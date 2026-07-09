// Preload attached to every tab WebContentsView and OAuth-style popup.
// Web content gets only a small Chrome-compatibility surface (window.chrome
// app/csi/loadTimes). The privileged IPC bridge is exposed only when the
// document is one of our own blanc:// internal pages (the check re-runs on
// every navigation, so a tab that leaves an internal page loses the API).
// The main process additionally verifies the sender URL on every pages:* IPC
// call.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

webFrame.executeJavaScript(`
(() => {
  const define = (target, key, value) => {
    if (target && !Object.prototype.hasOwnProperty.call(target, key)) {
      Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  };
  window.chrome = window.chrome || {};
  define(window.chrome, 'app', {
    isInstalled: false,
    InstallState: {
      DISABLED: 'disabled',
      INSTALLED: 'installed',
      NOT_INSTALLED: 'not_installed',
    },
    RunningState: {
      CANNOT_RUN: 'cannot_run',
      READY_TO_RUN: 'ready_to_run',
      RUNNING: 'running',
    },
    getDetails: () => null,
    getIsInstalled: () => false,
    installState: (callback) => {
      if (typeof callback === 'function') setTimeout(() => callback('not_installed'), 0);
    },
    runningState: () => 'cannot_run',
  });
  define(window.chrome, 'csi', () => {
    const timing = performance.timing || {};
    const navigationStart = timing.navigationStart || performance.timeOrigin || Date.now();
    return {
      onloadT: timing.loadEventStart || 0,
      startE: navigationStart,
      pageT: Math.max(0, Date.now() - navigationStart),
      tran: 15,
    };
  });
  define(window.chrome, 'loadTimes', () => {
    const timing = performance.timing || {};
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const navigationStart = timing.navigationStart || performance.timeOrigin || Date.now();
    const seconds = (value) => (value || navigationStart) / 1000;
    return {
      requestTime: seconds(navigationStart),
      startLoadTime: seconds(navigationStart),
      commitLoadTime: seconds(timing.responseStart),
      finishDocumentLoadTime: seconds(timing.domContentLoadedEventEnd),
      finishLoadTime: seconds(timing.loadEventEnd || timing.loadEventStart),
      firstPaintTime: 0,
      firstPaintAfterLoadTime: 0,
      navigationType: nav?.type || 'Other',
      wasFetchedViaSpdy: false,
      wasNpnNegotiated: false,
      npnNegotiatedProtocol: 'unknown',
      wasAlternateProtocolAvailable: false,
      connectionInfo: 'unknown',
    };
  });
})();
`, true).catch(() => {});

if (window.location.protocol === 'blanc:') {
  contextBridge.exposeInMainWorld('bowserPages', {
    appVersion: () => ipcRenderer.invoke('pages:app-version'),
    bookmarks: {
      list: () => ipcRenderer.invoke('pages:bookmarks:list'),
      remove: (id) => ipcRenderer.invoke('pages:bookmarks:remove', id),
      clearFavicon: (url) => ipcRenderer.invoke('pages:bookmarks:clear-favicon', url),
    },
    history: {
      list: (opts) => ipcRenderer.invoke('pages:history:list', opts),
      remove: (url, visitedAt) => ipcRenderer.invoke('pages:history:remove', url, visitedAt),
      clear: () => ipcRenderer.invoke('pages:history:clear'),
    },
    downloads: {
      list: () => ipcRenderer.invoke('pages:downloads:list'),
      cancel: (id) => ipcRenderer.invoke('pages:downloads:cancel', id),
      open: (id) => ipcRenderer.invoke('pages:downloads:open', id),
      show: (id) => ipcRenderer.invoke('pages:downloads:show', id),
      clearFinished: () => ipcRenderer.invoke('pages:downloads:clear-finished'),
    },
    start: {
      data: () => ipcRenderer.invoke('pages:start:data'),
      focusGroup: (id) => ipcRenderer.invoke('pages:start:focus-group', id),
    },
    shortcuts: {
      list: () => ipcRenderer.invoke('pages:shortcuts:list'),
    },
    settings: {
      get: () => ipcRenderer.invoke('pages:settings:get'),
      set: (partial) => ipcRenderer.invoke('pages:settings:set', partial),
      activateSupporter: (key) => ipcRenderer.invoke('pages:settings:supporter-activate', key),
      syncGet: () => ipcRenderer.invoke('pages:settings:sync-get'),
      syncEnable: (payload) => ipcRenderer.invoke('pages:settings:sync-enable', payload),
      syncDisable: (opts) => ipcRenderer.invoke('pages:settings:sync-disable', opts),
      syncNow: () => ipcRenderer.invoke('pages:settings:sync-now'),
    },
    permissions: {
      list: () => ipcRenderer.invoke('pages:permissions:list'),
      remove: (key) => ipcRenderer.invoke('pages:permissions:remove', key),
    },
    defaultBrowser: {
      get: () => ipcRenderer.invoke('pages:default-browser:get'),
      set: () => ipcRenderer.invoke('pages:default-browser:set'),
    },
    clearBrowsingData: () => ipcRenderer.invoke('pages:clear-browsing-data'),
  });
}
