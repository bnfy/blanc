const {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  ipcMain,
  Menu,
  nativeTheme,
  nativeImage,
  dialog,
  shell,
  desktopCapturer,
  webContents,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { pathToFileURL } = require('url');
const {
  setupAdBlocker,
  attachAdBlockerToSession,
  setAdBlockEnabled,
  onRequestBlocked,
} = require('./adblock');
const { webrtcPolicyFor, hostResolverOptionsFor } = require('./network-privacy');
const {
  chromeClientHintPlatform,
  chromeClientHintArchitecture,
  chromeClientHintBitness,
  chromeClientHintPlatformVersion,
} = require('./chrome-client-hints');
const { registerPagesScheme, setupPages } = require('./pages');
const {
  setupPermissionPolicy,
  setPermissionPrompter,
  setDisplayMediaPrompter,
} = require('./permissions');
const { setupAutoUpdater, checkForUpdatesManually } = require('./updater');
const { sendLaunchPing } = require('./telemetry');
const sync = require('./sync');
const tabsync = require('./tabsync');
const tabicons = require('./tabicons');
const iconRaster = require('./icon-raster');
const { setupDownloads, downloadsActivity, acknowledgeDownloads } = require('./downloads');
const { attachContextMenu } = require('./context-menu');
const { attachAddressMenu } = require('./address-menu');
const { promptForCredentials } = require('./auth-dialog');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const { groupFavoritesForMenu } = require('./bookmark-data');
const history = require('./history');
const { JsonStore } = require('./store');
const { persistableEntries } = require('./session-snapshot');
const { filterRestoredSession } = require('./session-restore');
const {
  PRIMARY_WINDOW_ID,
  readSessionWorkspace,
  activeWorkspaceWindow,
  replaceWorkspaceWindow,
  removeWorkspaceWindow,
  replaceObject,
} = require('./session-workspace');
const { createWindowRuntimeRegistry } = require('./window-runtime-registry');
const { isUtilityUrl } = require('./utility-pages');
const { shouldClearFaviconOnNavigate } = require('./favicon-policy');
const { setupWebAuthn } = require('./webauthn');
const { HANDOFF_PROTOCOLS, classifyExternalNavigation } = require('./external-protocols');
const { isTrustedSender } = require('./ipc-trust');
const { applyDockAppIcon } = require('./app-icon');
const { createSearchSuggestionService } = require('./search-suggestions');
const { createAdblockStartupController } = require('./adblock-startup');
const {
  normalizeTabLayout,
  normalizeVerticalTabsWidth,
  calculateChromeLayout,
} = require('./chrome-layout');
const { reorderWithinBucket } = require('./tab-order');
const {
  captureRequestStillValid,
} = require('./display-share-request');
const {
  sanitizeCertificate,
  createCertificateObserver,
  buildSiteInfo,
  certificateErrorQuery,
} = require('./site-security');

const NEW_TAB_URL = 'blanc://newtab/';
const newTabUrl = () => settings.getSettings().homePage || NEW_TAB_URL;
// The query flag tells the newtab page to show private copy + theme.
const PRIVATE_NEW_TAB_URL = 'blanc://newtab/?private=1';
const certificateObserver = createCertificateObserver();
// Exact, unpackaged-only gate for the Electron acceptance harness. A stray
// BLANC_TEST=0/false in a real launch must not weaken normal chrome behavior.
const acceptanceTestMode = !app.isPackaged && process.env.BLANC_TEST === '1';
// Exact packaged-smoke gate for the corrupt-cache/offline recovery path.
// It is deliberately inert in ordinary launches and keeps the acceptance
// harness's unpackaged-only semantics unchanged.
const requestedPackagedAdblockFailureTestMode =
  app.isPackaged && process.env.BLANC_TEST === '1'
    ? process.env.BLANC_TEST_ADBLOCK_FAILURE
    : null;
const packagedAdblockFailureTestMode =
  requestedPackagedAdblockFailureTestMode === 'once' ||
  requestedPackagedAdblockFailureTestMode === 'always'
    ? requestedPackagedAdblockFailureTestMode
    : null;
let packagedAdblockInitializationFailuresRemaining =
  packagedAdblockFailureTestMode === 'once' ? 1 : 0;
const packagedAdblockTestFetch = (...args) => {
  if (packagedAdblockFailureTestMode === 'always') {
    return Promise.reject(new Error('packaged smoke: simulated offline fetch'));
  }
  return fetch(...args);
};

// Dev runs (`npm start`) get their own userData so a dev instance never
// shares — and corrupts — the installed app's profile: two Chromium
// browser processes writing one profile's LevelDB/extension state
// SIGSEGVs both (observed 2026-07-04, identical CrBrowserMain crashes in
// dev and installed builds within seconds of each other).
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-Dev`);
}

// One-time migration for existing installs: userData's location is
// derived from productName, so the Bowser -> Blanc rename would otherwise
// start every existing user on an empty profile. Copy the old directory
// forward exactly once, before anything (JsonStores, adblock cache,
// single-instance lock) touches the new one.
if (app.isPackaged) {
  const oldUserDataDir = path.join(app.getPath('appData'), 'Bowser');
  const newUserDataDir = app.getPath('userData');
  if (!fs.existsSync(newUserDataDir) && fs.existsSync(oldUserDataDir)) {
    fs.cpSync(oldUserDataDir, newUserDataDir, { recursive: true });
  }
}

// Snapshot whether this is a genuinely new Blanc profile before Chromium's
// ready phase creates its own directories. settings.json is not sufficient:
// old versions did not write it until a setting changed, while session.json
// and the other product stores still prove the app has run before.
const existingProfileMarkers = [
  'settings.json',
  'session.json',
  'history.json',
  'bookmarks.json',
  'downloads.json',
  'sync.json',
  'install.json',
];
settings.setExistingProfileHint(
  existingProfileMarkers.some((name) =>
    fs.existsSync(path.join(app.getPath('userData'), name))
  )
);

// One instance per profile: a second launch defers to the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, commandLine) => {
    for (const url of urlsFromArgv(commandLine)) openExternalUrl(url);
    const browserWindow = currentBrowserWindow();
    if (browserWindow) {
      if (browserWindow.isMinimized()) browserWindow.restore();
      browserWindow.focus();
    }
  });

  // Chrome-extension support used to live here (electron-chrome-extensions
  // + web store, plus crash-loop recovery for extension profile state). It
  // was removed: the password managers it existed for are blocked from
  // working in any non-allowlisted browser at the OS/vendor level, and the
  // extension runtime was the app's main source of hard crashes. Leftover
  // extension profile state from older versions is cleared below. (The
  // profile's 'Service Worker' dir is left alone — it also holds ordinary
  // websites' service workers, and with no extension runtime a stale
  // extension worker registration in there is inert.)
  const staleExtensionState = [
    'Extensions', 'Extension State', 'Extension Scripts', 'Extension Rules', '.running',
  ];
  try {
    for (const entry of staleExtensionState) {
      fs.rmSync(path.join(app.getPath('userData'), entry), { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[cleanup] could not clear stale extension state:', err.message);
  }
}

// URLs handed over by the OS when Blanc is the default browser. macOS
// delivers them via 'open-url' (which can fire before 'ready' — those queue
// until the window and session restore are up); Windows/Linux pass them on
// the command line, at startup or through 'second-instance'.
const pendingExternalUrls = [];
let externalUrlsFlushable = false;

// While enabled blocking is compiling its lists, main-frame HTTP(S)
// navigations are held here. Local blanc:// chrome remains available, so an
// offline filter failure always has a usable recovery surface.
let startupNavigationGateActive = false;
const startupQueuedNavigations = new Map();

function installStartupNavigationGate(sessions) {
  startupNavigationGateActive = true;
  const listener = (details, callback) => {
    if (
      !startupNavigationGateActive ||
      details.resourceType !== 'mainFrame' ||
      !/^https?:/i.test(details.url)
    ) {
      callback({});
      return;
    }
    if (Number.isInteger(details.webContentsId) && details.webContentsId > 0) {
      startupQueuedNavigations.set(details.webContentsId, details.url);
    }
    callback({ cancel: true });
  };
  for (const browsingSession of sessions) {
    browsingSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      listener
    );
  }
}

function releaseStartupNavigationGate(sessions, { blockerAttached }) {
  startupNavigationGateActive = false;
  // A successful blocker attachment has already replaced the temporary
  // listener with its own network filter. Clearing here would remove the
  // blocker we just installed.
  if (!blockerAttached) {
    for (const browsingSession of sessions) {
      browsingSession.webRequest.onBeforeRequest(null);
    }
  }

  const queued = [...startupQueuedNavigations.entries()];
  startupQueuedNavigations.clear();
  for (const [webContentsId, url] of queued) {
    const tab = [...tabs.values()].find(
      (candidate) => candidate.view.webContents.id === webContentsId
    );
    if (!tab || tab.view.webContents.isDestroyed()) continue;
    tab.view.webContents.loadURL(url).catch(() => {});
  }
}

let launchPingSent = false;
function maybeSendLaunchPing() {
  if (
    launchPingSent ||
    !settings.isFirstRunComplete() ||
    !settings.getSettings().usagePing
  ) return;
  launchPingSent = true;
  sendLaunchPing();
}

/** Best-effort path -> file:// URL. Electron's 'open-file' contract types
 * the path as always a non-empty absolute string, but nothing else calling
 * this guards a raw filesystem string before handing it to Node — fail
 * closed (null) rather than let a malformed path crash the main process. */
function toFileUrl(filePath) {
  try {
    return pathToFileURL(filePath).href;
  } catch {
    return null;
  }
}

/** Local document paths: bare filenames/paths ending in .htm/.html/.xhtml
 * that exist on disk and aren't already a URI (so "https://x/a.html" isn't
 * mistaken for a bare path). The scheme check requires "://", not just
 * ":", so a Windows drive letter ("C:\...") isn't misread as a URI scheme
 * and silently rejected — matches normalizeAddressInput's own scheme
 * regex below, which this function is also called from. The extension
 * list must stay in sync with package.json's mac.extendInfo.
 * CFBundleDocumentTypes (public.html/public.xhtml) by hand — JSON can't
 * carry a comment pointing back here. */
function localDocumentUrl(input) {
  if (!/\.(x?html?)$/i.test(input)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return null;
  if (!fs.existsSync(input)) return null;
  return toFileUrl(input);
}

// http(s) links, plus local document paths (Windows/Linux file
// associations and `blanc file.html` pass a bare path on the command
// line; macOS double-clicks arrive via 'open-file' below instead).
const urlsFromArgv = (argv) =>
  argv.map((a) => (/^https?:\/\//.test(a) ? a : localDocumentUrl(a))).filter(Boolean);

function openExternalUrl(url) {
  if (!externalUrlsFlushable || !hasLiveWindow()) {
    pendingExternalUrls.push(url);
    return;
  }
  setActiveTab(createTab(url));
  const browserWindow = currentBrowserWindow();
  if (browserWindow?.isMinimized()) browserWindow.restore();
  browserWindow?.focus();
}

// Protocols handed off to the OS instead of navigated — a mailto: click
// should open the user's mail app, not die silently (Chromium has no
// external-protocol UI in Electron). Deliberately a small allowlist:
// launching arbitrary registered URL schemes is a run-anything vector.
// Checked at every point a URL becomes a navigation target: page-initiated
// navigation (will-navigate), window.open children (setWindowOpenHandler),
// the context menu's "Open Link" actions, and typed address-bar input.
// The allowlist and trusted/confirm policy live in external-protocols.js
// (pure, unit-tested); this wrapper owns the side effects only.
let externalProtocolPromptOpen = false;
function handOffToOs(url, { trusted = false } = {}) {
  const decision = classifyExternalNavigation(url, { trusted });
  if (decision.action === 'none') return false;

  // Address-bar input is an explicit user instruction. Page-initiated
  // navigations/window.open and context-menu targets are untrusted URL data,
  // so require confirmation before launching another application. One prompt
  // at a time prevents a hostile page from flooding the desktop with dialogs.
  if (decision.action === 'open') {
    shell.openExternal(url).catch(() => {});
  } else if (!externalProtocolPromptOpen && hasLiveWindow()) {
    externalProtocolPromptOpen = true;
    const label = decision.protocol.slice(0, -1);
    dialog.showMessageBox(currentBrowserWindow() ?? undefined, {
      type: 'question',
      title: 'Open external application?',
      message: `Open this ${label} link in another application?`,
      buttons: ['Open Link', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }).then(({ response }) => {
      if (response === 0) shell.openExternal(url).catch(() => {});
    }).finally(() => {
      externalProtocolPromptOpen = false;
    });
  }
  return true;
}

function flushExternalUrls() {
  externalUrlsFlushable = true;
  for (const url of pendingExternalUrls.splice(0)) openExternalUrl(url);
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  openExternalUrl(url);
});

// Double-clicked local files (Blanc is declared as an HTML viewer via
// CFBundleDocumentTypes) arrive as 'open-file', not 'open-url'. Same
// queueing as links: pre-ready events wait for the window + session
// restore, then land as the active tab.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const url = toFileUrl(filePath);
  if (url) openExternalUrl(url);
});

// Must happen before app 'ready'.
registerPagesScheme();

const chromeMajor = process.versions.chrome?.split('.')[0];
const chromeFull = process.versions.chrome;
const chromeReducedVersion = chromeMajor ? `${chromeMajor}.0.0.0` : null;

function chromeLikeUserAgent(ua) {
  let next = ua
    .replace(/\sblanc\/[\d.]+/i, '')
    .replace(/\sElectron\/[\d.]+/, '');
  if (chromeReducedVersion) {
    next = next.replace(/Chrome\/[\d.]+/, `Chrome/${chromeReducedVersion}`);
  }
  return next;
}

// Strip Electron/app tokens and use Chrome's reduced UA form so sites see
// the same low-entropy UA shape as desktop Chrome.
app.userAgentFallback = chromeLikeUserAgent(app.userAgentFallback);

// Hide the FedCM API. Must happen before app 'ready', and silently no-ops
// if Chromium ever retires the "FedCm" feature name (an Electron bump that
// brings back Google-login 400s should recheck here first — also see the
// CDP client-hints override and onBeforeSendHeaders fallback below). Chromium ships
// the JS surface (IdentityCredential) but Electron has no account-chooser
// UI behind it, so FedCM calls can only ever fail with "Error retrieving
// a token". Google Identity Services feature-detects the API, commits to
// the FedCM sign-in path, and after its popup completes dies at
// accounts.google.com/gis_transform with a 400 — "Sign in with Google"
// broken on every site using GIS. With the API absent, GIS falls back to
// its legacy popup flow, which works (see setWindowOpenHandler's
// 'new-window' handling). Comma-joined with any existing value: repeated
// disable-features switches replace, not merge, so appending blind would
// clobber argv flags (and a future second appendSwitch would drop FedCm).
const priorDisabledFeatures = app.commandLine.getSwitchValue('disable-features');
app.commandLine.appendSwitch(
  'disable-features',
  priorDisabledFeatures ? `${priorDisabledFeatures},FedCm` : 'FedCm'
);

// Override client-hints branding at the Chromium level via CDP so both HTTP
// Sec-CH-UA headers AND navigator.userAgentData.brands report Chrome.
// Google Identity Services checks brands client-side before opening the
// OAuth popup; onBeforeSendHeaders only patches HTTP headers and can't
// reach the JS-visible API under contextIsolation. The debugger session is
// lightweight, invisible (no infobar in Electron), and coexists with
// DevTools. Must be registered before app 'ready' so the very first
// webContents (the chrome window) is caught.
if (chromeMajor) {
  const greaseBrand = { brand: 'Not;A=Brand', version: '8' };
  const chromeBrands = [
    greaseBrand,
    { brand: 'Chromium', version: chromeMajor },
    { brand: 'Google Chrome', version: chromeMajor },
  ];
  const chromeFullVersionList = [
    { brand: greaseBrand.brand, version: `${greaseBrand.version}.0.0.0` },
    { brand: 'Chromium', version: chromeFull },
    { brand: 'Google Chrome', version: chromeFull },
  ];
  const uaMetadata = {
    brands: chromeBrands,
    fullVersionList: chromeFullVersionList,
    platform: chromeClientHintPlatform(),
    platformVersion: chromeClientHintPlatformVersion(),
    architecture: chromeClientHintArchitecture(),
    bitness: chromeClientHintBitness(),
    model: '',
    mobile: false,
    wow64: false,
  };
  app.on('web-contents-created', (_event, wc) => {
    try { wc.debugger.attach('1.3'); } catch { return; }
    wc.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent: app.userAgentFallback,
      userAgentMetadata: uaMetadata,
    }).catch(() => {});
    wc.debugger.on('detach', () => {});
  });
}

/** @type {BrowserWindow | null} */
let win = null;
// win remains the transition alias while the single-window code is being
// carved into per-window operations. Window-local chrome state and tab
// ownership start here so a second BrowserWindow cannot inherit the primary
// window's overlay/sheet identity by accident.
const windowRuntimeRegistry = createWindowRuntimeRegistry();
let primaryWindowRuntime = null;
let focusedWindowRuntime = null;
// Native window callbacks and IPC handlers can be interleaved across windows.
// AsyncLocalStorage keeps a tab event's follow-up work in the runtime that
// produced it instead of letting whichever window was focused most recently
// receive a state broadcast or child view operation.
const windowRuntimeContext = new AsyncLocalStorage();

function withWindowRuntime(runtime, work) {
  if (!runtime) return work();
  return windowRuntimeContext.run(runtime, work);
}

function bindWindowRuntime(runtime, listener) {
  return (...args) => withWindowRuntime(runtime, () => listener(...args));
}

function setFocusedWindowRuntime(runtime) {
  focusedWindowRuntime = runtime?.browserWindow && !runtime.browserWindow.isDestroyed()
    ? runtime
    : null;
  if (focusedWindowRuntime) activeWorkspaceWindowId = focusedWindowRuntime.id;
}

function currentWorkspaceRuntime() {
  return windowRuntimeContext.getStore()
    ?? focusedWindowRuntime
    ?? primaryWindowRuntime
    ?? windowRuntimeRegistry.get(activeWorkspaceWindowId);
}

function currentBrowserWindow() {
  const browserWindow = currentWorkspaceRuntime()?.browserWindow ?? null;
  return browserWindow && !browserWindow.isDestroyed() ? browserWindow : null;
}
// Transitional façade for the existing primary-window call sites. Its fields
// live on the registered runtime, not as separate module globals, so the
// remaining call sites can be converted one operation at a time without
// changing surface behavior.
const chromeState = {
  get overlayView() { return currentWorkspaceRuntime()?.overlayView ?? null; },
  set overlayView(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.overlayView = value ?? null;
  },
  get overlayMode() { return currentWorkspaceRuntime()?.overlayMode ?? null; },
  set overlayMode(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.overlayMode = value ?? null;
  },
  get overlayPrefill() { return currentWorkspaceRuntime()?.overlayPrefill ?? null; },
  set overlayPrefill(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.overlayPrefill = value ?? null;
  },
  get addressMenuTicket() { return currentWorkspaceRuntime()?.addressMenuTicket ?? 0; },
  set addressMenuTicket(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.addressMenuTicket = value;
  },
  get addressMenuSeq() { return currentWorkspaceRuntime()?.addressMenuSeq ?? 0; },
  set addressMenuSeq(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.addressMenuSeq = value;
  },
  get utilitySheetView() { return currentWorkspaceRuntime()?.utilitySheetView ?? null; },
  set utilitySheetView(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.utilitySheetView = value ?? null;
  },
  get utilitySheetUrl() { return currentWorkspaceRuntime()?.utilitySheetUrl ?? null; },
  set utilitySheetUrl(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.utilitySheetUrl = value ?? null;
  },
};
// The WebContents resources remain in the process-wide tabs map so native
// events can find them by id. Their ordering, grouping, and active selection
// belong to the current runtime, which is what makes a future second window's
// tab model independent.
const tabState = {
  get tabOrder() { return currentWorkspaceRuntime()?.tabOrder ?? []; },
  set tabOrder(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.tabOrder = Array.isArray(value) ? value : [];
  },
  get activeTabId() { return currentWorkspaceRuntime()?.activeTabId ?? null; },
  set activeTabId(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) windowRuntimeRegistry.setActiveTab(runtime.id, value ?? null);
  },
  get groups() { return currentWorkspaceRuntime()?.groups ?? []; },
  set groups(value) {
    const runtime = currentWorkspaceRuntime();
    if (runtime) runtime.groups = Array.isArray(value) ? value : [];
  },
};
/** Non-persistent session shared by all private tabs for this app run. */
let privateBrowsingSession = null;
const PRIVATE_PARTITION = 'private-browsing'; // no `persist:` prefix = memory only
const getPrivateBrowsingSession = () =>
  (privateBrowsingSession ??= session.fromPartition(PRIVATE_PARTITION));

const CHROME_INDEX_FILE = path.join(__dirname, '../renderer/index.html');
const CHROME_OVERLAY_FILE = path.join(__dirname, '../renderer/overlay.html');
const CHROME_INDEX_URL = pathToFileURL(CHROME_INDEX_FILE).href;
const CHROME_OVERLAY_URL = pathToFileURL(CHROME_OVERLAY_FILE).href;

/** Privileged chrome must never become a general-purpose browser surface. */
function lockPrivilegedNavigation(wc, trustedUrl) {
  wc.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== trustedUrl) event.preventDefault();
  });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// Window background behind everything so resizes and load flashes stay
// in-theme. The renderer gets the resolved appearance at the same time: a
// nativeTheme source change reaches prefers-color-scheme asynchronously, and
// without the push the untinted strip behind the Island visibly trails the
// Settings control.
const chromeBackgroundColor = (
  appearance = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
) =>
  (appearance === 'dark' ? '#0e0e0e' : '#f4f4f1');
const resolvedThemeAppearance = () =>
  (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
let lastNativeThemeAppearance = resolvedThemeAppearance();
let appliedThemeSource = null;
let themeTintRefreshGeneration = 0;

function applyChromeThemeAppearance(appearance) {
  const resolved = appearance === 'dark' || appearance === 'light'
    ? appearance
    : resolvedThemeAppearance();
  for (const runtime of windowRuntimeRegistry.all()) {
    const browserWindow = runtime.browserWindow;
    if (!browserWindow || browserWindow.isDestroyed()) continue;
    browserWindow.setBackgroundColor(chromeBackgroundColor(resolved));
    browserWindow.webContents.send('chrome:theme-appearance', resolved);
  }
}

function beginChromeThemeAppearance(appearance) {
  // An explicit target can paint immediately. "system" has no trustworthy
  // cross-platform resolved value until Electron removes the prior override,
  // but the renderer can still disable its transition before that happens.
  for (const runtime of windowRuntimeRegistry.all()) {
    const browserWindow = runtime.browserWindow;
    if (!browserWindow || browserWindow.isDestroyed()) continue;
    if (appearance === 'dark' || appearance === 'light') {
      browserWindow.setBackgroundColor(chromeBackgroundColor(appearance));
    }
    browserWindow.webContents.send('chrome:theme-appearance', appearance ?? 'pending');
  }
}

function refreshActivePageTintForThemeChange() {
  const generation = ++themeTintRefreshGeneration;
  // Each browser window owns an independent active tab and chrome strip. A
  // theme transition must invalidate/re-sample all of them; relying on the
  // focused runtime would leave a background window painted with its old page
  // tint until the user happened to visit it again.
  forEachLiveWindowRuntime((runtime) => {
    const tab = tabState.activeTabId ? tabs.get(tabState.activeTabId) : null;
    if (!tab || tab.private || !/^https?:\/\//.test(tab.url)) return;

    // The captured top-edge pixels and meta theme-color both describe the old
    // color scheme. Drop them before the page repaints so the strip cannot keep
    // showing a stale site color during the handoff.
    const hadTint = !!(tab.pageBg || tab.themeColor);
    tab.pageBg = null;
    tab.themeColor = null;
    if (hadTint) broadcastTabs();

    // Color-scheme media queries repaint asynchronously in the tab renderer.
    // Sample across the likely repaint/transition window: the first gets the
    // common case quickly, while later passes let a site with its own CSS
    // transition settle. Binding the callback preserves the owning runtime if
    // another native window gains focus before a delayed sample runs.
    for (const delay of [32, 160, 400, 800]) {
      setTimeout(bindWindowRuntime(runtime, () => {
        if (generation !== themeTintRefreshGeneration) return;
        samplePageTint(tab, {
          immediate: true,
          shouldApply: () => generation === themeTintRefreshGeneration,
        });
      }), delay);
    }
  });
}

// nativeTheme.themeSource drives prefers-color-scheme in every renderer —
// chrome UI, internal pages, and the web content itself see one theme.
function applyTheme() {
  const source = settings.getSettings().theme;
  // The settings listener runs for every preference write. Only a real theme
  // source change should invalidate and re-sample the active website tint.
  if (source === appliedThemeSource) return;
  appliedThemeSource = source;
  // Explicit choices are known before Electron does any native-theme work:
  // push them first so the strip can paint in the same interaction frame.
  // "system" must be resolved after removing the prior override.
  const explicitAppearance = source === 'dark' || source === 'light' ? source : null;
  beginChromeThemeAppearance(explicitAppearance);
  refreshActivePageTintForThemeChange();
  nativeTheme.themeSource = source;
  if (!explicitAppearance) applyChromeThemeAppearance();
}

function handleNativeThemeUpdated() {
  const appearance = resolvedThemeAppearance();
  applyChromeThemeAppearance(appearance);
  if (appearance === lastNativeThemeAppearance) return;
  lastNativeThemeAppearance = appearance;
  // Covers live OS appearance changes while the setting is "system". Explicit
  // app theme changes already invalidated before assigning themeSource; doing
  // it again here is harmless and keeps this path self-contained.
  refreshActivePageTintForThemeChange();
}

// Swap the macOS Dock icon to the chosen colorway. Packaged macOS 26+ builds
// use a named Icon Composer stack, leaving Default/Dark/Clear/Tinted rendering
// (and tint color) to macOS. Dev/older systems retain the flat PNG fallback.
function applyAppIcon() {
  // getSettings() already falls back an unauthorized/stale supporter icon
  // (hand-edited or copied settings.json) to the default — nothing further
  // to validate here.
  const { appIcon } = settings.getSettings();
  applyDockAppIcon({ app, nativeImage, appIcon });
}

const hasLiveWindow = () => !!currentBrowserWindow();

/** @type {Map<string, { id: string, view: WebContentsView, title: string, url: string, isLoading: boolean, canGoBack: boolean, canGoForward: boolean, favicon: string | null, bookmarked: boolean, blockedCount: number, private: boolean, pinned: boolean, muted: boolean, audible: boolean, pageBg: string | null, themeColor: string | null }>} */
const tabs = new Map();

function setRuntimeActiveTab(id) {
  tabState.activeTabId = id;
}

const tabsWantingAddressBarFocus = new Set();
const searchSuggestionService = createSearchSuggestionService();
// One live provider request per trusted chrome surface. A newer query aborts
// the older one even before the renderer's generation guard discards it.
const searchSuggestionRequests = new WeakMap();
// Deterministic, network-free hooks for the Electron acceptance run. They are
// reachable only through test-hook.js under acceptanceTestMode; production
// builds always use the active tab's session.
let testSearchSuggestionFixture = null;
let testSearchSuggestionRequests = [];
let testSearchNavigationCapture = false;
let testSearchSubmission = null;

function setTestSearchSuggestionFixture(suggestions) {
  if (!acceptanceTestMode) return;
  testSearchSuggestionFixture = Array.isArray(suggestions)
    ? suggestions.filter((value) => typeof value === 'string')
    : [];
  testSearchSuggestionRequests = [];
}

function clearTestSearchSuggestionFixture() {
  testSearchSuggestionFixture = null;
  testSearchSuggestionRequests = [];
}

function setTestSearchNavigationCapture(enabled) {
  if (!acceptanceTestMode) return;
  testSearchNavigationCapture = !!enabled;
  testSearchSubmission = null;
}

// Outstanding permission prompts awaiting the user's Allow/Block, keyed by
// prompt id → its resolver and owning runtime. A response from another
// window is ignored, and closing one window flushes only its own requests.
const pendingPermissionPrompts = new Map();
function flushPermissionPrompts(runtimeId = null) {
  for (const [id, pending] of pendingPermissionPrompts) {
    if (runtimeId && pending.runtimeId !== runtimeId) continue;
    pending.resolve(null); // null = never answered
    pendingPermissionPrompts.delete(id);
  }
}

// Height (in CSS px) of the sampled safe-area gutter the resting Island floats
// in. The renderer measures its own layout and reports it here, so this is just
// a sane default before the first report arrives — keep it in step with the
// `--strip-h` token (styles.css) so the initial web-view offset doesn't jump.
let chromeHeight = 64;
// Device-local presentation preference. Settings owns validation and
// persistence; this live copy makes every child-view bounds calculation use
// one coherent value throughout a layout transition.
const initialPresentationSettings = settings.getSettings();
let tabLayout = normalizeTabLayout(initialPresentationSettings.tabLayout);
// This is the saved preference, not necessarily the current rendered width.
// calculateChromeLayout temporarily caps it when the window is too narrow to
// preserve the 392px website pane.
let verticalTabsPreferredWidth = normalizeVerticalTabsWidth(
  initialPresentationSettings.verticalTabsWidth
);

// The island's expanded states (command bar, ⌘L palette, find capsule)
// render in a separate always-on-top WebContentsView so they float OVER
// the web content instead of growing the strip and shifting content down.
// They are attached to each runtime's BrowserWindow only while showing.

function currentChromeLayout() {
  const browserWindow = currentBrowserWindow();
  if (!browserWindow) return calculateChromeLayout({
    width: 1280,
    height: 800,
    chromeHeight,
    tabLayout,
    verticalTabsWidth: verticalTabsPreferredWidth,
  });
  const { width, height } = browserWindow.getContentBounds();
  return calculateChromeLayout({
    width,
    height,
    chromeHeight,
    tabLayout,
    verticalTabsWidth: verticalTabsPreferredWidth,
  });
}

function verticalTabsMetrics(layout = currentChromeLayout()) {
  return {
    verticalTabsWidth: layout.verticalTabsWidth,
    verticalTabsPreferredWidth: layout.verticalTabsPreferredWidth,
    verticalTabsMinWidth: layout.verticalTabsMinWidth,
    verticalTabsMaxWidth: layout.verticalTabsMaxWidth,
    verticalTabsDefaultWidth: layout.verticalTabsDefaultWidth,
  };
}

function overlayBounds() {
  const layout = currentChromeLayout();
  if (chromeState.overlayMode === 'find') return layout.findBounds;
  if (chromeState.overlayMode === 'palette') return layout.paletteBounds;
  return layout.panelBounds;
}

function createOverlay(runtime = currentWorkspaceRuntime()) {
  if (!runtime) return;
  return withWindowRuntime(runtime, () => createOverlayForRuntime(runtime));
}

function createOverlayForRuntime(runtime) {
  // A menu open when the previous window died may never have fired its close
  // callback — never let a leaked ticket disarm the new overlay's blur guard.
  chromeState.addressMenuTicket = 0;
  chromeState.overlayView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  chromeState.overlayView.setBackgroundColor('#00000000'); // page shows through around the panel
  lockPrivilegedNavigation(chromeState.overlayView.webContents, CHROME_OVERLAY_URL);
  installVerticalTabsShortcut(chromeState.overlayView.webContents);
  chromeState.overlayView.webContents.loadFile(CHROME_OVERLAY_FILE);

  // A show requested before the overlay document finished its first load
  // would be lost — leaving an invisible view blocking clicks. Replay it.
  chromeState.overlayView.webContents.once('did-finish-load', bindWindowRuntime(runtime, () => {
    if (chromeState.overlayMode) {
      chromeState.overlayView.webContents.send('overlay:show', { mode: chromeState.overlayMode, prefill: chromeState.overlayPrefill });
      chromeState.overlayView.webContents.focus();
    }
  }));

  // Dismiss on Escape at the main-process level so it works no matter
  // which element inside the overlay holds focus.
  chromeState.overlayView.webContents.on('before-input-event', bindWindowRuntime(runtime, (event, input) => {
    if (chromeState.overlayMode && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      if (chromeState.overlayMode === 'credential-picker') {
        pickerController.settleForRuntime(runtime.id, null, 'escape');
      }
      else if (chromeState.overlayMode === 'display-share-picker') {
        displaySharePickerController.cancelForRuntime(runtime.id, 'escape');
      }
      else hideOverlay();
    }
  }));

  // Losing focus (page click, cmd-tab, devtools) with the command bar open
  // would leave a stale panel floating over the page. Find mode survives
  // blur deliberately — users click around the page between matches.
  chromeState.overlayView.webContents.on('blur', bindWindowRuntime(runtime, () => {
    // A native address-bar context menu takes OS focus; that blur is not a
    // dismissal — the popup's close callback owns what happens next.
    if (chromeState.addressMenuTicket) return;
    // Playwright's Electron main-process evaluate calls steal focus from the
    // guest view while the acceptance harness inspects it. Keep the real blur
    // policy in production; tests dismiss explicitly between edit sessions.
    if (acceptanceTestMode) return;
    if (!chromeState.overlayMode || chromeState.overlayMode === 'find') return;
    // A freshly attached blank tab's view can momentarily grab focus while
    // its address-focus reclaim is still pending — that's not a dismissal;
    // the reclaim will re-assert overlay focus on the next tick.
    if (tabState.activeTabId && tabsWantingAddressBarFocus.has(tabState.activeTabId)) return;
    if (chromeState.overlayMode === 'credential-picker') {
      return pickerController.settleForRuntime(runtime.id, null, 'blur');
    }
    if (chromeState.overlayMode === 'display-share-picker') {
      return displaySharePickerController.cancelForRuntime(runtime.id, 'blur');
    }
    hideOverlay({ refocusContent: false });
  }));

  // A dying overlay must settle any pending picker, or the caller awaits forever.
  chromeState.overlayView.webContents.on('destroyed', bindWindowRuntime(runtime, () => {
    pickerController.settleForRuntime(runtime.id, null, 'window-closed');
    displaySharePickerController.cancelForRuntime(runtime.id, 'window-closed');
  }));
  chromeState.overlayView.webContents.on('render-process-gone', bindWindowRuntime(runtime, () => {
    pickerController.settleForRuntime(runtime.id, null, 'window-closed');
    displaySharePickerController.cancelForRuntime(runtime.id, 'window-closed');
  }));

  attachAddressMenu(chromeState.overlayView.webContents, {
    isOverlayLive: bindWindowRuntime(runtime, () =>
      hasLiveWindow()
      && chromeState.overlayView && !chromeState.overlayView.webContents.isDestroyed()
      && (chromeState.overlayMode === 'panel' || chromeState.overlayMode === 'palette'),
    ),
    getWindow: bindWindowRuntime(runtime, () => currentBrowserWindow()),
    getOverlayBounds: bindWindowRuntime(runtime, () => overlayBounds()),
    acquireMenuGuard: bindWindowRuntime(runtime, () => {
      chromeState.addressMenuTicket = ++chromeState.addressMenuSeq;
      return chromeState.addressMenuTicket;
    }),
    releaseMenuGuard: bindWindowRuntime(runtime, (ticket) => {
      // A stale popup (superseded by a newer one) must not disarm the guard
      // or run close policy under the live menu.
      if (ticket !== chromeState.addressMenuTicket) return;
      chromeState.addressMenuTicket = 0;
      if (!hasLiveWindow()) return;
      const browserWindow = currentBrowserWindow();
      if (browserWindow?.isFocused()) return refocusOverlayAfterMenu();
      // Never steal focus back from another app: if the window lost focus
      // while the guard was suppressing blur dismissal, perform the dismissal
      // the guard swallowed — without touching focus. But sample focus AFTER
      // a beat: GTK can return focus to the window asynchronously once the
      // popup closes, and reading it synchronously would misread an ordinary
      // item selection as an app switch (dismissing the island and swallowing
      // the very edit the item performed).
      setTimeout(() => {
        if (chromeState.addressMenuTicket || !hasLiveWindow()) return;
        if (!currentBrowserWindow()?.isFocused()) return hideOverlay({ refocusContent: false });
        refocusOverlayAfterMenu();
      }, 80);
    }),
    actions: {
      pasteAndGo: bindWindowRuntime(runtime, (text) => {
        if (tabState.activeTabId) pasteAndGo(tabState.activeTabId, text);
      }),
    },
  });
}

/** The popup took focus from the overlay; hand it back if a panel/palette is
 * still up (chromeState.overlayMode gone — e.g. Paste and Go closed it — nothing to do). */
function refocusOverlayAfterMenu() {
  if (chromeState.overlayMode === 'panel' || chromeState.overlayMode === 'palette') {
    chromeState.overlayView?.webContents.focus();
  }
}

function showOverlay(mode, { prefill } = {}) {
  // Returns whether the overlay was actually shown: requestPick treats a
  // non-true result as window-closed rather than waiting out its timeout.
  if (!hasLiveWindow() || !chromeState.overlayView) return false;
  const runtime = currentWorkspaceRuntime();
  if (chromeState.overlayMode === 'credential-picker' && mode !== 'credential-picker') {
    pickerController.settleForRuntime(runtime?.id, null, 'mode-replaced');
  }
  if (chromeState.overlayMode === 'display-share-picker' && mode !== 'display-share-picker') {
    displaySharePickerController.cancelForRuntime(runtime?.id, 'mode-replaced');
  }
  // One floating layer at a time: summoning the island dismisses the sheet
  // (the overlay takes focus itself — no tab refocus in between).
  hideUtilitySheet({ refocusContent: false });
  // Opening the panel is a freshness signal: pull other devices' tabs
  // (throttled to 1/min inside refreshSession — tab-sync spec §6).
  if (mode === 'panel' || mode === 'palette') sync.refreshSession();
  chromeState.overlayMode = mode;
  chromeState.overlayPrefill = prefill ?? null;
  // (Re-)adding moves the overlay to the top of the child-view stack.
  const browserWindow = currentBrowserWindow();
  if (!browserWindow) return false;
  browserWindow.contentView.addChildView(chromeState.overlayView);
  chromeState.overlayView.setBounds(overlayBounds());
  chromeState.overlayView.webContents.send('overlay:show', { mode, prefill });
  chromeState.overlayView.webContents.focus();
  browserWindow.webContents.send('chrome:island-state', { mode });
  return true;
}

function hideOverlay({ refocusContent = true } = {}) {
  if (!chromeState.overlayMode) return;
  // 'hidden' is deliberately no-restore: hideOverlay has six callers and the
  // cause can't be attributed, so it fails safe. RETURN after delegating —
  // settle() clears its pending state before calling its injected hide
  // collaborator, which re-enters here and performs the teardown. Falling
  // through would run the removal/send/focus body a second time.
  const runtime = currentWorkspaceRuntime();
  if (pickerController.isPendingForRuntime(runtime?.id)) {
    pickerController.settleForRuntime(runtime?.id, null, 'hidden');
    return;
  }
  if (displaySharePickerController.isPendingForRuntime(runtime?.id)) {
    displaySharePickerController.cancelForRuntime(runtime?.id, 'hidden');
    return;
  }
  chromeState.overlayMode = null;
  chromeState.overlayPrefill = null;   // vault rows must not outlive the picker
  // A dismissed command bar means the user is done addressing — stop any
  // pending blank-tab focus reclaim so a page click can't reopen it.
  if (tabState.activeTabId) tabsWantingAddressBarFocus.delete(tabState.activeTabId);
  const browserWindow = currentBrowserWindow();
  if (browserWindow && chromeState.overlayView) {
    browserWindow.contentView.removeChildView(chromeState.overlayView);
    chromeState.overlayView.webContents.send('overlay:hide');
    browserWindow.webContents.send('chrome:island-state', { mode: null });
    if (refocusContent) tabs.get(tabState.activeTabId)?.view.webContents.focus();
  }
}

// --- Utility sheet (design: 2026-07-22-utility-sheet-design.md) ---
// The five utility pages render here, never as tabs. One lazy transparent
// view per runtime; the page draws its own scrim + card (body.sheet in pages.css).

function createUtilitySheet(runtime = currentWorkspaceRuntime()) {
  if (!runtime) return;
  return withWindowRuntime(runtime, () => createUtilitySheetForRuntime(runtime));
}

function createUtilitySheetForRuntime(runtime) {
  chromeState.utilitySheetView = new WebContentsView({ webPreferences: TAB_WEB_PREFERENCES });
  chromeState.utilitySheetView.setBackgroundColor('#00000000');
  const wc = chromeState.utilitySheetView.webContents;
  installVerticalTabsShortcut(wc);
  // Esc dismisses no matter what inside the page holds focus (mirrors the
  // island overlay's handler).
  wc.on('before-input-event', bindWindowRuntime(runtime, (event, input) => {
    if (chromeState.utilitySheetUrl && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      hideUtilitySheet();
    }
  }));
  // A crashed sheet renderer is dismissed and destroyed; the next open
  // lazily recreates it. Close the dead webContents — dropping the
  // reference alone leaks the crashed guest. Default refocus: nothing else
  // will hand focus back after a crash.
  wc.on('render-process-gone', bindWindowRuntime(runtime, () => {
    hideUtilitySheet();
    wc.close();
    chromeState.utilitySheetView = null;
  }));
  // Default-deny (design §4): utility→utility stays in-sheet; http(s)
  // opens a real tab (createTab's dismissal covers the sheet); approved
  // handoff protocols go to the OS; everything else — and every
  // window.open — dies.
  wc.on('will-navigate', bindWindowRuntime(runtime, (event, targetUrl) => {
    if (isUtilityUrl(targetUrl)) {
      chromeState.utilitySheetUrl = targetUrl; // keep the toggle honest across in-sheet nav
      return;
    }
    event.preventDefault();
    if (/^https?:\/\//i.test(targetUrl)) {
      const id = createTab(targetUrl);
      if (id) setActiveTab(id);
    } else {
      handOffToOs(targetUrl);
    }
  }));
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/** Page identity, not URL spelling: each utility page is one document per
 * blanc:// host, and accepted spellings differ (typed "blanc://settings"
 * vs the menu's "blanc://settings/"). */
function sameUtilityPage(a, b) {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
}

function showUtilityPage(url) {
  const browserWindow = currentBrowserWindow();
  if (!browserWindow) return;
  // Toggle: a direct re-invocation (menu/accelerator) of the shown page
  // closes it. Overlay-hosted entry points can never hit this — summoning
  // the overlay already dismissed the sheet.
  if (chromeState.utilitySheetUrl && sameUtilityPage(chromeState.utilitySheetUrl, url)) return hideUtilitySheet();
  // One floating layer at a time, in both directions.
  hideOverlay({ refocusContent: false });
  if (!chromeState.utilitySheetView) createUtilitySheet();
  chromeState.utilitySheetUrl = url;
  // Rapid page swaps abort the in-flight load — loadURL rejects with
  // ERR_ABORTED; that's routine, not an error.
  chromeState.utilitySheetView.webContents.loadURL(url).catch(() => {});
  // Mirror tabs: a detached view's document still reports visibilityState
  // 'visible' and never background-throttles — toggle real visibility.
  chromeState.utilitySheetView.setVisible(true);
  browserWindow.contentView.addChildView(chromeState.utilitySheetView);
  resizeActiveView();
  chromeState.utilitySheetView.webContents.focus();
}

function hideUtilitySheet({ refocusContent = true } = {}) {
  if (!chromeState.utilitySheetUrl) return;
  chromeState.utilitySheetUrl = null;
  const browserWindow = currentBrowserWindow();
  if (browserWindow && chromeState.utilitySheetView) {
    browserWindow.contentView.removeChildView(chromeState.utilitySheetView);
    chromeState.utilitySheetView.setVisible(false);
    if (refocusContent) tabs.get(tabState.activeTabId)?.view.webContents.focus();
  }
}

function normalizeAddressInput(input) {
  const trimmed = input.trim();
  const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)?.[1]?.toLowerCase();
  if (scheme) {
    // Script-executing schemes must never be navigable from the address bar.
    if (['javascript', 'data', 'vbscript'].includes(scheme)) return settings.searchUrlFor(trimmed);
    return trimmed;
  }
  if (/^localhost(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`;
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`; // bare IPv4
  // A local filename ("notes.html") looks exactly like a domain to the
  // regex below — check disk first so typing one opens it, the same way
  // double-clicking it (via urlsFromArgv/open-file) already does.
  const localDoc = localDocumentUrl(trimmed);
  if (localDoc) return localDoc;
  const looksLikeDomain = /^[^\s]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/.test(trimmed);
  if (looksLikeDomain) return `https://${trimmed}`;
  return settings.searchUrlFor(trimmed);
}

/** The full typed-address routing pipeline — shared by the tabs:navigate IPC
 * handler and the address-bar menu's Paste and Go, so the two can't drift. */
function navigateTabToAddress(id, rawText) {
  const tab = tabs.get(id);
  if (!tab) return;
  // Checked against the raw address-bar text, before normalizeAddressInput
  // — a bare mailto:/tel: URI has no "://" and would otherwise fall
  // through its domain-guessing heuristic into an unreachable https:// URL.
  if (handOffToOs(rawText, { trusted: true })) return;
  const target = normalizeAddressInput(rawText);
  // A typed utility address opens the sheet, never navigates the tab.
  if (isUtilityUrl(target)) return openInternalPage(target);
  tabsWantingAddressBarFocus.delete(id);
  // Rapid re-navigation (Enter twice, Paste and Go twice) aborts the in-flight
  // load — loadURL rejects with ERR_ABORTED; that's routine, not an error.
  tab.view.webContents.loadURL(target).catch(() => {});
}

/** Paste and Go = navigate + dismiss the island, exactly like pressing Enter.
 * The menu action and the F19-3 acceptance binding both use THIS wrapper, so
 * the scenario's "closes the island" half asserts the real code path. */
function pasteAndGo(id, rawText) {
  navigateTabToAddress(id, rawText);
  hideOverlay();
}

function serializeTabs() {
  return tabState.tabOrder
    .map((id) => tabs.get(id))
    .filter(Boolean)
    .map(({ view, certificateError, siteSecurityFixture, ...rest }) => {
      // Desktop acceptance can pin a synthetic origin without navigating away
      // from its deterministic blanc:// harness page. Production tabs never
      // carry this property; every normal payload is still derived from the
      // committed WebContents URL and Chromium's certificate observer.
      const effectiveUrl = siteSecurityFixture?.url ?? rest.url;
      let certificateRecord = null;
      try {
        certificateRecord = siteSecurityFixture?.certificateRecord
          ?? certificateObserver.get(view.webContents.session, effectiveUrl);
      } catch {
        // A WebContents can disappear during teardown between the filter and
        // this projection. Site info fails neutral; tab teardown continues.
      }
      const serialized = {
        ...rest,
        ...(siteSecurityFixture ? { url: effectiveUrl, isLoading: false } : {}),
        siteInfo: buildSiteInfo(effectiveUrl, {
          certificateRecord,
          certificateError,
          blockedCount: rest.blockedCount,
        }),
      };
      // A page-favicon URL belongs to the tab's browsing session. Sending a
      // private tab's remote URL into persistent chrome would make the chrome
      // session fetch it again merely to paint the pill/overlay/rail, escaping
      // the non-persistent private-session boundary. Private rows deliberately
      // use the renderer's neutral fallback instead.
      if (serialized.private && serialized.favicon) {
        return { ...serialized, favicon: null };
      }
      return serialized;
    });
}

// Open tabs persist across launches through a versioned workspace record. Each
// window carries URLs plus parallel group/pin metadata and group records.
// This initial slice owns the primary window; future windows keep separate
// records instead of sharing a flat global session.
let sessionStore = null;
let sessionPersistenceReadOnly = false;
let activeWorkspaceWindowId = PRIMARY_WINDOW_ID;
const ensureSessionStore = () => (sessionStore ??= new JsonStore('session', {}));

// Rolling ads-blocked counter for the start page's margin note. Weeks
// start Monday 00:00 local; the count resets lazily on the first touch
// (read or increment) after a week boundary.
let adblockStatsStore = null;
const ensureAdblockStats = () => (adblockStatsStore ??= new JsonStore('adblock-stats', { weekStart: 0, blocked: 0 }));

function currentWeekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function adblockWeekStats() {
  const s = ensureAdblockStats();
  const week = currentWeekStart();
  if (s.data.weekStart !== week) s.update((d) => { d.weekStart = week; d.blocked = 0; });
  return s;
}

let isQuitting = false;
let sessionPersistenceSuspended = false;
app.on('before-quit', () => { isQuitting = true; });

function persistSession() {
  // Teardown closes tabs one by one; saving then would erode the session
  // file down to whatever closed last before the process exits.
  const runtime = currentWorkspaceRuntime();
  if (
    isQuitting
    || sessionPersistenceSuspended
    || sessionPersistenceReadOnly
    || !runtime
    || runtime.tabOrder.length === 0
  ) return;
  ensureSessionStore().update((d) => {
    const parsed = readSessionWorkspace(d);
    if (!parsed.supported) {
      // A newer Blanc understood this file first. Preserve it verbatim rather
      // than replacing its windows with this older process's one window.
      sessionPersistenceReadOnly = true;
      return;
    }
    const previous = parsed.workspace.windows.find((windowState) =>
      windowState.id === runtime.id
    ) ?? activeWorkspaceWindow(parsed.workspace);
    // Private tabs leave no trail, error pages persist their real
    // destination, url-less tabs drop — all in session-snapshot.js so tab
    // sync shares the exact same filter.
    const entries = persistableEntries(runtime.tabOrder.map((id) => tabs.get(id)));
    const nextWindow = {
      ...previous,
      id: runtime.id,
      urls: entries.map((e) => e.url),
      groupIds: entries.map((e) => e.groupId),
      pinned: entries.map((e) => e.pinned),
      activeIndex: previous.activeIndex,
    };
    // Groups referenced only by private tabs stay out of the file too.
    nextWindow.groups = runtime.groups.filter((g) => entries.some((e) => e.groupId === g.id));
    // Only update when the active tab is actually in the persisted list —
    // during startup (no active tab yet) or with a private tab active,
    // indexOf is -1 and writing 0 would corrupt the last good index.
    // Indexed into `entries` (what d.urls is built from), not the wider
    // tab list — a tab with no persistable url (an adopted window.open
    // child before its first navigation commits) is dropped from d.urls,
    // and an index computed on the unfiltered list would restore focus to
    // the wrong tab. -1 (startup, private or url-less active tab) keeps
    // the last good index, as before.
    const idx = entries.findIndex((e) => e.id === runtime.activeTabId);
    if (idx >= 0) nextWindow.activeIndex = idx;
    replaceObject(d, replaceWorkspaceWindow(parsed.workspace, nextWindow, {
      activeWindowId: activeWorkspaceWindowId,
    }));
  });
}

function removePersistedWorkspace(runtimeId) {
  if (isQuitting || sessionPersistenceSuspended || sessionPersistenceReadOnly) return;
  ensureSessionStore().update((data) => {
    const parsed = readSessionWorkspace(data);
    if (!parsed.supported) {
      sessionPersistenceReadOnly = true;
      return;
    }
    replaceObject(data, removeWorkspaceWindow(parsed.workspace, runtimeId));
  });
}

function persistSessionForRuntime(runtime) {
  if (runtime) withWindowRuntime(runtime, persistSession);
}

function broadcastTabs() {
  const runtime = currentWorkspaceRuntime();
  persistSession();
  tabsync.noteTabsChanged();
  const browserWindow = currentBrowserWindow();
  if (!runtime || !browserWindow) return;
  const widthMetrics = verticalTabsMetrics();
  const payload = {
    tabs: serializeTabs(),
    activeTabId: tabState.activeTabId,
    groups: tabState.groups,
    tabLayout,
    ...widthMetrics,
  };
  browserWindow.webContents.send('tabs:updated', payload);
  chromeState.overlayView?.webContents.send('tabs:updated', payload);
}

function broadcastTabsForRuntime(runtime) {
  if (runtime) withWindowRuntime(runtime, broadcastTabs);
}

function broadcastDownloadsActivity() {
  for (const runtime of windowRuntimeRegistry.all()) {
    withWindowRuntime(runtime, () => {
      const browserWindow = currentBrowserWindow();
      if (browserWindow) browserWindow.webContents.send('chrome:downloads', downloadsActivity());
    });
  }
}

// The blocked-request counter can tick many times a second during a page
// load; coalesce those into at most ~10 broadcasts/s.
const tabsBroadcastTimers = new Map();
function scheduleBroadcastTabs() {
  const runtime = currentWorkspaceRuntime();
  if (!runtime || tabsBroadcastTimers.has(runtime.id)) return;
  const timer = setTimeout(() => {
    tabsBroadcastTimers.delete(runtime.id);
    withWindowRuntime(runtime, broadcastTabs);
  }, 100);
  tabsBroadcastTimers.set(runtime.id, timer);
}

function resizeActiveView() {
  const browserWindow = currentBrowserWindow();
  if (!browserWindow) return;
  const layout = currentChromeLayout();
  const tab = tabState.activeTabId ? tabs.get(tabState.activeTabId) : null;
  if (tab) tab.view.setBounds(layout.pageBounds);
  if (chromeState.overlayMode && chromeState.overlayView) chromeState.overlayView.setBounds(overlayBounds());
  if (chromeState.utilitySheetUrl && chromeState.utilitySheetView) {
    chromeState.utilitySheetView.setBounds(layout.utilityBounds);
  }
  // The BrowserWindow renderer and native child views must move in the same
  // frame. A dedicated geometry event avoids turning every pointermove or
  // window resize into a tab/session-sync broadcast.
  browserWindow.webContents.send('chrome:vertical-tabs-width', verticalTabsMetrics(layout));
}

function forEachLiveWindowRuntime(work) {
  for (const runtime of windowRuntimeRegistry.all()) {
    const browserWindow = runtime.browserWindow;
    if (!browserWindow || browserWindow.isDestroyed()) continue;
    withWindowRuntime(runtime, () => work(runtime));
  }
}

function applyVerticalTabsWidth(nextWidth) {
  const next = normalizeVerticalTabsWidth(nextWidth);
  if (next === verticalTabsPreferredWidth) return false;
  verticalTabsPreferredWidth = next;
  forEachLiveWindowRuntime(resizeActiveView);
  return true;
}

function previewVerticalTabsWidth(nextWidth) {
  applyVerticalTabsWidth(nextWidth);
  return hasLiveWindow()
    ? verticalTabsMetrics()
    : { verticalTabsPreferredWidth };
}

function setVerticalTabsWidth(nextWidth) {
  const next = normalizeVerticalTabsWidth(nextWidth);
  // Pointer previews already moved the live geometry; this write commits the
  // preference once at drag end instead of churning settings.json per pixel.
  if (settings.getSettings().verticalTabsWidth === next) {
    applyVerticalTabsWidth(next);
    return next;
  }
  return settings.setSettings({ verticalTabsWidth: next }).verticalTabsWidth;
}

function applyTabLayout(nextLayout) {
  const next = normalizeTabLayout(nextLayout);
  if (next === tabLayout) return false;
  tabLayout = next;

  forEachLiveWindowRuntime(() => {
    // A floating overlay is tied to the old pane center. Dismiss it in the
    // same main-process turn, then rebound the attached page/sheet without
    // navigating either document. The Settings sheet stays open so its own
    // layout choice does not eject the user mid-interaction.
    hideOverlay({ refocusContent: false });
    resizeActiveView();
    if (!chromeState.utilitySheetUrl) tabs.get(tabState.activeTabId)?.view.webContents.focus();
    broadcastTabs();
  });
  scheduleMenuRebuild();
  return true;
}

function setTabLayout(nextLayout) {
  if (nextLayout !== 'island' && nextLayout !== 'vertical') return tabLayout;
  if (nextLayout === tabLayout) return tabLayout;
  // onSettingsChanged synchronously calls applyTabLayout after the validated
  // write, keeping menu, geometry, and renderer payload in one transition.
  return normalizeTabLayout(settings.setSettings({ tabLayout: nextLayout }).tabLayout);
}

function toggleTabLayout() {
  return setTabLayout(tabLayout === 'vertical' ? 'island' : 'vertical');
}

function installVerticalTabsShortcut(webContents) {
  webContents.on('before-input-event', (event, input) => {
    const primaryModifier = process.platform === 'darwin'
      ? input.meta && !input.control
      : input.control && !input.meta;
    if (
      input.type !== 'keyDown' ||
      input.isAutoRepeat ||
      String(input.key).toLowerCase() !== 'v' ||
      !input.alt ||
      !primaryModifier ||
      input.shift
    ) return;
    // Handle this before page dispatch so the shortcut is reliable no matter
    // which WebContentsView owns focus. preventDefault also suppresses the
    // duplicate native-menu accelerator dispatch for this same key event.
    event.preventDefault();
    toggleTabLayout();
  });
}

/** Pick the sharpest favicon from a page's declared icon links. The pill
 * renders icons at 14px CSS (28+ device px on retina), so a 16px .ico —
 * which is what `page-favicon-updated`'s first entry usually is — scales
 * up blurry. Preference: SVG, then declared sizes ≥32 (nearest 64 wins),
 * then apple-touch-icon (~180px, slightly demoted: often has a solid
 * background), then undeclared PNGs over undeclared ICOs. */
function pickBestFavicon(candidates) {
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (!c || typeof c.href !== 'string' || c.href.length > 2048) continue;
    if (!/^(https?:|data:image\/)/i.test(c.href)) continue;
    const sizes = typeof c.sizes === 'string' ? c.sizes.slice(0, 100) : '';
    const appleTouch = typeof c.rel === 'string' && /apple-touch-icon/i.test(c.rel);
    const declared = Math.max(0, ...[...sizes.matchAll(/(\d+)[x×]\d+/gi)].map((m) => Number(m[1])));
    const size = declared || (appleTouch ? 180 : 0);
    let score;
    if (/\.svg(\?|#|$)/i.test(c.href) || /\bany\b/i.test(sizes)) score = 1e6;
    else if (size >= 32) score = 100000 + (10000 - Math.abs(size - 64)) - (appleTouch ? 500 : 0);
    else if (size === 0) score = /\.ico(\?|$)/i.test(c.href) ? 100 : 1000;
    else score = size;
    if (score > bestScore) {
      bestScore = score;
      best = c.href;
    }
  }
  return best;
}

/** Asynchronously refine a tab's favicon beyond Chromium's first-listed
 * URL. Runs in the page context, so everything returned is validated in
 * pickBestFavicon before it touches chrome CSS. */
async function upgradeFavicon(tab) {
  const urlAtStart = tab.url;
  try {
    const candidates = await tab.view.webContents.executeJavaScript(
      `[...document.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"]')]
        .slice(0, 20)
        .map((l) => ({ href: l.href, sizes: l.getAttribute('sizes') || '', rel: l.rel }))`
    );
    if (!Array.isArray(candidates) || candidates.length > 20) return;
    if (!tabs.has(tab.id) || tab.url !== urlAtStart) return; // navigated away meanwhile
    const best = pickBestFavicon(candidates);
    if (best && best !== tab.favicon) {
      tab.favicon = best;
      if (tab.bookmarked) bookmarks.updateFavicon(tab.url, best);
      scheduleBroadcastTabs();
      sync.captureTabIcon(tab).catch(() => {});
    }
  } catch {
    /* page gone mid-query — Chromium's default pick stands */
  }
}

/** Most common color in a captured image, as #rrggbb (bitmap is BGRA).
 * The top rows of a page are usually a solid header/background color, so
 * the mode is robust where an average would go muddy. */
function dominantColor(image) {
  const { width, height } = image.getSize();
  if (!width || !height) return null;
  const bitmap = image.toBitmap();
  const counts = new Map();
  for (let i = 0; i + 3 < bitmap.length; i += 16) { // every 4th pixel is plenty
    const rgb = (bitmap[i + 2] << 16) | (bitmap[i + 1] << 8) | bitmap[i];
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [rgb, count] of counts) {
    if (count > bestCount) {
      best = rgb;
      bestCount = count;
    }
  }
  return best === null ? null : `#${best.toString(16).padStart(6, '0')}`;
}

/** Sample the top two pixel rows of a tab's rendered page — the edge that
 * visually abuts the chrome strip. Fails harmlessly for hidden views;
 * setActiveTab resamples on activation. */
async function samplePageTint(tab, { immediate = false, shouldApply = () => true } = {}) {
  if (!tabs.has(tab.id) || tab.view.webContents.isDestroyed()) return;
  if (tab.private || !/^https?:\/\//.test(tab.url)) {
    if (tab.pageBg) {
      tab.pageBg = null;
      scheduleBroadcastTabs();
    }
    return;
  }
  const { width } = tab.view.getBounds();
  if (!width || tab.view.webContents.isLoading()) return;
  try {
    const image = await tab.view.webContents.capturePage({ x: 0, y: 0, width, height: 2 });
    const color = dominantColor(image);
    if (shouldApply() && color && color !== tab.pageBg) {
      tab.pageBg = color;
      if (immediate) broadcastTabs();
      else scheduleBroadcastTabs();
    }
  } catch {
    /* view hidden or gone — nothing to paint from */
  }
}

/** Give the page a beat to paint after load before sampling its color. */
function scheduleSampleTint(tab) {
  const runtime = windowRuntimeRegistry.get(tab.runtimeId);
  setTimeout(() => withWindowRuntime(runtime, () => samplePageTint(tab)), 150);
}

// --- Tab tabState.groups (Island Tab Groups design) ---

/** Pill/panel cluster order: each non-empty group in group order, then a
 * trailing pseudo-cluster of ungrouped, unpinned tabs. Pinned members stay
 * inside their named group and lead that group's rows; only ungrouped pins
 * use the standalone pinned shelf. Cmd/Ctrl+1–9 jump by this. */
function clusterList() {
  const list = [];
  for (const g of tabState.groups) {
    const members = tabState.tabOrder.filter((id) => tabs.get(id)?.groupId === g.id);
    const tabIds = [
      ...members.filter((id) => tabs.get(id)?.pinned),
      ...members.filter((id) => !tabs.get(id)?.pinned),
    ];
    if (tabIds.length) list.push({ group: g, tabIds });
  }
  const loose = tabState.tabOrder.filter((id) => tabs.get(id) && !tabs.get(id).groupId && !tabs.get(id).pinned);
  if (loose.length) list.push({ group: null, tabIds: loose });
  return list;
}

/** clusterList() plus a leading pseudo-cluster for ungrouped pinned tabs,
 * each slot tagged with a stable key — the one definition of "cluster order"
 * shared by Cmd/Ctrl+1–9 and the ⌥⌘ arrow navigation. */
function clusterSlots() {
  const slots = clusterList().map(({ group, tabIds }) => ({
    key: group ? group.id : 'loose',
    group,
    tabIds,
  }));
  const pinnedIds = tabState.tabOrder.filter((id) => tabs.get(id)?.pinned && !tabs.get(id)?.groupId);
  if (pinnedIds.length) slots.unshift({ key: 'pinned', group: null, tabIds: pinnedIds });
  return slots;
}

/** Cluster key → most recently active tab id there, so ⌥⌘↑/↓ lands back
 * where you were in each group. In-memory only — a remembered tab that
 * closed or moved simply fails the lookup and the first tab wins. */
const lastActiveByCluster = new Map();

function clusterKeyForTab(tab) {
  return tab.groupId ?? (tab.pinned ? 'pinned' : 'loose');
}

/** A group exists only while it holds tabs — closing or moving out the
 * last one dissolves it (same convention as Chrome's tab tabState.groups). */
function pruneEmptyGroups() {
  if (!tabState.groups.length) return;
  const used = new Set();
  for (const tab of tabs.values()) if (tab.groupId) used.add(tab.groupId);
  tabState.groups = tabState.groups.filter((g) => used.has(g.id));
}

function setTabGroup(tabId, groupId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  // A requested group that no longer exists (a picker click racing the
  // group's dissolution) is a no-op — it must not ungroup the tab instead.
  if (groupId && !tabState.groups.some((g) => g.id === groupId)) return;
  tab.groupId = groupId || null;
  pruneEmptyGroups();
  broadcastTabs();
  scheduleMenuRebuild();
}

/** "/group work" — move a tab into the named group, creating it on first
 * use. Names are lowercase mono labels, per the design. */
function groupTabByName(tabId, rawName) {
  const tab = tabs.get(tabId);
  const name = String(rawName ?? '').trim().toLowerCase().slice(0, 40);
  if (!tab || !name) return;
  let group = tabState.groups.find((g) => g.name === name);
  if (!group) {
    group = { id: crypto.randomUUID(), name, collapsed: false };
    tabState.groups.push(group);
  }
  tab.groupId = group.id;
  pruneEmptyGroups();
  broadcastTabs();
  scheduleMenuRebuild();
}

function toggleGroupCollapsed(groupId) {
  const group = tabState.groups.find((g) => g.id === groupId);
  if (!group) return;
  group.collapsed = !group.collapsed;
  broadcastTabs();
}

/** Jump to a group: activate its first tab and unfold it. */
function focusGroup(groupId) {
  const group = tabState.groups.find((g) => g.id === groupId);
  if (!group) return;
  group.collapsed = false;
  const first = clusterList().find(({ group: g }) => g?.id === groupId)?.tabIds[0];
  // setActiveTab broadcasts, but no-ops when the tab is already active —
  // the unfold still has to reach the renderers.
  if (first && first !== tabState.activeTabId) setActiveTab(first);
  else broadcastTabs();
}

function closeGroup(groupId) {
  const ids = tabState.tabOrder.filter((id) => tabs.get(id)?.groupId === groupId);
  for (const id of ids) closeTab(id);
}

function toggleTabPinned(id) {
  const tab = tabs.get(id);
  if (!tab) return false;
  tab.pinned = !tab.pinned;
  broadcastTabs();
  scheduleMenuRebuild();
  return tab.pinned;
}

function toggleTabMuted(id) {
  const tab = tabs.get(id);
  if (!tab) return false;
  tab.muted = !tab.muted;
  tab.view.webContents.setAudioMuted(tab.muted);
  broadcastTabs();
  scheduleMenuRebuild();
  return tab.muted;
}

function duplicateTab(id) {
  const source = tabs.get(id);
  if (!source) return;
  const insertAt = tabState.tabOrder.indexOf(id) + 1;
  const history = source.view.webContents.navigationHistory;
  const entries = history.getAllEntries();
  const newId = createTab(source.url, {
    private: source.private,
    groupId: source.groupId,
    pinned: source.pinned,
    muted: source.muted,
    // Only worth restoring if there's more than just the current page.
    restoreHistory: entries.length > 1 ? { entries, index: history.getActiveIndex() } : null,
  });
  reorderTab(newId, insertAt);
  return newId;
}

const TAB_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Chromium's built-in PDF viewer is a plugin; without this flag
  // PDFs download instead of rendering inline.
  plugins: true,
  // Exposes a data API to our own blanc:// pages ONLY — see the guards in
  // tab-preload.js and pages.js. Ordinary web content gets only the
  // unprivileged, session-wide Chrome compatibility surface.
  preload: path.join(__dirname, 'tab-preload.js'),
};

// ─── SPIKE (1Password fill feasibility) — remove before release ───────────
// Fill the active tab's login form from 1Password behind Touch ID, with no
// browser extension. Env-gated; credentials live only in main memory + the
// verified page, and every outcome logs a result line, never a value.
const ONE_PASSWORD_SPIKE_ENABLED = !app.isPackaged || process.env.BLANC_1P_SPIKE === '1';
let onePasswordFillInFlight = false;
// Dedicated isolated world for the credential-bearing injections. 0 is the
// page's main world and 999 is Electron's context-isolation/preload world —
// both forbidden; Electron reserves ids >= 1000 for custom worlds.
const FILL_WORLD_ID = 1001;

const { createPickerController } = require('./credential-picker');
const { chooseAndReveal } = require('./credential-fill-flow');
const { createDisplaySharePickerController } = require('./display-share-picker');

// Exactly-once owner of picker resolution. Behaviour is covered by
// test/unit/credential-picker.test.js; this is only the Electron wiring.
const pickerController = createPickerController({
  showOverlay,
  hideOverlay: () => hideOverlay({ refocusContent: false }),
  getOverlayMode: () => chromeState.overlayMode,
  getRuntimeId: () => currentWorkspaceRuntime()?.id ?? null,
  // isTrustedSender expects { webContents, url } targets and checks frame.url
  // against target.url — a bare WebContentsView has no `.url`, so it would
  // reject EVERY reply (the picker's rows would be silently unclickable).
  // Mirror isTrustedChromeSender's shape exactly.
  isOverlaySender: (event) => {
    const runtime = trustedRuntimeForChromeSender(event);
    return !!runtime && event.sender === runtime.overlayView?.webContents;
  },
  randomUUID: () => crypto.randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t),
  timeoutMs: 60_000,
});

const displaySharePickerController = createDisplaySharePickerController({
  showOverlay,
  hideOverlay: () => hideOverlay({ refocusContent: false }),
  getOverlayMode: () => chromeState.overlayMode,
  getRuntimeId: () => currentWorkspaceRuntime()?.id ?? null,
  isOverlaySender: (event) => {
    const runtime = trustedRuntimeForChromeSender(event);
    return !!runtime && event.sender === runtime.overlayView?.webContents;
  },
  randomUUID: () => crypto.randomUUID(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (timer) => clearTimeout(timer),
  timeoutMs: 60_000,
});

function tabForWebContentsId(webContentsId) {
  for (const tab of tabs.values()) {
    if (tab.view.webContents.id === webContentsId) return tab;
  }
  return null;
}

function imageDataUrl(image, width) {
  try {
    if (!image || image.isEmpty()) return null;
    const bounded = Number.isInteger(width) && width > 0
      ? image.resize({ width })
      : image;
    return bounded.isEmpty() ? null : bounded.toDataURL();
  } catch {
    return null;
  }
}

function displaySourceRow(source) {
  return {
    name: typeof source.name === 'string' ? source.name.slice(0, 256) : 'Untitled source',
    type: String(source.id).startsWith('screen:') ? 'screen' : 'window',
    thumbnail: imageDataUrl(source.thumbnail, 320),
    appIcon: imageDataUrl(source.appIcon, 32),
  };
}

async function promptForDisplayMedia({
  origin,
  frame,
  audioRequested,
  userGesture,
  videoRequested,
}) {
  if (!userGesture || !videoRequested || !frame) return null;

  let wc;
  try {
    wc = webContents.fromFrame(frame);
  } catch {
    return null;
  }
  const tab = wc ? tabForWebContentsId(wc.id) : null;
  const runtime = tab ? windowRuntimeRegistry.get(tab.runtimeId) : null;
  if (!tab || !runtime) return null;
  return withWindowRuntime(runtime, () => promptForDisplayMediaInRuntime({
    origin,
    frame,
    audioRequested,
    userGesture,
    videoRequested,
    wc,
    tab,
  }));
}

async function promptForDisplayMediaInRuntime({
  origin,
  frame,
  audioRequested,
  userGesture,
  videoRequested,
  wc,
  tab,
}) {
  if (!userGesture || !videoRequested || !frame) return null;
  if (tab.id !== tabState.activeTabId) return null;

  const context = {
    frame,
    wc,
    origin,
    tabId: tab.id,
    navEpoch: tab.navEpoch,
  };
  const validation = {
    webContentsFromFrame: (candidate) => webContents.fromFrame(candidate),
    getTab: (id) => tabs.get(id),
    getActiveTabId: () => tabState.activeTabId,
    isUtilitySheetVisible: () => !!chromeState.utilitySheetUrl,
  };
  if (!captureRequestStillValid(context, validation)) return null;

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  if (!captureRequestStillValid(context, validation)) return null;

  const usableSources = sources.filter((source) =>
    source
    && typeof source.id === 'string'
    && typeof source.name === 'string'
  );
  const result = await displaySharePickerController.requestPick({
    sources: usableSources,
    rows: usableSources.map(displaySourceRow),
    origin,
    webContentsId: wc.id,
    runtimeId: currentWorkspaceRuntime()?.id ?? null,
    // Electron's display-media loopback stream is currently supported on
    // Windows. It stays unchecked in the chooser and is never implied.
    canShareAudio: process.platform === 'win32' && audioRequested,
  });

  if (!result.source || !captureRequestStillValid(context, validation)) return null;
  return {
    video: result.source,
    ...(result.shareAudio ? { audio: 'loopback' } : {}),
  };
}

/** A modal dialog returns focus to the CHROME document, not to the tab. Both
 * the main-side `wc.isFocused()` guard and the injected `document.hasFocus()`
 * check require the tab to hold focus, so every dialog in this flow must hand
 * it back before the next validation — otherwise the flow aborts with
 * `abort-wc-changed` having shown the user a prompt for nothing. WebContentsView
 * focus settles asynchronously (see reclaimAddressBarFocus), hence the bounded
 * re-assert rather than a single call. */
async function restoreTabFocus(wc) {
  // Only re-assert the WINDOW when Blanc is already frontmost. A picker
  // dismissed by ⌘-Tab must not drag the window back over whatever the user
  // switched to. (Same instinct as the overlay blur guard further up.)
  const browserWindow = currentBrowserWindow();
  if (browserWindow?.isFocused()) browserWindow.focus();
  for (let attempt = 0; attempt < 10; attempt++) {
    if (wc.isDestroyed()) return false;
    wc.focus();
    if (wc.isFocused()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return !wc.isDestroyed() && wc.isFocused();
}

async function fillActiveTabFrom1Password() {
  const log = (result, extra) => console.log(`[1p-spike] ${result}${extra ? ' ' + extra : ''}`);
  const onepassword = require('./onepassword'); // ./onepassword only — the SDK stays lazy inside it
  let capturedTabId, tab, wc, expectedURL, expectedHost, capturedEpoch, capturedTimeOrigin;
  let kept = [];
  let truncated = 0;

  // ── PHASE 1 (pre-reveal): NO credential is in memory yet, so err.message is
  //    safe to log for diagnosis. ──
  try {
    if (!hasLiveWindow() || !tabState.activeTabId) return log('no-active-tab');
    capturedTabId = tabState.activeTabId;
    tab = tabs.get(capturedTabId);
    if (!tab) return log('no-active-tab');
    wc = tab.view.webContents;
    expectedURL = wc.getURL();
    if (!/^https?:\/\//i.test(expectedURL)) return log('non-http-noop');
    expectedHost = new URL(expectedURL).hostname;
    capturedEpoch = tab.navEpoch;
    capturedTimeOrigin = await wc.executeJavaScript('performance.timeOrigin');

    const matches = await onepassword.findLogins(expectedHost);
    if (matches.length === 0) return log('no-match', expectedHost);
    // Rank on METADATA only — no decryption here. One survivor is the common
    // case and needs no picker at all: on www.google.com this turns 20
    // candidates into 1.
    const ranked = onepassword.rankMatches(matches, expectedHost);
    if (ranked.kept.length === 0) return log('no-match', expectedHost); // never fall back to the unranked list
    kept = ranked.kept;
    truncated = ranked.truncated;
  } catch (err) {
    return log('setup-error', err?.message); // pre-reveal only — credential-free
  }

  // ── PHASE 2 (inspect → confirm → reveal → fill). The inspect pass carries NO
  //    credential, so a page with no login form decrypts nothing. From the
  //    reveal onward this is a BINDING-LESS try: every failure logs a FIXED
  //    classification, so no page- or SDK-controlled message can echo the
  //    credential. Both injections run in a dedicated ISOLATED WORLD, where the
  //    page can neither hook the setter nor read the embedded credential. ──
  try {
    // One nonce per invocation binds this flow's authorization to the exact
    // elements the inspect pass chose.
    const nonce = crypto.randomUUID();
    const inspect = await wc.executeJavaScriptInIsolatedWorld(FILL_WORLD_ID, [
      { code: onepassword.buildInspectScript({ expectedURL, expectedTimeOrigin: capturedTimeOrigin, nonce }) },
    ]);

    // Validate the SHAPE strictly — a malformed or partial result is a plumbing
    // failure and must fail closed, not fall through to a benign branch.
    const basisOk = inspect && (inspect.passwordBasis === null
      || inspect.passwordBasis === 'authoritative' || inspect.passwordBasis === 'heuristic');
    if (!inspect || typeof inspect !== 'object'
        || typeof inspect.originMismatch !== 'boolean'
        || (!inspect.originMismatch
            && (typeof inspect.hasPassword !== 'boolean'
                || typeof inspect.hasUsername !== 'boolean' || !basisOk))) {
      return log('fill-error');
    }
    if (inspect.originMismatch) return log('origin-or-focus-mismatch');
    if (!inspect.hasPassword && !inspect.hasUsername) return log('no-fillable-field');

    // A HEURISTIC target was inferred from structure and English-language
    // wording, which does not survive localization — never fill one silently.
    // Confirm BEFORE decrypting, so declining costs no secret exposure.
    if (inspect.hasPassword && inspect.passwordBasis !== 'authoritative') {
      if (!hasLiveWindow()) return log('abort-window-changed');
      const { response } = await dialog.showMessageBox(currentBrowserWindow() ?? undefined, {
        type: 'question',
        title: 'Fill from 1Password',
        message: kept.length === 1 && kept[0].title
          ? `Use your saved ${kept[0].title} password?`
          : 'Use your saved password?',
        detail: "To protect your password, Blanc double-checks before filling on a page that doesn't "
          + 'clearly label its login field. Continue if this is where you sign in.',
        buttons: ['Fill', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response !== 0) return log('user-declined');
      // The sheet took focus; hand it back before the checks below (and before
      // the fill's own document.hasFocus() guard) look at it. If restoration
      // FAILS we must stop here — continuing would decrypt the credential and
      // only then abort on the post-reveal focus guard, which is exactly the
      // prompt-then-do-nothing failure this helper exists to prevent.
      if (!(await restoreTabFocus(wc))) return log('abort-wc-changed');
      // The dialog was modal and async: re-validate immediately on acceptance,
      // BEFORE decrypting. The post-reveal checks below still run.
      if (!currentBrowserWindow()?.isFocused()) return log('abort-window-changed');
      if (tabState.activeTabId !== capturedTabId || !tabs.has(capturedTabId)) return log('abort-tab-changed');
      if (wc.isDestroyed()) return log('abort-wc-changed');
      if (tab.navEpoch !== capturedEpoch) return log('abort-navigated');
      if (wc.getURL() !== expectedURL) return log('abort-url-changed');
    }

    // Only now — with a fillable field confirmed and, if heuristic, explicitly
    // approved — choose a credential (picker if several survive) and read it.
    // Behaviour lives in credential-fill-flow.js and is covered by
    // test/unit/credential-fill-flow.test.js.
    const picked = await chooseAndReveal({
      kept,
      truncated,
      host: expectedHost,
      deps: {
        revealUsernames: (list) => onepassword.revealUsernames(list),
        requestPick: (rows, trunc, host) => pickerController.requestPick(rows, trunc, host, {
          runtimeId: currentWorkspaceRuntime()?.id ?? null,
        }),
        restoreTabFocus: () => restoreTabFocus(wc),
        revalidate: () => {
          if (!currentBrowserWindow()?.isFocused()) return 'abort-window-changed';
          if (tabState.activeTabId !== capturedTabId || !tabs.has(capturedTabId)) return 'abort-tab-changed';
          if (wc.isDestroyed()) return 'abort-wc-changed';
          if (tab.navEpoch !== capturedEpoch) return 'abort-navigated';
          if (wc.getURL() !== expectedURL) return 'abort-url-changed';
          return null;
        },
        revealCredential: (c) => onepassword.revealCredential(c.vaultId, c.itemId),
      },
    });
    if (picked.outcome === 'chooser-cancel') return log('chooser-cancel', picked.detail);
    if (picked.outcome !== 'ok') return log(picked.outcome);
    const { username, password } = picked.credential;
    if (password == null && username == null) return log('empty-item');

    // Re-validate after the async reveal.
    if (!currentBrowserWindow()?.isFocused()) return log('abort-window-changed');
    if (tabState.activeTabId !== capturedTabId || !tabs.has(capturedTabId)) return log('abort-tab-changed');
    if (wc.isDestroyed() || !wc.isFocused()) return log('abort-wc-changed');
    if (tab.navEpoch !== capturedEpoch) return log('abort-navigated');
    if (wc.getURL() !== expectedURL) return log('abort-url-changed');

    // Send ONLY the credential this step needs: on a username-only screen the
    // password never reaches the renderer at all.
    const source = onepassword.buildFillScript({
      expectedURL,
      expectedTimeOrigin: capturedTimeOrigin,
      nonce,
      username: inspect.hasUsername ? username : null,
      password: inspect.hasPassword ? password : null,
    });
    const status = await wc.executeJavaScriptInIsolatedWorld(FILL_WORLD_ID, [{ code: source }]);
    if (!status || typeof status !== 'object') return log('fill-error'); // fail closed
    if (status.originMismatch) return log('origin-or-focus-mismatch');
    // The page changed what selectFields resolves to between authorization and
    // fill — nothing was written.
    if (status.selectionChanged) return log('selection-changed');
    if (status.filledPass && status.filledUser) return log('filled', 'user+pass');
    if (status.filledUser) return log('filled', 'user-only (multi-step step 1)');
    if (status.filledPass) return log('filled', 'pass-only (username field not found)');
    return log('nothing-filled');
  } catch {
    return log('fill-error'); // no binding, no message — a credential is in memory
  }
}

// SPIKE (1Password fill feasibility) — headless criterion 3(a). Gated on its
// OWN env var so it can run without a GUI/account: load the SDK package inside
// packaged Electron (asar resolution + @1password/sdk-core's eager core_bg.wasm
// compile), log ONE line, set a real exit code, and terminate. app.exit() is
// used (not app.quit()) so native handles the SDK may open can't stall exit.
async function runPackageProbeIfRequested() {
  if (process.env.BLANC_1P_PACKAGE_PROBE !== '1') return false;
  try {
    require('./onepassword').probePackageLoad();
    console.log('[1p-spike] package probe: PASS (require resolved + WASM compiled)');
    app.exit(0);
  } catch (err) {
    console.warn(`[1p-spike] package probe: FAIL — ${err?.message || err}`);
    app.exit(1);
  }
  return true; // unreachable after app.exit; kept for call-site clarity
}

// SPIKE (1Password fill feasibility) — GUI startup checks. Gated
// BLANC_1P_SPIKE === '1'. Two independent lines:
//   3(a) package probe — does the SDK module LOAD in this build?
//   3(b) core smoke    — does DesktopAuth dlopen + authenticate under a
//                        notarized/hardened build?
async function initSpikePackaging() {
  if (process.env.BLANC_1P_SPIKE !== '1') return;

  // 3(a): load the package (asar loader active, eager core_bg.wasm compile).
  try {
    require('./onepassword').probePackageLoad();
    console.log('[1p-spike] package probe: PASS (require resolved + WASM compiled)');
  } catch (err) {
    console.warn(`[1p-spike] package probe: FAIL — ${err?.message || err}`);
  }

  // 3(b): the native bridge round-trip. Decisive by default — everything is a
  // FAIL unless it matches the biometric-cancel signature (/cancell?ed/i), a
  // best-effort INCONCLUSIVE (bridge state then unknowable). "denied"/"not
  // allowed"/policy/auth errors are real FAILs (the round-trip did not work). A
  // genuine cancel misread as FAIL isn't worth chasing for throwaway code — just
  // re-run the smoke without cancelling.
  try {
    const client = await require('./onepassword').getClient();
    await client.vaults.list();
    console.log('[1p-spike] core smoke: PASS (DesktopAuth + vaults.list)');
  } catch (err) {
    const msg = err?.message || String(err);
    if (/cancell?ed/i.test(msg)) {
      console.log(`[1p-spike] core smoke: INCONCLUSIVE (biometric cancelled) — ${msg}`);
    } else {
      const bridge = /dlopen|libop_sdk_ipc_client|image not found|code ?sign|library/i.test(msg);
      console.warn(`[1p-spike] core smoke: FAIL${bridge ? ' (native bridge did not load)' : ''} — ${msg}`);
    }
  }
}
// ─── end SPIKE ────────────────────────────────────────────────────────────

function createTab(url = newTabUrl(), { private: isPrivate = false, groupId = null, view = null, pinned = false, muted = false, restoreHistory = null } = {}) {
  const runtime = currentWorkspaceRuntime();
  if (!runtime) return null;
  if (isUtilityUrl(url)) {
    // Utility pages never become tabs regardless of caller (external
    // open-url handoff, future call sites). Session restore filters
    // first and never trips this. Callers tolerate null: setActiveTab
    // no-ops on unknown ids.
    showUtilityPage(url);
    return null;
  }
  // Creating any real tab dismisses the sheet (design §5) — including
  // BACKGROUND creation (cmd-click arrives as disposition 'background-tab'
  // and never calls setActiveTab, so setActiveTab's dismissal alone has a
  // hole). DEFAULT refocus: background creation activates nothing, so the
  // current active tab must take focus back or it strands in the detached
  // sheet; when foreground creation follows with setActiveTab, that call
  // immediately re-focuses the new tab — the transient refocus is harmless.
  // No-ops during session restore and window creation (sheet hidden).
  hideUtilitySheet();
  const id = crypto.randomUUID();
  // An adopted view (window.open child, see the window-open handler) arrives
  // already constructed by Chromium with the opener relationship wired up;
  // everything else gets a fresh one.
  const adopted = !!view;
  view ??= new WebContentsView({
    webPreferences: isPrivate
      ? { ...TAB_WEB_PREFERENCES, session: getPrivateBrowsingSession() }
      : TAB_WEB_PREFERENCES,
  });

  const tab = {
    id,
    runtimeId: runtime.id,
    view,
    title: 'New Tab',
    url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    favicon: null,
    bookmarked: false,
    blockedCount: 0,
    private: isPrivate,
    pinned,
    muted,
    audible: false,
    groupId: groupId && tabState.groups.some((g) => g.id === groupId) ? groupId : null,
    // Strip tint ("faux header"): the page's top-edge color, so the chrome
    // strip can paint itself as a continuation of the site's own header.
    pageBg: null, // sampled from rendered pixels — authoritative
    themeColor: null, // the page's <meta name="theme-color"> — fallback
    // Set by did-navigate from the response code; gates BOTH addVisit
    // there and updateTitle below, so a URL recorded during an earlier
    // valid visit can't have its title silently rewritten to reflect a
    // later dead reload (page-title-updated has no response code of its
    // own to check). Starts true — the split-second before a tab's first
    // real navigation shouldn't behave differently from before this flag
    // existed.
    historyEligible: true,
    // SPIKE (1Password fill feasibility) — bumped on any main-frame navigation
    // start/commit so the async fill can detect a page swap mid-flow.
    navEpoch: 0,
    // In-memory only. A failed TLS identity check is projected into trusted
    // chrome and the local error interstitial, never persisted or bypassed.
    certificateError: null,
  };
  tabs.set(id, tab);
  tabState.tabOrder.push(id);
  windowRuntimeRegistry.claimTab(runtime.id, id);

  const wc = view.webContents;
  installVerticalTabsShortcut(wc);

  // SPIKE (1Password fill feasibility) — ⌥⌘P on the tab's OWN webContents
  // (the overlay before-input-event listener never sees page-focused keys).
  if (ONE_PASSWORD_SPIKE_ENABLED) {
    wc.on('before-input-event', bindWindowRuntime(runtime, (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      if (input.code !== 'KeyP') return; // physical key — ⌥ mutates input.key on macOS
      if (!(input.meta && input.alt && !input.control && !input.shift)) return; // one modifier off ⌘P Print
      // Consume the chord BEFORE the single-flight check — a recognized second
      // press must not fall through to the page, it just doesn't start a fill.
      event.preventDefault();
      if (onePasswordFillInFlight) return; // single-flight
      onePasswordFillInFlight = true;
      fillActiveTabFrom1Password()
        .catch((err) => console.warn('[1p-spike] fill error:', err?.message))
        .finally(() => { onePasswordFillInFlight = false; });
    }));
  }
  // WebRTC IP-handling policy applies per-webContents; this is the single choke
  // point every tab (fresh or adopted window.open child) passes through.
  wc.setWebRTCIPHandlingPolicy(webrtcPolicyFor(settings.getSettings().webrtcPolicy));
  if (muted) wc.setAudioMuted(true); // keep the actual audio state in sync with tab.muted
  const syncNavState = () => {
    tab.canGoBack = wc.navigationHistory.canGoBack();
    tab.canGoForward = wc.navigationHistory.canGoForward();
    tab.url = wc.getURL();
    tab.bookmarked = bookmarks.isBookmarked(tab.url);
  };

  wc.on('audio-state-changed', bindWindowRuntime(runtime, () => {
    // Coalesced like did-change-theme-color: audio transitions aren't urgent,
    // and a media that flips audible/silent needn't rebuild the session synchronously.
    tab.audible = wc.isCurrentlyAudible();
    scheduleBroadcastTabs();
  }));

  wc.on('page-title-updated', bindWindowRuntime(runtime, (_e, title) => {
    tab.title = title;
    if (tab.historyEligible) history.updateTitle(tab.url, title);
    broadcastTabs();
  }));
  wc.on('page-favicon-updated', bindWindowRuntime(runtime, (_e, favicons) => {
    tab.favicon = favicons[0] ?? null; // immediate, possibly low-res
    if (tab.bookmarked) bookmarks.updateFavicon(tab.url, tab.favicon);
    broadcastTabs();
    sync.captureTabIcon(tab).catch(() => {});
    upgradeFavicon(tab); // async refinement to the sharpest declared icon
  }));
  wc.on('did-start-loading', bindWindowRuntime(runtime, () => { tab.isLoading = true; broadcastTabs(); }));
  wc.on('did-stop-loading', bindWindowRuntime(runtime, () => {
    tab.isLoading = false;
    syncNavState();
    broadcastTabs();
    scheduleSampleTint(tab);
    // Same-origin navigations can retain their favicon without firing
    // page-favicon-updated; associate the already-known icon with the new URL.
    sync.captureTabIcon(tab).catch(() => {});
  }));
  wc.on('did-change-theme-color', bindWindowRuntime(runtime, (_e, color) => {
    // Chromium reports '#rrggbb' or null; validated because it feeds chrome CSS.
    tab.themeColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
    scheduleBroadcastTabs();
  }));
  wc.on('did-navigate', bindWindowRuntime(runtime, (_e, url, httpResponseCode) => {
    tab.navEpoch++; // SPIKE (1Password fill feasibility)
    const shouldReclaimChromeFocus = url === tab.url && tabsWantingAddressBarFocus.has(id) && tabState.activeTabId === id;
    if (url !== tab.url) tabsWantingAddressBarFocus.delete(id);
    tab.blockedCount = 0;
    tab.pageBg = null; // a new page's tint mustn't linger from the old one
    tab.themeColor = null;
    // Only clear on a genuine CROSS-ORIGIN navigation. Chromium doesn't
    // re-fire page-favicon-updated for a same-origin navigation whose favicon
    // is unchanged/already cached (e.g. apple.com/ -> apple.com/mac/), and a
    // favicon.ico-only site has no <link> for upgradeFavicon to restore from —
    // so blanking on same-origin (or on an identical-URL soft reload, as
    // cnn.com fires) would leave a correct favicon permanently cleared. See
    // favicon-policy.js + test/unit/favicon-policy.test.js.
    if (shouldClearFaviconOnNavigate(tab.url, url)) tab.favicon = null;
    syncNavState();
    // Error responses stay out of history — a dead one-shot OAuth URL
    // recorded here resurfaces in the Quick Switcher as a destination.
    tab.historyEligible = !tab.private && (httpResponseCode ?? 200) < 400;
    if (tab.historyEligible) history.addVisit(url, wc.getTitle());
    broadcastTabs();
    // did-navigate fires once per real top-level navigation (redirect
    // chains fire it per hop, but that's a bounded burst the debounce
    // already coalesces) — not the sustained-frequency case Task 1 exists
    // to avoid. The menu's Favorites label/dynamic list depend on
    // tab.url/.bookmarked, which this event just changed via syncNavState.
    scheduleMenuRebuild();
    if (shouldReclaimChromeFocus) reclaimAddressBarFocus(id);
  }));
  wc.on('did-navigate-in-page', bindWindowRuntime(runtime, (_e, url, isMainFrame) => {
    if (isMainFrame) tab.navEpoch++; // SPIKE (1Password fill feasibility) — main frame only
    syncNavState();
    if (isMainFrame && tab.historyEligible) history.addVisit(url, wc.getTitle());
    broadcastTabs();
    if (isMainFrame) sync.captureTabIcon(tab).catch(() => {});
    // Deliberately no scheduleMenuRebuild() here — unlike did-navigate,
    // this fires on every hash change/pushState and can be sustained and
    // frequent on SPA-heavy sites (exactly the rebuild-storm case Task 1
    // avoids). The menu may lag slightly behind in-page route changes;
    // it catches up on the next real navigation or tab-lifecycle event.
  }));
  // SPIKE (1Password fill feasibility) — a main-frame navigation that STARTS
  // after the orchestrator's main-side URL check would still let
  // executeJavaScript run in the replacement document; bump the epoch so the
  // pre-injection re-check aborts. Removed with the rest of the spike.
  wc.on('did-start-navigation', bindWindowRuntime(runtime, (_e, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) {
      tab.navEpoch++;
      // Keep the record while main routes the failed navigation to its local
      // certificate interstitial; any real retry/new destination starts clean.
      if (!String(_url).startsWith('blanc://error')) tab.certificateError = null;
      displaySharePickerController.cancelForWebContents(wc.id, 'navigation');
    }
  }));
  wc.once('did-finish-load', bindWindowRuntime(runtime, () => {
    if (shouldReclaimAddressBarFocus(id)) {
      reclaimAddressBarFocus(id, { consume: true });
    }
  }));

  wc.on('focus', bindWindowRuntime(runtime, () => {
    if (shouldReclaimAddressBarFocus(id)) {
      reclaimAddressBarFocus(id, { consume: true });
    }
  }));

  // Web content must never navigate a tab into the privileged blanc://
  // scheme (Chrome blocks web → chrome:// identically). Main-initiated
  // loads (address bar, commands, error pages) go through loadURL, which
  // doesn't fire will-navigate, so only page-initiated hops are caught.
  wc.on('will-navigate', bindWindowRuntime(runtime, (event, targetUrl) => {
    // Utility pages never load in a tab — the newtab ledger links to
    // blanc://bookmarks/ and blanc:→blanc: hops are otherwise legal. Only
    // an INTERNAL page may summon the sheet: for web content this is a
    // plain denial, same as any other web → blanc:// attempt below —
    // otherwise any page could pop (and focus-steal via) privileged chrome
    // with location.href = "blanc://settings/".
    if (isUtilityUrl(targetUrl)) {
      event.preventDefault();
      if (wc.getURL().startsWith('blanc://')) openInternalPage(targetUrl);
      return;
    }
    if (/^blanc:/i.test(targetUrl) && !wc.getURL().startsWith('blanc://')) {
      event.preventDefault();
    }
    if (handOffToOs(targetUrl)) event.preventDefault();
  }));

  // Show a real error page instead of leaving a blank/stale view.
  // errorCode -3 (ERR_ABORTED) fires for cancelled loads (stop button,
  // rapid re-navigation) and must not be treated as a failure.
  wc.on('did-fail-load', bindWindowRuntime(runtime, (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || !validatedURL) return;
    // The temporary startup gate deliberately cancels HTTP(S) main-frame
    // loads until blocking is attached (or the user explicitly continues
    // without it). Keep the tab blank and replay its queued URL afterward
    // instead of replacing it with a misleading network error page.
    if (
      startupNavigationGateActive &&
      startupQueuedNavigations.has(wc.id) &&
      /^https?:/i.test(validatedURL)
    ) {
      return;
    }
    const q = tab.certificateError
      ? certificateErrorQuery(tab.certificateError, {
          url: validatedURL,
          code: errorCode,
          desc: errorDescription,
        })
      : new URLSearchParams({
          url: validatedURL,
          code: String(errorCode),
          desc: errorDescription,
        });
    wc.loadURL(`blanc://error/?${q}`).catch(() => {});
  }));

  // Never bypass a failed server identity check. Keep only bounded display
  // metadata, reject the load, then did-fail-load routes to Blanc's dedicated
  // certificate interstitial. Subframe failures remain Chromium-denied but do
  // not replace the top-level page.
  wc.on('certificate-error', bindWindowRuntime(runtime, (_event, failedUrl, error, certificate, callback, isMainFrame) => {
    if (isMainFrame) {
      tab.certificateError = {
        url: failedUrl,
        error,
        certificate: sanitizeCertificate(certificate),
      };
    }
    callback(false);
  }));

  // Adopted window.open children are script-closable — window.close() by
  // the page, child.close() by the opener — the only tabs whose
  // webContents can die outside closeTab. Route destruction through
  // closeTab so the strip, tabState.groups, and active-tab selection stay
  // consistent (re-entry is safe: closeTab removes the map entry before
  // calling wc.close(), so this fires on an id that's already gone).
  wc.once('destroyed', bindWindowRuntime(runtime, () => closeTab(id)));

  // A tab whose renderer dies (OOM, GPU fault, kill -9) otherwise sits
  // blank forever; loadURL spawns a fresh renderer, so route it to the
  // error page with the original URL for one-click retry.
  wc.on('render-process-gone', bindWindowRuntime(runtime, (_e, details) => {
    if (details.reason === 'clean-exit') return;
    const q = new URLSearchParams({ url: tab.url, code: details.reason, desc: 'The page crashed' });
    wc.loadURL(`blanc://error/?${q}`).catch(() => {});
  }));

  // A page's beforeunload can block close/navigation; surface Chrome's
  // Leave/Stay choice instead of silently refusing.
  wc.on('will-prevent-unload', bindWindowRuntime(runtime, (event) => {
    const choice = dialog.showMessageBoxSync(currentBrowserWindow() ?? undefined, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 0,
      cancelId: 1,
      message: 'Leave this page?',
      detail: 'Changes you made may not be saved.',
    });
    if (choice === 0) event.preventDefault(); // preventing the prevention lets the unload proceed
  }));

  wc.on('found-in-page', bindWindowRuntime(runtime, (_e, result) => {
    if (id === tabState.activeTabId) {
      chromeState.overlayView?.webContents.send('chrome:find-result', { activeMatchOrdinal: result.activeMatchOrdinal, matches: result.matches });
    }
  }));

  // Open target="_blank"/featureless window.open as managed tabs, but let
  // window.open with explicit features ('new-window': OAuth/SSO popups,
  // payment flows) become a REAL child window. Both paths MUST preserve
  // window.opener: sign-in flows deliver their result back to the opening
  // page via postMessage, and an opener-less child breaks them (observed:
  // GitHub's "Sign in with Google" looping until accounts.google.com 400'd
  // on corrupted state; later, Google auth flows opened as target=_blank
  // dead-ending at accounts.google.com/gis_transform with a 400). So tabs
  // are ADOPTED via createWindow — Chromium constructs the child wired to
  // its opener, and createTab takes the view in as a normal managed tab —
  // never re-created from just the URL. outlivesOpener on both paths:
  // Electron's default destroys children with their opener, but closing a
  // tab must not tear down the tabs (or popups) it spawned — Chrome never
  // does. Electron only inherits the security subset of webPreferences
  // into window.open children, so plugins (inline PDFs) is re-asserted via
  // override — but ONLY plugins: overriding preload forces the child out
  // of its opener's context and severs window.opener, defeating the whole
  // adoption. Adopted tabs therefore lack tab-preload; that bridge only
  // matters on blanc:// pages, and the guards below keep web content
  // from opening or navigating into blanc:// at all.
  // Cmd/Ctrl+click arrives as 'background-tab' — open it without stealing
  // focus (browser convention). Children of a private tab stay private —
  // a popup must not silently start recording history again. Applied
  // recursively via did-create-window so a popup's own window.open
  // children (a "Terms" link inside an OAuth popup) land back in managed
  // tabs instead of falling through to bare Electron windows.
  const applyWindowOpenPolicy = (targetWc) => {
    targetWc.setWindowOpenHandler(bindWindowRuntime(runtime, ({ url: targetUrl, disposition }) => {
      // Utility pages never become tabs — and an adopted child must never
      // reach createTab's guard: by createWindow time the guest webContents
      // already exists, and a null return would leave it half-built and
      // unmanaged. Deny the child outright, and route to the sheet ONLY
      // for an internal opener — web content asking for a blanc:// child
      // gets the same silent denial it always did, never a focused sheet.
      if (isUtilityUrl(targetUrl)) {
        if (targetWc.getURL().startsWith('blanc://')) openInternalPage(targetUrl);
        return { action: 'deny' };
      }
      // Web content must not mint privileged internal pages (Chrome blocks
      // web → chrome:// the same way). Only blanc:// pages themselves may
      // open blanc:// children.
      if (/^blanc:/i.test(targetUrl) && !targetWc.getURL().startsWith('blanc://')) {
        return { action: 'deny' };
      }
      // target="_blank" mailto:/tel: links otherwise spawn a dead child
      // tab — hand them to the OS like the will-navigate path does.
      if (handOffToOs(targetUrl)) return { action: 'deny' };
      if (disposition === 'new-window') {
        return {
          action: 'allow',
          outlivesOpener: true,
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }
      // Children stay in their opener's group, like Chrome's tab tabState.groups.
      return {
        action: 'allow',
        outlivesOpener: true,
        overrideBrowserWindowOptions: { webPreferences: { plugins: true } },
        createWindow: (options) => {
          // options.webContents is the guest Chromium already created,
          // wired to its opener. The view must WRAP it — constructing a
          // fresh webContents here throws "Invalid webContents. Created
          // window should be connected to webContents passed with options".
          const view = new WebContentsView({ webContents: options.webContents });
          const newId = createTab(targetUrl, { private: tab.private, groupId: tab.groupId, view });
          // Activation is deferred: createWindow runs mid-window-open,
          // before Chromium has finished wiring the guest, and attaching
          // the view to the window at that point silently fails to take.
          if (disposition !== 'background-tab') setImmediate(() => setActiveTab(newId));
          return view.webContents;
        },
      };
    }));
    targetWc.on('did-create-window', bindWindowRuntime(runtime, (childWindow) => {
      // Adopted children run their own createTab wiring; only real popup
      // windows need the policy grafted on.
      const isManagedTab = [...tabs.values()].some(
        (t) => t.view.webContents.id === childWindow.webContents.id
      );
      if (!isManagedTab) applyWindowOpenPolicy(childWindow.webContents);
    }));
  };
  applyWindowOpenPolicy(wc);

  attachContextMenu(wc, {
    // "Open Link in New Tab"/"Open Link" on a mailto:/tel: link otherwise
    // creates a dead tab — createTab() has no chance to check, since it
    // never sees the raw link URL as a page navigation.
    openBackgroundTab: bindWindowRuntime(runtime, (targetUrl) => {
      if (handOffToOs(targetUrl)) return;
      createTab(targetUrl, { private: tab.private, groupId: tab.groupId });
    }),
    openTab: bindWindowRuntime(runtime, (targetUrl) => {
      if (handOffToOs(targetUrl)) return;
      setActiveTab(createTab(targetUrl, { private: tab.private, groupId: tab.groupId }));
    }),
  });

  // Load failures surface via the did-fail-load handler above; the
  // rejected promise here is the same event and must not crash main.
  // Adopted window.open children are loaded by Chromium itself as part of
  // the window-open dance — a competing loadURL here would cancel it.
  if (!adopted) {
    // navigationHistory.restore() performs its own navigation and must be
    // the tab's first — used by duplicateTab below instead of a plain
    // loadURL when the source tab has real back/forward history to clone.
    if (restoreHistory) wc.navigationHistory.restore(restoreHistory).catch(() => {});
    else wc.loadURL(url).catch(() => {});
  }
  scheduleMenuRebuild();
  return id;
}

function setActiveTab(id, { focusContent = true, focusAddress = false } = {}) {
  const next = tabs.get(id);
  const runtime = currentWorkspaceRuntime();
  if (!next || !runtime || windowRuntimeRegistry.ownerForTab(id) !== runtime.id) return;
  // A script-closed adopted tab prunes itself via its 'destroyed' handler,
  // but a deferred activation (the window-open setImmediate) can race the
  // event — never attach or focus a dead webContents.
  if (next.view.webContents.isDestroyed()) return;

  // Re-selecting the active tab is a no-op.
  if (id === tabState.activeTabId) return;

  // A genuine switch cancels a live picker — but only a switch FROM a real tab.
  // The window's did-finish-load re-attach nulls tabState.activeTabId to force a fresh
  // attach of the same tab; that is an initial attach, not a tab change, and
  // must not settle a picker (harmless in production, where no picker exists at
  // window creation — but in tests a picker scenario running right after launch
  // would otherwise be torn down by that deferred re-attach).
  if (tabState.activeTabId !== null) {
    pickerController.settleForRuntime(runtime.id, null, 'tab-changed');
    displaySharePickerController.cancelForRuntime(runtime.id, 'tab-changed');
  }

  // Tab switches dismiss the sheet; the switched-to tab takes focus via
  // the existing flow below.
  hideUtilitySheet({ refocusContent: false });

  lastActiveByCluster.set(clusterKeyForTab(next), id);

  // No window to attach to (quitting, or macOS with all windows closed):
  // just track the selection so window recreation attaches the right tab.
  // The menu bar persists on macOS even with no windows open, so it still
  // needs to reflect the new tabState.activeTabId.
  const browserWindow = currentBrowserWindow();
  if (!browserWindow) {
    setRuntimeActiveTab(id);
    scheduleMenuRebuild();
    return;
  }

  // Find state is per-tab; a stale capsule over a different page misleads.
  if (chromeState.overlayMode === 'find') hideOverlay({ refocusContent: false });

  const prevId = tabState.activeTabId;
  const prev = prevId ? tabs.get(prevId) : null;
  if (prev) {
    browserWindow.contentView.removeChildView(prev.view);
    // A detached view's document still reports visibilityState 'visible',
    // so Chromium never background-throttles its timers (the newtab sprite
    // would keep animating at 6fps forever). Hide it explicitly;
    // reactivation always calls setVisible(true).
    prev.view.setVisible(false);
  }

  setRuntimeActiveTab(id);
  if (prevId && prevId !== id) tabsWantingAddressBarFocus.delete(prevId);
  const shouldFocusAddress = focusAddress && !focusContent;
  if (shouldFocusAddress) {
    tabsWantingAddressBarFocus.add(id);
  } else {
    tabsWantingAddressBarFocus.delete(id);
    next.view.setVisible(true);
  }
  if (shouldFocusAddress) next.view.setVisible(false);
  browserWindow.contentView.addChildView(next.view);
  // The freshly attached tab view must not stack above an open overlay —
  // nor above the sheet (defensive: §5 means they shouldn't coexist here,
  // but a race must never paint a tab over either floating layer).
  if (chromeState.utilitySheetUrl && chromeState.utilitySheetView) browserWindow.contentView.addChildView(chromeState.utilitySheetView);
  if (chromeState.overlayMode && chromeState.overlayView) browserWindow.contentView.addChildView(chromeState.overlayView);
  resizeActiveView();
  // Focusing the tab's WebContentsView gives it OS keyboard focus. For a
  // blank new tab we instead want the chrome's address bar, and OS focus
  // can be claimed asynchronously by the attached child view, so blank-tab
  // activation keeps reclaiming focus until the user navigates or switches.
  if (focusContent) next.view.webContents.focus();
  // Background tabs can't be pixel-sampled; catch up when they surface.
  if (!next.pageBg) scheduleSampleTint(next);
  broadcastTabs();
  scheduleMenuRebuild();
  if (shouldFocusAddress) {
    reclaimAddressBarFocus(id);
    setImmediate(() => {
      if (tabState.activeTabId !== id || !tabs.has(id)) return;
      next.view.setVisible(true);
      reclaimAddressBarFocus(id);
    });
  }
}

let railActivationSerial = 0;

function activateTabFromRail(id) {
  const tab = tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return false;
  railActivationSerial += 1;

  // One guarded main-process action owns the complete interaction so a
  // renderer cannot leave an old sheet/panel stacked over the selected tab.
  hideOverlay({ refocusContent: false });
  hideUtilitySheet({ refocusContent: false });

  if (id !== tabState.activeTabId) {
    setActiveTab(id, { focusContent: true });
  } else {
    // setActiveTab deliberately no-ops for an already-active tab; the rail
    // contract still requires that click/keyboard activation focus content.
    tabsWantingAddressBarFocus.delete(id);
    tab.view.setVisible(true);
    resizeActiveView();
    tab.view.webContents.focus();
  }
  return true;
}

/** URLs of recently closed tabs, oldest first (Cmd/Ctrl+Shift+T pops). */
const recentlyClosedUrls = [];

function closeTab(id) {
  const tab = tabs.get(id);
  const runtime = currentWorkspaceRuntime();
  if (!tab || !runtime || windowRuntimeRegistry.ownerForTab(id) !== runtime.id) return;

  // Only the picker's own tab closing cancels it — an unrelated background tab
  // must not.
  if (id === tabState.activeTabId) {
    pickerController.settleForRuntime(runtime.id, null, 'tab-changed');
  }
  // A Chromium-initiated destruction reaches this function from wc's
  // `destroyed` event, after WebContentsView may already have cleared its
  // webContents property. The display request was already invalidated with the
  // renderer; cancel it when an id remains, but teardown must stay null-safe.
  const closingWebContents = tab.view.webContents;
  if (closingWebContents) {
    displaySharePickerController.cancelForWebContents(
      closingWebContents.id,
      'tab-changed'
    );
  }

  // Closed private tabs are gone — reopen-closed-tab must not resurrect them.
  if (tab.url && !tab.private && !tab.url.startsWith('blanc://newtab')) {
    recentlyClosedUrls.push(tab.url);
    if (recentlyClosedUrls.length > 25) recentlyClosedUrls.shift();
  }

  const wasActive = id === tabState.activeTabId;
  const browserWindow = currentBrowserWindow();
  if (wasActive && browserWindow) browserWindow.contentView.removeChildView(tab.view);

  const closedIndex = tabState.tabOrder.indexOf(id);
  tabsWantingAddressBarFocus.delete(id);
  tabs.delete(id);
  windowRuntimeRegistry.releaseTab(id);
  tabState.tabOrder = tabState.tabOrder.filter((tid) => tid !== id);
  pruneEmptyGroups();
  const wc = tab.view.webContents;
  if (wc && !wc.isDestroyed()) wc.close();

  if (wasActive) {
    if (tabState.tabOrder.length > 0) {
      // Prefer the tab that was to the right of the closed one.
      setActiveTab(tabState.tabOrder[Math.min(closedIndex, tabState.tabOrder.length - 1)]);
    } else if (browserWindow) {
      setRuntimeActiveTab(null);
      setActiveTab(createTab());
    } else {
      // Quitting or window already gone — don't spawn replacement tabs.
      setRuntimeActiveTab(null);
    }
    if (browserWindow) return; // setActiveTab already broadcasts and schedules a menu rebuild
  }
  broadcastTabs();
  scheduleMenuRebuild();
}

function reopenClosedTab() {
  const url = recentlyClosedUrls.pop();
  if (url) setActiveTab(createTab(url));
}

function reorderTab(id, toIndex) {
  const from = tabState.tabOrder.indexOf(id);
  if (from === -1) return;
  const clamped = Math.max(0, Math.min(tabState.tabOrder.length - 1, toIndex));
  tabState.tabOrder.splice(from, 1);
  tabState.tabOrder.splice(clamped, 0, id);
  broadcastTabs();
  scheduleMenuRebuild();
}

function reorderTabWithinBucket(id, beforeId) {
  // Renderer input is only a proposal. Main re-resolves both ids against its
  // live model and rejects a stale/cross-group/cross-pin target.
  const next = reorderWithinBucket(tabState.tabOrder, tabs, id, beforeId);
  if (!next) return false;
  if (next.some((tabId, index) => tabState.tabOrder[index] !== tabId)) {
    tabState.tabOrder = next;
    broadcastTabs();
    scheduleMenuRebuild();
  }
  return true;
}

/** Cmd/Ctrl+1–9. With tabState.groups: n jumps to the nth cluster — a group's
 * first tab, unfolding it (Island Tab Groups design). Without tabState.groups the
 * browser convention stands: 1–8 jump to that tab, 9 to the last. */
function selectTabAtIndex(index) {
  // clusterSlots() surfaces ungrouped pins as a leading slot. Grouped pins
  // remain reachable through their group's own slot.
  const slots = clusterSlots();
  if (tabState.groups.length && slots.length) {
    const slot = slots[index];
    if (!slot) return;
    if (slot.group) focusGroup(slot.group.id);
    else setActiveTab(slot.tabIds[0]);
    return;
  }
  const id = index >= 8 ? tabState.tabOrder[tabState.tabOrder.length - 1] : tabState.tabOrder[index];
  if (id) setActiveTab(id);
}

function cycleTab(direction) {
  if (!tabState.activeTabId || tabState.tabOrder.length < 2) return;
  const i = tabState.tabOrder.indexOf(tabState.activeTabId);
  setActiveTab(tabState.tabOrder[(i + direction + tabState.tabOrder.length) % tabState.tabOrder.length]);
}

/** ⌥⌘←/→: previous/next tab within the active tab's cluster, wrapping.
 * With no tabState.groups and no pins everything is one loose cluster, so this
 * degrades to plain tab cycling (same result as Ctrl+Tab). */
function cycleTabInCluster(direction) {
  if (!tabState.activeTabId) return;
  const slot = clusterSlots().find((s) => s.tabIds.includes(tabState.activeTabId));
  if (!slot) return cycleTab(direction);
  if (slot.tabIds.length < 2) return;
  const i = slot.tabIds.indexOf(tabState.activeTabId);
  setActiveTab(slot.tabIds[(i + direction + slot.tabIds.length) % slot.tabIds.length]);
}

/** ⌥⌘↑/↓: previous/next cluster in ⌘1–9 order (ungrouped pinned
 * shelf → tabState.groups → loose), wrapping. Lands on the cluster's last-active
 * tab and unfolds a collapsed group, consistent with focusGroup(). */
function cycleCluster(direction) {
  if (!tabState.activeTabId) return;
  const slots = clusterSlots();
  if (slots.length < 2) return;
  const from = slots.findIndex((s) => s.tabIds.includes(tabState.activeTabId));
  if (from === -1) return;
  const target = slots[(from + direction + slots.length) % slots.length];
  if (target.group) target.group.collapsed = false;
  const remembered = lastActiveByCluster.get(target.key);
  setActiveTab(target.tabIds.includes(remembered) ? remembered : target.tabIds[0]);
}

/** Focus an existing tab already on this internal page, or open one. */
function openInternalPage(url) {
  if (isUtilityUrl(url)) return showUtilityPage(url);
  const existing = tabState.tabOrder.find((id) => tabs.get(id)?.url.startsWith(url));
  if (existing) {
    setActiveTab(existing);
    tabs.get(existing).view.webContents.reload(); // pick up fresh data
  } else {
    setActiveTab(createTab(url));
  }
}

function toggleBookmarkForActiveTab() {
  const tab = tabState.activeTabId ? tabs.get(tabState.activeTabId) : null;
  if (!tab || tab.private || !/^https?:\/\//.test(tab.url)) return;
  tab.bookmarked = bookmarks.toggleBookmark(tab.url, tab.title, tab.favicon);
  broadcastTabs();
  scheduleMenuRebuild();
}

/** The `/save [folder]` command: add-only favorite of the active tab, into an
 * optional folder. Same guards as toggleBookmarkForActiveTab; re-derives
 * bookmarked from the store so add / move / rejected-folder all report right. */
function saveActiveTabAsFavorite(folder) {
  const tab = tabState.activeTabId ? tabs.get(tabState.activeTabId) : null;
  if (!tab || tab.private || !/^https?:\/\//.test(tab.url)) return;
  bookmarks.saveFavorite(tab.url, tab.title, tab.favicon, folder);
  tab.bookmarked = bookmarks.isBookmarked(tab.url);
  broadcastTabs();
  scheduleMenuRebuild();
}

/** "Add All Open Tabs to Favorites" — mirrors toggleBookmarkForActiveTab's
 * own URL guard. Skips private tabs (favorites never populate from private
 * browsing) and anything already favorited (idempotent). */
function addAllTabsToFavorites() {
  for (const id of tabState.tabOrder) {
    const tab = tabs.get(id);
    if (!tab || tab.private) continue;
    if (!/^https?:\/\//.test(tab.url)) continue;
    if (bookmarks.isBookmarked(tab.url)) continue;
    tab.bookmarked = bookmarks.toggleBookmark(tab.url, tab.title, tab.favicon);
  }
  broadcastTabs();
  scheduleMenuRebuild();
}

/** Bookmark state can change from the bookmarks page; re-derive per tab. */
function refreshBookmarkFlags() {
  for (const tab of tabs.values()) tab.bookmarked = bookmarks.isBookmarked(tab.url);
  for (const runtime of windowRuntimeRegistry.all()) broadcastTabsForRuntime(runtime);
  scheduleMenuRebuild();
}

const ZOOM_STEP = 0.5;
const ZOOM_MIN = -8;
const ZOOM_MAX = 8;

/** Zoom acts on what the user is looking at: the sheet when open, else the active tab. */
function zoomTargetWebContents() {
  if (chromeState.utilitySheetUrl && chromeState.utilitySheetView) return chromeState.utilitySheetView.webContents;
  return tabs.get(tabState.activeTabId)?.view.webContents ?? null;
}

function zoomActiveTab(delta) {
  const wc = zoomTargetWebContents();
  if (!wc) return;
  const level = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, wc.getZoomLevel() + delta));
  wc.setZoomLevel(level);
}

function resetZoomForActiveTab() {
  zoomTargetWebContents()?.setZoomLevel(0);
}

function openFindBar() {
  if (!currentBrowserWindow()) return;
  showOverlay('find');
}

function focusAddressBar() {
  const browserWindow = currentBrowserWindow();
  if (!browserWindow) return;
  // setActiveTab() may just have handed OS-level keyboard focus to the
  // tab's WebContentsView; showOverlay reclaims it for the overlay's
  // webContents so the address input actually receives keystrokes.
  browserWindow.focus();
  // Reasserts must not downgrade an already-summoned palette to a panel.
  showOverlay(chromeState.overlayMode && chromeState.overlayMode !== 'find' ? chromeState.overlayMode : 'panel');
}

function shouldReclaimAddressBarFocus(id) {
  return tabState.activeTabId === id && tabsWantingAddressBarFocus.has(id);
}

function reclaimAddressBarFocus(id, { consume = false } = {}) {
  if (!shouldReclaimAddressBarFocus(id)) return;
  // WebContentsView focus can settle after Electron emits focus/navigation
  // callbacks, so reassert once on the next main-process turn as well.
  focusAddressBar();
  setImmediate(() => {
    if (!shouldReclaimAddressBarFocus(id)) return;
    focusAddressBar();
    if (consume) tabsWantingAddressBarFocus.delete(id);
  });
}

function refocusAddressBarIfWanted() {
  if (tabState.activeTabId && shouldReclaimAddressBarFocus(tabState.activeTabId)) {
    reclaimAddressBarFocus(tabState.activeTabId);
  }
}

// The predicate itself lives in ipc-trust.js (pure, unit-tested). Resolve the
// runtime from the native sender first; a renderer never gets to nominate a
// window id in IPC payload. That is the cross-window isolation boundary.
function trustedRuntimeForChromeSender(event) {
  const runtime = windowRuntimeRegistry.getByChromeWebContents(event.sender);
  if (!runtime || !runtime.browserWindow || runtime.browserWindow.isDestroyed()) return null;
  const trusted = [
    { webContents: runtime.browserWindow.webContents, url: CHROME_INDEX_URL },
    runtime.overlayView && !runtime.overlayView.webContents.isDestroyed()
      ? { webContents: runtime.overlayView.webContents, url: CHROME_OVERLAY_URL }
      : null,
  ];
  return isTrustedSender(event, trusted) ? runtime : null;
}

function isTrustedChromeSender(event) {
  return !!trustedRuntimeForChromeSender(event);
}

function chromeHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    const runtime = trustedRuntimeForChromeSender(event);
    if (!runtime) throw new Error(`${channel}: denied for untrusted sender`);
    return withWindowRuntime(runtime, () => handler(event, ...args));
  });
}

function chromeOn(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    const runtime = trustedRuntimeForChromeSender(event);
    if (!runtime) {
      console.warn(`[ipc] ${channel}: denied for untrusted sender`);
      return;
    }
    withWindowRuntime(runtime, () => handler(event, ...args));
  });
}

function registerIpcHandlers() {
  // Credential-picker reply. Validation lives in the controller (two stages: a
  // reply that can't prove it belongs to THIS request changes no state).
  ipcMain.on('chrome:credential-pick', (event, payload) => {
    const runtime = trustedRuntimeForChromeSender(event);
    if (runtime) withWindowRuntime(runtime, () => pickerController.handleReply(event, payload));
  });
  ipcMain.on('chrome:display-share-pick', (event, payload) => {
    const runtime = trustedRuntimeForChromeSender(event);
    if (runtime) withWindowRuntime(runtime, () => displaySharePickerController.handleReply(event, payload));
  });

  chromeHandle('tabs:create', (_e, url, opts) => {
    const isPrivate = !!opts?.private;
    // A plain new tab is deliberately ungrouped — createTab defaults groupId
    // to null and we intentionally don't pass one. Only window.open/context-
    // menu children inherit the opener's group (see CLAUDE.md → Tab tabState.groups);
    // don't copy that `groupId: tab.groupId` pattern into new-tab entry points.
    const id = createTab(url || (isPrivate ? PRIVATE_NEW_TAB_URL : newTabUrl()), {
      private: isPrivate,
    });
    // A blank "New Tab" (no explicit url) is normally a launchpad — keep OS
    // focus on the chrome so the address bar can take it. A url means the
    // caller has somewhere specific to go, so focus the page content. The
    // island footer's New-tab/Private buttons opt out with focusAddress:false:
    // they close the panel and land the user directly on the fresh tab rather
    // than re-summoning the launchpad.
    const blank = !url;
    const focusAddress = opts?.focusAddress ?? blank;
    setActiveTab(id, { focusContent: !focusAddress, focusAddress });
    return id;
  });
  chromeHandle('tabs:close', (_e, id) => closeTab(id));
  chromeHandle('tabs:switch', (_e, id) => setActiveTab(id));
  chromeHandle('tabs:activate-from-rail', (_e, id) => activateTabFromRail(id));
  chromeHandle('tabs:navigate', (_e, id, url) => navigateTabToAddress(id, url));
  // Search completions are query text, not navigation targets: a suggestion
  // such as "example.com" must search for that text instead of being
  // reclassified as a bare domain by normalizeAddressInput().
  chromeHandle('tabs:search', (_e, id, query, _requestedEngine) => {
    const tab = tabs.get(id);
    if (!tab || typeof query !== 'string' || !query.trim()) return;
    // The renderer may still be showing completions returned by the previous
    // default after Settings or Profile Sync changes it. Treat its provider id
    // as display metadata only: submission always honors the current default.
    const currentEngine = settings.getSettings().searchEngine;
    const engine = settings.SEARCH_ENGINES[currentEngine]
      ?? settings.SEARCH_ENGINES.duckduckgo;
    const target = engine.url(query.trim());
    tabsWantingAddressBarFocus.delete(id);
    if (testSearchNavigationCapture) {
      testSearchSubmission = {
        engine: settings.SEARCH_ENGINES[currentEngine] ? currentEngine : 'duckduckgo',
        query: query.trim(),
        url: target,
      };
      return target;
    }
    return tab.view.webContents.loadURL(target);
  });
  chromeHandle('tabs:back', (_e, id) => tabs.get(id)?.view.webContents.navigationHistory.goBack());
  chromeHandle('tabs:forward', (_e, id) => tabs.get(id)?.view.webContents.navigationHistory.goForward());
  chromeHandle('tabs:reload', (_e, id) => tabs.get(id)?.view.webContents.reload());
  chromeHandle('tabs:stop', (_e, id) => tabs.get(id)?.view.webContents.stop());
  chromeHandle('tabs:reorder', (_e, id, toIndex) => reorderTab(id, toIndex));
  chromeHandle('tabs:reorder-within-bucket', (_e, id, beforeId) =>
    reorderTabWithinBucket(id, beforeId));
  chromeHandle('tabs:set-group', (_e, id, groupId) => setTabGroup(id, groupId ?? null));
  chromeHandle('tabs:group-by-name', (_e, id, name) => groupTabByName(id, name));
  chromeHandle('tabs:toggle-group-collapsed', (_e, groupId) => toggleGroupCollapsed(groupId));
  chromeHandle('tabs:focus-group', (_e, groupId) => focusGroup(groupId));
  chromeHandle('tabs:close-group', (_e, groupId) => closeGroup(groupId));
  chromeHandle('tabs:toggle-bookmark', () => toggleBookmarkForActiveTab());
  chromeHandle('tabs:save-favorite', (_e, folder) => saveActiveTabAsFavorite(folder));
  chromeHandle('tabs:toggle-pinned', (_e, id) => toggleTabPinned(id));
  chromeHandle('tabs:toggle-muted', (_e, id) => toggleTabMuted(id));
  chromeHandle('tabs:duplicate', (_e, id) => duplicateTab(id));
  chromeHandle('tabs:open-page', (_e, name) => {
    if (['bookmarks', 'history', 'downloads', 'settings'].includes(name)) {
      openInternalPage(`blanc://${name}/`);
    }
  });
  chromeHandle('tabs:get-all', () => ({
    tabs: serializeTabs(),
    activeTabId: tabState.activeTabId,
    groups: tabState.groups,
    tabLayout,
    ...verticalTabsMetrics(),
  }));
  chromeHandle('tabs:find', (_e, id, query, options) => tabs.get(id)?.view.webContents.findInPage(query, options));
  chromeHandle('tabs:find-stop', (_e, id) => tabs.get(id)?.view.webContents.stopFindInPage('clearSelection'));

  chromeOn('chrome:layout', (_e, { height }) => {
    if (typeof height === 'number' && height > 0) {
      chromeHeight = height;
      resizeActiveView();
    }
  });

  chromeOn('chrome:open-island', () => showOverlay('panel'));
  chromeOn('chrome:open-find', () => showOverlay('find'));
  chromeHandle('chrome:set-tab-layout', (_e, layout) => setTabLayout(layout));
  chromeOn('chrome:preview-vertical-tabs-width', (_e, width) =>
    previewVerticalTabsWidth(width));
  chromeHandle('chrome:set-vertical-tabs-width', (_e, width) =>
    setVerticalTabsWidth(width));
  chromeOn('overlay:close', () => hideOverlay());
  chromeOn('chrome:downloads-ack', () => {
    acknowledgeDownloads();
    broadcastDownloadsActivity();
  });

  // Data + actions behind the island's slash commands and Quick Switcher.
  chromeHandle('chrome:history-list', (_e, opts) => history.listHistory(opts ?? {}));
  chromeHandle('chrome:favorites-list', () => bookmarks.listBookmarks());
  chromeHandle('chrome:remote-tabs-list', () => sync.listRemoteDevices());
  chromeHandle('chrome:search-suggestions', async (event, query) => {
    const currentSettings = settings.getSettings();
    const configuredEngine = currentSettings.searchEngine;
    const engineId = settings.SEARCH_ENGINES[configuredEngine] ? configuredEngine : 'duckduckgo';
    const engine = settings.SEARCH_ENGINES[engineId];
    const response = { engine: engineId, label: engine.label, suggestions: [] };

    searchSuggestionRequests.get(event.sender)?.abort();

    // The opt-out, private tabs, and local document paths are hard stops at
    // the trusted main-process boundary. Exact-query search still works; only
    // live provider suggestions pause.
    const tab = tabState.activeTabId ? tabs.get(tabState.activeTabId) : null;
    const localDoc = typeof query === 'string' ? localDocumentUrl(query.trim()) : null;
    if (
      !settings.isFirstRunComplete() ||
      !currentSettings.searchSuggestions ||
      !tab ||
      tab.private ||
      localDoc
    ) return response;

    const controller = new AbortController();
    searchSuggestionRequests.set(event.sender, controller);

    try {
      response.suggestions = await searchSuggestionService.get({
        engine: engineId,
        query,
        locale: app.getLocale(),
        fetchImpl: testSearchSuggestionFixture
          ? async (url, options) => {
            testSearchSuggestionRequests.push({
              engine: engineId,
              query: typeof query === 'string' ? query.trim() : '',
              url,
              credentials: options?.credentials ?? null,
            });
            return {
              ok: true,
              headers: { get: () => null },
              text: async () => JSON.stringify([query, testSearchSuggestionFixture]),
            };
          }
          : tab.view.webContents.session.fetch.bind(tab.view.webContents.session),
        signal: controller.signal,
      });
      // A sync merge can change the default engine while this request is in
      // flight. Never label old-provider completions as if they belong to the
      // newly selected engine; the next keystroke will fetch the fresh set.
      const latestSettings = settings.getSettings();
      const latestConfiguredEngine = latestSettings.searchEngine;
      const latestEngineId = settings.SEARCH_ENGINES[latestConfiguredEngine]
        ? latestConfiguredEngine
        : 'duckduckgo';
      if (
        !settings.isFirstRunComplete() ||
        !latestSettings.searchSuggestions ||
        latestEngineId !== engineId
      ) {
        return {
          engine: latestEngineId,
          label: settings.SEARCH_ENGINES[latestEngineId].label,
          suggestions: [],
        };
      }
      return response;
    } finally {
      if (searchSuggestionRequests.get(event.sender) === controller) {
        searchSuggestionRequests.delete(event.sender);
      }
    }
  });
  chromeHandle('chrome:history-clear', () => history.clearHistory());
  chromeHandle('chrome:adblock-toggle', () => {
    const next = !settings.getSettings().adblockEnabled;
    settings.setSettings({ adblockEnabled: next });
    return next;
  });
  // "/allow-ads" — allow ads on the active tab's site, then reload it so
  // the exception actually takes effect on what's shown.
  chromeHandle('chrome:adblock-exempt-active', () => {
    const tab = tabState.activeTabId ? tabs.get(tabState.activeTabId) : null;
    if (!tab) return null;
    try {
      const hostname = new URL(tab.url).hostname.replace(/^www\./, '');
      if (!hostname) return null;
      const { adblockExceptions } = settings.getSettings();
      settings.setSettings({ adblockExceptions: [...adblockExceptions, hostname] });
      tab.view.webContents.reload();
      return hostname;
    } catch {
      return null;
    }
  });
  chromeHandle('chrome:cycle-theme', (_event, requestedTheme) => {
    const order = ['system', 'light', 'dark'];
    const current = settings.getSettings().theme;
    const requested = typeof requestedTheme === 'string'
      ? requestedTheme.trim().toLowerCase()
      : '';
    // Bare /theme keeps the original cycle behavior. An explicit argument is
    // authoritative; invalid arguments are a no-op instead of unexpectedly
    // advancing to some other appearance.
    const next = requested
      ? (order.includes(requested) ? requested : current)
      : order[(order.indexOf(current) + 1) % order.length];
    if (next !== current) settings.setSettings({ theme: next });
    return next;
  });

  chromeOn('window:minimize', () => currentBrowserWindow()?.minimize());
  chromeOn('window:maximize', () => {
    const browserWindow = currentBrowserWindow();
    if (browserWindow?.isMaximized()) browserWindow.unmaximize();
    else browserWindow?.maximize();
  });
  chromeOn('window:close', () => currentBrowserWindow()?.close());
}

// The native menu's dynamic content (tab list, favorites list, Pin/Mute/
// Add-to-Favorites labels) must stay live, but must NOT rebuild at the
// high frequency page-load events (title/favicon/navigation) fire at —
// see the discrete mutation functions below, which call this explicitly.
// Debounced (not called on every invocation immediately) so several
// mutations in quick succession — e.g. closeGroup closing several tabs
// in a loop — still only rebuild once.
let menuRebuildTimer = null;
function scheduleMenuRebuild() {
  if (menuRebuildTimer) return;
  menuRebuildTimer = setTimeout(() => {
    menuRebuildTimer = null;
    buildMenu();
  }, 100);
}

/** Native-menu items for every open tab in cluster order (matching the pill
 * and panel switcher), with pins first within their own cluster. Clicking jumps to it.
 * Titles/domains reflect state as of the last menu rebuild, not the
 * current instant — see the Global Constraints note on this. */
function tabMenuItems() {
  // Private tabs leave no trace anywhere else in the app (history, session,
  // favorites) — the native menu must not be the one place that leaks a
  // private tab's real title/domain.
  const orderedIds = clusterSlots()
    .flatMap((slot) => slot.tabIds)
    .filter((id) => !tabs.get(id)?.private);
  return orderedIds.map((id) => {
    const tab = tabs.get(id);
    const group = tab.groupId ? tabState.groups.find((g) => g.id === tab.groupId) : null;
    let domain = tab.url;
    try {
      domain = new URL(tab.url).hostname || tab.url;
    } catch {
      /* not a parseable URL (blank tab, blanc:// page) — show it as-is */
    }
    const label = `${tab.title || 'New Tab'} — ${domain}${group ? ` (${group.name})` : ''}`;
    return {
      label: escapeMenuLabel(label.length > 120 ? `${label.slice(0, 119)}…` : label),
      type: 'checkbox',
      checked: id === tabState.activeTabId,
      click: () => setActiveTab(id),
    };
  });
}

/** Double a literal '&' so native menus on Windows/Linux don't swallow it as
 * an Alt-mnemonic (macOS has no mnemonics). Apply to every menu label built
 * from user content — tab/favorite titles and folder names. */
const escapeMenuLabel = (label) => (process.platform === 'darwin' ? label : label.replace(/&/g, '&&'));

/** Native Favorites-menu items: folder submenus first (alphabetical), then
 * ungrouped favorites inline — mirroring the Favorites page. */
function favoritesMenuItems() {
  const label = (b) => {
    const t = b.title || b.url;
    return t.length > 120 ? `${t.slice(0, 119)}…` : t;
  };
  const open = (b) => ({ label: escapeMenuLabel(label(b)), click: () => setActiveTab(createTab(b.url)) });
  // Folders as submenus first (alphabetical), then ungrouped favorites inline —
  // mirroring the Favorites page. Everything is shown; folders keep the menu
  // navigable regardless of favorite count (no flat cap on ungrouped either).
  const { folders, ungrouped } = groupFavoritesForMenu(bookmarks.listBookmarks());
  const items = folders.map((f) => ({ label: escapeMenuLabel(f.name), submenu: f.items.map(open) }));
  if (folders.length && ungrouped.length) items.push({ type: 'separator' });
  items.push(...ungrouped.map(open));
  return items;
}

// --- Keyboard shortcuts inventory (Help → Keyboard Shortcuts page) ---

/** 'Alt+CmdOrCtrl+Left' → '⌥⌘←' on macOS, 'Alt+Ctrl+Left' elsewhere —
 * same per-platform glyph convention the overlay uses. */
function formatAccelerator(accelerator) {
  const parts = String(accelerator).split('+');
  const key = parts.pop();
  const KEYS = { Left: '←', Right: '→', Up: '↑', Down: '↓', Plus: '+' };
  const label = KEYS[key] ?? key;
  if (process.platform !== 'darwin') {
    return [...parts.map((m) => (m === 'CmdOrCtrl' || m === 'CommandOrControl' ? 'Ctrl' : m)), label].join('+');
  }
  const MAC = { CmdOrCtrl: '⌘', CommandOrControl: '⌘', Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧' };
  const order = ['⌃', '⌥', '⇧', '⌘'];
  const mods = parts.map((m) => MAC[m] ?? m).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, label].join('');
}

/** Rows for blanc://shortcuts/, read from the LIVE application menu so the
 * page can never drift from the real bindings, plus static extras for the
 * island's non-menu keys. Hidden items (silent aliases like ⌘=) are
 * skipped; the nine ⌘1–9 items collapse into one row. */
function listShortcuts() {
  const rows = [];
  let collapsedTabJumps = false;
  // Walk each top-level menu's whole tree, not just its first level, so an
  // accelerator nested inside a submenu (e.g. Help → Keyboard Shortcuts →
  // Show All Shortcuts…, ⌘/) is still catalogued.
  const collect = (items, category) => {
    for (const item of items ?? []) {
      if (item.submenu) { collect(item.submenu.items, category); continue; }
      if (!item.accelerator || item.visible === false) continue;
      if (/^CmdOrCtrl\+[1-9]$/.test(item.accelerator)) {
        if (!collapsedTabJumps) {
          collapsedTabJumps = true;
          rows.push({ category, label: 'Tab or Group 1–9', keys: `${formatAccelerator('CmdOrCtrl+1')}–9` });
        }
        continue;
      }
      rows.push({ category, label: item.label, keys: formatAccelerator(item.accelerator) });
    }
  };
  for (const top of Menu.getApplicationMenu()?.items ?? []) {
    collect(top.submenu?.items, top.label);
  }
  const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl+';
  rows.push(
    { category: 'Island', label: 'Dismiss island panel / find bar', keys: 'Esc' },
    { category: 'Island', label: 'Open address or run command (in command bar)', keys: 'Return' },
    { category: 'Island', label: 'Open link in background tab', keys: `${mod}click` },
  );
  return rows;
}

// Also listed in overlay.js's COMMANDS and pages/shortcuts.js's
// SLASH_COMMANDS — keep all three in sync when adding or changing a command.
const SLASH_COMMANDS = [
  ['/favorites', 'Open favorites'],
  ['/save [folder]', 'Save this page to favorites, into a folder if you name one'],
  ['/history', 'Open browsing history'],
  ['/downloads', 'Open downloads'],
  ['/settings', 'Open settings'],
  ['/clear', 'Clear browsing history'],
  ['/new', 'Open a new tab'],
  ['/private', 'Open a private tab (history stays untouched)'],
  ['/close', 'Close this tab'],
  ['/pin', 'Pin or unpin this tab'],
  ['/mute', 'Mute or unmute this tab'],
  ['/group <name>', 'Move this tab into a group, creating it on first use'],
  ['/ungroup', 'Take this tab out of its group'],
  ['/close-group', 'Close every tab in this group'],
  ['/find', 'Find in page'],
  ['/block-ads', 'Toggle ad & tracker blocking'],
  ['/allow-ads', 'Allow ads on this site'],
  ['/theme [system|light|dark]', 'Cycle appearance, or switch directly to system, light, or dark'],
];

// A hand-picked subset of the full inventory (blanc://shortcuts/, via
// listShortcuts()) for a quick reference right in the Help menu — not
// exhaustive by design, "Show All Shortcuts…" links to the rest.
const COMMON_KEYSTROKES = [
  ['New Window', 'CmdOrCtrl+N'],
  ['New Tab', 'CmdOrCtrl+T'],
  ['New Private Tab', 'CmdOrCtrl+Shift+N'],
  ['Close Tab', 'CmdOrCtrl+W'],
  ['Reopen Closed Tab', 'CmdOrCtrl+Shift+T'],
  ['Search & Commands', 'CmdOrCtrl+L'],
  ['Find in Page', 'CmdOrCtrl+F'],
  ['Toggle Vertical Tabs', 'CmdOrCtrl+Alt+V'],
  ['Next Tab', 'Ctrl+Tab'],
  ['Previous Tab', 'Ctrl+Shift+Tab'],
  ['Next Tab in Group', 'Alt+CmdOrCtrl+Right'],
  ['Previous Tab in Group', 'Alt+CmdOrCtrl+Left'],
  ['Next Group', 'Alt+CmdOrCtrl+Down'],
  ['Previous Group', 'Alt+CmdOrCtrl+Up'],
];

function buildMenu() {
  const isMac = process.platform === 'darwin';
  // On Windows/Linux native menus a lone "&" marks the next char as an Alt
  // mnemonic and is swallowed; a literal ampersand must be doubled. macOS
  // has no mnemonics, so leave labels untouched there.
  const mn = escapeMenuLabel; // literal '&' → '&&' on Win/Linux; see helper
  const favItems = favoritesMenuItems(); // computed once; drives the separator below
  const appMenu = isMac
    ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { label: 'Check for Updates…', click: checkForUpdatesManually },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }]
    : [];
  const template = [
    ...appMenu,
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: openNewWindow },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => setActiveTab(createTab(newTabUrl()), { focusContent: false, focusAddress: true }) },
        { label: 'New Private Tab', accelerator: 'CmdOrCtrl+Shift+N', click: () => setActiveTab(createTab(PRIVATE_NEW_TAB_URL, { private: true }), { focusContent: false, focusAddress: true }) },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => tabState.activeTabId && closeTab(tabState.activeTabId) },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: reopenClosedTab },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => tabState.activeTabId && tabs.get(tabState.activeTabId)?.view.webContents.print() },
        { type: 'separator' },
        ...(isMac ? [] : [{ label: 'Check for Updates…', click: checkForUpdatesManually }, { type: 'separator' }]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' }, // required for copy/paste/undo to work in inputs
    {
      label: 'View',
      submenu: [
        { label: mn('Search & Commands'), accelerator: 'CmdOrCtrl+L', click: () => {
          const browserWindow = currentBrowserWindow();
          if (browserWindow) {
            browserWindow.focus();
            showOverlay('palette');
          }
        } },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: openFindBar },
        { label: 'Reload Tab', accelerator: 'CmdOrCtrl+R', click: () => tabState.activeTabId && tabs.get(tabState.activeTabId)?.view.webContents.reload() },
        { label: 'Hard Reload Tab (Bypass Cache)', accelerator: 'CmdOrCtrl+Shift+R', click: () => tabState.activeTabId && tabs.get(tabState.activeTabId)?.view.webContents.reloadIgnoringCache() },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => zoomActiveTab(ZOOM_STEP) },
        // Plus requires Shift on most keyboards; Cmd/Ctrl+= is the common alternate, bound silently to the same action.
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', visible: false, click: () => zoomActiveTab(ZOOM_STEP) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => zoomActiveTab(-ZOOM_STEP) },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: resetZoomForActiveTab },
        { type: 'separator' },
        {
          id: 'toggle-vertical-tabs',
          label: 'Toggle Vertical Tabs',
          accelerator: 'CmdOrCtrl+Alt+V',
          click: toggleTabLayout,
        },
        {
          label: 'Tab Layout',
          submenu: [
            {
              label: 'Island',
              type: 'radio',
              checked: tabLayout === 'island',
              click: () => setTabLayout('island'),
            },
            {
              label: 'Vertical Tabs',
              type: 'radio',
              checked: tabLayout === 'vertical',
              click: () => setTabLayout('vertical'),
            },
          ],
        },
        { type: 'separator' },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: () => openInternalPage('blanc://downloads/') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => openInternalPage('blanc://settings/') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => cycleTab(1) },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => cycleTab(-1) },
        { label: 'Next Tab in Group', accelerator: 'Alt+CmdOrCtrl+Right', click: () => cycleTabInCluster(1) },
        { label: 'Previous Tab in Group', accelerator: 'Alt+CmdOrCtrl+Left', click: () => cycleTabInCluster(-1) },
        { label: 'Next Group', accelerator: 'Alt+CmdOrCtrl+Down', click: () => cycleCluster(1) },
        { label: 'Previous Group', accelerator: 'Alt+CmdOrCtrl+Up', click: () => cycleCluster(-1) },
        { type: 'separator' },
        { label: 'Duplicate Tab', enabled: !!tabState.activeTabId, click: () => tabState.activeTabId && duplicateTab(tabState.activeTabId) },
        { label: tabs.get(tabState.activeTabId)?.pinned ? 'Unpin Tab' : 'Pin Tab', enabled: !!tabState.activeTabId, click: () => tabState.activeTabId && toggleTabPinned(tabState.activeTabId) },
        { label: tabs.get(tabState.activeTabId)?.muted ? 'Unmute Tab' : 'Mute Tab', enabled: !!tabState.activeTabId, click: () => tabState.activeTabId && toggleTabMuted(tabState.activeTabId) },
        { type: 'separator' },
        {
          label: 'New Group…',
          enabled: !!tabState.activeTabId,
          click: () => {
            const browserWindow = currentBrowserWindow();
            if (browserWindow) {
              browserWindow.focus();
              showOverlay('palette', { prefill: '/group ' });
            }
          },
        },
        {
          label: 'Ungroup Tab',
          enabled: !!tabs.get(tabState.activeTabId)?.groupId,
          click: () => tabState.activeTabId && setTabGroup(tabState.activeTabId, null),
        },
        {
          label: 'Close Group',
          enabled: !!tabs.get(tabState.activeTabId)?.groupId,
          click: () => {
            const groupId = tabs.get(tabState.activeTabId)?.groupId;
            if (groupId) closeGroup(groupId);
          },
        },
        { type: 'separator' },
        // "Tab or Group": with tabState.groups these jump to the nth pill cluster.
        ...Array.from({ length: 9 }, (_, i) => ({
          label: i === 8 ? 'Last Tab or Group' : `Tab or Group ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => selectTabAtIndex(i),
        })),
        { type: 'separator' },
        ...tabMenuItems(),
      ],
    },
    {
      label: 'Favorites',
      submenu: [
        {
          label: tabs.get(tabState.activeTabId)?.bookmarked ? 'Remove from Favorites' : 'Add to Favorites',
          accelerator: 'CmdOrCtrl+D',
          // Same guard as toggleBookmarkForActiveTab itself — blanc://
          // pages and blank tabs can't be favorited, so don't offer to.
          enabled: /^https?:\/\//.test(tabs.get(tabState.activeTabId)?.url ?? ''),
          click: toggleBookmarkForActiveTab,
        },
        {
          label: 'Add All Open Tabs to Favorites',
          enabled: tabState.tabOrder.some((id) => {
            const tab = tabs.get(id);
            return tab && !tab.private && /^https?:\/\//.test(tab.url) && !bookmarks.isBookmarked(tab.url);
          }),
          click: addAllTabsToFavorites,
        },
        { type: 'separator' },
        ...favItems,
        // Only divide the favorites list from Show Favorites when there ARE
        // favorites — otherwise the two separators would collapse into one gap.
        ...(favItems.length ? [{ type: 'separator' }] : []),
        { label: 'Show Favorites', accelerator: isMac ? 'Cmd+Alt+B' : 'Ctrl+Shift+O', click: () => openInternalPage('blanc://bookmarks/') },
        { label: 'Show History', accelerator: 'CmdOrCtrl+Y', click: () => openInternalPage('blanc://history/') },
      ],
    },
    {
      label: 'Help',
      ...(isMac ? { role: 'help' } : {}),
      submenu: [
        {
          label: 'Slash Commands',
          // Plain reference rows, not disabled — legible at a glance, and a
          // stray click just closes the menu since none of them has a handler.
          submenu: SLASH_COMMANDS.map(([cmd, hint]) => ({ label: mn(`${cmd} — ${hint}`) })),
        },
        {
          label: 'Keyboard Shortcuts',
          submenu: [
            ...COMMON_KEYSTROKES.map(([label, accelerator]) => ({ label: mn(`${label} — ${formatAccelerator(accelerator)}`) })),
            { label: `Tab or Group 1–9 — ${formatAccelerator('CmdOrCtrl+1')}–9` },
            { type: 'separator' },
            { label: 'Show All Shortcuts…', accelerator: 'CmdOrCtrl+/', click: () => openInternalPage('blanc://shortcuts/') },
          ],
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow({ runtimeId = activeWorkspaceWindowId } = {}) {
  const browserWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: chromeBackgroundColor(),
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const runtime = windowRuntimeRegistry.register({
    id: runtimeId,
    browserWindow,
  });
  if (!primaryWindowRuntime || runtime.id === PRIMARY_WINDOW_ID) {
    primaryWindowRuntime = runtime;
  }
  setFocusedWindowRuntime(runtime);
  // Transition alias for startup-only integrations. Runtime-aware operations
  // use currentBrowserWindow(), never this mutable pointer.
  win = browserWindow;

  lockPrivilegedNavigation(browserWindow.webContents, CHROME_INDEX_URL);
  installVerticalTabsShortcut(browserWindow.webContents);
  browserWindow.loadFile(CHROME_INDEX_FILE);
  createOverlay(runtime);
  browserWindow.on('resize', bindWindowRuntime(runtime, resizeActiveView));
  browserWindow.on('focus', bindWindowRuntime(runtime, () => {
    setFocusedWindowRuntime(runtime);
    refocusAddressBarIfWanted();
  }));
  browserWindow.on('closed', bindWindowRuntime(runtime, () => {
    const closingWindow = browserWindow;
    const closingRuntime = runtime;
    // Settle any pending picker BEFORE resetting chromeState.overlayMode. The overlay's own
    // 'destroyed' listener also settles, but it fires after webContents.close()
    // below — by which point chromeState.overlayMode is already null, so settle would see no
    // picker mode and skip hideOverlay, stranding chromeState.overlayPrefill's vault rows
    // across a macOS dock reopen. Settling here, while the mode is still live,
    // is what clears them. (hasLiveWindow() is already false, so hideOverlay
    // clears the rows and skips the view ops rather than throwing.)
    pickerController.settleForRuntime(runtime.id, null, 'window-closed');
    displaySharePickerController.cancelForRuntime(runtime.id, 'window-closed');
    // Unlike tabs, the overlay doesn't outlive its window — recreated fresh.
    chromeState.overlayMode = null;
    if (chromeState.overlayView && !chromeState.overlayView.webContents.isDestroyed()) chromeState.overlayView.webContents.close();
    chromeState.overlayView = null;
    // The sheet doesn't outlive its window either — dropping the reference
    // without closing would leak the webContents.
    if (chromeState.utilitySheetView && !chromeState.utilitySheetView.webContents.isDestroyed()) chromeState.utilitySheetView.webContents.close();
    chromeState.utilitySheetView = null;
    chromeState.utilitySheetUrl = null;
    // Secondary windows own independent tab lifecycles. The primary keeps its
    // tabs for the macOS dock-reopen behavior; closing a secondary window is
    // an explicit user close, so its tabs and persisted workspace end here.
    if (!isQuitting && closingRuntime.id !== PRIMARY_WINDOW_ID) {
      for (const tabId of [...closingRuntime.tabOrder]) closeTab(tabId);
      removePersistedWorkspace(closingRuntime.id);
      windowRuntimeRegistry.discard(closingRuntime.id, closingWindow);
    } else if (closingRuntime) {
      windowRuntimeRegistry.detach(closingRuntime.id, closingWindow);
    }
    const nextFocusedRuntime = windowRuntimeRegistry.all().find((candidate) =>
      candidate.browserWindow && !candidate.browserWindow.isDestroyed()) ?? null;
    setFocusedWindowRuntime(nextFocusedRuntime);
    if (!nextFocusedRuntime) activeWorkspaceWindowId = PRIMARY_WINDOW_ID;
    win = nextFocusedRuntime?.browserWindow ?? null;
    // The detached favicon rasterizer view isn't a BrowserWindow, so it would
    // otherwise linger past the last window (blocking `window-all-closed` quit
    // on Windows/Linux). Recreated lazily on the next non-PNG capture.
    if (!nextFocusedRuntime) iconRaster.dispose();
    flushPermissionPrompts(closingRuntime.id);
  }));

  // Tabs survive window close (macOS dock-reopen recreates the window);
  // re-attach the active tab's view or the new window sits over nothing.
  // First launch has no tabState.activeTabId yet — app.whenReady handles that one.
  browserWindow.webContents.once('did-finish-load', bindWindowRuntime(runtime, () => {
    if (!tabState.activeTabId || !tabs.has(tabState.activeTabId)) return;
    const id = tabState.activeTabId;
    setRuntimeActiveTab(null); // force setActiveTab to treat it as a fresh attach
    setActiveTab(id);
    // An 'open-url' with no window queues; opening it is why the window
    // was recreated (macOS dock-reopen path).
    flushExternalUrls();
  }));

  return runtime;
}

function createWindowRuntimeId() {
  return `window_${crypto.randomUUID().replace(/-/g, '')}`;
}

function openNewWindow() {
  const runtime = createMainWindow({ runtimeId: createWindowRuntimeId() });
  return withWindowRuntime(runtime, () => {
    const tabId = createTab(newTabUrl());
    if (tabId) setActiveTab(tabId, { focusContent: false, focusAddress: true });
    // The initial blank tab is a normal restorable workspace entry. Broadcast
    // now so the new window has a stable owner before its first navigation.
    broadcastTabs();
    return runtime.id;
  });
}

function windowRuntimeSnapshots() {
  return windowRuntimeRegistry.all().map((runtime) => ({
    id: runtime.id,
    tabOrder: [...runtime.tabOrder],
    activeTabId: runtime.activeTabId,
    tabs: runtime.tabOrder.map((tabId) => {
      const tab = tabs.get(tabId);
      return tab ? { id: tab.id, url: tab.url } : null;
    }).filter(Boolean),
    groups: runtime.groups.map(({ id, name, collapsed }) => ({ id, name, collapsed })),
    attached: !!runtime.browserWindow && !runtime.browserWindow.isDestroyed(),
  }));
}

function closeWindowRuntime(id) {
  if (id === PRIMARY_WINDOW_ID) return false;
  const runtime = windowRuntimeRegistry.get(id);
  if (!runtime?.browserWindow || runtime.browserWindow.isDestroyed()) return false;
  runtime.browserWindow.close();
  return true;
}

function persistedWorkspaceIds() {
  return readSessionWorkspace(ensureSessionStore().data).workspace.windows
    .map((windowState) => windowState.id);
}

// Re-apply the current WebRTC policy to every open tab (used when the setting changes).
function applyWebrtcPolicyToAllTabs() {
  const policy = webrtcPolicyFor(settings.getSettings().webrtcPolicy);
  for (const tab of tabs.values()) {
    tab.view.webContents.setWebRTCIPHandlingPolicy(policy);
  }
}

// Last-applied encrypted-DNS values, so onSettingsChanged only reconfigures the
// resolver + clears its cache when DNS actually changes — the listener fires on
// every settings write, and clearing the cache mid-session isn't free.
let lastSecureDns = null;
let lastSecureDnsTemplate = null;

app.whenReady().then(async () => {
  if (await runPackageProbeIfRequested()) return; // SPIKE — headless 3(a); app.exit() already fired
  const ses = session.defaultSession;
  const privateSes = getPrivateBrowsingSession();
  const browsingSessions = [ses, privateSes];
  for (const browsingSession of browsingSessions) {
    certificateObserver.observe(browsingSession);
  }
  // Acceptance runs are isolated, unpackaged fixtures. Complete first-run
  // locally so existing suggestion/navigation scenarios exercise their
  // intended feature instead of the onboarding card; telemetry is disabled.
  if (acceptanceTestMode && !settings.isFirstRunComplete()) {
    settings.completeFirstRunPrivacyChoices({
      searchSuggestions: true,
      usagePing: false,
    });
  }
  // Encrypted DNS (DoH). app.configureHostResolver is process-wide in Electron 43
  // (an App method) and must run after 'ready'. ONE call covers every session,
  // including the private-browsing session, so private tabs inherit it by
  // construction. Deliberately no enableBuiltInResolver — forcing it would move the
  // Off position off the system resolver on Win/Linux.
  {
    lastSecureDns = settings.getSettings().secureDns;
    lastSecureDnsTemplate = settings.getSettings().secureDnsTemplate;
    app.configureHostResolver(hostResolverOptionsFor(lastSecureDns, lastSecureDnsTemplate));
  }

  // Enables device-bound Touch ID passkeys in signed macOS builds. Existing
  // iCloud Passwords passkeys remain gated on Apple's browser entitlement.
  setupWebAuthn({
    app,
    session: browsingSessions,
    dialog,
    getParentWindow: () => currentBrowserWindow(),
  });

  // Unlike a webPreferences preload, a session preload also reaches adopted
  // target=_blank children without replacing the Chromium-created opener
  // context. Google Identity Services can use either a popup or tab-style
  // child depending on the relying site, so the Chrome compatibility surface
  // must cover both paths.
  for (const browsingSession of browsingSessions) {
    browsingSession.registerPreloadScript({
      type: 'frame',
      filePath: path.join(__dirname, 'chrome-compat-preload.js'),
    });
  }

  // Fallback: patch Sec-CH-UA HTTP headers for webContents where the CDP
  // debugger couldn't attach (e.g. already in use). The CDP override above
  // handles both HTTP and navigator.userAgentData; this catches leftovers.
  // Replaces the entire value to match Chrome's exact brand format, and
  // adds the header if absent (Electron may omit it on first request to
  // an origin before the server's Accept-CH response arrives). Electron
  // only allows ONE listener per webRequest event per session (same
  // constraint adblock.js documents for onBeforeRequest) — if a future
  // feature also needs onBeforeSendHeaders, compose inside this handler
  // rather than registering a second one.
  if (chromeMajor) {
    const chUa = `"Not;A=Brand";v="8", "Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}"`;
    const chUaFull = `"Not;A=Brand";v="8.0.0.0", "Chromium";v="${chromeFull}", "Google Chrome";v="${chromeFull}"`;
    const setHeader = (headers, name, value, { add = false } = {}) => {
      const existing = Object.keys(headers).find((key) => key.toLowerCase() === name);
      if (existing || add) headers[existing || name] = value;
    };
    for (const browsingSession of browsingSessions) {
      browsingSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        const h = details.requestHeaders;
        setHeader(h, 'sec-ch-ua', chUa, { add: true });
        // High-entropy hint: only rewrite it when Chromium already decided to
        // send it (i.e. the server negotiated it via Accept-CH), matching real
        // Chrome — don't force it onto every request like the low-entropy hints.
        setHeader(h, 'sec-ch-ua-full-version-list', chUaFull);
        setHeader(h, 'sec-ch-ua-platform', `"${chromeClientHintPlatform()}"`);
        setHeader(h, 'sec-ch-ua-platform-version', `"${chromeClientHintPlatformVersion()}"`);
        setHeader(h, 'sec-ch-ua-arch', `"${chromeClientHintArchitecture()}"`);
        setHeader(h, 'sec-ch-ua-bitness', `"${chromeClientHintBitness()}"`);
        setHeader(h, 'sec-ch-ua-model', '""');
        setHeader(h, 'sec-ch-ua-mobile', '?0');
        setHeader(h, 'sec-ch-ua-wow64', '?0');
        callback({ requestHeaders: h });
      });
    }
  }

  applyTheme();
  lastNativeThemeAppearance = resolvedThemeAppearance();
  applyAppIcon();
  // Also follow a live OS appearance change while the preference is "system".
  nativeTheme.on('updated', handleNativeThemeUpdated);

  setupPermissionPolicy(ses);
  setupPermissionPolicy(privateSes, { persistDecisions: false });
  let permissionPromptCounter = 0;
  // Resolve null when there's no window to ask through — the policy treats
  // null as "not answered" and denies for now WITHOUT persisting, so a
  // transient no-window moment can't permanently block a site.
  setPermissionPrompter(({ origin, permission, mediaTypes, webContents: requestingWebContents }) =>
    new Promise((resolve) => {
      const tab = requestingWebContents ? tabForWebContentsId(requestingWebContents.id) : null;
      const runtime = tab ? windowRuntimeRegistry.get(tab.runtimeId) : null;
      const browserWindow = runtime?.browserWindow;
      if (!runtime || !browserWindow || browserWindow.isDestroyed()) return resolve(null);
      const promptId = ++permissionPromptCounter;
      pendingPermissionPrompts.set(promptId, { resolve, runtimeId: runtime.id });
      browserWindow.webContents.send('permissions:prompt', { id: promptId, origin, permission, mediaTypes });
    })
  );
  chromeOn('permissions:respond', (_e, { id, allow }) => {
    const pending = pendingPermissionPrompts.get(id);
    if (pending?.runtimeId !== currentWorkspaceRuntime()?.id) return;
    pending?.resolve(!!allow);
    pendingPermissionPrompts.delete(id);
  });
  setDisplayMediaPrompter(promptForDisplayMedia);

  setupDownloads(ses, broadcastDownloadsActivity);
  setupDownloads(privateSes, broadcastDownloadsActivity);
  let adblockStartupState = { phase: 'idle', attempt: 0, error: null };
  let adblockStartupController = null;
  let releaseStartup = async () => {};
  const startPageStatus = () => {
    const current = settings.getSettings();
    return {
      startup: adblockStartupState,
      privacy: {
        required: !settings.isFirstRunComplete(),
        searchSuggestions: current.searchSuggestions,
        usagePing: current.usagePing,
      },
    };
  };
  const broadcastStartPageStatus = () => {
    const status = startPageStatus();
    for (const tab of tabs.values()) {
      if (tab.url?.startsWith('blanc://newtab')) {
        tab.view.webContents.send('pages:start:status', status);
      }
    }
  };
  setupPages({
    sessions: browsingSessions,
    onDataChanged: refreshBookmarkFlags,
    // Internal pages are tab views, while utility sheets are chrome views.
    // Resolve both from their actual sender before a page hook reads local
    // workspace state; a background window's new-tab ledger must never render
    // the focused window's groups or direct a file dialog to the wrong parent.
    runInPageRuntime: (event, work) => {
      const tab = tabForWebContentsId(event.sender.id);
      const runtime = tab
        ? windowRuntimeRegistry.get(tab.runtimeId)
        : windowRuntimeRegistry.getByChromeWebContents(event.sender);
      return runtime ? withWindowRuntime(runtime, work) : work();
    },
    // Parent for the favorites-import file dialog (evaluated lazily at click).
    getMainWindow: () => currentBrowserWindow() ?? undefined,
    // Utility sheet: only the sheet view itself may close the sheet — the
    // strict pages:surface:close guard verifies the sender against this.
    utilitySheet: {
      isSheetSender: (wc) => {
        const runtime = windowRuntimeRegistry.getByChromeWebContents(wc);
        return !!runtime && wc === runtime.utilitySheetView?.webContents;
      },
      close: (wc) => {
        const runtime = windowRuntimeRegistry.getByChromeWebContents(wc);
        if (runtime) withWindowRuntime(runtime, hideUtilitySheet);
      },
    },
    // The start page's ledger sections read live tab-group state and the
    // rolling blocked counter, both owned here.
    startPage: {
      // Mirror persistSession's rule: private tabs — and groups only they
      // hold — never surface on a start page.
      groups: () => clusterList()
        .filter((c) => c.group)
        .map(({ group, tabIds }) => ({
          id: group.id,
          name: group.name,
          count: tabIds.filter((id) => !tabs.get(id)?.private).length,
        }))
        .filter((g) => g.count > 0),
      focusGroup,
      blockedThisWeek: () => adblockWeekStats().data.blocked,
      remoteDevices: () => sync.listRemoteDevices(),
      status: startPageStatus,
      retryAdblock: () => adblockStartupController?.retry() ?? startPageStatus().startup,
      continueWithoutAdblock: () =>
        adblockStartupController?.continueWithoutBlocking() ?? startPageStatus().startup,
      completePrivacy: (choices) => {
        const result = settings.completeFirstRunPrivacyChoices(choices);
        if (result.completed) {
          maybeSendLaunchPing();
          broadcastStartPageStatus();
        }
        return { completed: result.completed, error: result.error ?? null };
      },
    },
    shortcuts: { list: listShortcuts },
  });

  // The acceptance harness launches offline: skip the network ad-engine build
  // and install the test-only main-process surface instead. Gate is airtight — only an
  // UNPACKAGED dev run with BLANC_TEST exactly "1"; never a packaged build, and
  // BLANC_TEST=0/false stays off.
  if (acceptanceTestMode) {
    require('./test-hook').install({
      tabs, getTabOrder: () => tabState.tabOrder, getGroups: () => tabState.groups, getActiveTabId: () => tabState.activeTabId, clusterSlots,
      createTab, setActiveTab, closeTab, duplicateTab, toggleTabPinned, toggleTabMuted,
      groupTabByName, toggleGroupCollapsed, reorderTabWithinBucket, reopenClosedTab, newTabUrl,
      setTabLayout, setVerticalTabsWidth, broadcastTabs,
      openNewWindow, windowRuntimeSnapshots, closeWindowRuntime, persistedWorkspaceIds,
      getVerticalTabsMetrics: () => hasLiveWindow() ? verticalTabsMetrics() : null,
      getRailActivationSerial: () => railActivationSerial,
      normalizeAddressInput, pasteAndGo, handoffProtocols: HANDOFF_PROTOCOLS, openInternalPage, openFindBar,
      getOverlayMode: () => chromeState.overlayMode, showOverlay, hideOverlay, getPrivateBrowsingSession,
      pickerController, // SPIKE (1Password fill) — acceptance drives the real controller
      displaySharePickerController,
      showUtilityPage, hideUtilitySheet,
      getUtilitySheetState: () => ({ visible: !!chromeState.utilitySheetUrl, url: chromeState.utilitySheetUrl }),
      getUtilitySheetWebContents: () => chromeState.utilitySheetView?.webContents ?? null,
      getOverlayWebContents: () => chromeState.overlayView?.webContents ?? null,
      getChromeWebContents: () => win?.webContents ?? null,
      setWindowContentSize: (width, height) => {
        if (!hasLiveWindow()) return;
        win.setContentSize(width, height);
        resizeActiveView();
      },
      getWindowContentBounds: () => hasLiveWindow() ? win.getContentBounds() : null,
      getUtilitySheetBounds: () => chromeState.utilitySheetView?.getBounds() ?? null,
      getOverlayBounds: () => chromeState.overlayView?.getBounds() ?? null,
      setTestSearchSuggestionFixture,
      clearTestSearchSuggestionFixture,
      getTestSearchSuggestionRequests: () => structuredClone(testSearchSuggestionRequests),
      setTestSearchNavigationCapture,
      getTestSearchSubmission: () => structuredClone(testSearchSubmission),
      attemptChromeNavigation: (url) => win?.webContents.executeJavaScript(
        `location.href = ${JSON.stringify(String(url))}`
      ),
      getChromeUrl: () => win?.webContents.getURL() ?? '',
    });
  }

  initSpikePackaging(); // SPIKE (1Password fill feasibility) — fire-and-forget, gated on BLANC_1P_SPIKE

  // Per-tab blocked-request counter. `request.tabId` is the webContents id
  // of the frame the request came from.
  onRequestBlocked((request) => {
    adblockWeekStats().update((d) => { d.blocked += 1; });
    for (const tab of tabs.values()) {
      if (tab.view.webContents.id === request.tabId) {
        tab.blockedCount += 1;
        const runtime = windowRuntimeRegistry.get(tab.runtimeId);
        if (runtime) withWindowRuntime(runtime, scheduleBroadcastTabs);
        break;
      }
    }
  });

  settings.onSettingsChanged((s) => {
    setAdBlockEnabled(s.adblockEnabled);
    applyTheme();
    applyAppIcon();
    applyVerticalTabsWidth(s.verticalTabsWidth);
    applyTabLayout(s.tabLayout);
    // WebRTC reapply is unconditional — setWebRTCIPHandlingPolicy is a cheap,
    // idempotent per-tab call and settings writes are infrequent/user-initiated.
    applyWebrtcPolicyToAllTabs();
    if (s.secureDns !== lastSecureDns || s.secureDnsTemplate !== lastSecureDnsTemplate) {
      lastSecureDns = s.secureDns;
      lastSecureDnsTemplate = s.secureDnsTemplate;
      app.configureHostResolver(hostResolverOptionsFor(s.secureDns, s.secureDnsTemplate));
      // Clear cached lookups on both sessions so the new resolver takes effect without
      // a restart. clearHostResolverCache returns a promise; Promise.allSettled collects
      // any rejection so a failed clear can't surface as an unhandled rejection.
      Promise.allSettled(browsingSessions.map((sess) => sess.clearHostResolverCache()));
    }
  });

  // Live tab state for tab sync's snapshot builder. Must be registered
  // before sync.init() so the launch sync can publish. Tab Sync's existing
  // consent covered the single primary workspace; additional windows stay
  // local until their inclusion gets an explicit product/privacy decision.
  tabsync.setSnapshotProvider(() => ({
    tabList: (windowRuntimeRegistry.get(PRIMARY_WINDOW_ID)?.tabOrder ?? [])
      .map((id) => tabs.get(id))
      .filter(Boolean),
    groups: windowRuntimeRegistry.get(PRIMARY_WINDOW_ID)?.groups ?? [],
  }));
  tabicons.setSnapshotProvider(() => ({
    tabList: (windowRuntimeRegistry.get(PRIMARY_WINDOW_ID)?.tabOrder ?? [])
      .map((id) => tabs.get(id))
      .filter(Boolean),
  }));
  // A pull changed the cached device map: push the fresh list to the open
  // surfaces (overlay panel; any tab currently on the start page).
  const pushRemoteDevices = () => {
    const devices = sync.listRemoteDevices();
    for (const runtime of windowRuntimeRegistry.all()) {
      runtime.overlayView?.webContents.send('chrome:remote-tabs-updated', devices);
    }
    for (const tab of tabs.values()) {
      if (tab.url?.startsWith('blanc://newtab')) {
        tab.view.webContents.send('pages:start:remote-tabs', devices);
      }
    }
  };
  tabsync.onRemoteChanged(pushRemoteDevices);
  tabicons.onRemoteChanged(pushRemoteDevices);
  // Profile sync: sync-on-launch if configured, then follow local changes.
  // Runs after stores + setupPages so its triggers see a live app; failures
  // are swallowed and surfaced only in Settings (never block startup).
  sync.init();
  // Freshness pull when Blanc regains focus (tab-sync spec §6; throttled inside).
  app.on('browser-window-focus', () => sync.refreshSession());
  // Best-effort final push — fire-and-forget, never blocks quit (spec §6).
  app.on('before-quit', () => { sync.syncNow().catch(() => {}); });
  // A sync pull that merged in favorites from another device refreshes the
  // pill's favorite state; open internal pages still pull on their next load,
  // as with any cross-surface bookmark change.
  bookmarks.onMerged(refreshBookmarkFlags);

  // HTTP basic/digest auth: without this handler, 401-protected sites
  // (routers, staging servers) simply fail.
  app.on('login', (event, _wc, _details, authInfo, callback) => {
    event.preventDefault();
    const tab = _wc ? tabForWebContentsId(_wc.id) : null;
    const runtime = tab ? windowRuntimeRegistry.get(tab.runtimeId) : null;
    const parentWindow = runtime?.browserWindow && !runtime.browserWindow.isDestroyed()
      ? runtime.browserWindow
      : currentBrowserWindow();
    promptForCredentials(parentWindow, authInfo).then((creds) => {
      if (creds) callback(creds.username, creds.password);
      else callback(); // no args = cancel the request
    });
  });

  registerIpcHandlers();
  buildMenu();

  // Snapshot the previous session before the local startup tab exists. Tab
  // broadcasts are temporarily prevented from overwriting this snapshot.
  const storedWorkspace = readSessionWorkspace(ensureSessionStore().data);
  sessionPersistenceReadOnly = !storedWorkspace.supported;
  if (sessionPersistenceReadOnly) {
    console.warn('[session] newer workspace version found; leaving session.json untouched');
  } else if (storedWorkspace.migrated) {
    ensureSessionStore().update((data) => replaceObject(data, storedWorkspace.workspace));
  }
  const savedWindows = storedWorkspace.workspace.windows.map((windowState) => {
    const saved = structuredClone(windowState);
    const cleaned = filterRestoredSession(saved, isUtilityUrl);
    return {
      ...saved,
      urls: cleaned.urls,
      groupIds: cleaned.groupIds,
      pinned: cleaned.pinned,
      activeIndex: cleaned.activeIndex,
      groups: (Array.isArray(saved.groups) ? saved.groups : [])
        .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
        .map((g) => ({ id: g.id, name: g.name, collapsed: !!g.collapsed })),
    };
  });
  const savedWindowById = new Map(savedWindows.map((windowState) => [windowState.id, windowState]));
  activeWorkspaceWindowId = savedWindowById.has(storedWorkspace.workspace.activeWindowId)
    ? storedWorkspace.workspace.activeWindowId
    : savedWindows[0]?.id ?? PRIMARY_WINDOW_ID;
  sessionPersistenceSuspended = true;

  const blockingRequested =
    !acceptanceTestMode && settings.getSettings().adblockEnabled;
  if (blockingRequested) installStartupNavigationGate(browsingSessions);

  // Restore each workspace in its own BrowserWindow. Put the previously
  // focused window last so it is the frontmost native window after launch.
  const startupWindows = [...savedWindows].sort((a, b) =>
    Number(a.id === activeWorkspaceWindowId) - Number(b.id === activeWorkspaceWindowId));
  const startupTabs = new Map();
  const startupRuntimes = startupWindows.map((saved) => {
    const runtime = createMainWindow({ runtimeId: saved.id });
    withWindowRuntime(runtime, () => {
      tabState.groups = saved.groups;
      startupTabs.set(runtime.id, createTab(NEW_TAB_URL));
    });
    return runtime;
  });
  const chromeReady = Promise.all(startupRuntimes.map((runtime) => new Promise((resolve) => {
    runtime.browserWindow.webContents.once('did-finish-load', bindWindowRuntime(runtime, () => {
      const startupTabId = startupTabs.get(runtime.id);
      if (startupTabId && tabs.has(startupTabId)) {
        // Keep first-run/recovery actions keyboard reachable in every restored
        // window until its saved tabs can be attached after the blocker gate.
        setActiveTab(startupTabId, { focusContent: true });
      }
      resolve();
    }));
  })));

  let startupReleased = false;
  releaseStartup = async ({ blocking, preservePreference = false }) => {
    if (startupReleased) return;
    startupReleased = true;
    await chromeReady;

    if (!blocking && !preservePreference && settings.getSettings().adblockEnabled) {
      // “Continue without blocking” is an explicit effective-state change,
      // not a shield that stays visually enabled while no engine exists.
      settings.setSettings({ adblockEnabled: false });
    }
    if (blockingRequested) {
      releaseStartupNavigationGate(browsingSessions, {
        blockerAttached: blocking,
      });
    }

    for (const runtime of startupRuntimes) {
      const saved = savedWindowById.get(runtime.id);
      if (!saved) continue;
      withWindowRuntime(runtime, () => {
        const restoredIds = saved.urls.map((url, index) => createTab(url, {
          groupId: saved.groupIds?.[index] ?? null,
          pinned: !!saved.pinned?.[index],
        }));
        pruneEmptyGroups();
        if (restoredIds.length) {
          const target = restoredIds[
            Math.min(Math.max(0, saved.activeIndex), restoredIds.length - 1)
          ];
          const startupTabId = startupTabs.get(runtime.id);
          if (startupTabId && tabs.has(startupTabId)) closeTab(startupTabId);
          setActiveTab(target, { focusContent: true });
        }
      });
    }

    sessionPersistenceSuspended = false;
    for (const runtime of startupRuntimes) persistSessionForRuntime(runtime);

    // Cold-start URL handoff waits until the blocker decision and session
    // restore are both complete.
    pendingExternalUrls.push(...urlsFromArgv(process.argv.slice(1)));
    flushExternalUrls();
    maybeSendLaunchPing();
  };

  if (acceptanceTestMode) {
    adblockStartupState = { phase: 'skipped', attempt: 0, error: null };
    broadcastStartPageStatus();
    await releaseStartup({ blocking: false, preservePreference: true });
  } else if (!blockingRequested) {
    adblockStartupState = { phase: 'disabled', attempt: 0, error: null };
    broadcastStartPageStatus();
    await releaseStartup({ blocking: false, preservePreference: true });
    // Keep the engine warm so enabling the setting later in this run works,
    // but never hold browsing for a feature the user turned off.
    setupAdBlocker(ses, { enabled: false }).then(() => {
      attachAdBlockerToSession(privateSes, {
        enabled: settings.getSettings().adblockEnabled,
      });
      setAdBlockEnabled(settings.getSettings().adblockEnabled);
    }).catch((err) => {
      console.warn('[adblock] background initialization failed:', err.message);
    });
  } else {
    adblockStartupController = createAdblockStartupController({
      initialize: async () => {
        if (packagedAdblockInitializationFailuresRemaining > 0) {
          packagedAdblockInitializationFailuresRemaining -= 1;
          throw new Error('packaged smoke: simulated first initialization failure');
        }
        await setupAdBlocker(ses, {
          enabled: settings.getSettings().adblockEnabled,
          fetchImpl: packagedAdblockFailureTestMode
            ? packagedAdblockTestFetch
            : fetch,
        });
        attachAdBlockerToSession(privateSes, {
          enabled: settings.getSettings().adblockEnabled,
        });
      },
      onStateChange: (state) => {
        adblockStartupState = state;
        broadcastStartPageStatus();
        if (state.phase === 'failed') {
          for (const runtime of startupRuntimes) {
            const startupTabId = startupTabs.get(runtime.id);
            if (startupTabId && tabs.has(startupTabId)) {
              withWindowRuntime(runtime, () => setActiveTab(startupTabId, { focusContent: true }));
            }
          }
        }
      },
      onReleased: ({ blocking }) => releaseStartup({ blocking }),
    });
    // The controller converts filter failures into local UI state. This
    // catch is only for an unexpected release/restore failure and prevents
    // an unhandled ready-chain rejection.
    adblockStartupController.start().catch((err) => {
      console.error('[startup] could not release browsing:', err);
    });
  }

  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    refocusAddressBarIfWanted();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
