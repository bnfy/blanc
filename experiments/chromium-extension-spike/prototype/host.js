'use strict';
(() => {
  let nextId = 0;
  let snapshot = null;
  let serialized = '';
  let pillRect = null;
  let opened = false;
  let overlayMode = null;
  let findTabId = null;
  let refreshing = false;
  let extensionsOpened = false;
  let geometry = "";
  let layout = localStorage.getItem('blanc.prototype.tabLayout') === 'vertical' ? 'vertical' : 'island';
  let railWidth = Math.max(200, Math.min(360, Number(localStorage.getItem('blanc.prototype.railWidth')) || 248));
  let closedBefore = localStorage.getItem('blanc.prototype.closedBefore');
  async function applyRail(persist = false) {
    railWidth = await request('rail', [layout === 'vertical', Math.round(railWidth)]);
    strip.style.height = layout === 'vertical' ? '100%' : '68px';
    if (persist) {
      localStorage.setItem('blanc.prototype.tabLayout', layout);
      localStorage.setItem('blanc.prototype.railWidth', String(railWidth));
    }
    await refresh();
    emit('onVerticalTabsWidth', snapshot);
    return railWidth;
  }
  const pending = new Map();
  const subscribers = new Map();
  const strip = document.getElementById('strip');
  const overlay = document.getElementById('overlay');
  const tooltip = document.createElement('div');
  tooltip.id = 'prototypeTooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

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
      for (const key of ['focusedTabId', 'glanceTabId']) {
        if (snapshot[key] != null) snapshot[key] = String(snapshot[key]);
      }
      const items = strip.contentWindow?.TabSections?.itemsOf(snapshot.tabs) ?? [];
      const beforeIndex = items.findIndex(item => item.id === closedBefore);
      snapshot.closedSlot = beforeIndex < 0 ? items.length : beforeIndex;
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
      : opened ? overlay.contentDocument?.getElementById(overlayMode === 'find' ? 'findBar' : 'islandPanel')
      : strip.contentDocument?.getElementById('islandPill');
    if (!slot || !panel) return;
    const a = slot.getBoundingClientRect();
    // The palette scrim owns outside clicks across the whole viewport.
    const b = opened && overlayMode === 'palette'
      ? { x: 0, y: 0, width: innerWidth, height: innerHeight }
      : panel.getBoundingClientRect();
    const offsetY = opened && overlayMode === 'find' ? 68 : 0;
    const values = [a.x, a.y, a.width, a.height, b.x, b.y + offsetY, b.width, b.height].map(Math.round);
    const next = JSON.stringify(values);
    if (next !== geometry) {
      geometry = next;
      request('geometry', values).catch(error => notice(error.message));
    }
  }

  async function show(prefill, mode = 'panel') {
    if (overlayMode === 'find') emit('onOverlayHide', {});
    findTabId = null;
    overlay.dataset.mode = mode;
    tooltip.hidden = true;
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    await refresh();
    await request('height', [mode === 'palette' ? 10000 : 640]);
    overlayMode = mode;
    opened = true;
    overlay.hidden = false;
    emit('onIslandState', { mode });
    requestAnimationFrame(() => {
      emit('onOverlayShow', { mode, prefill, pillRect });
      reportGeometry();
      if (prefill !== undefined) {
        const input = overlay.contentDocument.getElementById('addressInput');
        input.value = prefill;
        input.dispatchEvent(new overlay.contentWindow.Event('input', { bubbles: true }));
      }
      overlay.contentWindow.focus();
    });
  }

  async function openFindBar() {
    await refresh();
    if (!snapshot?.activeTabId) return;
    if (overlayMode !== 'find') emit('onOverlayHide', {});
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    findTabId = snapshot.focusedTabId ?? snapshot.activeTabId;
    // Find can open before the copied panel renderer applies its theme.
    const findRoot = overlay.contentDocument?.documentElement;
    if (findRoot) {
      if (snapshot.tabs.find(tab => tab.id === findTabId)?.private)
        findRoot.dataset.theme = 'private';
      else delete findRoot.dataset.theme;
    }
    overlayMode = 'find';
    overlay.dataset.mode = 'find';
    await request('height', [228]);
    opened = true;
    overlay.hidden = false;
    emit('onIslandState', { mode: 'find' });
    requestAnimationFrame(() => {
      emit('onOverlayShow', { mode: 'find', purpose: { findTabId } });
      overlay.contentWindow.focus();
      reportGeometry();
    });
  }

  async function close(focus = true) {
    tooltip.hidden = true;
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    emit('onOverlayHide', {});
    emit('onIslandState', { mode: null });
    opened = false;
    overlayMode = null;
    findTabId = null;
    overlay.dataset.mode = '';
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
    overlayMode = null;
    findTabId = null;
    overlay.dataset.mode = '';
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
    setTabLayout: async value => { layout = value === 'vertical' ? 'vertical' : 'island'; await applyRail(true); return layout; },
    setVerticalTabsWidth: async width => { railWidth = Number(width) || 248; return applyRail(true); },
    previewVerticalTabsWidth: async width => { railWidth = Number(width) || 248; return applyRail(); },
    activateTabFromRail: async id => { await request('switchTab', [nativeId(id)]); await request('focusPage'); await refresh(); },
    toggleSiteMute: async id => { const result = await request('toggleSiteMute', [nativeId(id)]); await refresh(); return result; },
    moveClosedSection: async before => { closedBefore = before == null ? null : String(before); localStorage.setItem('blanc.prototype.closedBefore', closedBefore ?? ''); await refresh(); return true; },
    showTooltip: ({ text, anchor, privateTheme }) => {
      if (opened || extensionsOpened || !anchor || !Number.isFinite(anchor.x)) return;
      tooltip.textContent = String(text).slice(0, 180);
      tooltip.hidden = false;
      tooltip.dataset.private = String(privateTheme === true);
      const width = tooltip.getBoundingClientRect().width;
      tooltip.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, anchor.x + anchor.width / 2 - width / 2))}px`;
      tooltip.style.top = `${Math.max(0, Math.min(44, anchor.y + anchor.height + 4))}px`;
    },
    hideTooltip: () => { tooltip.hidden = true; },
    bangs: async () => ({ enabled: false, custom: [], recent: [] }),
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
    ...Object.fromEntries(['focusGroup', 'toggleGroupCollapsed', 'closeGroup', 'newTabInGroup', 'ungroupGroup', 'moveGroupToNewWindow'].map((method) =>
      [method, async (groupId) => { await request(method, [String(groupId)]); await refresh(); }])),
    ...Object.fromEntries(['renameGroup', 'setGroupColor'].map(method =>
      [method, async (groupId, value) => {
        const result = await request(method, [String(groupId), value ?? null]);
        await refresh();
        return result;
      }])),
    // Destructive and history-only, like Electron's /clear; main refuses it
    // from a private window. Test on a disposable profile only.
    clearHistory: () => request('clearHistory'),
    listFavorites: () => request('listFavorites'),
    listHistory: (options) => {
      const limit = Number.isInteger(options?.limit) ? options.limit : 300;
      return request('listHistory', [Math.min(300, Math.max(1, limit))]);
    },
    listRemoteTabs: async () => [],
    // Internal migration probes; no user-facing Glance acceptance yet.
    previewGlancePair: (main, reference) => request('previewGlancePair', [nativeId(main), nativeId(reference)]),
    previewGlanceClose: id => request('previewGlanceClose', [nativeId(id)]),
    previewSpaceSave: name => request('previewSpaceSave', [name]),
    previewSpaceList: () => request('previewSpaceList'),
    previewSpaceOpen: name => request('previewSpaceOpen', [name]),
    listWorkspaces: async () => ({ items: [], tint: 'mark' }),
    searchSuggestions: async () => [],
    openFindBar,
    findInPage: (id, query, options = {}) => request('find',
      [nativeId(id), String(query), options.forward !== false, options.findNext !== false]),
    // Teardown can race navigation/tab closure; never search a replacement tab.
    stopFindInPage: async (id) => {
      emit('onFindResult', { activeMatchOrdinal: 0, matches: 0 });
      return request('stopFind', [nativeId(id)]).catch(() => false);
    },
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

  for (const method of ['reopenClosedTab', 'reopenClosedEntry', 'forgetClosedEntry', 'clearClosedEntries']) {
    implemented[method] = async (...args) => {
      const result = await request(method, args.map(String));
      await refresh();
      return result;
    };
  }

  for (const method of ['switchTab', 'closeTab', 'goBack', 'goForward', 'reload', 'stop', 'newTabBelow', 'closeAbove', 'closeBelow']) {
    implemented[method] = async (id) => {
      const pageCommand = ['goBack', 'goForward', 'reload', 'stop'].includes(method);
      const routed = pageCommand && String(id) === snapshot?.activeTabId
        ? snapshot.focusedTabId ?? id : id;
      await request(method, [nativeId(routed)]);
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
    open: (newTab = false, text = '') => {
      if (!newTab && opened && overlayMode !== 'find') { emit('onOverlayToggle'); return; }
      return show(newTab ? text : undefined, newTab ? 'panel' : 'palette');
    },
    extensions: showExtensions,
    escape: () => opened || extensionsOpened ? close() : undefined,
    refresh,
    pageTint,
    findResult: (id, activeMatchOrdinal, matches, finalUpdate) => {
      if (overlayMode === 'find' && String(id) === findTabId)
        emit('onFindResult', { activeMatchOrdinal, matches, finalUpdate });
    },
    findStep: (forward) => {
      if (overlayMode !== 'find') return openFindBar();
      const query = overlay.contentDocument.getElementById('findInput').value;
      if (query && findTabId) return implemented.findInPage(findTabId, query,
        { forward, findNext: false });
    },
    findReset: () => { if (overlayMode === 'find') close(false); },
  };
  // The strip and overlay adapters read parent.BlancPrototypeHost as they
  // load, so the frames start only once it exists. A src in the markup let a
  // fast relaunch load the overlay first and leave its bridge undefined.
  strip.src = strip.dataset.src;
  overlay.src = overlay.dataset.src;

  window.addEventListener('unhandledrejection', (event) => {
    notice(event.reason?.message ?? String(event.reason));
  });
  window.addEventListener('resize', reportGeometry);
  setInterval(refresh, 300);
  applyRail().catch(error => notice(error.message));
})();
