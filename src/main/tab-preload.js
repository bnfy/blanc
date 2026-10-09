// Least-privilege bridge for Blanc's internal pages. Each host receives only
// the capabilities used by that document; main independently binds every IPC
// call to the exact live WebContents and expected host.
const { contextBridge, ipcRenderer } = require('electron');
// Isolated-world invalidation only: no API is exposed to ordinary websites,
// and no DOM values, URLs, colors, or pixels cross this channel. Main chooses
// its own live foreground view and coalesces all requests before sampling.
if (typeof process !== 'undefined' && process.isMainFrame && (/^https?:$/.test(window.location.protocol)
  || (window.location.protocol === 'blanc:' && window.location.host === 'newtab'))) {
  let pending = null;
  let lastSignal = -Infinity;
  let observing = false;
  const atTop = (node) => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return false;
    if (element === document.documentElement || element === document.body || document.head?.contains(element)) return true;
    const box = element.getBoundingClientRect();
    return box.top <= 32 && box.bottom >= 0 && box.width > 0;
  };
  const signal = () => {
    if (document.hidden || pending !== null) return;
    pending = setTimeout(() => {
      pending = null;
      if (document.hidden) return;
      lastSignal = performance.now();
      ipcRenderer.send('page-tint:changed');
    }, Math.max(0, 100 - (performance.now() - lastSignal)));
  };
  const observer = new MutationObserver((records) => {
    // Large framework batches still produce only one bounded notification.
    if (records.length > 20 || records.some(record => atTop(record.target))) signal();
  });
  const stop = () => {
    observer.disconnect(); observing = false;
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };
  const start = () => {
    if (document.hidden || observing || !document.documentElement) return;
    observing = true;
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['class', 'style', 'data-wallpaper-phase'],
    });
    signal();
  };
  window.addEventListener('scroll', signal, { passive: true });
  window.addEventListener('resize', signal, { passive: true });
  for (const event of ['load', 'transitionrun', 'animationstart']) {
    document.addEventListener(event, event => { if (atTop(event.target)) signal(); }, true);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}


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
        topSites: (options) => invoke('pages:start:top-sites', options),
        focusGroup: (id) => invoke('pages:start:focus-group', id),
        setLayout: (name) => invoke('pages:start:set-layout', name),
        setDynamicWallpaper: (enabled) => invoke('pages:start:set-dynamic-wallpaper', enabled),
        openMahjong: (background = false) => invoke('pages:start:open-mahjong', !!background),
        layoutUsed: (name) => invoke('pages:start:layout-used', name),
        openIsland: (char) => invoke('pages:start:open-island', char),
        retryStartup: () => invoke('pages:start:startup-retry'),
        continueWithoutBlocking: () => invoke('pages:start:startup-continue'),
        recoverSession: (choice) => invoke('pages:start:recover-session', choice),
        completePrivacy: (choices) => invoke('pages:start:privacy-complete', choices),
        openSettings: (section) => invoke('pages:start:open-settings', section),
        dismissMigrationChecklist: () => invoke('pages:start:migration-checklist-dismiss'),
        dismissPatronCallout: () => invoke('pages:start:patron-callout-dismiss'),
        onUtilitySheetVisibility: (callback) => {
          ipcRenderer.on('pages:start:utility-sheet-visibility', (_event, visible) => callback(visible === true));
        },
        defaultBrowser: () => invoke('pages:default-browser:get'),
        setDefaultBrowser: () => invoke('pages:default-browser:set'),
        onboardingSet: (partial) => invoke('pages:start:onboarding-set', partial),
        onStatus: (callback) => {
          ipcRenderer.on('pages:start:status', (_event, status) => callback(status));
        },
        onVisibility: (callback) => {
          ipcRenderer.on('pages:start:visibility', (_event, visible) => callback(visible));
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
  } else if (host === 'error') {
    // Argument-free by design: main resolves this tab's own certificate
    // failure and re-checks eligibility (certificate spec §4.4).
    api = {
      errorPage: { continueUnsafe: () => invoke('pages:error:continue-unsafe') },
    };
  } else if (host === 'tab-handoff') {
    api = {
      surface,
      tabHandoff: {
        get: () => invoke('pages:tab-handoff:get'),
        accept: (destination) => invoke('pages:tab-handoff:accept', destination),
        cancel: () => invoke('pages:tab-handoff:cancel'),
      },
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
        resume: (id) => invoke('pages:downloads:resume', id),
        retry: (id) => invoke('pages:downloads:retry', id),
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
  } else if (host === 'tab-import') {
    api = {
      surface,
      tabImport: {
        sources: () => invoke('pages:tab-import:sources'),
        openSource: (id, options) => invoke('pages:tab-import:open-source', id, options),
        setSelection: (sessionId, selection) =>
          invoke('pages:tab-import:set-selection', sessionId, selection),
        suggestSourceGroups: (sessionId) =>
          invoke('pages:tab-import:suggest-source-groups', sessionId),
        suggestEmbed: (sessionId) =>
          invoke('pages:tab-import:suggest-embed', sessionId),
        submitEmbeddings: (sessionId, generation, matrix) =>
          invoke('pages:tab-import:submit-embeddings', sessionId, generation, matrix),
        apply: (sessionId, request) =>
          invoke('pages:tab-import:apply', sessionId, request),
        cancel: (sessionId) => invoke('pages:tab-import:cancel', sessionId),
      },
    };
  } else if (host === 'settings') {
    api = {
      surface,
      settings: {
        get: () => invoke('pages:settings:get'),
        blockingStatus: () => invoke('pages:blocking:status'),
        blockingRetry: () => invoke('pages:blocking:retry'),
        blockingOpen: (tool) => invoke('pages:blocking:open', tool),
        onBlockingStatus: (callback) => {
          ipcRenderer.on('pages:blocking:status', (_event, status) => callback(status));
        },
        checkForUpdates: () => invoke('pages:settings:check-for-updates'),
        set: (partial) => invoke('pages:settings:set', partial),
        onAppearance: (callback) => {
          ipcRenderer.on('pages:settings:appearance', (_event, status) => callback(status));
        },
        activateSupporter: (key) => invoke('pages:settings:supporter-activate', key),
        syncGet: () => invoke('pages:settings:sync-get'),
        syncEnable: (payload) => invoke('pages:settings:sync-enable', payload),
        syncPreflight: (payload) => invoke('pages:settings:sync-preflight', payload),
        syncDisable: (opts) => invoke('pages:settings:sync-disable', opts),
        syncNow: () => invoke('pages:settings:sync-now'),
        syncTabsSet: (on) => invoke('pages:settings:sync-tabs-set', on),
        welcomeTour: () => invoke('pages:settings:welcome-tour'),
        onePasswordStatus: () => invoke('pages:settings:onepassword-status'),
        onePasswordVerify: (account) => invoke('pages:settings:onepassword-verify', account),
        openOnePasswordApp: () => invoke('pages:settings:open-onepassword-app'),
        trustReceipt: () => invoke('pages:settings:trust-receipt'),
        openTrustLink: (kind) => invoke('pages:settings:open-trust-link', kind),
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
      diagnostics: {
        status: () => invoke('pages:diagnostics:status'),
        export: () => invoke('pages:diagnostics:export'),
        clear: () => invoke('pages:diagnostics:clear'),
      },
    };
  }

  if (api) contextBridge.exposeInMainWorld('bowserPages', api);
}
