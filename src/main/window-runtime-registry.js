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

function createRuntime(id, browserWindow) {
  return {
    id,
    browserWindow,
    overlayView: null,
    overlayMode: null,
    overlayPrefill: null,
    addressMenuTicket: 0,
    addressMenuSeq: 0,
    utilitySheetView: null,
    utilitySheetUrl: null,
    activeTabId: null,
    tabOrder: [],
    groups: [],
    tabIds: new Set(),
  };
}

function createWindowRuntimeRegistry() {
  const runtimes = new Map();
  const tabOwners = new Map();

  function requireRuntime(id) {
    const runtime = runtimes.get(id);
    if (!runtime) throw new Error('Unknown window runtime: ' + id);
    return runtime;
  }

  function register({ id, browserWindow }) {
    if (!validRuntimeId(id)) throw new Error('Invalid window runtime id');
    if (!browserWindow) throw new Error('A BrowserWindow is required');
    const existing = runtimes.get(id);
    if (existing?.browserWindow && existing.browserWindow !== browserWindow) {
      throw new Error('Window runtime is already attached: ' + id);
    }
    const runtime = existing ?? createRuntime(id, browserWindow);
    runtime.browserWindow = browserWindow;
    runtimes.set(id, runtime);
    return runtime;
  }

  // BrowserWindow close on macOS leaves tabs alive for a dock reopen. Detach
  // native chrome, but retain the runtime's tab ownership and selection so a
  // replacement window can attach them without making those tabs global.
  function detach(id, browserWindow) {
    const runtime = requireRuntime(id);
    if (browserWindow && runtime.browserWindow !== browserWindow) return null;
    runtime.browserWindow = null;
    runtime.overlayView = null;
    runtime.overlayMode = null;
    runtime.overlayPrefill = null;
    runtime.addressMenuTicket = 0;
    runtime.utilitySheetView = null;
    runtime.utilitySheetUrl = null;
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

  return {
    register,
    detach,
    get,
    setOverlay,
    setUtilitySheet,
    claimTab,
    releaseTab,
    setActiveTab,
    ownerForTab,
  };
}

module.exports = {
  validRuntimeId,
  createWindowRuntimeRegistry,
};
