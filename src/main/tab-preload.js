// Least-privilege bridge for Blanc's internal pages. Each host receives only
// the capabilities used by that document; main independently binds every IPC
// call to the exact live WebContents and expected host.
const { contextBridge, ipcRenderer } = require('electron');

if (window.location.protocol === 'blanc:') {
  const host = window.location.host;
  const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
  const surface = {
    close: () => invoke('pages:surface:close'),
    /** Tell main Escape should close an in-page consumer first (Settings pickers). */
    armEscape: (armed) => invoke('pages:surface:escape-arm', !!armed),
    onEscape: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('pages:surface:escape', listener);
      return () => ipcRenderer.removeListener('pages:surface:escape', listener);
    },
  };
  let api = null;

  if (host === 'newtab') {
    api = {
      appVersion: () => invoke('pages:app-version'),
      bookmarks: {
        list: () => invoke('pages:bookmarks:list'),
        clearFavicon: (url) => invoke('pages:bookmarks:clear-favicon', url),
        browserSources: () => invoke('pages:bookmarks:browser-sources'),
        importBrowser: (id) => invoke('pages:bookmarks:import-browser', id),
        import: () => invoke('pages:bookmarks:import'),
      },
      start: {
        data: () => invoke('pages:start:data'),
        focusGroup: (id) => invoke('pages:start:focus-group', id),
        setLayout: (name) => invoke('pages:start:set-layout', name),
        layoutUsed: (name) => invoke('pages:start:layout-used', name),
        mahjongPlayed: () => invoke('pages:mahjong:played'),
        openIsland: (char) => invoke('pages:start:open-island', char),
        retryStartup: () => invoke('pages:start:startup-retry'),
        continueWithoutBlocking: () => invoke('pages:start:startup-continue'),
        completePrivacy: (choices) => invoke('pages:start:privacy-complete', choices),
        defaultBrowser: () => invoke('pages:default-browser:get'),
        setDefaultBrowser: () => invoke('pages:default-browser:set'),
        onboardingSet: (partial) => invoke('pages:start:onboarding-set', partial),
        onStatus: (callback) => {
          ipcRenderer.on('pages:start:status', (_event, status) => callback(status));
        },
        onRemoteTabs: (callback) => {
          ipcRenderer.on('pages:start:remote-tabs', (_event, devices) => callback(devices));
        },
      },
    };
  } else if (host === 'mahjong') {
    api = {
      mahjong: { played: () => invoke('pages:mahjong:played') },
    };
  } else if (host === 'bookmarks') {
    api = {
      surface,
      bookmarks: {
        list: () => invoke('pages:bookmarks:list'),
        remove: (id) => invoke('pages:bookmarks:remove', id),
        clearFavicon: (url) => invoke('pages:bookmarks:clear-favicon', url),
        import: () => invoke('pages:bookmarks:import'),
        browserSources: () => invoke('pages:bookmarks:browser-sources'),
        importBrowser: (id) => invoke('pages:bookmarks:import-browser', id),
        setFolder: (id, folder) => invoke('pages:bookmarks:set-folder', id, folder),
        renameFolder: (oldName, newName) => invoke('pages:bookmarks:rename-folder', oldName, newName),
        removeFolder: (name) => invoke('pages:bookmarks:remove-folder', name),
      },
    };
  } else if (host === 'history') {
    api = {
      surface,
      history: {
        list: (opts) => invoke('pages:history:list', opts),
        remove: (url, visitedAt) => invoke('pages:history:remove', url, visitedAt),
        clear: () => invoke('pages:history:clear'),
      },
    };
  } else if (host === 'downloads') {
    api = {
      surface,
      downloads: {
        list: () => invoke('pages:downloads:list'),
        cancel: (id) => invoke('pages:downloads:cancel', id),
        open: (id) => invoke('pages:downloads:open', id),
        show: (id) => invoke('pages:downloads:show', id),
        clearFinished: () => invoke('pages:downloads:clear-finished'),
      },
    };
  } else if (host === 'shortcuts') {
    api = {
      surface,
      shortcuts: { list: () => invoke('pages:shortcuts:list') },
    };
  } else if (host === 'settings') {
    api = {
      surface,
      settings: {
        get: () => invoke('pages:settings:get'),
        set: (partial) => invoke('pages:settings:set', partial),
        activateSupporter: (key) => invoke('pages:settings:supporter-activate', key),
        syncGet: () => invoke('pages:settings:sync-get'),
        syncEnable: (payload) => invoke('pages:settings:sync-enable', payload),
        syncDisable: (opts) => invoke('pages:settings:sync-disable', opts),
        syncNow: () => invoke('pages:settings:sync-now'),
        syncTabsSet: (on) => invoke('pages:settings:sync-tabs-set', on),
        welcomeTour: () => invoke('pages:settings:welcome-tour'),
        onePasswordStatus: () => invoke('pages:settings:onepassword-status'),
        onePasswordVerify: (account) => invoke('pages:settings:onepassword-verify', account),
        openOnePasswordApp: () => invoke('pages:settings:open-onepassword-app'),
      },
      profiles: {
        list: () => invoke('pages:profiles:list'),
        create: (name) => invoke('pages:profiles:create', name),
        open: (id) => invoke('pages:profiles:open', id),
        rename: (id, name) => invoke('pages:profiles:rename', id, name),
        remove: (id, confirmation) => invoke('pages:profiles:remove', id, confirmation),
      },
      permissions: {
        list: () => invoke('pages:permissions:list'),
        remove: (key) => invoke('pages:permissions:remove', key),
      },
      defaultBrowser: {
        get: () => invoke('pages:default-browser:get'),
        set: () => invoke('pages:default-browser:set'),
      },
      clearBrowsingData: () => invoke('pages:clear-browsing-data'),
      resetInstallId: () => invoke('pages:telemetry:reset-install-id'),
    };
  }

  if (api) contextBridge.exposeInMainWorld('bowserPages', api);
}
