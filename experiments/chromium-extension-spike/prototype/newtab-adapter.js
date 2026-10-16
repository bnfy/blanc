'use strict';
(() => {
  const key = 'blanc.prototype.start.preferences.v1';
  const layouts = ['ledger', 'billboard', 'shelf', 'tally'];
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch { return {}; }
  };
  const preferences = () => {
    const saved = read();
    return { layout: layouts.includes(saved.layout) ? saved.layout : 'billboard',
      dynamicWallpaperEnabled: saved.dynamicWallpaperEnabled === true };
  };
  const listeners = new Set();
  function publish() { for (const fn of listeners) fn(preferences()); }
  function save(patch) {
    const next = { ...preferences(), ...patch };
    localStorage.setItem(key, JSON.stringify(next));
    publish();
    return next;
  }
  window.addEventListener('storage', (event) => { if (event.key === key) publish(); });
  let nextId = 0;
  const pending = new Map();
  window.blancNewTabReply = (id, success, value) => {
    const task = pending.get(id);
    if (!task) return;
    clearTimeout(task.timer);
    pending.delete(id);
    if (success) task.resolve(value); else task.reject(new Error(value));
  };
  function request(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = String(++nextId);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('New tab request timed out')); }, 10000);
      pending.set(id, { resolve, reject, timer });
      chrome.send('blancNewTab', [id, method, args]);
    });
  }
  window.bowserPages = {
    appVersion: async () => 'Chromium prototype',
    bookmarks: { list: async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const items = await request('bookmarks');
        if (items !== null) return items;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Bookmarks are still loading');
    } },
    start: {
      data: async () => ({ ...preferences(), groups: [], remoteDevices: [], blockedThisWeek: 0,
        topSites: await request('topSites'), wallpaperVisible: !document.hidden }),
      topSites: async () => [], // Chromium supplies its complete TopSites list above.
      setLayout: async (layout) => {
        if (!layouts.includes(layout)) throw new Error('Unknown start-page layout');
        return save({ layout }).layout;
      },
      setDynamicWallpaper: async (enabled) => save({ dynamicWallpaperEnabled: enabled === true }).dynamicWallpaperEnabled,
      onStatus: callback => { listeners.add(callback); return () => listeners.delete(callback); },
      onVisibility: callback => {
        const update = () => callback(!document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
      },
      onRemoteTabs: () => {},
      onUtilitySheetVisibility: () => {},
      openIsland: text => request('openIsland', [text]),
    },
  };
  document.addEventListener('DOMContentLoaded', () => {
    // Keep the existing Favorites heading useful without the Electron protocol.
    for (const link of document.querySelectorAll('a[href="blanc://bookmarks/"]')) link.href = 'chrome://bookmarks/';
  });
})();
