// Delegate screenshot functionality to screenshot.js (loaded as an ES module at top of service worker)
// and only keep message routing and HTML save here.

// Import the screenshot functions into the service worker global via importScripts.
// MV3 service workers support importScripts for classic scripts.
try {
  importScripts('shared_utils.js');
  importScripts('screenshot.js');
  importScripts('save_html.js');
  importScripts('save_html_images.js');
  importScripts('save_text.js');
} catch (e) {
  console.error('Failed to import scripts:', e);
}

// Helper to download text as a file via Blob
function downloadTextAsFile(text, filename) {
  const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
  try {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename }, () => {
      if (chrome.runtime.lastError) {
        console.error('download error:', chrome.runtime.lastError.message);
      }
      try { URL.revokeObjectURL(url); } catch (_) {}
    });
  } catch (e) {
    // Fallback path is unlikely needed in SW, but keep parity
    const fr = new FileReader();
    fr.onloadend = () => {
      chrome.downloads.download({ url: fr.result, filename }, () => {
        if (chrome.runtime.lastError) {
          console.error('download error (fallback):', chrome.runtime.lastError.message);
        }
      });
    };
    fr.readAsDataURL(blob);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'capture') {
    if (typeof captureViaTabs === 'function') captureViaTabs();
    return;
  }
  if (request && request.action === 'save_html') {
    if (typeof handleSaveHtml === 'function') handleSaveHtml();
  }
  if (request && request.action === 'save_html_images') {
    if (typeof handleSaveHtmlImages === 'function') handleSaveHtmlImages();
  }
  if (request && request.action === 'save_visible_text') {
    if (typeof handleSaveVisibleText === 'function') handleSaveVisibleText();
  }
});

