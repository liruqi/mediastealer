/**
 * Helper to translate the UI using chrome.i18n.
 * It finds all elements with a [data-i18n] attribute and sets their content.
 */
function translateUI() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.textContent = message;
    }
  });

  // Handle placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.placeholder = message;
    }
  });

  // Handle titles (tooltips)
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.title = message;
    }
  });
}

// Ensure it runs once DOM is ready if directly included, 
// or it can be called manually from other scripts.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', translateUI);
} else {
  translateUI();
}

window.translateUI = translateUI;
