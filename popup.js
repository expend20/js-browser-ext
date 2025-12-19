document.getElementById('save-screenshot').addEventListener('click', () => {
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

document.getElementById('save-markdown').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'save_markdown' });
});

document.getElementById('gemini-analyze-html').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'gemini_analyze_html' });
});

document.getElementById('gemini-analyze-markdown').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'gemini_analyze_markdown' });
});

document.getElementById('gemini-analyze-screenshot').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'gemini_analyze_screenshot' });
});

// Reusable collapsible section handler
function setupCollapsible(toggleBtnId, bodyId, startExpanded = false) {
  const toggleBtn = document.getElementById(toggleBtnId);
  const bodyEl = document.getElementById(bodyId);
  if (!toggleBtn || !bodyEl) return;

  const setExpanded = (expanded) => {
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    if (expanded) {
      bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';
    } else {
      bodyEl.style.maxHeight = '0px';
    }
  };

  setExpanded(startExpanded);

  toggleBtn.addEventListener('click', () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    setExpanded(!isExpanded);
  });

  // Adjust maxHeight on content changes for smoother UX
  const observer = new ResizeObserver(() => {
    if (toggleBtn.getAttribute('aria-expanded') === 'true') {
      bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px';
    }
  });
  observer.observe(bodyEl);
}

// Initialize all collapsible sections
setupCollapsible('save-actions-toggle', 'save-actions-body', false);
setupCollapsible('gemini-actions-toggle', 'gemini-actions-body', true);
setupCollapsible('discourse-category-toggle', 'discourse-category-body', false);
setupCollapsible('settings-toggle', 'settings-body', false);


// Settings: load existing values
(function initSettings() {
  const formatEl = document.getElementById('format');
  const qualityEl = document.getElementById('quality');
  const qualityValue = document.getElementById('qualityValue');
  const saveBtn = document.getElementById('save-settings');
  
  // Gemini settings elements
  const saveDebugFilesEl = document.getElementById('save-debug-files');
  const geminiApiKeyEl = document.getElementById('gemini-api-key');
  const geminiModelEl = document.getElementById('gemini-model');
  const geminiPromptHtmlEl = document.getElementById('gemini-prompt-html');
  const geminiPromptMarkdownEl = document.getElementById('gemini-prompt-markdown');
  const geminiPromptImageEl = document.getElementById('gemini-prompt-image');

  // Discourse settings elements
  const discourseApiUrlEl = document.getElementById('discourse-api-url');
  const discourseApiKeyEl = document.getElementById('discourse-api-key');
  const discourseApiUsernameEl = document.getElementById('discourse-api-username');
  const discourseCategoryEl = document.getElementById('discourse-category');
  const fetchCategoriesBtn = document.getElementById('fetch-categories');
  const categoryStatusEl = document.getElementById('category-status');
  const categoryFilterEl = document.getElementById('category-filter');
  const postCategoryDisplayEl = document.getElementById('post-category-display');
  const postCategoryNameEl = document.getElementById('post-category-name');

  // Store all categories for filtering
  let allCategories = [];

  function updatePostCategoryDisplay(categoryName) {
    if (categoryName) {
      postCategoryNameEl.textContent = categoryName;
      postCategoryDisplayEl.style.display = 'block';
    } else {
      postCategoryDisplayEl.style.display = 'none';
    }
  }

  const DEFAULTS = {
    format: 'image/webp',
    quality: 0.8,
    saveDebugFiles: false,
    geminiApiKey: '',
    geminiModel: 'gemini-flash-latest',
    geminiPromptHtml: 'Summarize this HTML content.',
    geminiPromptMarkdown: 'Summarize this Markdown content.',
    geminiPromptImage: 'Describe this image.',
    discourseApiUrl: '',
    discourseApiKey: '',
    discourseApiUsername: '',
    discourseCategoryId: '',
  };

  const settingsKeys = Object.keys(DEFAULTS);

  chrome.storage.sync.get(settingsKeys, (items) => {
    formatEl.value = items.format || DEFAULTS.format;
    qualityEl.value = String(typeof items.quality === 'number' ? items.quality : DEFAULTS.quality);
    qualityValue.textContent = Number(qualityEl.value).toFixed(2);
    
    saveDebugFilesEl.checked = items.saveDebugFiles || DEFAULTS.saveDebugFiles;
    geminiApiKeyEl.value = items.geminiApiKey || DEFAULTS.geminiApiKey;
    geminiModelEl.value = items.geminiModel || DEFAULTS.geminiModel;
    geminiPromptHtmlEl.value = items.geminiPromptHtml || DEFAULTS.geminiPromptHtml;
    geminiPromptMarkdownEl.value = items.geminiPromptMarkdown || DEFAULTS.geminiPromptMarkdown;
    geminiPromptImageEl.value = items.geminiPromptImage || DEFAULTS.geminiPromptImage;

    discourseApiUrlEl.value = items.discourseApiUrl || DEFAULTS.discourseApiUrl;
    discourseApiKeyEl.value = items.discourseApiKey || DEFAULTS.discourseApiKey;
    discourseApiUsernameEl.value = items.discourseApiUsername || DEFAULTS.discourseApiUsername;

    // Load cached categories and set selected value
    chrome.storage.sync.get(['discourseCategories'], (catItems) => {
      allCategories = catItems.discourseCategories || [];
      const savedCategoryId = items.discourseCategoryId || DEFAULTS.discourseCategoryId;
      populateCategoryDropdown(allCategories, savedCategoryId);

      // Show saved category on load
      if (savedCategoryId) {
        const savedCat = allCategories.find(c => String(c.id) === String(savedCategoryId));
        if (savedCat) {
          categoryStatusEl.textContent = savedCat.name;
          categoryStatusEl.style.display = 'block';
          updatePostCategoryDisplay(savedCat.name);
        } else {
          categoryStatusEl.style.display = 'none';
          updatePostCategoryDisplay(null);
        }
      } else {
        categoryStatusEl.style.display = 'none';
        updatePostCategoryDisplay(null);
      }
    });
  });

  function populateCategoryDropdown(categories, selectedId) {
    discourseCategoryEl.innerHTML = '';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      if (String(cat.id) === String(selectedId)) {
        option.selected = true;
      }
      discourseCategoryEl.appendChild(option);
    });
  }

  // Filter categories as user types
  categoryFilterEl.addEventListener('input', () => {
    const filter = categoryFilterEl.value.toLowerCase();
    const currentSelected = discourseCategoryEl.value;
    const filtered = allCategories.filter(cat =>
      cat.name.toLowerCase().includes(filter)
    );
    populateCategoryDropdown(filtered, currentSelected);
  });

  // Auto-save category when selection changes
  discourseCategoryEl.addEventListener('change', () => {
    const selectedId = discourseCategoryEl.value;
    if (selectedId) {
      chrome.storage.sync.set({ discourseCategoryId: selectedId });
      const selectedCat = allCategories.find(c => String(c.id) === String(selectedId));
      if (selectedCat) {
        categoryStatusEl.textContent = `Saved: ${selectedCat.name}`;
        categoryStatusEl.style.display = 'block';
        categoryStatusEl.style.background = '#1e3a1e';
        categoryStatusEl.style.color = '#4ade80';
        categoryStatusEl.style.borderColor = '#2d5a2d';
        updatePostCategoryDisplay(selectedCat.name);
      }
    }
  });

  fetchCategoriesBtn.addEventListener('click', () => {
    const currentSettings = {
      discourseApiUrl: discourseApiUrlEl.value.trim(),
      discourseApiKey: discourseApiKeyEl.value.trim(),
      discourseApiUsername: discourseApiUsernameEl.value.trim(),
    };

    if (!currentSettings.discourseApiUrl || !currentSettings.discourseApiKey || !currentSettings.discourseApiUsername) {
      categoryStatusEl.textContent = 'Please fill in API URL, Key, and Username in Settings first';
      categoryStatusEl.style.display = 'block';
      categoryStatusEl.style.background = '#3a1e1e';
      categoryStatusEl.style.color = '#f87171';
      categoryStatusEl.style.borderColor = '#5a2d2d';
      return;
    }

    categoryStatusEl.textContent = 'Fetching categories...';
    categoryStatusEl.style.display = 'block';
    categoryStatusEl.style.background = '#1e2a3a';
    categoryStatusEl.style.color = '#60a5fa';
    categoryStatusEl.style.borderColor = '#2d3a5a';
    console.log('Sending fetch_discourse_categories request with settings:', {
      discourseApiUrl: currentSettings.discourseApiUrl,
      discourseApiUsername: currentSettings.discourseApiUsername,
      hasApiKey: !!currentSettings.discourseApiKey,
    });
    chrome.runtime.sendMessage({ action: 'fetch_discourse_categories', settings: currentSettings }, (response) => {
      console.log('Received response:', response);
      if (chrome.runtime.lastError) {
        console.error('Chrome runtime error:', chrome.runtime.lastError);
      }
      if (response && response.success) {
        allCategories = response.categories;
        chrome.storage.sync.set({ discourseCategories: response.categories });
        categoryFilterEl.value = '';
        populateCategoryDropdown(allCategories, discourseCategoryEl.value);
        categoryStatusEl.textContent = `Found ${response.categories.length} categories`;
        categoryStatusEl.style.background = '#1e3a1e';
        categoryStatusEl.style.color = '#4ade80';
        categoryStatusEl.style.borderColor = '#2d5a2d';
      } else {
        categoryStatusEl.textContent = response?.error || 'Failed to fetch categories';
        categoryStatusEl.style.background = '#3a1e1e';
        categoryStatusEl.style.color = '#f87171';
        categoryStatusEl.style.borderColor = '#5a2d2d';
      }
    });
  });

  qualityEl.addEventListener('input', () => {
    qualityValue.textContent = Number(qualityEl.value).toFixed(2);
  });

  saveBtn.addEventListener('click', () => {
    const newSettings = {
      format: formatEl.value,
      quality: Math.max(0, Math.min(1, parseFloat(qualityEl.value))),
      saveDebugFiles: saveDebugFilesEl.checked,
      geminiApiKey: geminiApiKeyEl.value,
      geminiModel: geminiModelEl.value,
      geminiPromptHtml: geminiPromptHtmlEl.value,
      geminiPromptMarkdown: geminiPromptMarkdownEl.value,
      geminiPromptImage: geminiPromptImageEl.value,
      discourseApiUrl: discourseApiUrlEl.value,
      discourseApiKey: discourseApiKeyEl.value,
      discourseApiUsername: discourseApiUsernameEl.value,
    };
    chrome.storage.sync.set(newSettings, () => {
      window.close();
    });
  });
})();