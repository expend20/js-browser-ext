// Save Markdown handler: extracts visible HTML and converts to Markdown, downloads as .md
function handleSaveMarkdown() {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      // Guard: cannot access restricted schemes
      try {
        const u = new URL(tab.url || '');
        const restrictedSchemes = new Set(['chrome:', 'edge:', 'about:', 'devtools:']);
        if (restrictedSchemes.has(u.protocol)) {
          console.warn('[save_markdown] Cannot access restricted URL:', tab.url);
          return;
        }
      } catch (_) {}

      const tabId = tab.id;
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            const root = document.body ? document.body.cloneNode(true) : null;
            if (!root) return '';

            // Remove script/style/noscript elements for cleaner output
            root.querySelectorAll('script, style, noscript').forEach((el) => el.remove());

            // Convert <a> and <img> to markdown-friendly placeholders directly on clone
            root.querySelectorAll('img').forEach((img) => {
              const alt = (img.getAttribute('alt') || '').trim();
              const src = (img.getAttribute('src') || '').trim();
              let abs = src;
              try {
                if (src) {
                  abs = new URL(src, document.baseURI || location.href).href;
                }
              } catch (_) {}
              const md = `![${alt}](${abs})`;
              const span = document.createElement('span');
              span.textContent = md;
              img.replaceWith(span);
            });

            root.querySelectorAll('a').forEach((a) => {
              const text = (a.textContent || '').trim();
              const href = (a.getAttribute('href') || '').trim();
              const md = href ? `[${text}](${href})` : text;
              const span = document.createElement('span');
              span.textContent = md;
              a.replaceWith(span);
            });

            // Basic block-level formatting: add newlines around block elements for readability
            const blockTags = new Set(['P','DIV','SECTION','ARTICLE','MAIN','HEADER','FOOTER','NAV','ASIDE','UL','OL','LI','H1','H2','H3','H4','H5','H6','PRE','BLOCKQUOTE','TABLE','THEAD','TBODY','TR']);
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
            const toWrap = [];
            while (walker.nextNode()) {
              const el = walker.currentNode;
              if (blockTags.has(el.tagName)) toWrap.push(el);
            }
            toWrap.forEach((el) => {
              const before = document.createTextNode('\n');
              const after = document.createTextNode('\n');
              el.parentNode && el.parentNode.insertBefore(before, el);
              el.parentNode && el.parentNode.insertBefore(after, el.nextSibling);
            });

            // Extract textContent as our markdown-ish output
            const text = root.textContent || '';

            // Collapse excessive blank lines
            return text.replace(/\u00A0/g, ' ').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          } catch (e) {
            return '';
          }
        }
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.warn('[save_markdown] executeScript error:', chrome.runtime.lastError.message);
          return;
        }
        const md = results && results[0] && results[0].result ? String(results[0].result) : '';
        const safeTitle = (typeof sanitizeBaseFilename === 'function') ? sanitizeBaseFilename(tab.title || 'page') : (tab.title || 'page');
        const filename = safeTitle + '.md';
        const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
        chrome.downloads.download({ url: dataUrl, filename }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[save_markdown] download error:', chrome.runtime.lastError.message);
          }
        });
      });
    });
  } catch (e) {
    console.error('handleSaveMarkdown error:', e);
  }
}


