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


