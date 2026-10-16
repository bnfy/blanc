'use strict';
if (location.origin === 'chrome://blanc-prototype' && parent !== window) {
  window.browserAPI = parent.BlancPrototypeHost.api;
  // The prototype's auxiliary WebView does not receive macOS's native
  // selectAll: edit command. Handle it only for this trusted UI's text fields.
  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
        && event.key.toLowerCase() === 'a'
        && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      event.target.select();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      parent.BlancPrototypeHost.escape();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    parent.BlancPrototypeHost.notice(event.reason?.message ?? String(event.reason));
  });
}
