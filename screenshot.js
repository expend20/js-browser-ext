// Scroll-and-stitch using executeScript + captureVisibleTab to avoid duplicated viewport tiling
function dataUrlToBlob(dataUrl) {
  try {
    const parts = dataUrl.split(',');
    const header = parts[0] || '';
    const base64 = parts[1] || '';
    const mimeMatch = header.match(/^data:(.*?);base64$/i);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (e) {
    console.error('dataUrlToBlob failed:', e);
    return null;
  }
}

function startDownloadFromBlob(blob, filename) {
  const targetFilename = filename || 'screenshot.png';
  try {
    const URLAPI = (typeof self !== 'undefined' && self.URL) ? self.URL : URL;
    if (URLAPI && typeof URLAPI.createObjectURL === 'function') {
      const url = URLAPI.createObjectURL(blob);
      chrome.downloads.download({ url, filename: targetFilename }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[capture] download error:', chrome.runtime.lastError.message);
        } else {
          console.log('[capture] download id=', downloadId);
        }
        try { URLAPI.revokeObjectURL(url); } catch (_) {}
      });
      return;
    }
  } catch (e) {
    console.warn('[capture] createObjectURL unavailable, using data URL fallback');
  }

  try {
    const fr = new FileReader();
    fr.onloadend = () => {
      const dataUrl = fr.result;
      chrome.downloads.download({ url: dataUrl, filename: targetFilename }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('[capture] download error (fallback):', chrome.runtime.lastError.message);
        } else {
          console.log('[capture] download id (fallback)=', downloadId);
        }
      });
    };
    fr.readAsDataURL(blob);
  } catch (e) {
    console.error('[capture] Finalizing image failed (fallback):', e);
  }
}

function getDefaultCaptureSettings() {
  return { format: 'image/webp', quality: 0.8 };
}

function getCaptureSettings(callback) {
  try {
    chrome.storage.sync.get(['format', 'quality'], (items) => {
      const defaults = getDefaultCaptureSettings();
      const format = items && items.format ? items.format : defaults.format;
      const quality = (items && typeof items.quality === 'number') ? items.quality : defaults.quality;
      callback({ format, quality });
    });
  } catch (_) {
    callback(getDefaultCaptureSettings());
  }
}

function captureViaTabs() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) return;

    const tabId = tab.id;
    console.log('[capture] start tabId=', tabId, 'url=', tab.url);

    getCaptureSettings(({ format: outputType, quality: outputQuality }) => {
      const extMap = {
        'image/webp': 'webp',
        'image/jpeg': 'jpg',
        'image/png': 'png',
      };
      const ext = extMap[outputType] || 'png';
      const safeTitle = sanitizeBaseFilename(tab.title || 'screenshot');
      const outputFilename = safeTitle + '.' + ext;
      console.log('[capture] filename info:', { originalTitle: tab.title, sanitizedBase: safeTitle, finalFilename: outputFilename });
      const tileCaptureFormat = (outputType === 'image/jpeg') ? 'jpeg' : 'png';
      const tileJpegQuality = Math.max(0, Math.min(100, Math.round((outputQuality || 0.8) * 100)));

    // 1) Identify the primary scroll container and measure dimensions
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const dpr = window.devicePixelRatio || 1;

          const docEl = document.scrollingElement || document.documentElement;
          const isScrollable = (el) => {
            const style = getComputedStyle(el);
            const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll');
            return canScrollY && el.scrollHeight > el.clientHeight;
          };
          let best = docEl;
          let bestScore = docEl.scrollHeight;
          const elements = Array.from(document.querySelectorAll('*'));
          for (const el of elements) {
            try {
              if (!isScrollable(el)) continue;
              const rect = el.getBoundingClientRect();
              if (rect.width < window.innerWidth * 0.5 || rect.height < window.innerHeight * 0.5) continue;
              const score = el.scrollHeight;
              if (score > bestScore) {
                best = el;
                bestScore = score;
              }
            } catch (_) {}
          }

          const isWindowScroller = (best === docEl);
          const rect = isWindowScroller
            ? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
            : best.getBoundingClientRect();

          const totalWidth = isWindowScroller ? Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) : best.scrollWidth;
          const totalHeight = isWindowScroller ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) : best.scrollHeight;
          const viewportWidth = isWindowScroller ? window.innerWidth : best.clientWidth;
          const viewportHeight = isWindowScroller ? window.innerHeight : best.clientHeight;

          return {
            isWindowScroller,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            totalWidth,
            totalHeight,
            viewportWidth,
            viewportHeight,
            dpr: dpr,
          };
        },
      },
      (results) => {
        if (!results || !results[0]) { console.warn('[capture] no results from dimension script'); return; }

        const { isWindowScroller, rect, totalWidth, totalHeight, viewportWidth, viewportHeight, dpr } = results[0].result;
        const cropRect = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height };
        console.log('[capture] dims', { isWindowScroller, cropRect, totalWidth, totalHeight, viewportWidth, viewportHeight, dpr });

        // Prepare target canvas (CSS pixel space)
        const canvas = new OffscreenCanvas(totalWidth, totalHeight);
        const ctx = canvas.getContext('2d');

        // Build strictly increasing positions, aligning last tile to bottom
        const positions = [];
        const tileCount = Math.max(1, Math.ceil(totalHeight / viewportHeight));
        for (let i = 0; i < tileCount; i++) {
          const y = (i === tileCount - 1) ? Math.max(0, totalHeight - viewportHeight) : i * viewportHeight;
          if (positions.length === 0 || y > positions[positions.length - 1]) positions.push(y);
        }
        console.log('[capture] tiles count=', positions.length);

        const drawTile = (url, yPos, next, destHeightOverride) => {
          console.log('[capture] drawTile y=', yPos, 'destHeight=', destHeightOverride || viewportHeight);
          const loadBlob = () => new Promise((resolve, reject) => {
            if (typeof url === 'string' && url.startsWith('data:')) {
              const blob = dataUrlToBlob(url);
              if (blob) resolve(blob); else reject(new Error('Invalid data URL'));
            } else if (typeof url === 'string' && url.startsWith('blob:')) {
              fetch(url).then(r => r.blob()).then(resolve).catch(reject);
            } else if (url instanceof Blob) {
              resolve(url);
            } else {
              reject(new Error('Unsupported image source'));
            }
          });

          loadBlob()
            .then(blob => createImageBitmap(blob))
            .then(bitmap => {
              const sx = Math.floor(cropRect.x * dpr);
              const sy = Math.floor(cropRect.y * dpr);
              const sWidth = Math.floor(cropRect.width * dpr);
              const sHeight = Math.floor(cropRect.height * dpr);

              const destHeight = destHeightOverride != null ? destHeightOverride : viewportHeight;

              ctx.drawImage(
                bitmap,
                sx,
                sy,
                sWidth,
                sHeight,
                0,
                yPos,
                viewportWidth,
                destHeight
              );
              console.log('[capture] drawTile done y=', yPos);
              next();
            })
            .catch(err => {
              console.error('Bitmap draw error:', err);
              next(err);
            });
        };

        const restorePageThenSave = () => {
          // Restore any temporarily hidden fixed/sticky elements
          chrome.scripting.executeScript(
            {
              target: { tabId },
              func: () => {
                const list = document.querySelectorAll('[data-capture-hidden="1"]');
                for (const el of list) {
                  try {
                    const prev = el.getAttribute('data-prev-visibility');
                    if (prev === null || prev === '') el.style.removeProperty('visibility');
                    else el.style.visibility = prev;
                    el.removeAttribute('data-prev-visibility');
                    el.removeAttribute('data-capture-hidden');
                  } catch (_) {}
                }
                return list.length;
              },
            },
            () => {
              const opts = (outputType === 'image/jpeg' || outputType === 'image/webp')
                ? { type: outputType, quality: Math.max(0, Math.min(1, outputQuality || 0.8)) }
                : { type: outputType };
              canvas.convertToBlob(opts).then((blob) => {
                console.log('[capture] saving image type=', outputType, 'size=', blob.size);
                startDownloadFromBlob(blob, outputFilename);
              }).catch(err => {
                console.error('Finalizing image failed:', err);
              });
            }
          );
        };

        let index = 0;
        let lastCaptureAt = 0;
        const step = () => {
          if (index >= positions.length) {
            restorePageThenSave();
            return;
          }

          const yPos = positions[index];
          const tileHeight = Math.min(viewportHeight, totalHeight - yPos);
          console.log('[capture] step idx=', index, '/', positions.length, 'y=', yPos, 'tileH=', tileHeight);

          // 2) Scroll the identified container and wait for paint
          chrome.scripting.executeScript(
            {
              target: { tabId },
              args: [yPos],
              func: (y) => {
                const docEl = document.scrollingElement || document.documentElement;
                const isScrollable = (el) => {
                  const style = getComputedStyle(el);
                  const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll');
                  return canScrollY && el.scrollHeight > el.clientHeight;
                };
                let best = docEl;
                let bestScore = docEl.scrollHeight;
                const elements = Array.from(document.querySelectorAll('*'));
                for (const el of elements) {
                  try {
                    if (!isScrollable(el)) continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width < window.innerWidth * 0.5 || rect.height < window.innerHeight * 0.5) continue;
                    const score = el.scrollHeight;
                    if (score > bestScore) {
                      best = el;
                      bestScore = score;
                    }
                  } catch (_) {}
                }
                if (best === docEl) {
                  window.scrollTo(0, y);
                } else {
                  best.scrollTop = y;
                }
                return new Promise((resolve) => {
                  requestAnimationFrame(() => requestAnimationFrame(resolve));
                });
              },
            },
            () => {
              // 3) Capture visible viewport of the tab
              console.log('[capture] capturing at y=', yPos);
              const now = Date.now();
              const delay = Math.max(0, 1100 - (now - lastCaptureAt));
              console.log('[capture] throttle delay ms=', delay);
              setTimeout(() => {
                lastCaptureAt = Date.now();
                const captureOpts = (tileCaptureFormat === 'jpeg') ? { format: 'jpeg', quality: tileJpegQuality } : { format: 'png' };
                chrome.tabs.captureVisibleTab(tab.windowId, captureOpts, (dataUrl) => {
                  if (chrome.runtime.lastError) {
                    console.error('captureVisibleTab error:', chrome.runtime.lastError.message);
                  }
                  if (!dataUrl) {
                    console.error('Capture failed');
                    // Attempt to continue to avoid hanging
                    index += 1;
                    setTimeout(step, 500);
                    return;
                  }
                  console.log('[capture] captured length=', dataUrl.length);
                  // If bottom tile is partial, crop it vertically before drawing
                  if (tileHeight !== viewportHeight) {
                    const blob = dataUrlToBlob(dataUrl);
                    if (!blob) {
                      console.error('Bottom tile decode failed');
                      index += 1;
                      setTimeout(step, 500);
                      return;
                    }
                    createImageBitmap(blob)
                      .then(bitmap => {
                        const scale = bitmap.height / viewportHeight;
                        const croppedHeightPx = Math.floor(tileHeight * scale);
                        const tmp = new OffscreenCanvas(bitmap.width, croppedHeightPx);
                        const tctx = tmp.getContext('2d');
                        tctx.drawImage(bitmap, 0, 0, bitmap.width, croppedHeightPx, 0, 0, bitmap.width, croppedHeightPx);
                        return tmp.convertToBlob({ type: 'image/png' });
                      })
                      .then(croppedBlob => {
                        drawTile(croppedBlob, yPos, (err) => {
                          if (err) {
                            index += 1;
                            setTimeout(step, 500);
                            return;
                          }
                          index += 1;
                          setTimeout(step, 500);
                        }, tileHeight);
                      })
                      .catch(err => {
                        console.error('Bottom tile crop failed:', err);
                        drawTile(dataUrl, yPos, (err) => {
                          index += 1;
                          setTimeout(step, 500);
                        }, tileHeight);
                      });
                    return;
                  }
                  drawTile(dataUrl, yPos, (err) => {
                    index += 1;
                    setTimeout(step, 500);
                  });
                });
              }, delay);
            }
          );
        };

        // Hide fixed/sticky elements to avoid repeated headers/footers in each tile
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              let hidden = 0;
              const all = document.body ? document.body.querySelectorAll('*') : [];
              for (const el of all) {
                try {
                  const cs = getComputedStyle(el);
                  if (cs.position === 'fixed' || cs.position === 'sticky') {
                    if (!el.hasAttribute('data-capture-hidden')) {
                      el.setAttribute('data-capture-hidden', '1');
                      el.setAttribute('data-prev-visibility', el.style.visibility || '');
                      el.style.setProperty('visibility', 'hidden', 'important');
                      hidden += 1;
                    }
                  }
                } catch (_) {}
              }
              return hidden;
            },
          },
          () => {
            step();
          }
        );
      }
    );
    });
  });
}


