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
  const isPrivatePage = new URLSearchParams(location.search).has('private');
  // Keep the user's re-encoded photo in profile-local Chromium storage, not
  // in the small settings value. Each page receives its own opaque blob URL.
  const imageStore = 'blanc.prototype.wallpaper.v1';
  let imageKey = null, imageUrl = null, imageGeneration = 0;
  async function imageTransaction(mode, action) {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(imageStore, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('images');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('images', mode);
        const operation = action(transaction.objectStore('images'));
        transaction.oncomplete = () => resolve(operation.result);
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Wallpaper storage failed'));
      });
    } finally { db.close(); }
  }
  function setImage(key, blob) {
    const oldUrl = imageUrl;
    imageKey = key;
    imageUrl = blob ? URL.createObjectURL(blob) : null;
    // The outgoing layer may still be fading when a wallpaper is replaced.
    if (oldUrl) setTimeout(() => URL.revokeObjectURL(oldUrl), 5000);
  }
  async function refreshImage() {
    const generation = ++imageGeneration;
    const id = !isPrivatePage && read().wallpaper?.imageKey;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) {
      if (generation === imageGeneration) setImage(null, null);
      return;
    }
    if (imageKey === id && imageUrl) return;
    const blob = await imageTransaction('readonly', store => store.get(id));
    if (generation !== imageGeneration || read().wallpaper?.imageKey !== id) return;
    setImage(id, blob instanceof Blob && blob.type === 'image/jpeg' ? blob : null);
  }
  async function storeImage(blob) {
    if (!navigator.locks) throw new Error('Wallpaper storage unavailable');
    return navigator.locks.request(imageStore, async () => {
      const previous = read().wallpaper?.imageKey;
      const id = crypto.randomUUID();
      await imageTransaction('readwrite', store => store.put(blob, id));
      try {
        ++imageGeneration;
        setImage(id, blob);
        const result = saveWallpaper({ source: 'custom', image: null, imageKey: id }, disableStoreTheme());
        if (previous && previous !== id) await imageTransaction('readwrite', store => store.delete(previous)).catch(() => {});
        return result;
      } catch (error) {
        setImage(null, null);
        await imageTransaction('readwrite', store => store.delete(id)).catch(() => {});
        await refreshImage().catch(() => {});
        throw error;
      }
    });
  }
  let installedTheme = {};
  const usesStoreTheme = saved => !!installedTheme.id &&
    !(saved.storeThemeWallpaper?.id === installedTheme.id && saved.storeThemeWallpaper.enabled === false);
  function wallpaper(saved) {
    const value = saved.wallpaper || {};
    const image = !isPrivatePage && value.imageKey === imageKey && imageUrl ? imageUrl
      : !isPrivatePage && typeof value.image === 'string' && value.image.startsWith('data:image/jpeg;base64,') ? value.image : null;
    // Sunrise and time-of-day share one base choice. The independently
    // persisted dynamic switch is authoritative for both, including reloads.
    const source = value.source === 'custom' || value.source === 'color' ? value.source
      : saved.dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise';
    const preset = paint.normalizePreset(value.color?.preset) || paint.DEFAULT_PRESET;
    const fill = paint.normalizeFill(value.color?.paint?.fill) || paint.DEFAULT_FILL;
    return { source: source === 'custom' && !image ? (saved.dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise') : source, image, hasImage: !!image,
      style: ['auto', 'light', 'dark', 'spotlight'].includes(value.style) ? value.style : 'auto',
      wash: Number.isInteger(value.wash) && value.wash >= 0 && value.wash <= 100 ? value.wash : 100,
      color: { presets: window.SpaceIdentity.PRESETS, preset, followSpace: false, inSpace: false,
        paint: paint.colorWallpaper({ preset, fill, followSpace: false }) } };
  }
  function saveWallpaper(patch, otherPreferences = {}) {
    const current = read().wallpaper || {};
    return save({ ...otherPreferences, wallpaper: { ...current, ...patch } }).wallpaper;
  }
  const disableStoreTheme = () => installedTheme.id
    ? { storeThemeWallpaper: { id: installedTheme.id, enabled: false } }
    : {};
  async function chooseWallpaper() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    const file = await new Promise(resolve => {
      input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
    if (!file) return { cancelled: true, wallpaper: preferences().wallpaper };
    if (file.size > 25 * 1024 * 1024) return { error: 'too-large', wallpaper: preferences().wallpaper };
    if (!['image/jpeg', 'image/png'].includes(file.type)) return { error: 'unsupported', wallpaper: preferences().wallpaper };
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      // Re-encode at shipping quality and drop original camera metadata.
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob || blob.type !== 'image/jpeg') return { error: 'unreadable', wallpaper: preferences().wallpaper };
      return { ok: true, wallpaper: await storeImage(blob) };
    } catch { return { error: 'unreadable', wallpaper: preferences().wallpaper }; }
    finally { bitmap?.close(); }
  }
  let clockValue = null;
  let sharedLayout = null;
  const preferences = () => {
    const saved = read();
    return { ...(clockValue ? { clock: clockValue } : {}), layout: sharedLayout ?? (layouts.includes(saved.layout) ? saved.layout : 'billboard'),
      dynamicWallpaperEnabled: saved.dynamicWallpaperEnabled === true,
      wallpaper: usesStoreTheme(saved) ? { ...wallpaper(saved), source: 'web-store',
        image: installedTheme.image || null, hasImage: !!installedTheme.image, themeAvailable: true }
        : { ...wallpaper(saved), themeAvailable: !!installedTheme.id } };
  };
  const listeners = new Set();
  function publish() {
    for (const fn of listeners) {
      try { fn(preferences()); } catch (error) { console.warn('Start Page listener failed', error); }
    }
  }
  function save(patch) {
    const next = { ...read(), ...patch };
    localStorage.setItem(key, JSON.stringify(next));
    publish();
    try { paintStoreTheme(); } catch (error) { console.warn('Theme display failed', error); }
    return preferences();
  }
  window.addEventListener('storage', (event) => {
    if (event.key === key) refreshImage().catch(() => {}).finally(() => { publish(); paintStoreTheme(); });
  });
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
  // Native profile preferences are shared by Start Pages; unlike this page's
  // local wallpaper storage, the clock is available to the sync path later.
  const clockAdapter = window.BlancBillboardClock?.create({
    read: () => request('clockRead'),
    save: patch => request('clockWrite', [patch]),
    model: window.BlancClockStyle,
  });
  async function refreshClock() {
    if (!clockAdapter) return;
    try {
      clockValue = await clockAdapter.data();
    } catch (error) {
      // Keep the Start Page usable when the clock store is unavailable.
      // Writes still reject; fallback presentation is not persistence proof.
      clockValue = window.BlancClockStyle.clockStyleFromSettings({});
      console.warn('Clock settings unavailable; using defaults', error);
    }
  }
  async function refreshLayout() {
    try {
      let value = await request('layoutRead');
      const oldLayout = read().layout;
      if (!value && !isPrivatePage && layouts.includes(oldLayout))
        value = await request('layoutInitialize', [oldLayout]);
      sharedLayout = layouts.includes(value) ? value : 'billboard';
    } catch (error) {
      console.warn('Shared Start Page layout unavailable', error);
      if (!sharedLayout) sharedLayout = isPrivatePage ? 'billboard' :
        (layouts.includes(read().layout) ? read().layout : 'billboard');
    }
  }
  function paintStoreTheme() {
    const enabled = usesStoreTheme(read());
    const picker = document.getElementById('storeThemeWallpaperPick');
    if (picker) {
      picker.hidden = !installedTheme.id;
      picker.setAttribute('aria-pressed', String(enabled));
    }
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
  const pinListeners = new Set();
  window.bowserPages = {
    appVersion: async () => 'Chromium prototype',
    pins: {
      list: () => request('pinsList'),
      pin: (url, title) => request('pinsPin', [url, typeof title === 'string' ? title : '']),
      unpin: url => request('pinsUnpin', [url]),
      onChanged: callback => { pinListeners.add(callback); return () => pinListeners.delete(callback); },
    },
    bookmarks: { list: async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const items = await request('bookmarks');
        if (items !== null) return items;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Bookmarks are still loading');
    } },
    start: {
      data: async () => {
        await Promise.all([refreshClock(), refreshLayout(), refreshImage().catch(() => {})]);
        return { ...preferences(), groups: [], remoteDevices: [], blockedThisWeek: 0,
          topSites: await request('topSites'), wallpaperVisible: !document.hidden };
      },
      setClock: async partial => {
        if (!clockAdapter) throw new Error('Clock controls unavailable');
        clockValue = await clockAdapter.setClock(partial);
        publish();
        return clockValue;
      },
      topSites: async () => [], // Chromium supplies its complete TopSites list above.
      setLayout: async (layout) => {
        if (!layouts.includes(layout)) throw new Error('Unknown start-page layout');
        const value = await request('layoutWrite', [layout]);
        sharedLayout = layouts.includes(value) ? value : 'billboard';
        publish();
        return sharedLayout;
      },
      chooseWallpaper,
      setWallpaper: async source => {
        if (source === 'web-store') {
          if (!installedTheme.id) throw new Error('No Web Store theme installed');
          return save({ storeThemeWallpaper: { id: installedTheme.id, enabled: true } }).wallpaper;
        }
        if (!['sunrise', 'time-of-day', 'custom', 'color'].includes(source)) throw new Error('Unknown wallpaper');
        if (source === 'sunrise' || source === 'time-of-day')
          return saveWallpaper({ source }, { ...disableStoreTheme(), dynamicWallpaperEnabled: source === 'time-of-day' });
        return saveWallpaper({ source }, disableStoreTheme());
      },
      removeWallpaper: async () => {
        if (!navigator.locks) throw new Error('Wallpaper storage unavailable');
        return navigator.locks.request(imageStore, async () => {
          const previous = read().wallpaper?.imageKey;
          const result = saveWallpaper({ image: null, imageKey: null, source: preferences().dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise' });
          ++imageGeneration;
          setImage(null, null);
          if (previous) await imageTransaction('readwrite', store => store.delete(previous)).catch(() => {});
          return result;
        });
      },
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
    clock: async () => { await refreshClock(); publish(); },
    layout: async () => { await refreshLayout(); publish(); },
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
    if (kind === "pins") { for (const fn of pinListeners) fn(); return; }
    if (!refreshers[kind] || pendingRefresh[kind]) return;
    if (kind === 'clock' || kind === 'layout') { refreshers[kind]().catch(error => console.warn(error.message)); return; }
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
