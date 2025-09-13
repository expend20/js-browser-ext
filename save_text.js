// Save Visible Text handler: extracts document.body.innerText and downloads as .txt
function handleSaveVisibleText() {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      // Guard: cannot access chrome://, edge://, about:, devtools:// pages
      try {
        const u = new URL(tab.url || '');
        const restrictedSchemes = new Set(['chrome:', 'edge:', 'about:', 'devtools:']);
        if (restrictedSchemes.has(u.protocol)) {
          console.warn('[save_visible_text] Cannot access restricted URL:', tab.url);
          return;
        }
      } catch (_) {}
      const tabId = tab.id;
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            return document.body ? document.body.innerText : '';
          } catch (e) {
            return '';
          }
        }
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.warn('[save_visible_text] executeScript error:', chrome.runtime.lastError.message);
          return;
        }
        const text = results && results[0] && results[0].result ? String(results[0].result) : '';
        const safeTitle = (typeof sanitizeBaseFilename === 'function') ? sanitizeBaseFilename(tab.title || 'page') : (tab.title || 'page');
        const filename = safeTitle + '.txt';
        // Use data URL to avoid createObjectURL availability issues in SW
        const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
        chrome.downloads.download({ url: dataUrl, filename }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[save_visible_text] download error:', chrome.runtime.lastError.message);
          }
        });
      });
    });
  } catch (e) {
    console.error('handleSaveVisibleText error:', e);
  }
}


