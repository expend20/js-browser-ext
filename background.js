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
  importScripts('save_markdown.js');
  importScripts('gemini_api.js');
  importScripts('discourse.js');
} catch (e) {
  console.error('Failed to import scripts:', e);
}

// Helper to get settings from storage with defaults
function getSettings(callback) {
  const DEFAULTS = {
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
  const keys = Object.keys(DEFAULTS);
  chrome.storage.sync.get(keys, (items) => {
    const settings = {};
    for (const key of keys) {
      settings[key] = items[key] || DEFAULTS[key];
    }
    callback(settings);
  });
}

// Generic Gemini handler
async function handleGeminiAnalysis(contentType, contentFetcher) {
  return new Promise((resolve) => {
    getSettings(async (settings) => {
      if (!settings.geminiApiKey) {
        console.error('Gemini API Key is not set.');
        resolve({ success: false, error: 'API key not set. Check Settings.' });
        return;
      }

      try {
        console.log(`Capturing ${contentType} content for Gemini analysis...`);
        const content = await contentFetcher();
        if (!content) {
          console.error(`Failed to capture content for ${contentType}.`);
          resolve({ success: false, error: 'Failed to capture content' });
          return;
        }
        console.log(`Captured ${contentType} data, size: ${contentType === 'image' ? content.data.length : content.length} bytes.`);

        const tabs = await new Promise(res => chrome.tabs.query({ active: true, currentWindow: true }, res));
        const tab = tabs && tabs[0];
        if (!tab) {
          resolve({ success: false, error: 'No active tab' });
          return;
        }

        const safeTitle = (typeof sanitizeBaseFilename === 'function') ? sanitizeBaseFilename(tab.title || 'page') : (tab.title || 'page');

        // Save input file (if debug enabled)
        if (settings.saveDebugFiles) {
          if (contentType === 'html') {
            const inputFilename = `${safeTitle}-gemini-input.html`;
            downloadTextAsFile(content, inputFilename);
          } else if (contentType === 'markdown') {
            const inputFilename = `${safeTitle}-gemini-input.md`;
            downloadTextAsFile(content, inputFilename);
          } else if (contentType === 'image') {
            const extension = content.mimeType.split('/')[1] || 'png';
            const inputFilename = `${safeTitle}-gemini-input.${extension}`;
            if (typeof downloadBase64AsFile === 'function') {
              downloadBase64AsFile(content.dataUrl, inputFilename);
            }
          }
        }

        const promptKey = `geminiPrompt${contentType.charAt(0).toUpperCase() + contentType.slice(1)}`;
        const prompt = settings[promptKey];

        console.log(`Sending data to Gemini for ${contentType} analysis...`);
        const result = await callGemini(settings.geminiApiKey, settings.geminiModel, prompt, content, contentType);

        console.log(`Gemini API usage for ${contentType} analysis:`, {
          promptTokens: result.promptTokens,
          candidateTokens: result.candidateTokens,
          totalTokens: result.totalTokens,
        });

        // Save output file (if debug enabled)
        if (settings.saveDebugFiles) {
          const filename = `${safeTitle}-gemini-${contentType}-analysis.txt`;
          downloadTextAsFile(result.text, filename);
        }

        let postTitle = `Gemini Analysis of: ${tab.title || 'a page'}`;
        const titleMatch = result.text.match(/^#+\s*(.*)/m);
        if (titleMatch && titleMatch[1]) {
          postTitle = titleMatch[1].trim();
        }

        const imageContentForDiscourse = contentType === 'image' ? content : null;
        const postBody = `Original URL: ${tab.url}\n\n${result.text}`;
        const discourseResult = await postToDiscourse(settings, postTitle, postBody, imageContentForDiscourse);

        if (discourseResult && discourseResult.success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: discourseResult?.error || 'Failed to post to Discourse' });
        }

      } catch (error) {
        console.error(`Error during Gemini ${contentType} analysis:`, error);
        resolve({ success: false, error: error.message || 'Analysis failed' });
      }
    });
  });
}

// Content fetcher for HTML
function getHtmlContent() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.documentElement.outerHTML,
      }, (results) => {
        resolve(results[0].result);
      });
    });
  });
}

// Content fetcher for Markdown
function getMarkdownContent() {
  return new Promise((resolve) => {
    if (typeof handleSaveMarkdown === 'function') {
      handleSaveMarkdown(true, resolve); // Assuming handleSaveMarkdown can be adapted to return content
    } else {
      resolve('');
    }
  });
}

// Content fetcher for Screenshot
function getScreenshotContent() {
  return new Promise((resolve) => {
    if (typeof captureViaTabs === 'function') {
      captureViaTabs(true, (dataUrl) => {
        if (dataUrl) {
          const [header, data] = dataUrl.split(',');
          const mimeMatch = header.match(/:(.*?);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
          resolve({ dataUrl, data, mimeType });
        } else {
          resolve(null);
        }
      });
    } else {
      resolve(null);
    }
  });
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return;

  // Screenshot capture
  if (request.action === 'capture') {
    if (typeof captureViaTabs === 'function') {
      captureViaTabs(false, (result) => {
        sendResponse({ success: !!result });
      });
    } else {
      sendResponse({ success: false, error: 'Screenshot not available' });
    }
    return true;
  }

  // Save HTML
  if (request.action === 'save_html') {
    if (typeof handleSaveHtml === 'function') {
      handleSaveHtml((result) => {
        sendResponse({ success: result !== false });
      });
    } else {
      sendResponse({ success: false, error: 'Save HTML not available' });
    }
    return true;
  }

  // Save HTML + Images
  if (request.action === 'save_html_images') {
    if (typeof handleSaveHtmlImages === 'function') {
      handleSaveHtmlImages((result) => {
        sendResponse({ success: result !== false });
      });
    } else {
      sendResponse({ success: false, error: 'Save not available' });
    }
    return true;
  }

  // Save Visible Text
  if (request.action === 'save_visible_text') {
    if (typeof handleSaveVisibleText === 'function') {
      handleSaveVisibleText((result) => {
        sendResponse({ success: result !== false });
      });
    } else {
      sendResponse({ success: false, error: 'Save text not available' });
    }
    return true;
  }

  // Save Markdown
  if (request.action === 'save_markdown') {
    if (typeof handleSaveMarkdown === 'function') {
      handleSaveMarkdown(false, (result) => {
        sendResponse({ success: result !== false });
      });
    } else {
      sendResponse({ success: false, error: 'Save markdown not available' });
    }
    return true;
  }

  // Gemini HTML analysis
  if (request.action === 'gemini_analyze_html') {
    handleGeminiAnalysis('html', getHtmlContent).then(sendResponse);
    return true;
  }

  // Gemini Markdown analysis
  if (request.action === 'gemini_analyze_markdown') {
    handleGeminiAnalysis('markdown', getMarkdownContent).then(sendResponse);
    return true;
  }

  // Gemini Screenshot analysis
  if (request.action === 'gemini_analyze_screenshot') {
    handleGeminiAnalysis('image', getScreenshotContent).then(sendResponse);
    return true;
  }

  // Fetch Discourse categories
  if (request.action === 'fetch_discourse_categories') {
    console.log('background.js: received fetch_discourse_categories request');
    (async () => {
      if (typeof fetchDiscourseCategories === 'function') {
        const settings = request.settings || {};
        const result = await fetchDiscourseCategories(settings);
        sendResponse(result);
      } else {
        sendResponse({ success: false, error: 'fetchDiscourseCategories not available', categories: [] });
      }
    })();
    return true;
  }
});

