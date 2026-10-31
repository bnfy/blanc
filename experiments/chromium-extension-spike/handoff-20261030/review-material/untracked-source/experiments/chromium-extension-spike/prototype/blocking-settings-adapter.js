'use strict';
(() => {
  if (location.origin !== 'chrome://blanc-prototype' ||
      location.pathname !== '/blocking-settings.html' || window.top !== window) return;
  let next = 0;
  const pending = new Map(), listeners = new Set();
  window.blancBlockingSettingsReply = (id, ok, value) => {
    const item = pending.get(id); if (!item) return;
    pending.delete(id); clearTimeout(item.timer);
    if (ok) item.resolve(value); else item.reject(new Error(String(value || 'Blocking settings failed.')));
  };
  window.blancBlockingSettingsChanged = () => { for (const callback of listeners) callback(); };
  const send = (method, args = []) => new Promise((resolve, reject) => {
    const id = String(++next);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Blocking settings request timed out.')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    chrome.send('blancBlockingSettings', [id, method, args]);
  });
  window.blancBlockingSettings = Object.freeze({
    get: () => send('get'), setEnabled: value => send('setEnabled', [value]),
    addException: host => send('addException', [host]),
    removeException: host => send('removeException', [host]),
    languageGet: () => send('languageGet'), languageSet: value => send('languageSet', [value]),
    languageRestart: () => send('languageRestart'),
    onChanged: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  });
})();
