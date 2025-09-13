// Save HTML handler: collects document doctype + outerHTML in the page and downloads it.
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

function handleSaveHtml() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) return;
    const tabId = tab.id;
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const doc = document.documentElement;
          const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ' PUBLIC "' + document.doctype.publicId + '"' : ''}${document.doctype.systemId ? ' "' + document.doctype.systemId + '"' : ''}>\n` : '';
          const html = doc.outerHTML;
          return doctype + html;
        } catch (e) {
          return '<!-- HTML serialization failed: ' + (e && e.message) + ' -->';
        }
      }
    }, (results) => {
      const content = results && results[0] && results[0].result ? results[0].result : '';
      const safeTitle = (typeof sanitizeBaseFilename === 'function') ? sanitizeBaseFilename(tab.title || 'page') : (tab.title || 'page');
      const filename = safeTitle + '.html';
      try { console.log('[save_html] filename info:', { originalTitle: tab.title, sanitizedBase: safeTitle, finalFilename: filename }); } catch (_) {}
      downloadTextAsFile(content, filename);
    });
  });
}


