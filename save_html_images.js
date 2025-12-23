// Save HTML + Images handler: gathers HTML and image URLs, fetches images,
// rewrites <img src> to data URLs, then downloads a single self-contained HTML file.

function downloadTextAsFile(text, filename) {
  const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
  try {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename }, () => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    });
  } catch (e) {
    const fr = new FileReader();
    fr.onloadend = () => {
      chrome.downloads.download({ url: fr.result, filename }, () => {});
    };
    fr.readAsDataURL(blob);
  }
}

async function handleSaveHtmlImages(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) {
      if (typeof callback === 'function') callback(false);
      return;
    }
    const tabId = tab.id;

    // Step 1: collect HTML, doctype, baseUrl, and absolute image URLs in page context
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ' PUBLIC "' + document.doctype.publicId + '"' : ''}${document.doctype.systemId ? ' "' + document.doctype.systemId + '"' : ''}>\n` : '';
          const html = document.documentElement.outerHTML;
          const baseUrl = location.href;
          const imgs = Array.from(document.querySelectorAll('img[src]'));
          const urls = Array.from(new Set(imgs.map(img => {
            try {
              const src = img.getAttribute('src');
              if (!src) return null;
              const abs = new URL(src, location.href).toString();
              if (abs.startsWith('data:') || abs.startsWith('blob:')) return null;
              return abs;
            } catch (_) { return null; }
          }).filter(Boolean)));
          return { html, doctype, baseUrl, imageUrls: urls };
        } catch (e) {
          return { html: '<!-- HTML serialization failed: ' + (e && e.message) + ' -->', doctype: '', baseUrl: location.href, imageUrls: [] };
        }
      }
    }, async (results) => {
      const payload = results && results[0] && results[0].result ? results[0].result : { html: '', doctype: '', baseUrl: '', imageUrls: [] };
      const { html, doctype, baseUrl, imageUrls } = payload;

      // Step 2: in page context, try to read same-origin images from HTTP cache only (no network)
      chrome.scripting.executeScript({
        target: { tabId },
        args: [imageUrls, baseUrl],
        func: async (urls, base) => {
          const map = {};
          if (!Array.isArray(urls)) return map;
          for (const u of urls) {
            try {
              const abs = new URL(u, base).toString();
              const absUrl = new URL(abs);
              // Only attempt same-origin; cross-origin + only-if-cached is forbidden by Fetch spec
              if (absUrl.origin !== location.origin) continue;
              const req = new Request(abs, { mode: 'same-origin', credentials: 'include', cache: 'only-if-cached' });
              const res = await fetch(req);
              if (!res || !res.ok) continue;
              const blob = await res.blob();
              const dataUrl = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onloadend = () => resolve(fr.result);
                fr.onerror = reject;
                fr.readAsDataURL(blob);
              });
              map[abs] = dataUrl;
            } catch (_) {
              // TypeError if not cached or disallowed by mode; skip to avoid network
            }
          }
          return map;
        }
      }, (mapResults) => {
        const mapping = mapResults && mapResults[0] && mapResults[0].result ? mapResults[0].result : {};

        // Step 3: rewrite in page context using DOMParser there
        chrome.scripting.executeScript({
          target: { tabId },
          args: [html, doctype, baseUrl, mapping],
          func: (htmlStr, doctypeStr, base, map) => {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(htmlStr, 'text/html');
              const imgs = doc.querySelectorAll('img[src]');
              for (const img of imgs) {
                try {
                  const src = img.getAttribute('src');
                  const abs = new URL(src, base).toString();
                  if (map && map[abs]) img.setAttribute('src', map[abs]);
                } catch (_) {}
              }
              return doctypeStr + doc.documentElement.outerHTML;
            } catch (e) {
              return doctypeStr + htmlStr;
            }
          }
        }, (rewriteResults) => {
          const content = rewriteResults && rewriteResults[0] && rewriteResults[0].result ? rewriteResults[0].result : (doctype + html);
          const safeTitle = (typeof sanitizeBaseFilename === 'function') ? sanitizeBaseFilename(tab.title || 'page') : (tab.title || 'page');
          const filename = safeTitle + '.inline.html';
          try { console.log('[save_html_images] filename info:', { originalTitle: tab.title, sanitizedBase: safeTitle, finalFilename: filename }); } catch (_) {}
          downloadTextAsFile(content, filename);
          if (typeof callback === 'function') callback(true);
        });
      });
    });
  });
}


