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
  const paint = window.BlancStartPaint;
  let installedTheme = {};
  const usesStoreTheme = saved => !!installedTheme.id &&
    !(saved.storeThemeWallpaper?.id === installedTheme.id && saved.storeThemeWallpaper.enabled === false);
  function wallpaper(saved) {
    const value = saved.wallpaper || {};
    const image = typeof value.image === 'string' && value.image.startsWith('data:image/jpeg;base64,') ? value.image : null;
    const source = ['sunrise', 'time-of-day', 'color', 'custom'].includes(value.source) ? value.source
      : saved.dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise';
    const preset = paint.normalizePreset(value.color?.preset) || paint.DEFAULT_PRESET;
    const fill = paint.normalizeFill(value.color?.paint?.fill) || paint.DEFAULT_FILL;
    return { source: source === 'custom' && !image ? 'sunrise' : source, image, hasImage: !!image,
      style: ['auto', 'light', 'dark', 'spotlight'].includes(value.style) ? value.style : 'auto',
      wash: Number.isInteger(value.wash) && value.wash >= 0 && value.wash <= 100 ? value.wash : 100,
      color: { presets: window.SpaceIdentity.PRESETS, preset, followSpace: false, inSpace: false,
        paint: paint.colorWallpaper({ preset, fill, followSpace: false }) } };
  }
  function saveWallpaper(patch) {
    const current = wallpaper(read());
    return save({ wallpaper: { ...current, ...patch } }).wallpaper;
  }
  async function chooseWallpaper() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    const file = await new Promise(resolve => {
      input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
    if (!file) return { cancelled: true };
    if (file.size > 25 * 1024 * 1024) return { error: 'too-large' };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { error: 'unsupported' };
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // Canvas re-encoding drops EXIF/GPS and never persists the original file.
      const image = canvas.toDataURL('image/jpeg', 0.85);
      // This adapter uses profile-local WebUI storage, with a bounded image.
      if (image.length > 3 * 1024 * 1024) return { error: 'too-large' };
      if (installedTheme.id) save({ storeThemeWallpaper: { id: installedTheme.id, enabled: false } });
      return { wallpaper: saveWallpaper({ source: 'custom', image }) };
    } catch { return { error: 'unreadable' }; }
    finally { bitmap?.close(); }
  }
  const preferences = () => {
    const saved = read();
    return { layout: layouts.includes(saved.layout) ? saved.layout : 'billboard',
      dynamicWallpaperEnabled: saved.dynamicWallpaperEnabled === true,
      wallpaper: usesStoreTheme(saved) ? { ...wallpaper(saved), source: 'web-store',
        image: installedTheme.image || null, hasImage: !!installedTheme.image, themeAvailable: true }
        : { ...wallpaper(saved), themeAvailable: !!installedTheme.id } };
  };
  const listeners = new Set();
  function publish() { for (const fn of listeners) fn(preferences()); }
  function save(patch) {
    const next = { ...read(), ...patch };
    localStorage.setItem(key, JSON.stringify(next));
    publish();
    paintStoreTheme();
    return preferences();
  }
  window.addEventListener('storage', (event) => { if (event.key === key) { publish(); paintStoreTheme(); } });
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
  function paintStoreTheme() {
    const enabled = usesStoreTheme(read());
    // Images go through Blanc's existing wash/style pipeline. Only color-only
    // themes need a native palette overlay on the start page.
    window.BlancInstalledTheme.apply(document, enabled && !installedTheme.image ? installedTheme : {}, true);
    if (document.body) {
      document.body.toggleAttribute('data-store-wallpaper', enabled && !!installedTheme.image);
      const position = /^(left|center|right) (top|center|bottom)$/.test(installedTheme.position) ? installedTheme.position : 'center bottom';
      const repeat = ['repeat', 'repeat-x', 'repeat-y'].includes(installedTheme.repeat) ? installedTheme.repeat : 'no-repeat';
      document.body.style.setProperty('--store-wallpaper-position', position);
      document.body.style.setProperty('--store-wallpaper-repeat', repeat);
      document.getElementById('storeThemeAttribution')?.remove();
      if (enabled && /^chrome:\/\/blanc-prototype\/theme-attribution\.png\?[a-p]{32}$/.test(installedTheme.attribution)) {
        const image = document.createElement('img'); image.id = 'storeThemeAttribution';
        image.alt = 'Theme attribution'; image.src = installedTheme.attribution; document.body.append(image);
      }
    }
  }
  let themeId = '__initial__', themePending = false;
  async function refreshTheme() {
    if (themePending) return;
    themePending = true;
    try {
      const theme = await request('installedTheme', [themeId]);
      if (theme !== null) {
        themeId = theme.id || '';
        installedTheme = theme;
        publish();
        paintStoreTheme();
      }
    } catch (error) { console.warn('Theme refresh failed', error); }
    finally { themePending = false; }
  }
  window.addEventListener('DOMContentLoaded', refreshTheme, { once: true });
  window.addEventListener('pageshow', refreshTheme);
  setInterval(() => { if (!document.hidden) refreshTheme(); }, 1000);
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
      chooseWallpaper,
      setWallpaper: async source => {
        if (source === 'web-store') {
          if (!installedTheme.id) throw new Error('No Web Store theme installed');
          return save({ storeThemeWallpaper: { id: installedTheme.id, enabled: true } }).wallpaper;
        }
        if (!['sunrise', 'time-of-day', 'custom', 'color'].includes(source)) throw new Error('Unknown wallpaper');
        if (installedTheme.id) save({ storeThemeWallpaper: { id: installedTheme.id, enabled: false } });
        if (source === 'sunrise' || source === 'time-of-day')
          return save({ dynamicWallpaperEnabled: source === 'time-of-day', wallpaper: { ...wallpaper(read()), source } }).wallpaper;
        return saveWallpaper({ source });
      },
      removeWallpaper: async () => saveWallpaper({ image: null, source: preferences().dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise' }),
      setWallpaperStyle: async style => {
        if (!['auto', 'light', 'dark', 'spotlight'].includes(style)) throw new Error('Unknown wash style');
        return saveWallpaper({ style });
      },
      setWallpaperWash: async wash => {
        if (!Number.isInteger(wash) || wash < 0 || wash > 100) throw new Error('Invalid wash');
        return saveWallpaper({ wash });
      },
      setWallpaperColor: async preset => {
        if (!paint.normalizePreset(preset)) throw new Error('Unknown color');
        return saveWallpaper({ color: { ...preferences().wallpaper.color, preset } });
      },
      setWallpaperFill: async fill => {
        if (!paint.normalizeFill(fill)) throw new Error('Unknown fill');
        const color = preferences().wallpaper.color;
        return saveWallpaper({ color: { ...color, paint: { ...color.paint, fill } } });
      },
      setWallpaperFollowSpace: async () => { throw new Error('Spaces are not available in this prototype.'); },
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
  // The native handler reports bookmark-model changes (Island heart, /save,
  // Chromium's manager, a favicon arriving) and TopSites changes (history
  // visits, /clear). Bursts coalesce per kind into one re-fetch, which
  // re-renders through the copied page's own globals once it is ready.
  const refreshers = {
    bookmarks: async () => {
      const items = await window.bowserPages.bookmarks.list();
      if (typeof renderLedgerFavorites !== 'function') return;
      state.favorites = items;
      renderLedgerFavorites(items);
    },
    topSites: async () => {
      // The page's own pager is already exhausted (start.topSites returns
      // nothing more), so the full native list simply replaces the state.
      state.topSites = await request('topSites');
    },
  };
  const pendingRefresh = {};
  window.blancNewTabEvent = (kind) => {
    if (!refreshers[kind] || pendingRefresh[kind]) return;
    pendingRefresh[kind] = setTimeout(async () => {
      pendingRefresh[kind] = null;
      if (!document.body.classList.contains('layout-ready')) return;
      try {
        if (typeof state !== 'object' || typeof invalidate !== 'function' || typeof applyLayout !== 'function') return;
        await refreshers[kind]();
        invalidate();
        applyLayout(state.layout);
      } catch (error) { console.warn(error.message); }
    }, 80);
  };
  document.addEventListener('DOMContentLoaded', () => {
    // Keep the existing Favorites heading useful without the Electron protocol.
    for (const link of document.querySelectorAll('a[href="blanc://bookmarks/"]')) link.href = 'chrome://bookmarks/';
  });
})();
