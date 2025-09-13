document.getElementById('capture').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'capture' });
});

document.getElementById('save-html').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'save_html' });
});

document.getElementById('save-html-images').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'save_html_images' });
});