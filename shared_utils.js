// Shared utilities across the extension

function sanitizeBaseFilename(name) {
  try {
    let base = String(name || 'screenshot');
    base = base.replace(/[^a-z0-9\-_. ]+/gi, '_');
    base = base.replace(/^[. ]+/g, '');
    base = base.replace(/[. ]+$/g, '');
    base = base.replace(/\s+/g, ' ').trim();
    if (!base) base = 'screenshot';
    if (base === '.' || base === '..') base = 'screenshot';
    const reserved = /^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])$/i;
    if (reserved.test(base)) base = '_' + base;
    if (base.length > 120) base = base.slice(0, 120);
    return base;
  } catch (_) {
    return 'screenshot';
  }
}

function downloadTextAsFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const reader = new FileReader();
  reader.onloadend = () => {
    chrome.downloads.download({ url: reader.result, filename }, () => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError);
      }
    });
  };
  reader.readAsDataURL(blob);
}

function downloadBase64AsFile(dataUrl, filename) {
  chrome.downloads.download({ url: dataUrl, filename }, () => {
    if (chrome.runtime.lastError) {
      console.error('Download failed:', chrome.runtime.lastError.message);
    }
  });
}


