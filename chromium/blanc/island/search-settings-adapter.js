'use strict';
(() => {
  if (location.origin !== 'chrome://blanc-prototype' ||
      location.pathname !== '/blocking-settings.html' || window.top !== window) return;
  let next = 0;
  const pending = new Map();
  window.blancSearchSettingsReply = (id, ok, value) => {
    const item = pending.get(id); if (!item) return;
    pending.delete(id); clearTimeout(item.timer);
    if (ok) item.resolve(value); else item.reject(new Error(String(value || 'Search settings failed.')));
  };
  const send = (method, args = []) => new Promise((resolve, reject) => {
    const id = String(++next);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Search settings request timed out.')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    chrome.send('blancSearchSettings', [id, method, args]);
  });
  window.blancSearchSettings = Object.freeze({
    get: () => send('get'), set: partial => send('set', [partial]),
  });
})();
