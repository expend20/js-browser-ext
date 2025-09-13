document.getElementById('capture').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'capture' });
});

document.getElementById('save-html').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'save_html' });
});

document.getElementById('save-html-images').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'save_html_images' });
});

document.getElementById('save-visible-text').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'save_visible_text' });
});

// Settings: load existing values
(function initSettings() {
  const formatEl = document.getElementById('format');
  const qualityEl = document.getElementById('quality');
  const qualityValue = document.getElementById('qualityValue');
  const saveBtn = document.getElementById('save-settings');
  const toggleBtn = document.getElementById('settings-toggle');
  const settingsBody = document.getElementById('settings-body');
  if (!formatEl || !qualityEl || !qualityValue || !saveBtn) return;

  const DEFAULTS = { format: 'image/webp', quality: 0.8 };

  chrome.storage.sync.get(['format', 'quality'], (items) => {
    const fmt = items.format || DEFAULTS.format;
    const q = (typeof items.quality === 'number') ? items.quality : DEFAULTS.quality;
    formatEl.value = fmt;
    qualityEl.value = String(q);
    qualityValue.textContent = Number(q).toFixed(2);
  });

  qualityEl.addEventListener('input', () => {
    qualityValue.textContent = Number(qualityEl.value).toFixed(2);
  });

  saveBtn.addEventListener('click', () => {
    const fmt = formatEl.value;
    const q = Math.max(0, Math.min(1, parseFloat(qualityEl.value)));
    chrome.storage.sync.set({ format: fmt, quality: q }, () => {
      window.close();
    });
  });

  // Collapsible settings
  if (toggleBtn && settingsBody) {
    const setExpanded = (expanded) => {
      toggleBtn.setAttribute('aria-expanded', String(expanded));
      // Measure natural height for smooth animation
      if (expanded) {
        settingsBody.style.maxHeight = settingsBody.scrollHeight + 'px';
      } else {
        settingsBody.style.maxHeight = '0px';
      }
    };

    // Start collapsed by default
    setExpanded(false);

    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      setExpanded(!expanded);
    });

    // Adjust maxHeight on content changes (e.g., slider move) for smoother UX
    const updateHeight = () => {
      if (toggleBtn.getAttribute('aria-expanded') === 'true') {
        settingsBody.style.maxHeight = settingsBody.scrollHeight + 'px';
      }
    };
    new ResizeObserver(updateHeight).observe(settingsBody);
  }
})();