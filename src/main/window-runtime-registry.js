// In-memory ownership model for BrowserWindow-local browser chrome.
//
// This deliberately has no Electron dependency. A runtime holds the native
// window reference plus the surfaces and tab identity that must never leak to
// another window. The first post-1.0 wiring attaches the existing primary
// window; later multi-window work can create the same record for every
// BrowserWindow without reintroducing process-wide overlay or sheet state.

function validRuntimeId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function createRuntime(id, browserWindow, profileId) {
  return {
    id,
    profileId,
    browserWindow,
    overlayView: null,
    overlayMode: null,
    overlayPrefill: null,
    // A tiny macOS-only surface that backs the native traffic lights while
    // the scroll-away Island has released the rest of its landing zone.
    trafficLightIslandView: null,
    trafficLightIslandVisible: false,
    addressMenuTicket: 0,
    addressMenuSeq: 0,
    utilitySheetView: null,
    utilitySheetUrl: null,
    activeTabId: null,
    tabOrder: [],
    groups: [],
    recentlyClosed: [],
    glanceTabId: null,
    // Scroll-away Island experiment. The visual hide begins immediately, then
    // the page claims the former Island gutter after its short exit motion.
    // Both states are window-local; a second window must never inherit them.
    islandHidden: false,
    islandPageExpanded: false,
    islandHideTimer: null,
    tabIds: new Set(),
  };
}

function createWindowRuntimeRegistry() {
  const runtimes = new Map();
  const tabOwners = new Map();
  // BrowserWindow owns the chrome document, while the overlay and sheet are
  // sibling WebContentsViews. Keep their association in the runtime rather
  // than trusting an IPC payload to name a window. A future second window can
  // therefore only operate on the runtime that actually owns its sender.
  const windowOwners = new WeakMap();

  function requireRuntime(id) {
    const runtime = runtimes.get(id);
    if (!runtime) throw new Error('Unknown window runtime: ' + id);
    return runtime;
  }

  function register({ id, browserWindow, profileId = 'default' }) {
    if (!validRuntimeId(id)) throw new Error('Invalid window runtime id');
    if (!validRuntimeId(profileId)) throw new Error('Invalid local profile id');
    if (!browserWindow) throw new Error('A BrowserWindow is required');
    const existing = runtimes.get(id);
    if (existing && existing.profileId !== profileId) {
      throw new Error('Window runtime profile cannot change while it exists');
    }
    if (existing?.browserWindow && existing.browserWindow !== browserWindow) {
      throw new Error('Window runtime is already attached: ' + id);
    }
    const runtime = existing ?? createRuntime(id, browserWindow, profileId);
    if (runtime.browserWindow && runtime.browserWindow !== browserWindow) {
      windowOwners.delete(runtime.browserWindow);
    }
    runtime.browserWindow = browserWindow;
    windowOwners.set(browserWindow, runtime);
    runtimes.set(id, runtime);
    return runtime;
  }

  // BrowserWindow close on macOS leaves tabs alive for a dock reopen. Detach
  // native chrome, but retain the runtime's tab ownership and selection so a
  // replacement window can attach them without making those tabs global.
  function detach(id, browserWindow) {
    const runtime = requireRuntime(id);
    if (browserWindow && runtime.browserWindow !== browserWindow) return null;
    if (runtime.browserWindow) windowOwners.delete(runtime.browserWindow);
    runtime.browserWindow = null;
    runtime.overlayView = null;
    runtime.overlayMode = null;
    runtime.overlayPrefill = null;
    runtime.trafficLightIslandView = null;
    runtime.trafficLightIslandVisible = false;
    runtime.addressMenuTicket = 0;
    runtime.utilitySheetView = null;
    runtime.utilitySheetUrl = null;
    if (runtime.islandHideTimer) clearTimeout(runtime.islandHideTimer);
    runtime.islandHideTimer = null;
    runtime.islandHidden = false;
    runtime.islandPageExpanded = false;
    return runtime;
  }

  // A user-closed secondary window has no dock-reopen contract. Remove its
  // runtime after its tab resources have been released so it cannot appear in
  // later broadcasts or a future session restore.
  function discard(id, browserWindow) {
    const runtime = requireRuntime(id);
    if (browserWindow && runtime.browserWindow !== browserWindow) return null;
    if (runtime.browserWindow) windowOwners.delete(runtime.browserWindow);
    for (const tabId of runtime.tabIds) tabOwners.delete(tabId);
    runtimes.delete(id);
    return runtime;
  }

  function setOverlay(id, { view, mode = null, prefill = null } = {}) {
    const runtime = requireRuntime(id);
    runtime.overlayView = view ?? null;
    runtime.overlayMode = mode ?? null;
    runtime.overlayPrefill = prefill ?? null;
    return runtime;
  }

  function setUtilitySheet(id, { view, url = null } = {}) {
    const runtime = requireRuntime(id);
    runtime.utilitySheetView = view ?? null;
    runtime.utilitySheetUrl = url ?? null;
    return runtime;
  }

  function claimTab(id, tabId) {
    if (typeof tabId !== 'string' || !tabId) throw new Error('Invalid tab id');
    const runtime = requireRuntime(id);
    const owner = tabOwners.get(tabId);
    if (owner && owner !== id) throw new Error('Tab already belongs to: ' + owner);
    tabOwners.set(tabId, id);
    runtime.tabIds.add(tabId);
    return runtime;
  }

  function releaseTab(tabId) {
    const owner = tabOwners.get(tabId);
    if (!owner) return null;
    tabOwners.delete(tabId);
    const runtime = runtimes.get(owner);
    if (!runtime) return null;
    runtime.tabIds.delete(tabId);
    if (runtime.activeTabId === tabId) runtime.activeTabId = null;
    return owner;
  }

  function setActiveTab(id, tabId) {
    const runtime = requireRuntime(id);
    if (tabId !== null && !runtime.tabIds.has(tabId)) {
      throw new Error('Active tab must belong to its window runtime');
    }
    runtime.activeTabId = tabId;
    return runtime;
  }

  function ownerForTab(tabId) {
    return tabOwners.get(tabId) ?? null;
  }

  function get(id) {
    return runtimes.get(id) ?? null;
  }

  function getByBrowserWindow(browserWindow) {
    return (browserWindow && windowOwners.get(browserWindow)) ?? null;
  }

  // Chrome IPC is valid only from the BrowserWindow's own renderer or its
  // registered overlay. Utility sheets are included so their guarded close
  // action can resolve ownership too, but ordinary tab WebContents are never
  // classified as trusted chrome by this lookup.
  function getByChromeWebContents(webContents) {
    if (!webContents) return null;
    for (const runtime of runtimes.values()) {
      if (runtime.browserWindow?.webContents === webContents) return runtime;
      if (runtime.overlayView?.webContents === webContents) return runtime;
      if (runtime.utilitySheetView?.webContents === webContents) return runtime;
    }
    return null;
  }

  function all() {
    return [...runtimes.values()];
  }

  return {
    register,
    detach,
    discard,
    get,
    setOverlay,
    setUtilitySheet,
    claimTab,
    releaseTab,
    setActiveTab,
    ownerForTab,
    getByBrowserWindow,
    getByChromeWebContents,
    all,
  };
}

module.exports = {
  validRuntimeId,
  createWindowRuntimeRegistry,
};
