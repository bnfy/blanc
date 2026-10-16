'use strict';
(() => {
  let nextId = 0;
  let snapshot = null;
  let serialized = '';
  let pillRect = null;
  let opened = false;
  let refreshing = false;
  let extensionsOpened = false;
  let geometry = "";
  const pending = new Map();
  const subscribers = new Map();
  const strip = document.getElementById('strip');
  const overlay = document.getElementById('overlay');

  function notice(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.hidden = false;
    console.warn(message);
  }

  function subscribe(event, callback) {
    if (!subscribers.has(event)) subscribers.set(event, new Set());
    subscribers.get(event).add(callback);
    return () => subscribers.get(event)?.delete(callback);
  }

  function emit(event, value) {
    for (const callback of subscribers.get(event) ?? []) {
      try { callback(value); } catch (error) { notice(error.message); }
    }
  }

  function request(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = String(++nextId);
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Native bridge timed out: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timeout });
      chrome.send('blancPrototype', [id, method, args]);
    });
  }

  window.blancPrototypeReply = (id, success, value) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timeout);
    (success ? entry.resolve : entry.reject)(success ? value : new Error(value));
  };

  function paintHeader() {
    const active = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
    const color = active?.private ? '#0a0a0a'
      : /^#[0-9a-f]{6}$/i.test(active?.pageBg) ? active.pageBg : '';
    document.documentElement.style.setProperty('--page-bg', color);
  }

  function pageTint(nativeTabId, color) {
    const id = String(nativeTabId);
    if (snapshot?.activeTabId !== id || (color && !/^#[0-9a-f]{6}$/i.test(color))) return;
    const tab = snapshot.tabs.find(tab => tab.id === id);
    if (!tab || tab.private) return;
    tab.pageBg = color;
    paintHeader();
    if (color) emit('onPageTint', { id, color });
    else emit('onTabsUpdated', snapshot);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      snapshot = await request('snapshot');
      // The contract's TabId is an opaque string, and the copied renderers
      // round-trip ids through DOM datasets (drag intents, keyboard moves,
      // context rows), so native integer ids become strings here and go
      // back through nativeId() on every call.
      for (const tab of snapshot.tabs) tab.id = String(tab.id);
      if (snapshot.activeTabId != null) snapshot.activeTabId = String(snapshot.activeTabId);
      paintHeader();
      const slot = strip.contentDocument?.getElementById('nativeExtensions');
      if (slot) slot.style.width = `${snapshot.extensionsWidth / 1.15}px`;
      reportGeometry();
      const next = JSON.stringify(snapshot);
      if (next !== serialized) {
        serialized = next;
        emit('onTabsUpdated', snapshot);
      }
    } catch (error) {
      notice(error.message);
    } finally {
      refreshing = false;
    }
  }

  function reportGeometry() {
    const slot = strip.contentDocument?.getElementById('nativeExtensions');
    const panel = extensionsOpened ? document.getElementById('extensionsPanel')
      : opened ? overlay.contentDocument?.getElementById('islandPanel')
      : strip.contentDocument?.getElementById('islandPill');
    if (!slot || !panel) return;
    const a = slot.getBoundingClientRect(), b = panel.getBoundingClientRect();
    const values = [a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height].map(Math.round);
    const next = JSON.stringify(values);
    if (next !== geometry) {
      geometry = next;
      request('geometry', values).catch(error => notice(error.message));
    }
  }

  async function show(prefill) {
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    await refresh();
    await request('height', [640]);
    opened = true;
    overlay.hidden = false;
    emit('onIslandState', { mode: 'panel' });
    requestAnimationFrame(() => {
      emit('onOverlayShow', { mode: 'panel', prefill, pillRect });
      if (prefill !== undefined) {
        const input = overlay.contentDocument.getElementById('addressInput');
        input.value = prefill;
        input.dispatchEvent(new overlay.contentWindow.Event('input', { bubbles: true }));
      }
      overlay.contentWindow.focus();
    });
  }

  async function close(focus = true) {
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    emit('onOverlayHide', {});
    emit('onIslandState', { mode: null });
    opened = false;
    overlay.hidden = true;
    await request('height', [68]);
    // Escape and outside clicks return focus to the page (Electron's
    // hideOverlay does the same); extension activation passes false so the
    // native popup takes focus instead.
    if (focus) await request('focusPage');
    reportGeometry();
  }

  const extensionsPanel = new window.BlancExtensions({
    request, close, refreshGeometry: reportGeometry, back: () => show(),
  });
  async function showExtensions() {
    if (extensionsOpened) return close();
    emit('onOverlayHide', {});
    emit('onIslandState', { mode: null });
    opened = false;
    overlay.hidden = true;
    extensionsOpened = true;
    strip.style.visibility = 'hidden';
    await request('height', [640]);
    await extensionsPanel.show();
    reportGeometry();
  }
  document.addEventListener('pointerdown', event => {
    if (extensionsOpened && !extensionsPanel.panel.contains(event.target)) close();
  });
  window.addEventListener('blur', () => {
    setTimeout(() => { if (extensionsOpened && !document.hasFocus()) close(); }, 0);
  });
  setInterval(() => extensionsPanel.update(), 1000);

  // Native handlers take the integer SessionID; anything else fails their
  // "real tab ID" check instead of matching by accident.
  function nativeId(id) {
    const n = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
    return Number.isInteger(n) ? n : -1;
  }

  function destination(value) {
    const text = String(value ?? '').trim();
    if (/^https?:\/\//i.test(text)) return text;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text) || /^localhost[:/]/i.test(text)) {
      return `https://${text}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }

  const implemented = {
    platform: 'darwin',
    getAllTabs: async () => snapshot ?? request('snapshot'),
    createTab: async (url, options) => {
      if (options?.private) throw new Error('Use Chromium’s native private-window command in this prototype.');
      await request('createTab', [url ? destination(url) : 'chrome://newtab/']);
      await refresh();
      if (options?.focusAddress) await show('');
    },
    navigate: async (id, value) => { await request('navigate', [nativeId(id), destination(value)]); await refresh(); },
    search: async (id, query) => {
      await request('navigate', [nativeId(id), `https://www.google.com/search?q=${encodeURIComponent(query)}`]);
      await refresh();
    },
    openPage: async (name) => {
      // Electron names Favorites `bookmarks` internally; Chromium's manager
      // pages stand in for Blanc's utility sheets in this prototype.
      if (!['downloads', 'extensions', 'bookmarks', 'history'].includes(name)) {
        throw new Error('Use Chromium’s native controls for this page in the prototype.');
      }
      await request('createTab', [`chrome://${name}/`]);
    },
    // Favorites and history are Chromium's own BookmarkModel and
    // HistoryService, shaped like Electron's records; see contract.json.
    // The copied hearts enable on any http(s) page without checking
    // `private`; like Electron's main, a private tab is a silent no-op here
    // (prototype.css also hides them under the private theme). The native
    // guard stays as defense in depth.
    toggleBookmark: async () => {
      const tab = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
      if (!tab || tab.private) return;
      await request('toggleBookmark', [nativeId(tab.id)]);
      await refresh();
    },
    saveFavorite: async (folder) => {
      const tab = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
      if (!tab || tab.private) return;
      await request('saveFavorite', [nativeId(tab.id), typeof folder === 'string' ? folder : '']);
      await refresh();
    },
    // Pin, mute and reorder are TabStripModel operations; the snapshot's
    // pinned/muted/audible fields feed the copied rows and pill unchanged.
    toggleTabPinned: async (id) => {
      const pinned = await request('togglePinned', [nativeId(id)]);
      await refresh();
      return pinned;
    },
    toggleTabMuted: async (id) => {
      const muted = await request('toggleMuted', [nativeId(id)]);
      await refresh();
      return muted;
    },
    moveTab: async (id, target) => {
      // Drag intents carry DOM dataset strings for both tab ids; group ids are
      // Chromium's TabGroupId strings straight from the snapshot.
      const groupId = typeof target?.groupId === 'string' ? target.groupId : null;
      const beforeId = target?.beforeId == null ? null : nativeId(target.beforeId);
      const moved = await request('moveTab', [nativeId(id), groupId, beforeId]);
      await refresh();
      return moved === true;
    },
    // Named groups are Chromium tab groups (TabStripModel), shaped as Blanc's
    // {id, name, collapsed}; names are lowercase labels and colour is unused.
    groupTabByName: async (id, name) => {
      await request('groupTabByName', [nativeId(id), String(name ?? '')]);
      await refresh();
    },
    setTabGroup: async (id, groupId) => {
      await request('setTabGroup', [nativeId(id), typeof groupId === 'string' ? groupId : null]);
      await refresh();
    },
    reorderGroup: async (groupId, beforeGroupId) => {
      const moved = await request('reorderGroup',
        [String(groupId), typeof beforeGroupId === 'string' ? beforeGroupId : null]);
      await refresh();
      return moved === true;
    },
    ...Object.fromEntries(['focusGroup', 'toggleGroupCollapsed', 'closeGroup'].map((method) =>
      [method, async (groupId) => { await request(method, [String(groupId)]); await refresh(); }])),
    // Destructive and history-only, like Electron's /clear; main refuses it
    // from a private window. Test on a disposable profile only.
    clearHistory: () => request('clearHistory'),
    listFavorites: () => request('listFavorites'),
    listHistory: (options) => {
      const limit = Number.isInteger(options?.limit) ? options.limit : 300;
      return request('listHistory', [Math.min(300, Math.max(1, limit))]);
    },
    listRemoteTabs: async () => [],
    listWorkspaces: async () => ({ items: [], tint: 'mark' }),
    searchSuggestions: async () => [],
    openIsland: () => show(),
    openIslandTyping: (character) => show(character),
    openIslandCommands: () => show('/'),
    closeOverlay: close,
    reportIslandRect: (rect) => { pillRect = rect; reportGeometry(); },
    reportChromeLayout: () => {},
    reportPanelDrawn: () => emit('onIslandCovered'),
    // Shared panel cleanup runs even though this prototype has no workspace actions.
    cancelWorkspaceAction: () => {},
    setWorkspaceSwitcherOpen: () => {},
    setOverlayDragState: () => {},
    acknowledgeDownloads: () => {},
  };

  for (const method of ['switchTab', 'closeTab', 'goBack', 'goForward', 'reload', 'stop']) {
    implemented[method] = async (id) => {
      await request(method, [nativeId(id)]);
      await refresh();
    };
  }

  const api = new Proxy(implemented, {
    get(target, property) {
      if (property in target) return target[property];
      if (String(property).startsWith('on')) return (callback) => subscribe(property, callback);
      return () => {
        const error = new Error(`Prototype does not implement ${String(property)}. Use Chromium’s native controls.`);
        notice(error.message);
        return Promise.reject(error);
      };
    },
  });

  window.BlancPrototypeHost = {
    api,
    notice,
    open: (newTab = false, text = '') => show(newTab ? text : undefined),
    extensions: showExtensions,
    escape: () => opened || extensionsOpened ? close() : undefined,
    refresh,
    pageTint,
  };

  window.addEventListener('unhandledrejection', (event) => {
    notice(event.reason?.message ?? String(event.reason));
  });
  window.addEventListener('resize', reportGeometry);
  setInterval(refresh, 300);
  refresh();
})();
