const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, nativeTheme, nativeImage, dialog, shell, net, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const {
  setupAdBlocker,
  attachAdBlockerToSession,
  setAdBlockEnabled,
  onRequestBlocked,
} = require('./adblock');
const { blockableHostname, resolveBlockAdsCommand } = require('./adblock-exceptions');
const islandProximity = require('./island-proximity');
const {
  shieldChipState, shieldPopoverModel, connectionFor, committedUrlOf, activeConnection,
} = require('./shield-model');
const { webrtcPolicyFor, hostResolverOptionsFor } = require('./network-privacy');
const {
  chromeClientHintPlatform,
  chromeClientHintArchitecture,
  chromeClientHintBitness,
  chromeClientHintPlatformVersion,
} = require('./chrome-client-hints');
const { registerPagesScheme, setupPages } = require('./pages');
const { setupPermissionPolicy, setPermissionPrompter } = require('./permissions');
const { setupAutoUpdater, checkForUpdatesManually } = require('./updater');
const { sendLaunchPing } = require('./telemetry');
const sync = require('./sync');
const tabsync = require('./tabsync');
const tabicons = require('./tabicons');
const iconRaster = require('./icon-raster');
const { setupDownloads, downloadsActivity, acknowledgeDownloads } = require('./downloads');
const { attachAddressMenu } = require('./address-menu');
const { promptForCredentials } = require('./auth-dialog');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const { groupFavoritesForMenu } = require('./bookmark-data');
const history = require('./history');
const { JsonStore } = require('./store');
const { persistableEntries, sessionTabMeta } = require('./session-snapshot');
const { loadWorkspace, buildSaveShape } = require('./session-workspace');
const { filterRestoredSession } = require('./session-restore');
const { isUtilityUrl } = require('./utility-pages');
const {
  sleepCandidates,
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
} = require('./tab-sleep');
const {
  createTabView,
  wireTabView,
  initTabView,
  liveContents,
  TAB_WEB_PREFERENCES,
  getPrivateBrowsingSession,
} = require('./tab-view');
const { setupWebAuthn } = require('./webauthn');
const { HANDOFF_PROTOCOLS, classifyExternalNavigation } = require('./external-protocols');
const { isTrustedSender } = require('./ipc-trust');
const {
  applyDockAppIcon,
  setWindowsAppUserModelId,
  windowsDevelopmentIconPath,
} = require('./app-icon');
const { createSearchSuggestionService } = require('./search-suggestions');
const { createAdblockStartupController } = require('./adblock-startup');
const {
  normalizeTabLayout,
  normalizeVerticalTabsWidth,
  calculateChromeLayout,
  calculateShieldBounds,
} = require('./chrome-layout');
const { reorderWithinBucket } = require('./tab-order');
const {
  installPlatformMainMenuShortcut,
  popupPlatformMainMenu,
} = require('./platform-main-menu');
const { showAboutPanel } = require('./about-panel');

const NEW_TAB_URL = 'blanc://newtab/';
const newTabUrl = () => settings.getSettings().homePage || NEW_TAB_URL;
// The query flag tells the newtab page to show private copy + theme.
const PRIVATE_NEW_TAB_URL = 'blanc://newtab/?private=1';
// Exact, unpackaged-only gate for the Electron acceptance harness. A stray
// BLANC_TEST=0/false in a real launch must not weaken normal chrome behavior.
const acceptanceTestMode = !app.isPackaged && process.env.BLANC_TEST === '1';

const { AsyncLocalStorage } = require('node:async_hooks');
const windowRuntimes = require('./window-runtime-registry');

// The owning window-runtime for the current async execution — set by
// bindWindowRuntime at every event registration and sanctioned root, carried
// through timers and late callbacks by AsyncLocalStorage.
const windowRuntimeContext = new AsyncLocalStorage();

/** M1 has exactly one runtime; created below, before any startup work runs. */
let primaryRuntime = null;

/** Wrap a callback so it (and everything it schedules) resolves to `runtime`. */
function bindWindowRuntime(runtime, fn) {
  return (...args) => windowRuntimeContext.run(runtime, () => fn(...args));
}

/** The runtime owning the current execution. Outside any binding: the single
 * runtime in production, a THROW under acceptanceTestMode — so the acceptance
 * suite detects every runtime-dependent unbound path it executes. */
function currentRuntime() {
  const bound = windowRuntimeContext.getStore();
  if (bound) return bound;
  if (acceptanceTestMode) {
    throw new Error('currentRuntime() outside any bindWindowRuntime scope');
  }
  return primaryRuntime;
}

/** Terse accessor for per-window state. Every former module global reads
 * through here, which is what makes the ownership boundary greppable. */
const rt = currentRuntime;

// The runtime must exist before app.whenReady does anything — later sweeps
// make createOverlay() and the IPC trust path read currentRuntime(), and both
// run from startup contexts.
primaryRuntime = windowRuntimes.createRuntime();

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

// A Windows taskbar button must inherit the same stable identity as the
// installed shortcut before any BrowserWindow exists.
setWindowsAppUserModelId({ app });

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
  app.on('second-instance', bindWindowRuntime(primaryRuntime, (_e, commandLine) => {
    for (const url of urlsFromArgv(commandLine)) openExternalUrl(url);
    if (rt().window && !rt().window.isDestroyed()) {
      if (rt().window.isMinimized()) rt().window.restore();
      rt().window.focus();
    }
  }));

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

  const deferredWakes = [...pendingWakes];
  pendingWakes.clear();
  for (const tabId of deferredWakes) wakeTab(tabId).catch(() => {});

  const queued = [...startupQueuedNavigations.entries()];
  startupQueuedNavigations.clear();
  for (const [webContentsId, url] of queued) {
    // A throwing predicate does not skip an entry — it propagates out of find
    // and leaves every queued tab behind the startup gate. This two-step read
    // handles missing and already-destroyed views alike.
    const tab = [...tabs.values()].find(
      (candidate) => liveContents(candidate)?.id === webContentsId
    );
    const wc = liveContents(tab);
    if (!wc) continue;
    wc.loadURL(url).catch(() => {});
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
  if (rt().window.isMinimized()) rt().window.restore();
  rt().window.focus();
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
    dialog.showMessageBox(rt().window, {
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

app.on('open-url', bindWindowRuntime(primaryRuntime, (event, url) => {
  event.preventDefault();
  openExternalUrl(url);
}));

// Double-clicked local files (Blanc is declared as an HTML viewer via
// CFBundleDocumentTypes) arrive as 'open-file', not 'open-url'. Same
// queueing as links: pre-ready events wait for the window + session
// restore, then land as the active tab.
app.on('open-file', bindWindowRuntime(primaryRuntime, (event, filePath) => {
  event.preventDefault();
  const url = toFileUrl(filePath);
  if (url) openExternalUrl(url);
}));

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

function applyChromeThemeAppearance(appearance) {
  if (!hasLiveWindow()) return;
  const resolved = appearance === 'dark' || appearance === 'light'
    ? appearance
    : resolvedThemeAppearance();
  rt().window.setBackgroundColor(chromeBackgroundColor(resolved));
  rt().window.webContents.send(
    'chrome:theme-appearance',
    resolved
  );
}

function beginChromeThemeAppearance(appearance) {
  if (!hasLiveWindow()) return;
  // An explicit target can paint immediately. "system" has no trustworthy
  // cross-platform resolved value until Electron removes the prior override,
  // but the renderer can still disable its transition before that happens.
  if (appearance === 'dark' || appearance === 'light') {
    rt().window.setBackgroundColor(chromeBackgroundColor(appearance));
  }
  rt().window.webContents.send('chrome:theme-appearance', appearance ?? 'pending');
}

function refreshActivePageTintForThemeChange() {
  const generation = ++rt().themeTintRefreshGeneration;
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
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
  // transition settle. The generation guard prevents an older theme change's
  // captures from winning after a newer one.
  for (const delay of [32, 160, 400, 800]) {
    setTimeout(() => {
      if (generation !== rt().themeTintRefreshGeneration) return;
      samplePageTint(tab, {
        immediate: true,
        shouldApply: () => generation === rt().themeTintRefreshGeneration,
      });
    }, delay);
  }
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

// Swap the chosen macOS Dock icon. Windows deliberately has one fixed icon,
// embedded into Blanc.exe by electron-builder.
function applyAppIcon() {
  // getSettings() already falls back an unauthorized/stale supporter icon
  // (hand-edited or copied settings.json) to the default — nothing further
  // to validate here.
  const { appIcon } = settings.getSettings();
  applyDockAppIcon({ app, nativeImage, appIcon });
}

const hasLiveWindow = () => !!rt().window && !rt().window.isDestroyed();

/** @type {Map<string, { id: string, view: WebContentsView, title: string, url: string, isLoading: boolean, canGoBack: boolean, canGoForward: boolean, favicon: string | null, bookmarked: boolean, blockedCount: number, private: boolean, pinned: boolean, muted: boolean, audible: boolean, pageBg: string | null, themeColor: string | null }>} */
const tabs = new Map();
/**
 * @typedef {object} SleepSnapshot
 * @property {import('electron').WebContentsView|null} view
 *   The discarded view, held only between wc.close() and its observed
 *   'destroyed' event. Nulled by that observer; never assigned to tab.view.
 * @property {Array<{url:string,title:string,pageState?:string}>} entries
 * @property {number} index
 * @property {boolean} droppedPageState
 */

/** MAIN-PROCESS ONLY. Never serialized or persisted: it can hold form values
 * and POST bodies, so it must never reach chrome renderers or crash reporting. */
const sleepSnapshots = new Map(); // Map<string /* tab.id */, SleepSnapshot>
// Delete on closeTab, a wake generation's final commit, and before quit. A
// macOS window close intentionally does NOT clear this Map: tabs survive dock
// reopen, and their recovery data must survive with them. Turning tabSleep off
// likewise changes policy only; it must not discard existing snapshots.

// Evaluated in every frame of a tab. A programmatic password-manager fill fires
// no interaction events, so compare live controls with their defaults instead.
const DIRTY_PROBE_SOURCE = `(() => {
  try {
    const d = document;
    for (const el of d.querySelectorAll('input, textarea')) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return { dirty: true };
      } else if (el.type === 'password') {
        if (el.value) return { dirty: true };
      } else if (el.value !== el.defaultValue) {
        return { dirty: true };
      }
    }
    for (const sel of d.querySelectorAll('select')) {
      for (const opt of sel.options) {
        if (opt.selected !== opt.defaultSelected) return { dirty: true };
      }
    }
    for (const el of d.querySelectorAll('[contenteditable]')) {
      if ((el.textContent || '').trim()) return { dirty: true };
    }
    if (d.designMode === 'on' && (d.body?.textContent || '').trim()) return { dirty: true };
    if (window.sessionStorage && window.sessionStorage.length > 0) return { dirty: true };
    if (d.pictureInPictureElement) return { dirty: true };
    return {
      dirty: false,
      deepScrolled: window.scrollY > 3 * window.innerHeight,
    };
  } catch {
    return { dirty: true };
  }
})()`;

/**
 * Is there work in this document a reload would destroy? Any frame that fails
 * to answer during the shared 250 ms budget is dirty by default.
 *
 * @returns {Promise<boolean>} true means this tab must not be quieted
 */
async function probeTabDirty(tab, wc) {
  // Our error page holds no recoverable work. It would otherwise fail safe on
  // its privileged frame and defeat the space-saving use case for dead tabs.
  if (typeof tab.url === 'string' && tab.url.startsWith('blanc://error')) {
    tab.deepScrolled = false;
    return false;
  }

  let frames;
  try {
    frames = wc.mainFrame?.framesInSubtree ?? [];
  } catch {
    return true;
  }
  if (frames.length === 0) return true;

  // One budget for the complete frame tree, never 250 ms per iframe.
  const budget = new Promise((resolve) => setTimeout(() => resolve('timeout'), 250));
  const answers = await Promise.race([
    Promise.all(frames.map((frame) => {
      // The WebContents API reaches only its top frame; frame-level execution
      // makes cross-origin payment and SSO frames visible to the fail-safe rule.
      try { return frame.executeJavaScript(DIRTY_PROBE_SOURCE).catch(() => null); }
      catch { return Promise.resolve(null); }
    })),
    budget,
  ]);
  if (answers === 'timeout') return true;

  let deepScrolled = false;
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object') return true;
    if (answer.dirty) return true;
    if (answer.deepScrolled) deepScrolled = true;
  }
  tab.deepScrolled = deepScrolled;
  return deepScrolled;
}

/** True while sleepTab has replaced a tab's listeners with its temporary
 * teardown pair. A concurrent user close cancels the sleep intent. */
let sleepTeardownInProgress = false;

/**
 * Discard one tab's renderer. This is best-effort only: it never throws or
 * wakes a tab, and any uncertain precondition leaves the tab awake.
 *
 * @returns {Promise<boolean>} true exactly when destruction was observed
 */
async function sleepTab(id) {
  const tab = tabs.get(id);
  const wc = liveContents(tab);
  if (!tab || !wc || tab.asleep || tab.sleeping || tab.waking) return false;

  const epochAtProbe = tab.navEpoch;
  let snapshot;
  try {
    const nav = wc.navigationHistory;
    snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
  } catch {
    return false;
  }
  if (!snapshot) return false;

  let dirty = true;
  try { dirty = await probeTabDirty(tab, wc); } catch { dirty = true; }
  if (dirty) return false;

  // The probe has an async frame budget; validate synchronously immediately
  // before teardown so it can never discard a tab the user just activated.
  if (!tabs.has(id) || id === rt().activeTabId || tab.navEpoch !== epochAtProbe
      || tab.isLoading || tab.sleeping || !liveContents(tab)) return false;

  if (snapshot.droppedPageState) {
    console.debug(`[quiet-tabs] ${id}: page state dropped (oversized or private)`);
  }
  if (sleepSnapshots.size >= MAX_SLEEP_SNAPSHOTS) {
    console.debug('[quiet-tabs] snapshot ceiling reached; refusing to quiet further tabs');
    return false;
  }

  // Keep the old view only until Chromium confirms destruction. Merely dropping
  // the JS reference does not reclaim its renderer.
  sleepSnapshots.set(id, {
    view: tab.view,
    entries: snapshot.entries,
    index: snapshot.index,
    droppedPageState: snapshot.droppedPageState,
  });
  tab.sleeping = true;
  sleepTeardownInProgress = true;
  const wcId = wc.id;
  const owner = windowRuntimes.runtimeForTab(id) ?? primaryRuntime;
  // This must remove every old listener: loading/failure/crash listeners can
  // otherwise poison tab.url or resurrect exactly the renderer being closed.
  wc.removeAllListeners();

  let aborted = false;
  let teardownTimeout;
  const outcome = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    wc.once('destroyed', bindWindowRuntime(owner, () => {
      tab.view = null;
      tab.asleep = true;
      tab.sleeping = false;
      tab.blockedCount = 0;
      tab.audible = false;
      tab.isLoading = false;
      tab.pageBg = null;
      tab.themeColor = null;
      const record = sleepSnapshots.get(id);
      if (record) record.view = null;
      tabIdByWebContentsId.delete(wcId);
      lastMainFrameMethod.delete(wcId);
      finish('quiet');
    }));

    // Polarity matters: this fires when the page objects to unload. Calling
    // preventDefault here would override that objection and destroy the tab.
    wc.on('will-prevent-unload', () => {
      aborted = true;
      finish('aborted');
    });

    wc.close({ waitForBeforeUnload: true });
    // A wedged renderer must not remain permanently `sleeping`.
    teardownTimeout = setTimeout(() => finish('unresponsive'), 5000);
  });
  clearTimeout(teardownTimeout);

  if (outcome === 'quiet') {
    sleepTeardownInProgress = false;
    broadcastTabs();
    return true;
  }

  // Restore the ordinary listener set after the temporary teardown pair. A
  // user close during this interval sets the global flag false and wins.
  tab.sleeping = false;
  sleepSnapshots.delete(id);
  const stillThere = sleepTeardownInProgress && tabs.has(id) && liveContents(tab);
  sleepTeardownInProgress = false;
  if (stillThere) {
    wireTabView(tab, tab.view, {
      owner: windowRuntimes.runtimeForTab(id) ?? primaryRuntime,
      adopted: false,
    });
  }
  console.debug(`[quiet-tabs] ${id}: teardown ${outcome} — left awake${aborted ? ' (beforeunload)' : ''}`);
  return false;
}

/** Wakes deferred because the startup gate would otherwise cancel restore() and
 * replay a plain URL load, losing the retained history snapshot. */
const pendingWakes = new Set();

function commitWake(tab, generation) {
  if (tab.wakeGeneration !== generation) return false;
  tab.asleep = false;
  tab.waking = false;
  tab.lastActiveAt = Date.now();
  sleepSnapshots.delete(tab.id);
  broadcastTabs();
  return true;
}

async function failWake(tab, generation) {
  if (tab.wakeGeneration !== generation) return false;
  const wc = liveContents(tab);
  if (wc) {
    const q = new URLSearchParams({
      url: tab.url ?? '',
      code: 'wake-failed',
      desc: 'The page could not be reloaded',
      title: tab.title ?? '',
    });
    await wc.loadURL(`blanc://error/?${q}`).catch(() => {});
  }
  if (tab.wakeGeneration !== generation) return false;
  tab.asleep = false;
  tab.waking = false;
  tab.lastActiveAt = Date.now();
  sleepSnapshots.delete(tab.id);
  broadcastTabs();
  return false;
}

/**
 * Rebuild a quiet tab inside a wake generation. The synchronous prefix makes
 * a new view visible to same-turn activation callers before this promise is
 * awaited; restore() or the direct navigation below is then its first load.
 */
async function wakeTab(id, { navigateTo = null, atIndex = null } = {}) {
  const tab = tabs.get(id);
  if (!tab) return false;
  if (!tab.asleep) return true;
  if (startupNavigationGateActive) {
    pendingWakes.add(id);
    return false;
  }

  const owner = windowRuntimes.runtimeForTab(id) ?? primaryRuntime;
  const snapshot = sleepSnapshots.get(id);
  let wc;
  let generation;

  // An activation often immediately follows another wake-triggering action
  // (notably openInternalPage). Coalesce a plain wake onto its live view;
  // an explicit navigation/back-forward supersedes the pending first load in
  // that same view. Starting another WebContentsView here would leak the
  // first renderer while its stale generation quietly resolves.
  const wakingContents = tab.waking ? liveContents(tab) : null;
  if (wakingContents) {
    if (navigateTo === null && atIndex === null) return true;
    wc = wakingContents;
    generation = ++tab.wakeGeneration;
  } else {
    const view = createTabView(tab);
    tab.view = view;
    wireTabView(tab, view, { owner, adopted: false });
    wc = view.webContents;
    tabIdByWebContentsId.set(wc.id, id);
    wc.setAudioMuted(!!tab.muted);
    wc.setWebRTCIPHandlingPolicy(webrtcPolicyFor(settings.getSettings().webrtcPolicy));
    tab.waking = true;
    generation = ++tab.wakeGeneration;
  }

  let first;
  if (navigateTo) {
    // A direct navigation and restore() are mutually exclusive; this consumes
    // the recovery snapshot without restoring it first.
    sleepSnapshots.delete(id);
    first = wc.loadURL(navigateTo);
  } else if (snapshot?.entries.length) {
    const index = atIndex === null
      ? snapshot.index
      : Math.max(0, Math.min(snapshot.entries.length - 1, atIndex));
    first = wc.navigationHistory.restore({ entries: snapshot.entries, index });
  } else {
    first = wc.loadURL(tab.url);
  }

  try {
    await first;
    return commitWake(tab, generation);
  } catch {
    if (tab.wakeGeneration !== generation) return false;
    // Exactly one fallback, only after restore rejects. A rejected plain load
    // gets its error page, not an unbounded retry loop.
    const canFallBack = !navigateTo && !!snapshot?.entries.length;
    if (!canFallBack) return failWake(tab, generation);
    const live = liveContents(tab);
    if (!live) return failWake(tab, generation);
    try {
      await live.loadURL(tab.url);
      return commitWake(tab, generation);
    } catch {
      return failWake(tab, generation);
    }
  }
}

// ─── Quiet Tabs sweep (spec §4.3) ────────────────────────────────────────
const SLEEP_SWEEP_INTERVAL_MS = 30_000;

/** Acceptance-only threshold override, in ms (or null to follow settings). */
let sleepThresholdOverrideMs = null;
/** Wall-clock time of the previous sweep, for the clock-jump check. */
let lastSleepSweepAt = 0;

/** The idle threshold now in force, in ms, or null for "never auto-quiet". */
function currentSleepThresholdMs() {
  if (sleepThresholdOverrideMs !== null) return sleepThresholdOverrideMs;
  const key = settings.getSettings().tabSleep;
  // Deliberately not `?? DEFAULT`: 'off' maps to null, and `??` would turn
  // the user's explicit Off into the default delay. Presence is the test.
  return Object.hasOwn(TAB_SLEEP_DELAY_MS, key)
    ? TAB_SLEEP_DELAY_MS[key]
    : TAB_SLEEP_DELAY_MS['1h']; // the setting ships in a later phase
}

/** Ids of tabs with a permission prompt still open in this runtime. */
function permissionPendingTabIds() {
  const ids = new Set();
  for (const pending of rt().permissionPrompts.values()) {
    if (pending?.tabId) ids.add(pending.tabId);
  }
  return ids;
}

/** Re-stamp every background tab as "active just now" (clock-jump / resume). */
function restampBackgroundTabs() {
  const now = Date.now();
  for (const tab of tabs.values()) {
    if (tab.id === rt().activeTabId || tab.asleep) continue;
    tab.lastActiveAt = now;
  }
}

/**
 * One sequential pass of the idle sweep. Its result lets the acceptance
 * harness drive this real path rather than a reimplementation.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.ignoreThreshold=false] `/sleep`: skip only the wait
 * @returns {Promise<{quieted: string[], skippedReason: string|null}>}
 */
async function runSleepSweep({ ignoreThreshold = false } = {}) {
  const skip = (reason) => ({ quieted: [], skippedReason: reason });
  if (isQuitting) return skip('quitting');
  if (sessionPersistenceSuspended) return skip('persistence-suspended');
  if (startupNavigationGateActive) return skip('startup-gate');
  // Wake is a network re-fetch; do not discard work we cannot bring back.
  if (!net.isOnline()) return skip('offline');

  const now = Date.now();
  // Wall-clock lastActiveAt would make every tab look idle after a suspended
  // laptop wakes. Re-stamp instead of probing a burst of just-resumed pages.
  if (lastSleepSweepAt && now - lastSleepSweepAt > 2 * SLEEP_SWEEP_INTERVAL_MS) {
    lastSleepSweepAt = now;
    restampBackgroundTabs();
    return skip('clock-jump');
  }
  lastSleepSweepAt = now;

  const tabList = rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean);
  const candidates = sleepCandidates(tabList, {
    now,
    thresholdMs: currentSleepThresholdMs(),
    activeTabId: rt().activeTabId,
    ignoreThreshold,
    snapshotCount: sleepSnapshots.size,
    maxSnapshots: MAX_SLEEP_SNAPSHOTS,
    permissionPendingTabIds: permissionPendingTabIds(),
    popupChildCounts,
  });

  const quieted = [];
  for (const id of candidates) {
    // Sequential, not Promise.all: sleepTab re-validates the active tab, and
    // a concurrent burst of dirty probes is precisely what resume avoids.
    if (await sleepTab(id)) quieted.push(id);
  }
  // sleepTab broadcasts every actual transition; an empty sweep stays silent.
  return { quieted, skippedReason: null };
}
/** webContents.id -> tab.id. Maintained rather than searched: the ad blocker's
 *  per-request counter resolves a tab tens of times per second, and a linear
 *  walk of `tabs` dereferencing view.webContents there is both the hot path and
 *  a crash once a tab can exist without a view. */
const tabIdByWebContentsId = new Map();
/** webContents id -> the HTTP method of its last main-frame request. The only
 * place a method is observable is onBeforeSendHeaders, and it is needed at
 * did-navigate time. Deliberately not on the tab record: that record is an
 * explicit serialization allowlist, while this is main-process bookkeeping. */
const lastMainFrameMethod = new Map();
/** openerTabId -> live popup BrowserWindow count. A `new-window` popup never
 * enters tabs, yet discarding its opener severs the OAuth/SSO callback. */
const popupChildCounts = new Map();

/** Drop every index entry pointing at `tabId`. Deletion is BY VALUE because a
 *  closing tab's view.webContents already reads back undefined, so the key it
 *  was stored under is no longer recoverable from the record. One pass over at
 *  most one entry per open tab, once per close — not the per-request cost this
 *  index exists to remove. */
function forgetTabWebContentsIds(tabId) {
  for (const [wcId, id] of tabIdByWebContentsId) {
    if (id === tabId) tabIdByWebContentsId.delete(wcId);
  }
}

// Display order of tab ids (rt().tabOrder) — the single source of truth
// for the strip. Selected tab id: rt().activeTabId.
// Named tab groups in display order (rt().groups) — pill clusters follow
// this order, ungrouped tabs trail. Groups have no color by design (Island
// Tab Groups handoff): identity is a lowercase mono name. Empty groups are
// pruned. Shape: { id: string, name: string, collapsed: boolean }[]
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
// prompt id → { resolve, tabId }, live on runtime.permissionPrompts. Flushed
// if the owning window dies mid-prompt so Chromium's request never hangs.
function flushPermissionPrompts(runtime) {
  for (const { resolve } of runtime.permissionPrompts.values()) resolve(null); // null = never answered
  runtime.permissionPrompts.clear();
}

// Height (in CSS px) of the sampled safe-area gutter the resting Island floats
// in. The renderer measures its own layout and reports it here, so this is just
// a sane default before the first report arrives — keep it in step with the
// `--strip-h` token (styles.css) so the initial web-view offset doesn't jump.
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
// It is attached to the window's contentView only while something is showing.
// overlayView, overlayMode, overlayPrefill, shieldAnchorRight,
// shieldPopoverHost, and shieldTrigger now live on the runtime record
// (see window-runtime-registry.js for their per-field doc comments).
/** Native address-bar context menu up: suppress the overlay's blur
 * dismissal — the popup's close callback owns what happens next.
 * A generation ticket, not a boolean: if a second popup ever supersedes the
 * first (two right-clicks racing the handler's await), the stale popup's
 * close callback must not disarm the guard under the live one. 0 = no menu. */

function currentChromeLayout() {
  const { width, height } = rt().window.getContentBounds();
  return calculateChromeLayout({
    width,
    height,
    chromeHeight: rt().chromeHeight,
    tabLayout,
    verticalTabsWidth: verticalTabsPreferredWidth,
  });
}

/* ---- Island proximity ---------------------------------------------------
 * The resting pill reacts to the cursor approaching it. The measuring happens
 * here rather than in the chrome renderer because the cursor is usually over
 * the page — a different WebContentsView — and the chrome document never sees
 * those moves. Both views report their input events to main, so main is the
 * only place that can watch the whole window.
 *
 * What crosses the IPC boundary is one number (plus a lean direction), only
 * when it changes, and at most once a frame. Beyond the range main sends a
 * single zero and then says nothing at all. */

/** Map a point from a child view's coordinates into the window's. */
function toWindowPoint(point, offset) {
  return { x: point.x + (offset?.x ?? 0), y: point.y + (offset?.y ?? 0) };
}

function sendIslandProximity(runtime, next) {
  runtime.islandProximity = next;
  runtime.islandProximitySentAt = Date.now();
  if (runtime.window && !runtime.window.isDestroyed()) {
    runtime.window.webContents.send('chrome:island-proximity', next);
  }
}

function updateIslandProximity(point) {
  const runtime = rt();
  if (!runtime?.window || runtime.window.isDestroyed()) return;
  const rect = runtime.islandRect;
  if (!rect) return;

  // Asleep whenever the pill isn't the thing you're looking at: another app has
  // focus, or the island is already expanded and the pill is hidden behind it.
  const awake = runtime.window.isFocused() && !runtime.overlayMode;
  const k = awake ? islandProximity.closeness(point, rect) : 0;
  const lean = awake ? islandProximity.lean(point, rect, k) : 0;

  // Three decimals is finer than the effect can render, and makes "unchanged"
  // the common case while you move around away from the pill.
  const next = { k: Number(k.toFixed(3)), lean: Number(lean.toFixed(3)) };
  const prev = runtime.islandProximity;
  if (next.k === prev.k && next.lean === prev.lean) return;

  const since = Date.now() - runtime.islandProximitySentAt;
  if (since >= 16) {
    if (runtime.islandProximityTimer) {
      clearTimeout(runtime.islandProximityTimer);
      runtime.islandProximityTimer = null;
    }
    sendIslandProximity(runtime, next);
    return;
  }
  // Inside the frame budget. Park the value and let a trailing timer deliver
  // it — but park the NEWEST one: during a fast sweep the moves arrive far
  // quicker than a frame, and holding the first would animate to a position
  // the cursor has already left.
  runtime.islandProximityPending = next;
  if (runtime.islandProximityTimer) return;
  runtime.islandProximityTimer = setTimeout(bindWindowRuntime(runtime, () => {
    runtime.islandProximityTimer = null;
    const pending = runtime.islandProximityPending;
    runtime.islandProximityPending = null;
    if (pending) sendIslandProximity(runtime, pending);
  }), 16 - since);
}

/**
 * Watch one view's mouse moves. `offset` maps its coordinates into the window's
 * (a function when the offset can move, as it does with vertical tabs). `bind`
 * puts the whole listener inside its window's runtime — updateIslandProximity
 * reads rt(), so binding only the offset would throw on the first move.
 */
function watchCursorFor(wc, offset, bind) {
  wc.on('input-event', bind((_event, input) => {
    if (!input || input.type !== 'mouseMove') return;
    updateIslandProximity(toWindowPoint(input, typeof offset === 'function' ? offset() : offset));
  }));
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
  if (rt().overlayMode === 'find') return layout.findBounds;
  if (rt().overlayMode === 'palette') return layout.paletteBounds;
  if (rt().overlayMode === 'shield') {
    return calculateShieldBounds({
      windowWidth: rt().window.getContentBounds().width,
      stripHeight: rt().chromeHeight,
      anchorRight: rt().shieldAnchorRight,
    });
  }
  return layout.panelBounds;
}

function createOverlay() {
  // A menu open when the previous window died may never have fired its close
  // callback — never let a leaked ticket disarm the new overlay's blur guard.
  rt().addressMenuTicket = 0;
  rt().overlayView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRuntimes.registerChromeSurface(primaryRuntime, rt().overlayView.webContents.id);
  // If the overlay's webContents dies on its own (renderer crash,
  // render-process-gone) rather than through the window's 'closed' handler,
  // make sure it never lingers in the surface index or as a dangling
  // reference. Locals capture the view + id at creation time since bare
  // overlayView no longer exists after the Task 7 sweep.
  const overlay = rt().overlayView; // just assigned above
  const overlayWcId = overlay.webContents.id;
  overlay.webContents.once('destroyed', bindWindowRuntime(primaryRuntime, () => {
    windowRuntimes.unregisterChromeSurface(overlayWcId);
    if (rt().overlayView === overlay) rt().overlayView = null;
  }));
  // Fully transparent: the panel floats over live web content, so only what
  // overlay.html actually paints may be opaque.
  rt().overlayView.setBackgroundColor('#00000000');
  lockPrivilegedNavigation(rt().overlayView.webContents, CHROME_OVERLAY_URL);
  installChromeShortcuts(rt().overlayView.webContents);
  rt().overlayView.webContents.loadFile(CHROME_OVERLAY_FILE);

  // A show requested before the overlay document finished its first load
  // would be lost — leaving an invisible view blocking clicks. Replay it.
  rt().overlayView.webContents.once('did-finish-load', bindWindowRuntime(primaryRuntime, () => {
    if (rt().overlayMode) {
      rt().overlayView.webContents.send('overlay:show', { mode: rt().overlayMode, prefill: rt().overlayPrefill });
      rt().overlayView.webContents.focus();
    }
  }));

  // Dismiss on Escape at the main-process level so it works no matter
  // which element inside the overlay holds focus.
  rt().overlayView.webContents.on('before-input-event', bindWindowRuntime(primaryRuntime, (event, input) => {
    if (rt().overlayMode && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      hideOverlay({ reason: 'escape' });
    }
  }));

  // Losing focus (page click, cmd-tab, devtools) with the command bar open
  // would leave a stale panel floating over the page. Find mode survives
  // blur deliberately — users click around the page between matches.
  rt().overlayView.webContents.on('blur', bindWindowRuntime(primaryRuntime, () => {
    // A native address-bar context menu takes OS focus; that blur is not a
    // dismissal — the popup's close callback owns what happens next.
    if (rt().addressMenuTicket) return;
    // Playwright's Electron main-process evaluate calls steal focus from the
    // guest view while the acceptance harness inspects it. Keep the real blur
    // policy in production; tests dismiss explicitly between edit sessions.
    if (acceptanceTestMode) return;
    if (!rt().overlayMode || rt().overlayMode === 'find') return;
    // A freshly attached blank tab's view can momentarily grab focus while
    // its address-focus reclaim is still pending — that's not a dismissal;
    // the reclaim will re-assert overlay focus on the next tick.
    if (rt().activeTabId && rt().tabsWantingAddressBarFocus.has(rt().activeTabId)) return;
    hideOverlay({ refocusContent: false });
  }));

  attachAddressMenu(rt().overlayView.webContents, {
    isOverlayLive: bindWindowRuntime(primaryRuntime, () =>
      hasLiveWindow()
      && rt().overlayView && !rt().overlayView.webContents.isDestroyed()
      && (rt().overlayMode === 'panel' || rt().overlayMode === 'palette')),
    getWindow: bindWindowRuntime(primaryRuntime, () => rt().window),
    getOverlayBounds: bindWindowRuntime(primaryRuntime, () => overlayBounds()),
    acquireMenuGuard: bindWindowRuntime(primaryRuntime, () => { rt().addressMenuTicket = ++rt().addressMenuSeq; return rt().addressMenuTicket; }),
    releaseMenuGuard: bindWindowRuntime(primaryRuntime, (ticket) => {
      // A stale popup (superseded by a newer one) must not disarm the guard
      // or run close policy under the live menu.
      if (ticket !== rt().addressMenuTicket) return;
      rt().addressMenuTicket = 0;
      if (!hasLiveWindow()) return;
      if (rt().window.isFocused()) return refocusOverlayAfterMenu();
      // Never steal focus back from another app: if the window lost focus
      // while the guard was suppressing blur dismissal, perform the dismissal
      // the guard swallowed — without touching focus. But sample focus AFTER
      // a beat: GTK can return focus to the window asynchronously once the
      // popup closes, and reading it synchronously would misread an ordinary
      // item selection as an app switch (dismissing the island and swallowing
      // the very edit the item performed).
      setTimeout(bindWindowRuntime(primaryRuntime, () => {
        if (rt().addressMenuTicket || !hasLiveWindow()) return;
        if (!rt().window.isFocused()) return hideOverlay({ refocusContent: false });
        refocusOverlayAfterMenu();
      }), 80);
    }),
    actions: {
      pasteAndGo: bindWindowRuntime(primaryRuntime, (text) => { if (rt().activeTabId) pasteAndGo(rt().activeTabId, text); }),
    },
  });
}

/** The popup took focus from the overlay; hand it back if a panel/palette is
 * still up (the overlay mode already cleared — e.g. Paste and Go closed it —
 * nothing to do). */
function refocusOverlayAfterMenu() {
  if (rt().overlayMode === 'panel' || rt().overlayMode === 'palette') {
    rt().overlayView?.webContents.focus();
  }
}

function showOverlay(mode, { prefill } = {}) {
  if (!hasLiveWindow() || !rt().overlayView) return;
  // One floating layer at a time: summoning the island dismisses the sheet
  // (the overlay takes focus itself — no tab refocus in between).
  hideUtilitySheet({ refocusContent: false });
  // Opening the panel is a freshness signal: pull other devices' tabs
  // (throttled to 1/min inside refreshSession — tab-sync spec §6).
  if (mode === 'panel' || mode === 'palette') sync.refreshSession();
  rt().overlayMode = mode;
  rt().overlayPrefill = prefill ?? null;
  // (Re-)adding moves the overlay to the top of the child-view stack.
  rt().window.contentView.addChildView(rt().overlayView);
  if (rt().overlayExitTimer) {
    clearTimeout(rt().overlayExitTimer);
    rt().overlayExitTimer = null;
  }
  const bounds = overlayBounds();
  rt().overlayView.setBounds(bounds);
  rt().overlayView.webContents.send('overlay:show', {
    mode,
    prefill,
    // Where the resting pill is, in the overlay's OWN coordinates, so the
    // panel can start life at the pill's size and grow out of it. The two live
    // in different views, so this hand-off is the only way the overlay can
    // know. Null until the chrome renderer has reported a box — the panel then
    // just appears, which is what it did before this existed.
    pillRect: rt().islandRect && {
      x: rt().islandRect.x - bounds.x,
      y: rt().islandRect.y - bounds.y,
      width: rt().islandRect.width,
      height: rt().islandRect.height,
    },
  });
  rt().overlayView.webContents.focus();
  rt().window.webContents.send('chrome:island-state', { mode, trigger: mode === 'shield' ? rt().shieldTrigger : null });
}

/** How long the panel takes to retract. Keep in step with styles.css. */
const OVERLAY_RETRACT_MS = 200;

function hideOverlay({ refocusContent = true, reason = null } = {}) {
  if (!rt().overlayMode) return;
  const closingMode = rt().overlayMode;
  const closingTrigger = rt().shieldTrigger;
  rt().overlayMode = null;
  rt().shieldAnchorRight = null;
  rt().shieldPopoverHost = null;
  rt().shieldTrigger = null;
  // A dismissed command bar means the user is done addressing — stop any
  // pending blank-tab focus reclaim so a page click can't reopen it.
  if (rt().activeTabId) rt().tabsWantingAddressBarFocus.delete(rt().activeTabId);
  if (hasLiveWindow() && rt().overlayView) {
    // Tell the overlay to close BEFORE detaching it — the panel retracts into
    // the pill, and a view that has already been removed has nothing left to
    // draw. Only the pixels linger: focus and island state hand over below at
    // once, so the user is never waiting on the animation.
    const retracts = closingMode === 'panel' || closingMode === 'palette';
    rt().overlayView.webContents.send('overlay:hide', { retract: retracts });
    if (rt().overlayExitTimer) {
      clearTimeout(rt().overlayExitTimer);
      rt().overlayExitTimer = null;
    }
    if (retracts) {
      rt().overlayExitTimer = setTimeout(bindWindowRuntime(rt(), () => {
        rt().overlayExitTimer = null;
        // Re-check: a new overlay may have opened while this was retracting,
        // in which case the view is legitimately on screen again.
        if (!rt().overlayMode && hasLiveWindow() && rt().overlayView) {
          rt().window.contentView.removeChildView(rt().overlayView);
        }
      }), OVERLAY_RETRACT_MS);
    } else {
      rt().window.contentView.removeChildView(rt().overlayView);
    }
    // Escape from the shield popover hands focus back to the control that
    // opened it, not to page content — keyboard users should land where they
    // started. The chrome webContents must take focus BEFORE the strip's DOM
    // focus() runs: the overlay held it until removeChildView above, and a
    // focus call inside an unfocused document paints no visible ring.
    const restoreTrigger = reason === 'escape' && closingMode === 'shield' ? closingTrigger : null;
    if (restoreTrigger) rt().window.webContents.focus();
    rt().window.webContents.send('chrome:island-state', { mode: null, trigger: null, restoreTrigger });
    if (refocusContent && !restoreTrigger) tabs.get(rt().activeTabId)?.view.webContents.focus();
  }
}

// --- Utility sheet (design: 2026-07-22-utility-sheet-design.md) ---
// The five utility pages render here, never as tabs. One lazy transparent
// view; the page draws its own scrim + card (body.sheet in pages.css).
// utilitySheetView, utilitySheetUrl now live on the runtime record (see
// window-runtime-registry.js for their per-field doc comments).

function createUtilitySheet() {
  rt().utilitySheetView = new WebContentsView({ webPreferences: TAB_WEB_PREFERENCES });
  rt().utilitySheetView.setBackgroundColor('#00000000');
  const wc = rt().utilitySheetView.webContents;
  installChromeShortcuts(wc);
  // Esc dismisses no matter what inside the page holds focus (mirrors the
  // island overlay's handler).
  wc.on('before-input-event', bindWindowRuntime(primaryRuntime, (event, input) => {
    if (rt().utilitySheetUrl && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      hideUtilitySheet();
    }
  }));
  // A crashed sheet renderer is dismissed and destroyed; the next open
  // lazily recreates it. Close the dead webContents — dropping the
  // reference alone leaks the crashed guest. Default refocus: nothing else
  // will hand focus back after a crash.
  wc.on('render-process-gone', bindWindowRuntime(primaryRuntime, () => {
    hideUtilitySheet();
    wc.close();
    rt().utilitySheetView = null;
  }));
  // Default-deny (design §4): utility→utility stays in-sheet; http(s)
  // opens a real tab (createTab's dismissal covers the sheet); approved
  // handoff protocols go to the OS; everything else — and every
  // window.open — dies.
  wc.on('will-navigate', bindWindowRuntime(primaryRuntime, (event, targetUrl) => {
    if (isUtilityUrl(targetUrl)) {
      rt().utilitySheetUrl = targetUrl; // keep the toggle honest across in-sheet nav
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
  if (!hasLiveWindow()) return;
  // Toggle: a direct re-invocation (menu/accelerator) of the shown page
  // closes it. Overlay-hosted entry points can never hit this — summoning
  // the overlay already dismissed the sheet.
  if (rt().utilitySheetUrl && sameUtilityPage(rt().utilitySheetUrl, url)) return hideUtilitySheet();
  // One floating layer at a time, in both directions.
  hideOverlay({ refocusContent: false });
  if (!rt().utilitySheetView) createUtilitySheet();
  rt().utilitySheetUrl = url;
  // Rapid page swaps abort the in-flight load — loadURL rejects with
  // ERR_ABORTED; that's routine, not an error.
  rt().utilitySheetView.webContents.loadURL(url).catch(() => {});
  // Mirror tabs: a detached view's document still reports visibilityState
  // 'visible' and never background-throttles — toggle real visibility.
  rt().utilitySheetView.setVisible(true);
  rt().window.contentView.addChildView(rt().utilitySheetView);
  resizeActiveView();
  rt().utilitySheetView.webContents.focus();
}

function hideUtilitySheet({ refocusContent = true } = {}) {
  if (!rt().utilitySheetUrl) return;
  rt().utilitySheetUrl = null;
  if (hasLiveWindow() && rt().utilitySheetView) {
    rt().window.contentView.removeChildView(rt().utilitySheetView);
    rt().utilitySheetView.setVisible(false);
    if (refocusContent) tabs.get(rt().activeTabId)?.view.webContents.focus();
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
  rt().tabsWantingAddressBarFocus.delete(id);
  // A quiet tab navigates in one step: restore() and a navigation are mutually
  // exclusive, so this spends the snapshot and loads the target directly.
  if (tab.asleep) {
    wakeTab(id, { navigateTo: target }).catch(() => {});
    return;
  }
  // Rapid re-navigation (Enter twice, Paste and Go twice) aborts the in-flight
  // load — loadURL rejects with ERR_ABORTED; that's routine, not an error.
  liveContents(tab)?.loadURL(target)?.catch(() => {});
}

/** Paste and Go = navigate + dismiss the island, exactly like pressing Enter.
 * The menu action and the F19-3 acceptance binding both use THIS wrapper, so
 * the scenario's "closes the island" half asserts the real code path. */
function pasteAndGo(id, rawText) {
  navigateTabToAddress(id, rawText);
  hideOverlay();
}

/** Is this URL's site on the ad-block exception list? Read live so a change
 *  from either Settings or a slash command shows up on the next broadcast. */
function isHostnameExcepted(url) {
  const hostname = blockableHostname(url);
  return !!hostname && settings.getSettings().adblockExceptions.includes(hostname);
}

function serializeTabs() {
  const { adblockEnabled } = settings.getSettings();
  return rt().tabOrder
    .map((id) => tabs.get(id))
    .filter(Boolean)
    .map((tab) => {
      // This broadcast reaches both chrome renderers roughly ten times a
      // second. Keep it a projection: new main-process fields must never
      // cross this boundary merely because they were added to a tab record.
      const rest = {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isLoading: tab.isLoading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        favicon: tab.favicon,
        bookmarked: tab.bookmarked,
        blockedCount: tab.blockedCount,
        private: tab.private,
        pinned: tab.pinned,
        muted: tab.muted,
        audible: tab.audible,
        groupId: tab.groupId,
        pageBg: tab.pageBg,
        themeColor: tab.themeColor,
        // The sole Quiet Tabs field chrome may see. Operational sleep state
        // and snapshots remain main-process-only.
        asleep: tab.asleep,
      };
      // Whether ads are allow-listed here. Derived rather than stored: the
      // exception list is edited from Settings and the slash commands alike,
      // and without this the chrome shows NOTHING on an excepted site (the
      // shield hides at a 0 count), so "/allow-ads" left no visible trace and
      // "/block-ads" appeared to do nothing when it lifted the exception.
      const excepted = isHostnameExcepted(rest.url);
      // Chip state is fully derived here (shield-model.js) so the strip and
      // overlay only ever render what the broadcast says.
      const shield = shieldChipState({
        url: rest.url,
        blockedCount: rest.blockedCount,
        excepted,
        adblockEnabled,
      });
      // Derived exactly once, here. A quiet tab has no view, but it reached
      // quiet only after committing, so its stored URL is honest in that one
      // state. Do not broaden committedUrlOf's null default: it prevents an
      // ahead-of-navigation URL from making a false security claim.
      const connection = connectionFor({
        url: rest.asleep ? rest.url : committedUrlOf(tab.view),
        isLoading: rest.isLoading,
      });
      if (rest.private && rest.favicon) {
        // A page-favicon URL belongs to the tab's browsing session. Sending a
        // private tab's remote URL into persistent chrome would make the chrome
        // session fetch it again merely to paint the pill/overlay/rail, escaping
        // the non-persistent private-session boundary. Private rows deliberately
        // use the renderer's neutral fallback instead.
        return { ...rest, favicon: null, excepted, shield, connection };
      }
      return { ...rest, excepted, shield, connection };
    });
}

// Open tabs persist across launches (restored in app.whenReady).
// `groupIds` is parallel to `urls` (null = ungrouped); `groups` holds the
// group records those ids point at.
let sessionStore = null;
const ensureSessionStore = () => (sessionStore ??= new JsonStore('session', {}));
// Set by the restore path when session.json is a newer format than this
// build understands (loadWorkspace's readOnly) — persistSession must never
// rewrite a file it can't fully round-trip.
let sessionReadOnly = false;

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
app.on('before-quit', () => {
  isQuitting = true;
  sleepSnapshots.clear(); // retained POST bodies / form values
});

function persistSession() {
  // Teardown closes tabs one by one; saving then would erode the session
  // file down to whatever closed last before the process exits.
  if (isQuitting || sessionPersistenceSuspended || tabs.size === 0) return;
  if (sessionReadOnly) return; // a newer format owns this file — never rewrite it
  const runtime = rt();
  ensureSessionStore().update((d) => {
    // Private tabs leave no trail, error pages persist their real
    // destination, url-less tabs drop — all in session-snapshot.js so tab
    // sync shares the exact same filter.
    const entries = persistableEntries(runtime.tabOrder.map((id) => tabs.get(id)));
    const entry = {
      urls: entries.map((e) => e.url),
      groupIds: entries.map((e) => e.groupId),
      pinned: entries.map((e) => e.pinned),
      // Restored tabs come back quiet, with no webContents to ask for a title
      // or favicon. Map over `entries`, not the raw list: private/url-less
      // tabs drop out of urls and must drop out of metadata with them.
      meta: entries.map((e) => sessionTabMeta(tabs.get(e.id))),
      // Groups referenced only by private tabs stay out of the file too.
      groups: runtime.groups.filter((g) => entries.some((e) => e.groupId === g.id)),
      activeIndex: d.activeIndex ?? 0,
    };
    // Only update when the active tab is actually in the persisted list —
    // during startup (no active tab yet) or with a private tab active,
    // indexOf is -1 and writing 0 would corrupt the last good index.
    // Indexed into `entries` (what entry.urls is built from), not the wider
    // tab list — a tab with no persistable url (an adopted window.open
    // child before its first navigation commits) is dropped from entry.urls,
    // and an index computed on the unfiltered list would restore focus to
    // the wrong tab. -1 (startup, private or url-less active tab) keeps
    // the last good index, as before.
    const idx = entries.findIndex((e) => e.id === runtime.activeTabId);
    if (idx >= 0) entry.activeIndex = idx;
    Object.assign(d, buildSaveShape(entry, d));
  });
}

/** The active tab's popover model, or null when it has no blockable host. */
function activeShieldPopover(serialized = serializeTabs()) {
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
  if (!tab) return null;
  return shieldPopoverModel({
    url: tab.url,
    blockedCount: tab.blockedCount,
    excepted: isHostnameExcepted(tab.url),
    adblockEnabled: settings.getSettings().adblockEnabled,
    // Read back out of the serialized payload rather than derived again, so
    // the popover and the active tab row cannot disagree within a broadcast.
    connection: activeConnection(serialized, rt().activeTabId),
  });
}

function broadcastTabs() {
  persistSession();
  tabsync.noteTabsChanged();
  if (!rt().window || rt().window.isDestroyed()) return;
  const widthMetrics = verticalTabsMetrics();
  // Serialize once and hand the same list to the popover, so connection is
  // derived a single time per broadcast.
  const serialized = serializeTabs();
  const runtime = rt();
  const payload = {
    tabs: serialized,
    activeTabId: runtime.activeTabId,
    groups: runtime.groups,
    tabLayout,
    adblockEnabled: settings.getSettings().adblockEnabled,
    shieldPopover: activeShieldPopover(serialized),
    ...widthMetrics,
  };
  rt().window.webContents.send('tabs:updated', payload);
  runtime.overlayView?.webContents.send('tabs:updated', payload);
}

function broadcastDownloadsActivity() {
  if (!rt().window || rt().window.isDestroyed()) return;
  rt().window.webContents.send('chrome:downloads', downloadsActivity());
}

// The blocked-request counter can tick many times a second during a page
// load; coalesce those into at most ~10 broadcasts/s.
function scheduleBroadcastTabs() {
  if (rt().tabsBroadcastTimer) return;
  rt().tabsBroadcastTimer = setTimeout(() => {
    rt().tabsBroadcastTimer = null;
    broadcastTabs();
  }, 100);
}

function resizeActiveView() {
  if (!rt().window || rt().window.isDestroyed()) return;
  const layout = currentChromeLayout();
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
  if (tab?.view) tab.view.setBounds(layout.pageBounds);
  if (rt().overlayMode && rt().overlayView) rt().overlayView.setBounds(overlayBounds());
  if (rt().utilitySheetUrl && rt().utilitySheetView) {
    rt().utilitySheetView.setBounds(layout.utilityBounds);
  }
  // The BrowserWindow renderer and native child views must move in the same
  // frame. A dedicated geometry event avoids turning every pointermove or
  // window resize into a tab/session-sync broadcast.
  rt().window.webContents.send('chrome:vertical-tabs-width', verticalTabsMetrics(layout));
}

function applyVerticalTabsWidth(nextWidth) {
  const next = normalizeVerticalTabsWidth(nextWidth);
  if (next === verticalTabsPreferredWidth) return false;
  verticalTabsPreferredWidth = next;
  if (hasLiveWindow()) resizeActiveView();
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

  if (hasLiveWindow()) {
    // A floating overlay is tied to the old pane center. Dismiss it in the
    // same main-process turn, then rebound the attached page/sheet without
    // navigating either document. The Settings sheet stays open so its own
    // layout choice does not eject the user mid-interaction.
    hideOverlay({ refocusContent: false });
    resizeActiveView();
    if (!rt().utilitySheetUrl) tabs.get(rt().activeTabId)?.view.webContents.focus();
  }
  broadcastTabs();
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
  webContents.on('before-input-event', bindWindowRuntime(primaryRuntime, (event, input) => {
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
  }));
}

function installChromeShortcuts(webContents) {
  installVerticalTabsShortcut(webContents);
  installPlatformMainMenuShortcut({
    webContents,
    Menu,
    getWindow: bindWindowRuntime(primaryRuntime, () => rt().window),
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
  // Reached from a bare 150 ms timer too, so a tab may close or discard its
  // view between scheduling and this run.
  const wc = liveContents(tab);
  if (!tabs.has(tab.id) || !wc) return;
  if (tab.private || !/^https?:\/\//.test(tab.url)) {
    if (tab.pageBg) {
      tab.pageBg = null;
      scheduleBroadcastTabs();
    }
    return;
  }
  const { width } = tab.view?.getBounds() ?? {};
  if (!width || wc.isLoading()) return;
  try {
    const image = await wc.capturePage({ x: 0, y: 0, width, height: 2 });
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
  setTimeout(() => samplePageTint(tab), 150);
}

// --- Tab groups (Island Tab Groups design) ---

/** Pill/panel cluster order: each non-empty group in group order, then a
 * trailing pseudo-cluster of ungrouped, unpinned tabs. Pinned members stay
 * inside their named group and lead that group's rows; only ungrouped pins
 * use the standalone pinned shelf. Cmd/Ctrl+1–9 jump by this. */
function clusterList() {
  const list = [];
  for (const g of rt().groups) {
    const members = rt().tabOrder.filter((id) => tabs.get(id)?.groupId === g.id);
    const tabIds = [
      ...members.filter((id) => tabs.get(id)?.pinned),
      ...members.filter((id) => !tabs.get(id)?.pinned),
    ];
    if (tabIds.length) list.push({ group: g, tabIds });
  }
  const loose = rt().tabOrder.filter((id) => tabs.get(id) && !tabs.get(id).groupId && !tabs.get(id).pinned);
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
  const pinnedIds = rt().tabOrder.filter((id) => tabs.get(id)?.pinned && !tabs.get(id)?.groupId);
  if (pinnedIds.length) slots.unshift({ key: 'pinned', group: null, tabIds: pinnedIds });
  return slots;
}

// Cluster key → most recently active tab id there (rt().lastActiveByCluster),
// so ⌥⌘↑/↓ lands back where you were in each group. In-memory only — a
// remembered tab that closed or moved simply fails the lookup and the
// first tab wins.

function clusterKeyForTab(tab) {
  return tab.groupId ?? (tab.pinned ? 'pinned' : 'loose');
}

/** A group exists only while it holds tabs — closing or moving out the
 * last one dissolves it (same convention as Chrome's tab groups). */
function pruneEmptyGroups() {
  if (!rt().groups.length) return;
  const used = new Set();
  for (const tab of tabs.values()) if (tab.groupId) used.add(tab.groupId);
  rt().groups = rt().groups.filter((g) => used.has(g.id));
}

function setTabGroup(tabId, groupId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  // A requested group that no longer exists (a picker click racing the
  // group's dissolution) is a no-op — it must not ungroup the tab instead.
  if (groupId && !rt().groups.some((g) => g.id === groupId)) return;
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
  let group = rt().groups.find((g) => g.name === name);
  if (!group) {
    group = { id: crypto.randomUUID(), name, collapsed: false };
    rt().groups.push(group);
  }
  tab.groupId = group.id;
  pruneEmptyGroups();
  broadcastTabs();
  scheduleMenuRebuild();
}

function toggleGroupCollapsed(groupId) {
  const group = rt().groups.find((g) => g.id === groupId);
  if (!group) return;
  group.collapsed = !group.collapsed;
  broadcastTabs();
}

/** Jump to a group: activate its first tab and unfold it. */
function focusGroup(groupId) {
  const group = rt().groups.find((g) => g.id === groupId);
  if (!group) return;
  group.collapsed = false;
  const first = clusterList().find(({ group: g }) => g?.id === groupId)?.tabIds[0];
  // setActiveTab broadcasts, but no-ops when the tab is already active —
  // the unfold still has to reach the renderers.
  if (first && first !== rt().activeTabId) setActiveTab(first);
  else broadcastTabs();
}

function closeGroup(groupId) {
  const ids = rt().tabOrder.filter((id) => tabs.get(id)?.groupId === groupId);
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
  liveContents(tab)?.setAudioMuted(tab.muted);
  broadcastTabs();
  scheduleMenuRebuild();
  return tab.muted;
}

function duplicateTab(id) {
  const source = tabs.get(id);
  if (!source) return;
  const insertAt = rt().tabOrder.indexOf(id) + 1;
  // A quiet source duplicates straight from its retained snapshot; waking it
  // just to read history defeats the feature and creates a needless reload.
  const snapshot = source.asleep ? sleepSnapshots.get(id) : null;
  const history = snapshot ? null : liveContents(source)?.navigationHistory;
  const entries = snapshot ? snapshot.entries : (history?.getAllEntries() ?? []);
  const activeIndex = snapshot ? snapshot.index : (history?.getActiveIndex() ?? 0);
  const newId = createTab(source.url, {
    private: source.private,
    groupId: source.groupId,
    pinned: source.pinned,
    muted: source.muted,
    // Only worth restoring if there's more than just the current page.
    restoreHistory: entries.length > 1 ? { entries, index: activeIndex } : null,
  });
  reorderTab(newId, insertAt);
  return newId;
}

// ─── SPIKE (1Password fill feasibility) — remove before release ───────────
// Fill the active tab's login form from 1Password behind Touch ID, with no
// browser extension. Env-gated; credentials live only in main memory + the
// verified page, and every outcome logs a result line, never a value.
const ONE_PASSWORD_SPIKE_ENABLED = !app.isPackaged || process.env.BLANC_1P_SPIKE === '1';

async function fillActiveTabFrom1Password() {
  const log = (result, extra) => console.log(`[1p-spike] ${result}${extra ? ' ' + extra : ''}`);
  const onepassword = require('./onepassword'); // ./onepassword only — the SDK stays lazy inside it
  let capturedTabId, tab, wc, expectedURL, expectedHost, capturedEpoch, capturedTimeOrigin, chosen;

  // ── PHASE 1 (pre-reveal): NO credential is in memory yet, so err.message is
  //    safe to log for diagnosis. ──
  try {
    if (!hasLiveWindow() || !rt().activeTabId) return log('no-active-tab');
    capturedTabId = rt().activeTabId;
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
    chosen = matches[0];
    if (matches.length > 1) {
      // The vault search was async — if the window died meanwhile, don't ask
      // the user to choose a login for a window that no longer exists (the
      // post-reveal re-validation would abort anyway). Also keeps `rt().window`
      // safe to pass as the dialog parent (documented overloads only).
      if (!hasLiveWindow()) return log('abort-window-changed');
      const buttons = matches.map((m) => m.title || '(untitled)');
      const cancelId = buttons.length;
      buttons.push('Cancel');
      const { response } = await dialog.showMessageBox(rt().window, {
        type: 'question',
        title: 'Fill from 1Password',
        message: `Choose a login for ${expectedHost}`,
        buttons,
        cancelId,
        noLink: true,
      });
      if (response < 0 || response >= matches.length) return log('chooser-cancel');
      chosen = matches[response];
    }
  } catch (err) {
    return log('setup-error', err?.message); // pre-reveal only — credential-free
  }

  // ── PHASE 2 (reveal + fill): a credential is in memory from revealCredential
  //    onward. This whole block is a BINDING-LESS try — every failure (a
  //    page-controlled executeJavaScript rejection, OR any other throw once the
  //    credential exists) logs a FIXED classification, so no error string can
  //    ever echo the credential. ──
  try {
    const { username, password } = await onepassword.revealCredential(chosen.vaultId, chosen.itemId);
    if (password == null && username == null) return log('empty-item');

    // Re-validate after the async auth/chooser: same live+focused window, same
    // active tab, live+focused webContents, unchanged epoch, exact same URL.
    if (!hasLiveWindow() || !rt().window.isFocused()) return log('abort-window-changed');
    if (rt().activeTabId !== capturedTabId || !tabs.has(capturedTabId)) return log('abort-tab-changed');
    if (wc.isDestroyed() || !wc.isFocused()) return log('abort-wc-changed');
    if (tab.navEpoch !== capturedEpoch) return log('abort-navigated');
    if (wc.getURL() !== expectedURL) return log('abort-url-changed');

    // Injection runs in the page's MAIN WORLD (a hostile page could override the
    // value setter to throw an Error echoing the value) — the binding-less catch
    // below is what makes that message unloggable.
    const source = onepassword.buildFillScript({ expectedURL, expectedTimeOrigin: capturedTimeOrigin, username, password });
    const status = await wc.executeJavaScript(source); // single-arg, no userGesture
    if (status?.originMismatch) return log('origin-or-focus-mismatch');
    if (status?.noPasswordField) return log('no-password-field');
    if (status?.filledPass && status?.filledUser) return log('filled', 'user+pass');
    if (status?.filledPass) return log('filled', 'pass-only (username field not found)');
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

// --- Quiet Tabs hooks (phase 2 fills these in) --------------------------
// The tab-view dependency contract is fixed now, so later phases can extend
// these hooks without changing the construction/wiring seam again.
/**
 * Quiet Tabs: refresh every eligibility signal that a main-frame commit
 * invalidates (spec §4.2). Called from tab-view.js's did-navigate handler.
 */
function onMainFrameCommit(tab, { url, httpResponseCode }) {
  // "This document has played media" is cleared ONLY here — clearing on pause
  // would unprotect exactly the paused video this rule exists to protect.
  tab.usedMedia = false;
  tab.deepScrolled = false;
  const wc = liveContents(tab);
  const isHttp = /^https?:/i.test(url ?? '');
  // Non-http(s) commits never reach onBeforeSendHeaders, so they are GETs by
  // construction. An HTTP(S) commit without an observed method fails safe.
  const method = wc ? lastMainFrameMethod.get(wc.id) : undefined;
  const effectiveMethod = method ?? (isHttp ? null : 'GET');
  tab.restorableCommit = effectiveMethod === 'GET' && (httpResponseCode ?? 200) < 400;
  try {
    tab.httpEntryCount = wc
      ? wc.navigationHistory.getAllEntries().filter((entry) => /^https?:/i.test(entry?.url ?? '')).length
      : 0;
  } catch {
    tab.httpEntryCount = 0;
  }
}
/** Suppress history and normal failure handling for every hop while a wake
 * generation is open. */
function noteWakeSuppressed(tab) {
  return !!tab?.waking;
}
/** Count an unmanaged popup against its opener until its webContents dies. */
function notePopupChild(openerTabId, childWindow) {
  if (!openerTabId || !childWindow) return;
  popupChildCounts.set(openerTabId, (popupChildCounts.get(openerTabId) ?? 0) + 1);
  childWindow.webContents.once('destroyed', bindWindowRuntime(primaryRuntime, () => {
    const next = (popupChildCounts.get(openerTabId) ?? 1) - 1;
    if (next <= 0) popupChildCounts.delete(openerTabId);
    else popupChildCounts.set(openerTabId, next);
  }));
}

// tab-view.js owns every per-tab WebContentsView listener and setup call.
// Function declarations below are hoisted; every const this reads is already
// initialized before this module-scope call.
initTabView({
  tabs,
  windowRuntimes,
  bindWindowRuntime,
  tabIdByWebContentsId,
  broadcastTabs,
  scheduleBroadcastTabs,
  scheduleSampleTint,
  scheduleMenuRebuild,
  createTab,
  setActiveTab,
  closeTab,
  openInternalPage,
  currentChromeLayout,
  hideOverlay,
  hasLiveWindow,
  reclaimAddressBarFocus,
  shouldReclaimAddressBarFocus,
  installChromeShortcuts,
  watchCursorFor,
  isUtilityUrl,
  handOffToOs,
  upgradeFavicon,
  isStartupGateActive: () => startupNavigationGateActive,
  startupQueuedNavigations,
  onMainFrameCommit,
  noteWakeSuppressed,
  notePopupChild,
  onePasswordSpikeEnabled: ONE_PASSWORD_SPIKE_ENABLED,
  fillActiveTabFrom1Password,
});

function createTab(url = newTabUrl(), { private: isPrivate = false, groupId = null, view = null, pinned = false, muted = false, restoreHistory = null, openerTabId = null } = {}) {
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
  const owner = currentRuntime();
  // An adopted view (window.open child, see the window-open handler) arrives
  // already constructed by Chromium with the opener relationship wired up;
  // everything else gets a fresh one.
  const adopted = !!view;
  view ??= createTabView({ private: isPrivate });

  const tab = {
    id,
    runtimeId: owner.id,
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
    groupId: groupId && rt().groups.some((g) => g.id === groupId) ? groupId : null,
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
    // --- Quiet Tabs (spec §3). None of these are serialized except `asleep`;
    // serializeTabs is an explicit allowlist precisely so they cannot leak. ---
    asleep: false,            // renderer discarded; tab.view is null
    sleeping: false,          // teardown in progress
    waking: false,            // a wake generation is open
    wakeGeneration: 0,        // monotonic, never reset
    lastActiveAt: null,       // ms epoch; null until first stamp
    adopted,                  // an adopted window.open child is never quietable
    openerTabId,              // family-awareness for sleepCandidates
    usedMedia: false,         // 'media-started-playing'; cleared ONLY on main-frame nav
    // Fail-safe false: a tab with no committed main frame is not quietable.
    // Deliberately NOT historyEligible, which is false for every private tab.
    restorableCommit: false,
    deepScrolled: false,      // probe result: scrollY > 3 * innerHeight
    httpEntryCount: 0,        // http(s) entries in navigationHistory
  };
  tabs.set(id, tab);
  // A background-created tab (cmd-click, session restore, window.open child)
  // never passes through setActiveTab, so it would otherwise never be stamped.
  // A foreground creation overwrites this the moment it is deactivated.
  tab.lastActiveAt = Date.now();
  rt().tabOrder.push(id);
  windowRuntimes.attachTab(owner, id);

  const wc = view.webContents;
  tabIdByWebContentsId.set(wc.id, id);
  wireTabView(tab, view, { owner, adopted });

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
  if (!next) return;
  // The wake's synchronous prefix creates its view before returning. This is
  // deliberately before every guard below, including the no-window path.
  if (next.asleep) wakeTab(id).catch(() => {});
  // A script-closed adopted tab prunes itself via its 'destroyed' handler,
  // but a deferred activation (the window-open setImmediate) can race the
  // event — never attach or focus a dead webContents.
  if (!liveContents(next)) return;

  // Re-selecting the active tab is a no-op.
  if (id === rt().activeTabId) return;

  // Tab switches dismiss the sheet; the switched-to tab takes focus via
  // the existing flow below.
  hideUtilitySheet({ refocusContent: false });

  rt().lastActiveByCluster.set(clusterKeyForTab(next), id);

  // No window to attach to (quitting, or macOS with all windows closed):
  // just track the selection so window recreation attaches the right tab.
  // The menu bar persists on macOS even with no windows open, so it still
  // needs to reflect the new activeTabId.
  if (!hasLiveWindow()) {
    rt().activeTabId = id;
    scheduleMenuRebuild();
    return;
  }

  // Find state is per-tab; a stale capsule over a different page misleads.
  // The shield popover describes one tab's site — same rule.
  if (rt().overlayMode === 'find' || rt().overlayMode === 'shield') hideOverlay({ refocusContent: false });

  const prevId = rt().activeTabId;
  const prev = prevId ? tabs.get(prevId) : null;
  if (prev) {
    // Quiet Tabs: the tab is leaving the foreground — this is the ONLY moment
    // that defines "idle since" (spec §4.3). Stamp before a potential detach
    // error so the tab cannot be left eligible without an idle timestamp.
    prev.lastActiveAt = Date.now();
  }
  if (prev?.view) {
    rt().window.contentView.removeChildView(prev.view);
    // A detached view's document still reports visibilityState 'visible',
    // so Chromium never background-throttles its timers (the newtab sprite
    // would keep animating at 6fps forever). Hide it explicitly;
    // reactivation always calls setVisible(true).
    prev.view.setVisible(false);
  }

  rt().activeTabId = id;
  if (prevId && prevId !== id) rt().tabsWantingAddressBarFocus.delete(prevId);
  const shouldFocusAddress = focusAddress && !focusContent;
  if (shouldFocusAddress) {
    rt().tabsWantingAddressBarFocus.add(id);
  } else {
    rt().tabsWantingAddressBarFocus.delete(id);
    next.view.setVisible(true);
  }
  if (shouldFocusAddress) next.view.setVisible(false);
  rt().window.contentView.addChildView(next.view);
  // The freshly attached tab view must not stack above an open overlay —
  // nor above the sheet (defensive: §5 means they shouldn't coexist here,
  // but a race must never paint a tab over either floating layer).
  if (rt().utilitySheetUrl && rt().utilitySheetView) rt().window.contentView.addChildView(rt().utilitySheetView);
  if (rt().overlayMode && rt().overlayView) rt().window.contentView.addChildView(rt().overlayView);
  resizeActiveView();
  // Focusing the tab's WebContentsView gives it OS keyboard focus. For a
  // blank new tab we instead want the chrome's address bar, and OS focus
  // can be claimed asynchronously by the attached child view, so blank-tab
  // activation keeps reclaiming focus until the user navigates or switches.
  if (focusContent) liveContents(next)?.focus();
  // Background tabs can't be pixel-sampled; catch up when they surface.
  if (!next.pageBg) scheduleSampleTint(next);
  broadcastTabs();
  scheduleMenuRebuild();
  if (shouldFocusAddress) {
    reclaimAddressBarFocus(id);
    setImmediate(() => {
      if (rt().activeTabId !== id || !tabs.has(id) || !next.view) return;
      next.view.setVisible(true);
      reclaimAddressBarFocus(id);
    });
  }
}

function activateTabFromRail(id) {
  const tab = tabs.get(id);
  if (!tab) return false;
  // Rail rows target background tabs, so they are the common direct path to a
  // quiet tab. wakeTab's synchronous prefix makes liveContents safe below.
  if (tab.asleep) wakeTab(id).catch(() => {});
  const wc = liveContents(tab);
  if (!wc) return false;
  rt().railActivationSerial += 1;

  // One guarded main-process action owns the complete interaction so a
  // renderer cannot leave an old sheet/panel stacked over the selected tab.
  hideOverlay({ refocusContent: false });
  hideUtilitySheet({ refocusContent: false });

  if (id !== rt().activeTabId) {
    setActiveTab(id, { focusContent: true });
  } else {
    // setActiveTab deliberately no-ops for an already-active tab; the rail
    // contract still requires that click/keyboard activation focus content.
    rt().tabsWantingAddressBarFocus.delete(id);
    tab.view.setVisible(true);
    resizeActiveView();
    wc.focus();
  }
  return true;
}

/** URLs of recently closed tabs, oldest first (Cmd/Ctrl+Shift+T pops). */
const recentlyClosedUrls = [];

function closeTab(id) {
  // First statement: any later early return must not strand recovery data.
  sleepSnapshots.delete(id);
  // A user close during a sleep teardown wins: do not rewire a tab going away.
  sleepTeardownInProgress = false;
  const tab = tabs.get(id);
  if (!tab) return;
  forgetTabWebContentsIds(id);

  // Closed private tabs are gone — reopen-closed-tab must not resurrect them.
  // A failed provisional navigation can leave a non-string value in the
  // model during WebContents teardown. Closing that tab must not take down the
  // main process while deciding whether it is eligible for reopen-closed-tab.
  const tabUrl = typeof tab.url === 'string' ? tab.url : '';
  if (tabUrl && !tab.private && !tabUrl.startsWith('blanc://newtab')) {
    recentlyClosedUrls.push(tabUrl);
    if (recentlyClosedUrls.length > 25) recentlyClosedUrls.shift();
  }

  const wasActive = id === rt().activeTabId;
  if (wasActive && hasLiveWindow() && tab.view) rt().window.contentView.removeChildView(tab.view);

  const closedIndex = rt().tabOrder.indexOf(id);
  rt().tabsWantingAddressBarFocus.delete(id);
  tabs.delete(id);
  popupChildCounts.delete(id);
  windowRuntimes.detachTab(id);
  rt().tabOrder = rt().tabOrder.filter((tid) => tid !== id);
  pruneEmptyGroups();
  const wc = tab.view?.webContents;
  if (wc) lastMainFrameMethod.delete(wc.id);
  if (wc && !wc.isDestroyed()) wc.close();

  if (wasActive) {
    // Electron destroys the active view during app shutdown. Do not select a
    // surviving quiet tab here: setActiveTab would wake it and construct a
    // fresh WebContentsView while the native window is being torn down.
    if (isQuitting) {
      rt().activeTabId = null;
      return;
    }
    if (rt().tabOrder.length > 0) {
      // Prefer the tab that was to the right of the closed one.
      setActiveTab(rt().tabOrder[Math.min(closedIndex, rt().tabOrder.length - 1)]);
    } else if (hasLiveWindow()) {
      rt().activeTabId = null;
      setActiveTab(createTab());
    } else {
      // Quitting or window already gone — don't spawn replacement tabs.
      rt().activeTabId = null;
    }
    if (hasLiveWindow()) return; // setActiveTab already broadcasts and schedules a menu rebuild
  }
  broadcastTabs();
  scheduleMenuRebuild();
}

function reopenClosedTab() {
  const url = recentlyClosedUrls.pop();
  if (url) setActiveTab(createTab(url));
}

function reorderTab(id, toIndex) {
  const from = rt().tabOrder.indexOf(id);
  if (from === -1) return;
  const clamped = Math.max(0, Math.min(rt().tabOrder.length - 1, toIndex));
  rt().tabOrder.splice(from, 1);
  rt().tabOrder.splice(clamped, 0, id);
  broadcastTabs();
  scheduleMenuRebuild();
}

function reorderTabWithinBucket(id, beforeId) {
  // Renderer input is only a proposal. Main re-resolves both ids against its
  // live model and rejects a stale/cross-group/cross-pin target.
  const next = reorderWithinBucket(rt().tabOrder, tabs, id, beforeId);
  if (!next) return false;
  if (next.some((tabId, index) => rt().tabOrder[index] !== tabId)) {
    rt().tabOrder = next;
    broadcastTabs();
    scheduleMenuRebuild();
  }
  return true;
}

/** Cmd/Ctrl+1–9. With groups: n jumps to the nth cluster — a group's
 * first tab, unfolding it (Island Tab Groups design). Without groups the
 * browser convention stands: 1–8 jump to that tab, 9 to the last. */
function selectTabAtIndex(index) {
  // clusterSlots() surfaces ungrouped pins as a leading slot. Grouped pins
  // remain reachable through their group's own slot.
  const slots = clusterSlots();
  if (rt().groups.length && slots.length) {
    const slot = slots[index];
    if (!slot) return;
    if (slot.group) focusGroup(slot.group.id);
    else setActiveTab(slot.tabIds[0]);
    return;
  }
  const id = index >= 8 ? rt().tabOrder[rt().tabOrder.length - 1] : rt().tabOrder[index];
  if (id) setActiveTab(id);
}

function cycleTab(direction) {
  if (!rt().activeTabId || rt().tabOrder.length < 2) return;
  const i = rt().tabOrder.indexOf(rt().activeTabId);
  setActiveTab(rt().tabOrder[(i + direction + rt().tabOrder.length) % rt().tabOrder.length]);
}

/** ⌥⌘←/→: previous/next tab within the active tab's cluster, wrapping.
 * With no groups and no pins everything is one loose cluster, so this
 * degrades to plain tab cycling (same result as Ctrl+Tab). */
function cycleTabInCluster(direction) {
  if (!rt().activeTabId) return;
  const slot = clusterSlots().find((s) => s.tabIds.includes(rt().activeTabId));
  if (!slot) return cycleTab(direction);
  if (slot.tabIds.length < 2) return;
  const i = slot.tabIds.indexOf(rt().activeTabId);
  setActiveTab(slot.tabIds[(i + direction + slot.tabIds.length) % slot.tabIds.length]);
}

/** ⌥⌘↑/↓: previous/next cluster in ⌘1–9 order (ungrouped pinned
 * shelf → groups → loose), wrapping. Lands on the cluster's last-active
 * tab and unfolds a collapsed group, consistent with focusGroup(). */
function cycleCluster(direction) {
  if (!rt().activeTabId) return;
  const slots = clusterSlots();
  if (slots.length < 2) return;
  const from = slots.findIndex((s) => s.tabIds.includes(rt().activeTabId));
  if (from === -1) return;
  const target = slots[(from + direction + slots.length) % slots.length];
  if (target.group) target.group.collapsed = false;
  const remembered = rt().lastActiveByCluster.get(target.key);
  setActiveTab(target.tabIds.includes(remembered) ? remembered : target.tabIds[0]);
}

/** Focus an existing tab already on this internal page, or open one. */
function openInternalPage(url) {
  if (isUtilityUrl(url)) return showUtilityPage(url);
  const existing = rt().tabOrder.find((id) => tabs.get(id)?.url?.startsWith(url));
  const tab = existing ? tabs.get(existing) : null;
  if (tab) {
    setActiveTab(existing);
    // Hold the tab from the lookup rather than fetching it again. Re-fetching
    // was safe only because setActiveTab happens not to mutate `tabs` — the
    // same unstated assumption that crashed the menu rebuild.
    // The selected internal page is being navigated anyway. Give a quiet tab
    // the target as its first load rather than restore-then-reload.
    if (tab.asleep) wakeTab(existing, { navigateTo: url }).catch(() => {});
    else liveContents(tab)?.reload(); // pick up fresh data
  } else {
    setActiveTab(createTab(url));
  }
}

function toggleBookmarkForActiveTab() {
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
  if (!tab || tab.private || !/^https?:\/\//.test(tab.url)) return;
  tab.bookmarked = bookmarks.toggleBookmark(tab.url, tab.title, tab.favicon);
  broadcastTabs();
  scheduleMenuRebuild();
}

/** The `/save [folder]` command: add-only favorite of the active tab, into an
 * optional folder. Same guards as toggleBookmarkForActiveTab; re-derives
 * bookmarked from the store so add / move / rejected-folder all report right. */
function saveActiveTabAsFavorite(folder) {
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
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
  for (const id of rt().tabOrder) {
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
  broadcastTabs();
  scheduleMenuRebuild();
}

const ZOOM_STEP = 0.5;
const ZOOM_MIN = -8;
const ZOOM_MAX = 8;

/** Zoom acts on what the user is looking at: the sheet when open, else the active tab. */
function zoomTargetWebContents() {
  if (rt().utilitySheetUrl && rt().utilitySheetView) return rt().utilitySheetView.webContents;
  return tabs.get(rt().activeTabId)?.view.webContents ?? null;
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
  if (!rt().window || rt().window.isDestroyed()) return;
  showOverlay('find');
}

/** ⌘L opens the expanded island and closes it again. Both expanded states share
 * the pill's anchor, so it doesn't matter which one is up — either way the
 * island is open and the shortcut should put it away. The find capsule is a
 * different surface: summoning search over it replaces it rather than
 * dismissing it, which is what pressing ⌘L there means.
 *
 * Dismissal is the overlay's call, not ours: it owns the address input, and a
 * half-typed query must never be thrown away by the same shortcut that opened
 * it (every mainstream browser re-selects the field instead). Main can't see
 * whether anything was typed, so it hands the decision over. */
function toggleIsland() {
  if (!hasLiveWindow()) return;
  rt().window.focus();
  if (rt().overlayMode === 'panel' || rt().overlayMode === 'palette') {
    rt().overlayView?.webContents.focus();
    rt().overlayView?.webContents.send('overlay:toggle');
    return;
  }
  showOverlay('palette');
}

function focusAddressBar() {
  if (!rt().window || rt().window.isDestroyed()) return;
  // setActiveTab() may just have handed OS-level keyboard focus to the
  // tab's WebContentsView; showOverlay reclaims it for the overlay's
  // webContents so the address input actually receives keystrokes.
  rt().window.focus();
  // Reasserts must not downgrade an already-summoned palette to a panel —
  // nor promote a non-island mode (find, shield) into staying up.
  showOverlay(rt().overlayMode === 'palette' ? 'palette' : 'panel');
}

function shouldReclaimAddressBarFocus(id) {
  return rt().activeTabId === id && rt().tabsWantingAddressBarFocus.has(id);
}

function reclaimAddressBarFocus(id, { consume = false } = {}) {
  if (!shouldReclaimAddressBarFocus(id)) return;
  // WebContentsView focus can settle after Electron emits focus/navigation
  // callbacks, so reassert once on the next main-process turn as well.
  focusAddressBar();
  setImmediate(() => {
    if (!shouldReclaimAddressBarFocus(id)) return;
    focusAddressBar();
    if (consume) rt().tabsWantingAddressBarFocus.delete(id);
  });
}

function refocusAddressBarIfWanted() {
  if (rt().activeTabId && shouldReclaimAddressBarFocus(rt().activeTabId)) {
    reclaimAddressBarFocus(rt().activeTabId);
  }
}

// The predicate itself lives in ipc-trust.js (pure, unit-tested); this
// wrapper only supplies the live trusted surfaces.
function isTrustedChromeSender(event) {
  return isTrustedSender(event, [
    hasLiveWindow() ? { webContents: rt().window.webContents, url: CHROME_INDEX_URL } : null,
    rt().overlayView && !rt().overlayView.webContents.isDestroyed()
      ? { webContents: rt().overlayView.webContents, url: CHROME_OVERLAY_URL }
      : null,
  ]);
}

function chromeHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    const runtime = windowRuntimes.runtimeForChromeWebContentsId(event.sender.id);
    if (!runtime) {
      // Unregistered surface: either untrusted, or a window mid-close. Never
      // fall back to "whichever window is focused".
      if (!app.isPackaged) console.warn(`[ipc] ${channel}: sender has no runtime`);
      throw new Error(`${channel}: denied for unregistered sender`);
    }
    return windowRuntimeContext.run(runtime, () => {
      if (!isTrustedChromeSender(event)) throw new Error(`${channel}: denied for untrusted sender`);
      return handler(event, ...args);
    });
  });
}

function chromeOn(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    const runtime = windowRuntimes.runtimeForChromeWebContentsId(event.sender.id);
    if (!runtime) {
      if (!app.isPackaged) console.warn(`[ipc] ${channel}: sender has no runtime`);
      return;
    }
    windowRuntimeContext.run(runtime, () => {
      if (!isTrustedChromeSender(event)) {
        console.warn(`[ipc] ${channel}: denied for untrusted sender`);
        return;
      }
      handler(event, ...args);
    });
  });
}

// The two ad-block slash commands live here rather than inline in their IPC
// handlers so the acceptance harness can drive the REAL implementation through
// test-hook.js. A mirrored copy in the hook would leave the shipping handler
// untested — reverting it to a bare global toggle (the bug users hit) kept the
// whole suite green until these were extracted.

/**
 * The site the user is acting on. The tab model's url is main's own source of
 * truth — it is what the pill shows as the domain, and it is set synchronously
 * rather than lagging until the navigation commits the way webContents.getURL()
 * does. Both agree once a page has settled; using the model means the exception
 * these commands write is for the site the user was actually looking at, even
 * if they fire mid-load.
 */
function activeSiteHostname(tab) {
  if (!tab) return null;
  const fromModel = blockableHostname(tab.url);
  if (fromModel) return fromModel;
  try {
    return blockableHostname(tab.view.webContents.getURL());
  } catch {
    return null;
  }
}

/**
 * Reload a tab AFTER the settings write's fan-out, never inside it.
 *
 * settings.setSettings() runs onSettingsChanged synchronously: it re-wires the
 * session's ad-block handlers, reapplies theme/icon/layout, and walks every
 * tab's webContents for the WebRTC policy. Calling reload() on a webContents in
 * that same turn kills the main process outright — EXC_BREAKPOINT on
 * CrBrowserMain, reproducible on roughly a third of attempts. Neither half does
 * it alone: settings writes with no reload survive, and reloading the same view
 * with no settings write survives; only the two in one turn crash. Deferring by
 * a turn lets the fan-out settle first, and costs nothing the user can see —
 * both callers already reload asynchronously from the renderer's point of view.
 */
function reloadTabAfterSettingsFanout(tab) {
  if (!tab?.view) return;
  setImmediate(() => {
    // Re-read webContents inside the deferred turn: closing the tab in that
    // window runs closeTab's wc.close(), after which view.webContents is
    // undefined — dereferencing it here threw an uncaught TypeError that
    // killed the main process. closeTab (see its own `if (wc && ...)` guard)
    // already treats this as nullable; this path did not.
    liveContents(tab)?.reload();
  });
}

/**
 * "/block-ads" — see resolveBlockAdsCommand: on a site "/allow-ads" excepted
 * this re-blocks that site, everywhere else it toggles blocking globally.
 * Either way the active tab reloads, since neither change reaches requests
 * already made or markup already rendered — without it the command looks inert
 * until the user reloads by hand.
 */
function runBlockAdsCommand() {
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
  const current = settings.getSettings();
  const result = resolveBlockAdsCommand({
    hostname: activeSiteHostname(tab),
    exceptions: current.adblockExceptions,
    enabled: current.adblockEnabled,
  });
  settings.setSettings(
    result.action === 'unexcept'
      ? { adblockEnabled: result.enabled, adblockExceptions: result.exceptions }
      : { adblockEnabled: result.enabled }
  );
  reloadTabAfterSettingsFanout(tab);
  // Shield chip/popover state changed — don't wait for the reload's own
  // broadcast to reflect it.
  broadcastTabs();
  return result;
}

/**
 * "/allow-ads" — allow ads on the active tab's site, then reload it so the
 * exception actually takes effect on what's shown. The hostname is normalized
 * the same way the request path matches it, so the exception this writes is the
 * one isExcepted will find (and internal pages, which have no ads to allow, are
 * skipped rather than filed by scheme).
 */
function runAllowAdsCommand() {
  const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
  if (!tab) return null;
  const hostname = activeSiteHostname(tab);
  if (!hostname) return null;
  const { adblockExceptions } = settings.getSettings();
  settings.setSettings({ adblockExceptions: [...adblockExceptions, hostname] });
  reloadTabAfterSettingsFanout(tab);
  // Shield chip/popover state changed — don't wait for the reload's own
  // broadcast to reflect it.
  broadcastTabs();
  return hostname;
}

function registerIpcHandlers() {
  chromeHandle('tabs:create', (_e, url, opts) => {
    const isPrivate = !!opts?.private;
    // A plain new tab is deliberately ungrouped — createTab defaults groupId
    // to null and we intentionally don't pass one. Only window.open/context-
    // menu children inherit the opener's group (see CLAUDE.md → Tab groups);
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
    rt().tabsWantingAddressBarFocus.delete(id);
    if (testSearchNavigationCapture) {
      testSearchSubmission = {
        engine: settings.SEARCH_ENGINES[currentEngine] ? currentEngine : 'duckduckgo',
        query: query.trim(),
        url: target,
      };
      return target;
    }
    if (tab.asleep) return wakeTab(id, { navigateTo: target });
    return liveContents(tab)?.loadURL(target);
  });
  // These commands accept arbitrary ids, so each must account for a quiet
  // tab rather than assuming a WebContentsView exists.
  chromeHandle('tabs:back', (_e, id) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) {
      const snapshot = sleepSnapshots.get(id);
      return wakeTab(id, { atIndex: snapshot ? snapshot.index - 1 : null });
    }
    return liveContents(tab)?.navigationHistory.goBack();
  });
  chromeHandle('tabs:forward', (_e, id) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) {
      const snapshot = sleepSnapshots.get(id);
      return wakeTab(id, { atIndex: snapshot ? snapshot.index + 1 : null });
    }
    return liveContents(tab)?.navigationHistory.goForward();
  });
  chromeHandle('tabs:reload', (_e, id) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) return wakeTab(id);
    return liveContents(tab)?.reload();
  });
  chromeHandle('tabs:stop', (_e, id) => liveContents(tabs.get(id))?.stop());
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
  chromeHandle('tabs:open-page', (_e, name, section) => {
    if (['bookmarks', 'history', 'downloads', 'settings'].includes(name)) {
      // Deep-link into a page section via URL fragment — allowlisted only,
      // never interpolated from renderer-supplied text (privileged URL).
      const fragment = name === 'settings' && section === 'blocking' ? '#group-privacy' : '';
      openInternalPage(`blanc://${name}/${fragment}`);
    }
  });
  chromeHandle('tabs:get-all', () => ({
    tabs: serializeTabs(),
    activeTabId: rt().activeTabId,
    groups: rt().groups,
    tabLayout,
    ...verticalTabsMetrics(),
  }));
  chromeHandle('tabs:find', (_e, id, query, options) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) return wakeTab(id); // find on the rebuilt page, never throw
    return liveContents(tab)?.findInPage(query, options);
  });
  chromeHandle('tabs:find-stop', (_e, id) => liveContents(tabs.get(id))?.stopFindInPage('clearSelection'));

  chromeOn('chrome:island-rect', (_e, rect) => {
    const ok = rect && ['x', 'y', 'width', 'height'].every((f) => Number.isFinite(rect[f]));
    rt().islandRect = ok && rect.width > 0 ? rect : null;
  });

  chromeOn('chrome:layout', (_e, { height }) => {
    if (typeof height === 'number' && height > 0) {
      rt().chromeHeight = height;
      resizeActiveView();
    }
  });

  chromeOn('chrome:open-island', () => showOverlay('panel'));
  chromeOn('chrome:open-find', () => showOverlay('find'));
  chromeOn('chrome:open-shield', (_e, anchor) => {
    const trigger = anchor?.trigger === 'insecure' ? 'insecure' : 'shield';
    if (rt().overlayMode === 'shield') {
      // Same control re-clicked toggles shut. A DIFFERENT control re-anchors —
      // closing there would read as the second button being broken.
      if (trigger === rt().shieldTrigger) return hideOverlay({ refocusContent: false });
      rt().shieldAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
      rt().shieldTrigger = trigger;
      // The bounds must move NOW: updating stored state alone would pass a
      // state assertion while leaving the card visually where it was.
      rt().overlayView.setBounds(overlayBounds());
      rt().window.webContents.send('chrome:island-state', { mode: 'shield', trigger });
      return;
    }
    const popover = activeShieldPopover();
    if (!popover) return; // no blockable host — nothing to show
    rt().shieldPopoverHost = popover.host;
    rt().shieldAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
    rt().shieldTrigger = trigger;
    broadcastTabs(); // fresh state.shieldPopover before the overlay renders
    showOverlay('shield');
  });
  chromeHandle('chrome:open-main-menu', (event, point) => {
    // The rich preload is shared with the overlay, but the visible platform
    // menu button exists only in the strip document. Keep this entry point as
    // narrow as the UI that owns it.
    if (event.sender !== rt().window?.webContents) return false;
    return popupPlatformMainMenu({ Menu, window: rt().window, point });
  });
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
    const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
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
  chromeHandle('chrome:adblock-toggle', () => runBlockAdsCommand());
  chromeHandle('chrome:adblock-exempt-active', () => runAllowAdsCommand());
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

  chromeOn('window:minimize', () => rt().window?.minimize());
  chromeOn('window:maximize', () => (rt().window?.isMaximized() ? rt().window.unmaximize() : rt().window?.maximize()));
  chromeOn('window:close', () => rt().window?.close());
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
  // Resolve to tabs here, once. The rebuild is debounced by 100ms, so
  // clusterSlots() can still name a tab that has since closed — and dropping
  // that id has to happen BEFORE anything reads the tab, or it takes the whole
  // main process down. It did: `tabs.get(id)?.private` let a missing tab
  // through (not private, therefore keep) and the next line dereferenced it.
  const openTabs = clusterSlots()
    .flatMap((slot) => slot.tabIds)
    .map((id) => [id, tabs.get(id)])
    .filter(([, tab]) => tab && !tab.private);
  return openTabs.map(([id, tab]) => {
    const group = tab.groupId ? rt().groups.find((g) => g.id === tab.groupId) : null;
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
      checked: id === rt().activeTabId,
      click: bindWindowRuntime(primaryRuntime, () => setActiveTab(id)),
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
  const open = (b) => ({ label: escapeMenuLabel(label(b)), click: bindWindowRuntime(primaryRuntime, () => setActiveTab(createTab(b.url))) });
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
  ['/block-ads', 'Block ads here, or toggle blocking everywhere'],
  ['/allow-ads', 'Allow ads on this site'],
  ['/theme [system|light|dark]', 'Cycle appearance, or switch directly to system, light, or dark'],
];

// A hand-picked subset of the full inventory (blanc://shortcuts/, via
// listShortcuts()) for a quick reference right in the Help menu — not
// exhaustive by design, "Show All Shortcuts…" links to the rest.
const COMMON_KEYSTROKES = [
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
  // Every native click: handler is wrapped here — Electron invokes menu
  // clicks from outside any JS causality chain our own bound roots created,
  // so each one must re-establish the runtime context at invocation time
  // (same reasoning as the tab-webContents listeners above).
  const bound = (fn) => bindWindowRuntime(primaryRuntime, fn);
  const appMenu = isMac
    ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { label: 'Check for Updates…', click: bound(checkForUpdatesManually) },
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
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: bound(() => setActiveTab(createTab(newTabUrl()), { focusContent: false, focusAddress: true })) },
        { label: 'New Private Tab', accelerator: 'CmdOrCtrl+Shift+N', click: bound(() => setActiveTab(createTab(PRIVATE_NEW_TAB_URL, { private: true }), { focusContent: false, focusAddress: true })) },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: bound(() => rt().activeTabId && closeTab(rt().activeTabId)) },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: bound(reopenClosedTab) },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: bound(() => rt().activeTabId && tabs.get(rt().activeTabId)?.view.webContents.print()) },
        { type: 'separator' },
        ...(isMac ? [] : [{ label: 'Check for Updates…', click: bound(checkForUpdatesManually) }, { type: 'separator' }]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' }, // required for copy/paste/undo to work in inputs
    {
      label: 'View',
      submenu: [
        { label: mn('Search & Commands'), accelerator: 'CmdOrCtrl+L', click: bound(toggleIsland) },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: bound(openFindBar) },
        { label: 'Reload Tab', accelerator: 'CmdOrCtrl+R', click: bound(() => rt().activeTabId && tabs.get(rt().activeTabId)?.view.webContents.reload()) },
        { label: 'Hard Reload Tab (Bypass Cache)', accelerator: 'CmdOrCtrl+Shift+R', click: bound(() => rt().activeTabId && tabs.get(rt().activeTabId)?.view.webContents.reloadIgnoringCache()) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: bound(() => zoomActiveTab(ZOOM_STEP)) },
        // Plus requires Shift on most keyboards; Cmd/Ctrl+= is the common alternate, bound silently to the same action.
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', visible: false, click: bound(() => zoomActiveTab(ZOOM_STEP)) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: bound(() => zoomActiveTab(-ZOOM_STEP)) },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: bound(resetZoomForActiveTab) },
        { type: 'separator' },
        {
          id: 'toggle-vertical-tabs',
          label: 'Toggle Vertical Tabs',
          accelerator: 'CmdOrCtrl+Alt+V',
          click: bound(toggleTabLayout),
        },
        {
          label: 'Tab Layout',
          submenu: [
            {
              label: 'Island',
              type: 'radio',
              checked: tabLayout === 'island',
              click: bound(() => setTabLayout('island')),
            },
            {
              label: 'Vertical Tabs',
              type: 'radio',
              checked: tabLayout === 'vertical',
              click: bound(() => setTabLayout('vertical')),
            },
          ],
        },
        { type: 'separator' },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: bound(() => openInternalPage('blanc://downloads/')) },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: bound(() => openInternalPage('blanc://settings/')) },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: bound(() => cycleTab(1)) },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: bound(() => cycleTab(-1)) },
        { label: 'Next Tab in Group', accelerator: 'Alt+CmdOrCtrl+Right', click: bound(() => cycleTabInCluster(1)) },
        { label: 'Previous Tab in Group', accelerator: 'Alt+CmdOrCtrl+Left', click: bound(() => cycleTabInCluster(-1)) },
        { label: 'Next Group', accelerator: 'Alt+CmdOrCtrl+Down', click: bound(() => cycleCluster(1)) },
        { label: 'Previous Group', accelerator: 'Alt+CmdOrCtrl+Up', click: bound(() => cycleCluster(-1)) },
        { type: 'separator' },
        { label: 'Duplicate Tab', enabled: !!rt().activeTabId, click: bound(() => rt().activeTabId && duplicateTab(rt().activeTabId)) },
        { label: tabs.get(rt().activeTabId)?.pinned ? 'Unpin Tab' : 'Pin Tab', enabled: !!rt().activeTabId, click: bound(() => rt().activeTabId && toggleTabPinned(rt().activeTabId)) },
        { label: tabs.get(rt().activeTabId)?.muted ? 'Unmute Tab' : 'Mute Tab', enabled: !!rt().activeTabId, click: bound(() => rt().activeTabId && toggleTabMuted(rt().activeTabId)) },
        { type: 'separator' },
        {
          label: 'New Group…',
          enabled: !!rt().activeTabId,
          click: bound(() => { if (hasLiveWindow()) { rt().window.focus(); showOverlay('palette', { prefill: '/group ' }); } }),
        },
        {
          label: 'Ungroup Tab',
          enabled: !!tabs.get(rt().activeTabId)?.groupId,
          click: bound(() => rt().activeTabId && setTabGroup(rt().activeTabId, null)),
        },
        {
          label: 'Close Group',
          enabled: !!tabs.get(rt().activeTabId)?.groupId,
          click: bound(() => {
            const groupId = tabs.get(rt().activeTabId)?.groupId;
            if (groupId) closeGroup(groupId);
          }),
        },
        { type: 'separator' },
        // "Tab or Group": with groups these jump to the nth pill cluster.
        ...Array.from({ length: 9 }, (_, i) => ({
          label: i === 8 ? 'Last Tab or Group' : `Tab or Group ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: bound(() => selectTabAtIndex(i)),
        })),
        { type: 'separator' },
        ...tabMenuItems(),
      ],
    },
    {
      label: 'Favorites',
      submenu: [
        {
          label: tabs.get(rt().activeTabId)?.bookmarked ? 'Remove from Favorites' : 'Add to Favorites',
          accelerator: 'CmdOrCtrl+D',
          // Same guard as toggleBookmarkForActiveTab itself — blanc://
          // pages and blank tabs can't be favorited, so don't offer to.
          enabled: /^https?:\/\//.test(tabs.get(rt().activeTabId)?.url ?? ''),
          click: bound(toggleBookmarkForActiveTab),
        },
        {
          label: 'Add All Open Tabs to Favorites',
          enabled: rt().tabOrder.some((id) => {
            const tab = tabs.get(id);
            return tab && !tab.private && /^https?:\/\//.test(tab.url) && !bookmarks.isBookmarked(tab.url);
          }),
          click: bound(addAllTabsToFavorites),
        },
        { type: 'separator' },
        ...favItems,
        // Only divide the favorites list from Show Favorites when there ARE
        // favorites — otherwise the two separators would collapse into one gap.
        ...(favItems.length ? [{ type: 'separator' }] : []),
        { label: 'Show Favorites', accelerator: isMac ? 'Cmd+Alt+B' : 'Ctrl+Shift+O', click: bound(() => openInternalPage('blanc://bookmarks/')) },
        { label: 'Show History', accelerator: 'CmdOrCtrl+Y', click: bound(() => openInternalPage('blanc://history/')) },
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
            { label: 'Show All Shortcuts…', accelerator: 'CmdOrCtrl+/', click: bound(() => openInternalPage('blanc://shortcuts/')) },
          ],
        },
        ...(isMac ? [] : [
          { type: 'separator' },
          { label: 'About Blanc', click: bound(() => showAboutPanel({ app })) },
        ]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Bound to primaryRuntime at its own entry point (not just via the callers'
// context) — macOS dock-reopen invokes this from an 'activate' handler whose
// own binding is a later task's concern, and this function must not depend
// on that ordering to establish the runtime context it and createOverlay()
// rely on.
const createMainWindow = bindWindowRuntime(primaryRuntime, function createMainWindow() {
  // Packaged Windows builds inherit the multi-resolution icon embedded in
  // Blanc.exe. Unpackaged development needs the same icon supplied explicitly
  // because its executable is Electron.exe.
  const windowIcon = windowsDevelopmentIconPath({ app });
  const newWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: chromeBackgroundColor(),
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRuntimes.attachWindow(primaryRuntime, { window: newWindow });
  windowRuntimes.registerChromeSurface(primaryRuntime, newWindow.webContents.id);
  // The strip's own 64px band. Its document IS the window, so no offset.
  watchCursorFor(newWindow.webContents, { x: 0, y: 0 },
    (fn) => bindWindowRuntime(primaryRuntime, fn));

  lockPrivilegedNavigation(rt().window.webContents, CHROME_INDEX_URL);
  installChromeShortcuts(rt().window.webContents);
  rt().window.loadFile(CHROME_INDEX_FILE);
  createOverlay();
  rt().window.on('resize', bindWindowRuntime(primaryRuntime, resizeActiveView));
  rt().window.on('focus', bindWindowRuntime(primaryRuntime, refocusAddressBarIfWanted));
  rt().window.on('closed', bindWindowRuntime(primaryRuntime, () => {
    const runtime = primaryRuntime;
    // Destroy the views the window owned — detachWindow only forgets them.
    if (runtime.overlayView && !runtime.overlayView.webContents.isDestroyed()) {
      runtime.overlayView.webContents.close();
    }
    if (runtime.utilitySheetView && !runtime.utilitySheetView.webContents.isDestroyed()) {
      runtime.utilitySheetView.webContents.close();
    }
    windowRuntimes.detachWindow(runtime);
    // The detached favicon rasterizer view isn't a BrowserWindow, so it would
    // otherwise linger past the last window (blocking `window-all-closed` quit
    // on Windows/Linux). Recreated lazily on the next non-PNG capture.
    iconRaster.dispose();
    flushPermissionPrompts(runtime);
  }));

  // Tabs survive window close (macOS dock-reopen recreates the window);
  // re-attach the active tab's view or the new window sits over nothing.
  // First launch has no activeTabId yet — app.whenReady handles that one.
  rt().window.webContents.once('did-finish-load', bindWindowRuntime(primaryRuntime, () => {
    if (!rt().activeTabId || !tabs.has(rt().activeTabId)) return;
    const id = rt().activeTabId;
    rt().activeTabId = null; // force setActiveTab to treat it as a fresh attach
    setActiveTab(id);
    // An 'open-url' with no window queues; opening it is why the window
    // was recreated (macOS dock-reopen path).
    flushExternalUrls();
  }));
});

// Re-apply the current WebRTC policy to every open tab (used when the setting changes).
function applyWebrtcPolicyToAllTabs() {
  const policy = webrtcPolicyFor(settings.getSettings().webrtcPolicy);
  for (const tab of tabs.values()) {
    liveContents(tab)?.setWebRTCIPHandlingPolicy(policy);
  }
}

// Last-applied encrypted-DNS values, so onSettingsChanged only reconfigures the
// resolver + clears its cache when DNS actually changes — the listener fires on
// every settings write, and clearing the cache mid-session isn't free.
let lastSecureDns = null;
let lastSecureDnsTemplate = null;

app.whenReady().then(bindWindowRuntime(primaryRuntime, async () => {
  if (await runPackageProbeIfRequested()) return; // SPIKE — headless 3(a); app.exit() already fired
  const ses = session.defaultSession;
  const privateSes = getPrivateBrowsingSession();
  const browsingSessions = [ses, privateSes];
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
    getParentWindow: bindWindowRuntime(primaryRuntime, () => (hasLiveWindow() ? rt().window : null)),
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
        // Compose with the Client Hints handler rather than registering a
        // second listener: Electron allows one listener per webRequest event.
        // A POST result is not safely refetchable, so retain the method until
        // did-navigate can decide whether the commit is restorable.
        if (details.resourceType === 'mainFrame' && Number.isInteger(details.webContentsId)) {
          lastMainFrameMethod.set(details.webContentsId, details.method);
        }
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
  nativeTheme.on('updated', bindWindowRuntime(primaryRuntime, handleNativeThemeUpdated));

  setupPermissionPolicy(ses);
  setupPermissionPolicy(privateSes, { persistDecisions: false });
  let permissionPromptCounter = 0;
  // Resolve the tab owning a requesting webContents through the maintained
  // index — never by walking `tabs` and dereferencing each view.
  function tabForWebContents(wc) {
    if (!wc) return null;
    return tabs.get(tabIdByWebContentsId.get(wc.id)) ?? null;
  }
  // Resolve null when there's no window to ask through — the policy treats
  // null as "not answered" and denies for now WITHOUT persisting, so a
  // transient no-window moment can't permanently block a site.
  setPermissionPrompter(({ origin, permission, mediaTypes, requestingWebContents }) =>
    new Promise((resolve) => {
      const tab = tabForWebContents(requestingWebContents);
      // Managed tabs resolve first; a real window.open popup child (never a
      // managed tab — see did-create-window above) falls through to the
      // auxiliary-content map registered for permission prompting only.
      const owner = tab
        ? windowRuntimes.runtimeForTab(tab.id)
        : windowRuntimes.runtimeForAuxiliaryContent(requestingWebContents?.id);
      // An unresolvable requester is DENIED (null = not answered, never
      // persisted), never rerouted — under M2 a fallback could reach the
      // wrong window's chrome.
      if (!owner) return resolve(null);
      if (!owner.window || owner.window.isDestroyed()) return resolve(null);
      const promptId = ++permissionPromptCounter;
      // A quiet sweep excludes tabs with a prompt open: responding after the
      // renderer is gone would persist a decision for a page the user cannot see.
      owner.permissionPrompts.set(promptId, { resolve, tabId: tab?.id ?? null });
      owner.window.webContents.send('permissions:prompt', { id: promptId, origin, permission, mediaTypes });
    })
  );
  chromeOn('permissions:respond', (_e, { id, allow }) => {
    const sender = rt(); // the sender's runtime, established by chromeOn
    const pending = sender.permissionPrompts.get(id);
    if (!pending) return; // wrong window's chrome, or a stale prompt — ignore
    sender.permissionPrompts.delete(id);
    pending.resolve(!!allow);
  });

  // downloads.js invokes this from its own session/DownloadItem listeners —
  // a native event boundary main.js doesn't control — so the callback must
  // rebind the runtime itself rather than rely on setupDownloads' call site.
  const boundBroadcastDownloadsActivity = bindWindowRuntime(primaryRuntime, broadcastDownloadsActivity);
  setupDownloads(ses, boundBroadcastDownloadsActivity);
  setupDownloads(privateSes, boundBroadcastDownloadsActivity);
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
      if (!tab.url?.startsWith('blanc://newtab')) continue;
      liveContents(tab)?.send('pages:start:status', status);
    }
  };
  // pages.js's ipcMain.handle('pages:*', ...) registrations are a wholly
  // separate, unbound native IPC surface from chromeOn/chromeHandle above —
  // every hook function handed in here is invoked from there, so each one
  // must rebind the runtime itself.
  const refreshBookmarkFlagsBound = bindWindowRuntime(primaryRuntime, refreshBookmarkFlags);
  setupPages({
    sessions: browsingSessions,
    onDataChanged: refreshBookmarkFlagsBound,
    // Parent for the favorites-import file dialog (evaluated lazily at click).
    getMainWindow: bindWindowRuntime(primaryRuntime, () => (hasLiveWindow() ? rt().window : undefined)),
    // Utility sheet: only the sheet view itself may close the sheet — the
    // strict pages:surface:close guard verifies the sender against this.
    utilitySheet: {
      isSheetSender: bindWindowRuntime(primaryRuntime, (wc) => !!rt().utilitySheetView && wc === rt().utilitySheetView.webContents),
      close: bindWindowRuntime(primaryRuntime, () => hideUtilitySheet()),
    },
    // The start page's ledger sections read live tab-group state and the
    // rolling blocked counter, both owned here.
    startPage: {
      // Mirror persistSession's rule: private tabs — and groups only they
      // hold — never surface on a start page.
      groups: bindWindowRuntime(primaryRuntime, () => clusterList()
        .filter((c) => c.group)
        .map(({ group, tabIds }) => ({
          id: group.id,
          name: group.name,
          count: tabIds.filter((id) => !tabs.get(id)?.private).length,
        }))
        .filter((g) => g.count > 0)),
      focusGroup: bindWindowRuntime(primaryRuntime, focusGroup),
      blockedThisWeek: bindWindowRuntime(primaryRuntime, () => adblockWeekStats().data.blocked),
      remoteDevices: bindWindowRuntime(primaryRuntime, () => sync.listRemoteDevices()),
      status: bindWindowRuntime(primaryRuntime, startPageStatus),
      retryAdblock: bindWindowRuntime(primaryRuntime, () => adblockStartupController?.retry() ?? startPageStatus().startup),
      continueWithoutAdblock: bindWindowRuntime(primaryRuntime, () =>
        adblockStartupController?.continueWithoutBlocking() ?? startPageStatus().startup),
      completePrivacy: bindWindowRuntime(primaryRuntime, (choices) => {
        const result = settings.completeFirstRunPrivacyChoices(choices);
        if (result.completed) {
          maybeSendLaunchPing();
          broadcastStartPageStatus();
        }
        return { completed: result.completed, error: result.error ?? null };
      }),
    },
    // listShortcuts() reads only the live Electron application menu — no
    // runtime-owned state — so this one hook is left unwrapped.
    shortcuts: { list: listShortcuts },
  });

  // The acceptance harness launches offline: skip the network ad-engine build
  // and install the test-only main-process surface instead. Gate is airtight — only an
  // UNPACKAGED dev run with BLANC_TEST exactly "1"; never a packaged build, and
  // BLANC_TEST=0/false stays off.
  if (acceptanceTestMode) {
    require('./test-hook').install({
      // Playwright calls globalThis.__blanc.* from OUTSIDE any ALS context
      // (electronApp.evaluate() reaches straight into the main process) —
      // test-hook.js wraps every installed method with this at install time.
      bindRoot: (fn) => bindWindowRuntime(primaryRuntime, fn),
      tabs, getTabOrder: () => rt().tabOrder, getGroups: () => rt().groups, getActiveTabId: () => rt().activeTabId, clusterSlots,
      createTab, setActiveTab, closeTab, duplicateTab, toggleTabPinned, toggleTabMuted,
      groupTabByName, toggleGroupCollapsed, reorderTabWithinBucket, reopenClosedTab, newTabUrl,
      setTabLayout, setVerticalTabsWidth, broadcastTabs,
      getVerticalTabsMetrics: () => hasLiveWindow() ? verticalTabsMetrics() : null,
      getRailActivationSerial: () => rt().railActivationSerial,
      normalizeAddressInput, pasteAndGo, handoffProtocols: HANDOFF_PROTOCOLS, openInternalPage, openFindBar,
      runBlockAdsCommand, runAllowAdsCommand,
      getOverlayMode: () => rt().overlayMode, showOverlay, hideOverlay, getPrivateBrowsingSession,
      showUtilityPage, hideUtilitySheet,
      getUtilitySheetState: () => ({ visible: !!rt().utilitySheetUrl, url: rt().utilitySheetUrl }),
      getUtilitySheetWebContents: () => rt().utilitySheetView?.webContents ?? null,
      getOverlayWebContents: () => rt().overlayView?.webContents ?? null,
      getChromeWebContents: () => rt().window?.webContents ?? null,
      setWindowContentSize: (width, height) => {
        if (!hasLiveWindow()) return;
        rt().window.setContentSize(width, height);
        resizeActiveView();
      },
      getWindowContentBounds: () => hasLiveWindow() ? rt().window.getContentBounds() : null,
      getUtilitySheetBounds: () => rt().utilitySheetView?.getBounds() ?? null,
      getOverlayBounds: () => rt().overlayView?.getBounds() ?? null,
      setTestSearchSuggestionFixture,
      clearTestSearchSuggestionFixture,
      getTestSearchSuggestionRequests: () => structuredClone(testSearchSuggestionRequests),
      setTestSearchNavigationCapture,
      getTestSearchSubmission: () => structuredClone(testSearchSubmission),
      attemptChromeNavigation: (url) => rt().window?.webContents.executeJavaScript(
        `location.href = ${JSON.stringify(String(url))}`
      ),
      getChromeUrl: () => rt().window?.webContents.getURL() ?? '',
      serializedTabsPayload: () => JSON.parse(JSON.stringify(serializeTabs())),
      sleepTab, wakeTab, runSleepSweep,
      getSleepSnapshots: () => sleepSnapshots,
      setSleepThresholdOverride: (ms) => {
        sleepThresholdOverrideMs = Number.isFinite(ms) && ms >= 0 ? Number(ms) : null;
        return sleepThresholdOverrideMs;
      },
    });
  }

  initSpikePackaging(); // SPIKE (1Password fill feasibility) — fire-and-forget, gated on BLANC_1P_SPIKE

  // One bound 30-second sweep. Both setInterval and setImmediate cross an
  // AsyncLocalStorage boundary; bind both so rt() remains the primary runtime.
  // The immediate also ensures a sweep never runs synchronously in a settings
  // fan-out turn, where WebContents lifecycle work is unsafe.
  setInterval(bindWindowRuntime(primaryRuntime, () => {
    setImmediate(bindWindowRuntime(primaryRuntime, () => {
      runSleepSweep().catch((err) => console.warn('[quiet-tabs] sweep:', err?.message));
    }));
  }), SLEEP_SWEEP_INTERVAL_MS);

  powerMonitor.on('resume', bindWindowRuntime(primaryRuntime, () => {
    // Machine sleep is not user idle. Avoid a simultaneous wake-time sweep.
    lastSleepSweepAt = Date.now();
    restampBackgroundTabs();
  }));

  // Per-tab blocked-request counter. `request.tabId` is the webContents id
  // of the frame the request came from. adblock.js's eventBridge fires this
  // from the network layer — not from any of our own bound roots.
  onRequestBlocked(bindWindowRuntime(primaryRuntime, (request) => {
    adblockWeekStats().update((d) => { d.blocked += 1; });
    const tab = tabs.get(tabIdByWebContentsId.get(request.tabId));
    if (!tab) return;
    tab.blockedCount += 1;
    scheduleBroadcastTabs();
  }));

  // Settings fan-out: settings.js calls every registered listener synchronously
  // from setSettings()/etc, which can be reached from pages.js's OWN unbound
  // 'pages:settings:set' IPC handler — not only from already-bound callers here.
  settings.onSettingsChanged(bindWindowRuntime(primaryRuntime, (s) => {
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
  }));

  // Live tab state for tab sync's snapshot builder. Must be registered
  // before sync.init() so the launch sync can publish. sync.js/tabicons.js
  // pull this provider from their own timers/session flows — bind it here
  // rather than trust every possible caller to already be bound.
  tabsync.setSnapshotProvider(bindWindowRuntime(primaryRuntime, () => ({
    tabList: rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean),
    groups: rt().groups,
  })));
  tabicons.setSnapshotProvider(bindWindowRuntime(primaryRuntime, () => ({
    tabList: rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean),
  })));
  // A pull changed the cached device map: push the fresh list to the open
  // surfaces (overlay panel; any tab currently on the start page).
  const pushRemoteDevices = bindWindowRuntime(primaryRuntime, () => {
    const devices = sync.listRemoteDevices();
    rt().overlayView?.webContents.send('chrome:remote-tabs-updated', devices);
    for (const tab of tabs.values()) {
      if (!tab.url?.startsWith('blanc://newtab')) continue;
      liveContents(tab)?.send('pages:start:remote-tabs', devices);
    }
  });
  tabsync.onRemoteChanged(pushRemoteDevices);
  tabicons.onRemoteChanged(pushRemoteDevices);
  // Profile sync: sync-on-launch if configured, then follow local changes.
  // Runs after stores + setupPages so its triggers see a live app; failures
  // are swallowed and surfaced only in Settings (never block startup).
  sync.init();
  // Freshness pull when Blanc regains focus (tab-sync spec §6; throttled inside).
  app.on('browser-window-focus', bindWindowRuntime(primaryRuntime, () => sync.refreshSession()));
  // Best-effort final push — fire-and-forget, never blocks quit (spec §6).
  app.on('before-quit', bindWindowRuntime(primaryRuntime, () => { sync.syncNow().catch(() => {}); }));
  // A sync pull that merged in favorites from another device refreshes the
  // pill's favorite state; open internal pages still pull on their next load,
  // as with any cross-surface bookmark change.
  bookmarks.onMerged(refreshBookmarkFlagsBound);

  // HTTP basic/digest auth: without this handler, 401-protected sites
  // (routers, staging servers) simply fail.
  app.on('login', bindWindowRuntime(primaryRuntime, (event, _wc, _details, authInfo, callback) => {
    event.preventDefault();
    promptForCredentials(hasLiveWindow() ? rt().window : null, authInfo).then((creds) => {
      if (creds) callback(creds.username, creds.password);
      else callback(); // no args = cancel the request
    });
  }));

  registerIpcHandlers();
  buildMenu();

  // Snapshot the previous session before the local startup tab exists. Tab
  // broadcasts are temporarily prevented from overwriting this snapshot.
  const { windows, readOnly } = loadWorkspace(ensureSessionStore().data);
  sessionReadOnly = readOnly;
  const saved = windows[0];
  const cleaned = filterRestoredSession(saved, isUtilityUrl);
  saved.urls = cleaned.urls;
  saved.groupIds = cleaned.groupIds;
  saved.pinned = cleaned.pinned;
  saved.meta = cleaned.meta;
  saved.activeIndex = cleaned.activeIndex;
  rt().groups = (Array.isArray(saved.groups) ? saved.groups : [])
    .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
    .map((g) => ({ id: g.id, name: g.name, collapsed: !!g.collapsed }));
  sessionPersistenceSuspended = true;

  const blockingRequested =
    !acceptanceTestMode && settings.getSettings().adblockEnabled;
  if (blockingRequested) installStartupNavigationGate(browsingSessions);

  createMainWindow();
  const startupTabId = createTab(NEW_TAB_URL);
  const chromeReady = new Promise((resolve) => {
    rt().window.webContents.once('did-finish-load', bindWindowRuntime(primaryRuntime, () => {
      if (tabs.has(startupTabId)) {
        // Keep focus in the local page so first-run/recovery actions are
        // immediately visible and keyboard reachable.
        setActiveTab(startupTabId, { focusContent: true });
      }
      resolve();
    }));
  });

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

    const restoredIds = saved.urls.map((url, index) => createTab(url, {
      groupId: saved.groupIds?.[index] ?? null,
      pinned: !!saved.pinned?.[index],
    }));
    pruneEmptyGroups();
    if (restoredIds.length) {
      const target = restoredIds[
        Math.min(Math.max(0, saved.activeIndex), restoredIds.length - 1)
      ];
      if (tabs.has(startupTabId)) closeTab(startupTabId);
      setActiveTab(target, { focusContent: true });
    }

    sessionPersistenceSuspended = false;
    persistSession();

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
        if (state.phase === 'failed' && tabs.has(startupTabId)) {
          setActiveTab(startupTabId, { focusContent: true });
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

  app.on('activate', bindWindowRuntime(primaryRuntime, () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    refocusAddressBarIfWanted();
  }));
}));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
