const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, nativeTheme, nativeImage, dialog, shell, net, powerMonitor, webContents, clipboard, utilityProcess, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { installMacOSQuitVisibilityGate } = require('./macos-quit');

// Electron's default uncaught-exception path raises a native modal dialog,
// which can leave the acceptance runner reporting green while app.close()
// waits behind an invisible main-process failure. Test runs record the exact
// stack in their throwaway profile instead; the parent harness turns any entry
// into a failed scenario. Production keeps Electron's ordinary crash handling.
if (process.env.BLANC_TEST === '1' && process.env.BLANC_TEST_UNCAUGHT_LOG) {
  process.on('uncaughtException', (error, origin) => {
    try {
      fs.appendFileSync(
        process.env.BLANC_TEST_UNCAUGHT_LOG,
        `${origin || 'uncaughtException'}\n${error?.stack || error}\n\n`,
        { encoding: 'utf8', mode: 0o600 }
      );
    } catch {}
    // Continuing after an uncaught main-process exception is unsafe. The
    // synchronous record above is the only cleanup this test process needs;
    // exit without Electron's modal error dialog so the harness can report it.
    process.exit(1);
  });
}

installMacOSQuitVisibilityGate({ app, BrowserWindow });
const {
  setupAdBlocker,
  attachAdBlockerToSession,
  setAdBlockEnabled,
  onRequestBlocked,
} = require('./adblock');
const { blockableHostname, resolveBlockAdsCommand } = require('./adblock-exceptions');
const islandProximity = require('./island-proximity');
const {
  recordActivation,
  previousSurvivor,
  previousActiveSurvivor,
} = require('./tab-activation');
const {
  shieldChipState, shieldPopoverModel, connectionFor, committedUrlOf, activeConnection,
} = require('./shield-model');
const {
  sanitizeCertificate,
  createCertificateObserver,
  buildSiteInfo,
  certificateErrorQuery,
} = require('./site-security');
const { webrtcPolicyFor, hostResolverOptionsFor } = require('./network-privacy');
const {
  WEBRTC_AUDIO_BUFFER_GET_CHANNEL,
  sendWebrtcAudioBufferMode,
} = require('./webrtc-audio-buffer');
const { createNativeMediaAccessGate } = require('./native-media-access');
const {
  chromeClientHintPlatform,
  chromeClientHintArchitecture,
  chromeClientHintBitness,
  chromeClientHintPlatformVersion,
} = require('./chrome-client-hints');
const { registerPagesScheme, setupPages } = require('./pages');
const {
  CHROME_PARTITION,
  CHROME_INDEX_URL,
  CHROME_OVERLAY_URL,
  CHROME_PERMISSION_URL,
  CHROME_FILL_STATUS_URL,
  setupChromeProtocol,
} = require('./chrome-protocol');
const { setupPermissionPolicy, setPermissionPrompter, setCaptureGrantObserver, setPermissionDecisionObserver, mediaQueryState, setHeldRequesterCheck } = require('./permissions');
const nativeMediaAccess = createNativeMediaAccessGate({
  platform: process.platform,
  systemPreferences,
});
const nativeMediaPermissionOptions = {
  requestNativeMediaAccess: nativeMediaAccess.request,
  nativeMediaAccessState: nativeMediaAccess.state,
};
const { setupAutoUpdater, checkForUpdatesManually } = require('./updater');
const {
  sendLaunchPing,
  sendMahjongPlay,
  sendNewtabLayoutUsed,
  productUsageAllowed,
} = require('./telemetry');
const diagnostics = require('./diagnostics');
const sync = require('./sync');
const tabsync = require('./tabsync');
const tabicons = require('./tabicons');
const iconRaster = require('./icon-raster');
const { sanitizeFavicon } = require('./favicon-sanitizer');
const {
  resolvedFavicon,
  shouldClearFaviconOnNavigate,
  updateFaviconAfterDomReady,
} = require('./favicon-policy');
const { effectiveTabMuted, revealTabAudio } = require('./tab-audio');
const { validFavicon } = require('./bookmark-validate');
const {
  setupDownloads,
  downloadsActivity,
  acknowledgeDownloads,
  discardProfileDownloads,
} = require('./downloads');
const { attachAddressMenu } = require('./address-menu');
const { installDockMenu } = require('./dock-menu');
const { createDockReopenLifecycle } = require('./dock-reopen');
/** Handle from installDockMenu ({ update }); null until app-ready (macOS). */
let dockMenuHandle = null;
const { closableTabIds, pickSurvivorTabId } = require('./tab-context-menu-model');
const { attachChromeMenu, attachRowMenu } = require('./tab-context-menu');
const { attachWorkspaceRowMenu } = require('./workspace-context-menu');
const { promptForCredentials } = require('./auth-dialog');
const settings = require('./settings');
const patron = require('./patron');
const bookmarks = require('./bookmarks');
const { groupFavoritesForMenu, mayWriteFavoriteFavicon } = require('./bookmark-data');
const history = require('./history');
const { siteKey: topSiteKey } = require('./top-sites');
const { JsonStore, discardProfileStoreEntries } = require('./store');
const { persistableEntries, sessionTabMeta } = require('./session-snapshot');
const {
  PRIMARY_WINDOW_ID,
  loadWorkspace,
  buildSaveShape,
  removeProfileWorkspaces,
} = require('./session-workspace');
const {
  RECOVERY_WINDOW_ID,
  freshRecoveryWindow,
  recoveryHostWindow,
  summarizeRecoveryWindows,
  validRecoveryChoice,
} = require('./session-recovery');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');
const localProfiles = require('./local-profiles');
const profileDeletions = require('./profile-deletions');
const {
  withLocalProfile,
  setFocusedLocalProfile,
} = require('./local-profile-context');
const { filterRestoredSession, restoreTargetId } = require('./session-restore');
const { UTILITY_PAGES, isUtilityUrl } = require('./utility-pages');
const {
  sleepCandidates,
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
} = require('./tab-sleep');
const adblockStats = require('./adblock-stats');
const {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport,
  projection: captureProjection, clearRecord: clearCaptureRecord,
} = require('./capture-state');
const { hasExclusiveRenderer, hasBeforeUnloadListener } = require('./renderer-discard');
const {
  createTabView,
  wireTabView,
  unwireTabView,
  initTabView,
  liveContents,
  liveViewContents,
  TAB_WEB_PREFERENCES,
  configureProfileSessions,
  getPrivateBrowsingSession,
} = require('./tab-view');
const { createProfileSessionRegistry } = require('./profile-sessions');
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
  calculateCaptureBounds,
} = require('./chrome-layout');
const {
  DEFAULT_GLANCE_RATIO,
  calculateGlanceLayout,
  ratioForGlanceDivider,
} = require('./glance-layout');
const { reorderWithinBucket } = require('./tab-order');
const {
  installPlatformMainMenuShortcut,
  popupPlatformMainMenu,
} = require('./platform-main-menu');
const { showAboutPanel } = require('./about-panel');
const { externalUrlActivationPlan, webUrlsFromArgv } = require('./startup-urls');
const { bringExternalWindowToFront } = require('./window-activation');
const { isForbiddenTopLevelUrl } = require('./top-level-url-policy');
const { createOnePasswordClient } = require('./onepassword-client');
const { isOnePasswordAvailable } = require('./onepassword-availability');
const { createCredentialFillController } = require('./credential-fill-controller');
const { createFillStatusSurface } = require('./fill-status-surface');
const { pickerAnchorPoint, parseWebUrl: parseOnePasswordWebUrl, FILL_WORLD_ID } = require('./onepassword-policy');
const { buildHintProbeScript, configTransition, createFillHintScheduler } = require('./fill-hint');
const { FILL_KINDS, MODES: FILL_MODES, FILL_COPY } = require('./fill-status-kinds');
const {
  holdEligibility, sanitizeSnapshot, buildTabEntry, buildGroupEntry, buildBatchEntry,
  expireHolds, expireEntries, projectEntries, CLOSED_GRACE_MS, CLOSED_ENTRY_TTL_MS,
  MAX_CLOSED_ENTRIES,
} = require('./closed-tabs');
// The profile-scoped Named Workspaces store and its pure decision model
// (single-window binding, resolveOpen). See the "Named Workspaces" section
// below (near closeGroup) for the capture/apply/switch seams that use them.
const namedWorkspaces = require('./workspaces');
const {
  resolveOpen, scratchSwitchGuardResult, bindingsAfterSwap, bindingsAfterUnbind, bindingsAfterDelete,
} = require('./workspaces-model');

// The SDK never loads in main. The first production release is macOS-only;
// unsupported platforms do not even create the lazy client, so no command can
// fork a credential broker there. On macOS the Plugin utility process still
// starts only after an explicit Fill command reaches the controller below.
const ONE_PASSWORD_AVAILABLE = isOnePasswordAvailable();
const onePasswordBroker = ONE_PASSWORD_AVAILABLE
  ? createOnePasswordClient({ utilityProcess })
  : null;

const NEW_TAB_URL = 'blanc://newtab/';
const newTabUrl = () => settings.getSettings().homePage || NEW_TAB_URL;
// The query flag tells the newtab page to show private copy + theme.
const PRIVATE_NEW_TAB_URL = 'blanc://newtab/?private=1';
const certificateObserver = createCertificateObserver();
// Exact, unpackaged-only gate for the Electron acceptance harness. A stray
// BLANC_TEST=0/false in a real launch must not weaken normal chrome behavior.
const acceptanceTestMode = !app.isPackaged && process.env.BLANC_TEST === '1';
// Test-only: the most recent forced fill decision's resolution, so the
// acceptance keyboard scenarios can assert WHICH verb a real keypress
// produced. Written solely by showFillStatusForTest's continuation.
let testFillStatusOutcome = null;

const { AsyncLocalStorage } = require('node:async_hooks');
const windowRuntimes = require('./window-runtime-registry');
const { isValidPrefillChar } = require('./island-typing');

// The owning window-runtime for the current async execution — set by
// bindWindowRuntime at every event registration and sanctioned root, carried
// through timers and late callbacks by AsyncLocalStorage.
const windowRuntimeContext = new AsyncLocalStorage();

/** The primary runtime survives a macOS dock close. Secondary runtimes are
 * discarded when their native window closes. */
let primaryRuntime = null;
let focusedRuntime = null;
let profileSessionRegistry = null;
let installProfileSessionPolicies = () => {};

/** Wrap a callback so it (and everything it schedules) resolves to `runtime`. */
function bindWindowRuntime(runtime, fn) {
  return (...args) => withLocalProfile(
    runtime?.profileId ?? DEFAULT_PROFILE_ID,
    () => windowRuntimeContext.run(runtime, () => fn(...args))
  );
}

/** The runtime owning the current execution. Native and IPC entry points bind
 * their owner explicitly; the focused fallback is only for legacy production
 * roots that cannot identify a sender. Acceptance stays strict. */
function currentRuntime() {
  const bound = windowRuntimeContext.getStore();
  if (bound) return bound;
  if (acceptanceTestMode) {
    throw new Error('currentRuntime() outside any bindWindowRuntime scope');
  }
  return focusedRuntime ?? primaryRuntime;
}

/** Terse accessor for per-window state. Every former module global reads
 * through here, which is what makes the ownership boundary greppable. */
const rt = currentRuntime;

// The runtime must exist before app.whenReady does anything — later sweeps
// make createOverlay() and the IPC trust path read currentRuntime(), and both
// run from startup contexts.
primaryRuntime = windowRuntimes.createRuntime({ id: PRIMARY_WINDOW_ID });
focusedRuntime = primaryRuntime;

function withWindowRuntime(runtime, work) {
  if (!runtime) return undefined;
  return withLocalProfile(
    runtime.profileId,
    () => windowRuntimeContext.run(runtime, work)
  );
}

function forEachWindowRuntime(work, { liveOnly = false } = {}) {
  for (const runtime of windowRuntimes.all()) {
    if (liveOnly && (!runtime.window || runtime.window.isDestroyed())) continue;
    withWindowRuntime(runtime, () => work(runtime));
  }
}

function runtimeForPageWebContents(wc) {
  if (!wc) return null;
  const tabId = tabIdByWebContentsId.get(wc.id);
  if (tabId) return windowRuntimes.runtimeForTab(tabId);
  // Utility sheets are trusted internal-page surfaces, but deliberately NOT
  // registered as chrome surfaces: doing so would confer the rich tabs/window
  // IPC namespace on their narrow tab-preload bridge.
  for (const runtime of windowRuntimes.all()) {
    if (liveViewContents(runtime.utilitySheetView) === wc) return runtime;
  }
  return windowRuntimes.runtimeForChromeWebContentsId(wc.id);
}

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

// One production instance per profile: a second launch defers to the first.
// The unpackaged acceptance harness already has a unique userData directory;
// do not let a running installed Blanc make isolated test launches impossible.
// acceptanceTestMode is airtight (`!app.isPackaged && BLANC_TEST === '1'`).
if (!(acceptanceTestMode || app.requestSingleInstanceLock())) {
  app.quit();
} else {
  diagnostics.start();
  app.on('second-instance', (_e, commandLine) => {
    const runtime = focusedRuntime ?? primaryRuntime;
    withWindowRuntime(runtime, () => {
      openExternalUrls(urlsFromArgv(commandLine));
      if (rt().window && !rt().window.isDestroyed()) {
        bringExternalWindowToFront(app, rt().window);
      }
    });
  });

  // Chrome-extension support used to live here (electron-chrome-extensions
  // + web store, plus crash-loop recovery for extension profile state). It
  // was removed: the password managers it existed for are blocked from
  // working in any non-allowlisted browser at the OS/vendor level, and the
  // extension runtime was the app's main source of hard crashes. Leftover
  // extension profile state from older versions is cleared below. (The
  // profile's 'Service Worker' dir is left alone — it also holds ordinary
  // websites' service workers, and with no extension runtime a stale
  // extension worker registration in there is inert.) The separate opt-in
  // 1Password SDK integration does not restore an extension runtime: its
  // native bridge is isolated in one utility process and runs only on Fill.
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

function maybeSendProductUsage(wc, report) {
  const tabId = tabIdByWebContentsId.get(wc?.id);
  const tab = tabId ? tabs.get(tabId) : null;
  const current = settings.getSettings();
  if (!tab || !productUsageAllowed({
    firstRunComplete: settings.isFirstRunComplete(),
    usagePing: current.usagePing,
    privateTab: tab.private,
  })) return false;
  return report();
}

// Only web URLs may enter from command-line/default-browser handoff. Local
// HTML is intentionally not a supported document type: Electron's file:
// implementation grants a document broader filesystem authority than a web
// page, even when its renderer is sandboxed.
const urlsFromArgv = webUrlsFromArgv;

function openExternalUrl(url, { activate = true } = {}) {
  if (!externalUrlsFlushable || !hasLiveWindow()) {
    pendingExternalUrls.push(url);
    return;
  }
  const id = createTab(url);
  if (activate) {
    setActiveTab(id);
    bringExternalWindowToFront(app, rt().window);
  }
}

function openExternalUrls(urls) {
  for (const entry of externalUrlActivationPlan(urls)) {
    openExternalUrl(entry.url, { activate: entry.activate });
  }
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
  openExternalUrls(pendingExternalUrls.splice(0));
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  withWindowRuntime(focusedRuntime ?? primaryRuntime, () => openExternalUrl(url));
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

/** Privileged chrome must never become a general-purpose browser surface. */
function lockPrivilegedNavigation(wc, trustedUrl) {
  const allowOnlyExactMainFrame = (event) => {
    if (event.url !== trustedUrl || event.isMainFrame !== true) event.preventDefault();
  };
  wc.on('will-navigate', allowOnlyExactMainFrame);
  wc.on('will-frame-navigate', allowOnlyExactMainFrame);
  wc.on('will-redirect', allowOnlyExactMainFrame);
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
  forEachWindowRuntime(() => {
    beginChromeThemeAppearance(explicitAppearance);
    refreshActivePageTintForThemeChange();
  }, { liveOnly: true });
  nativeTheme.themeSource = source;
  if (!explicitAppearance) {
    forEachWindowRuntime(() => applyChromeThemeAppearance(), { liveOnly: true });
  }
}

function handleNativeThemeUpdated() {
  const appearance = resolvedThemeAppearance();
  forEachWindowRuntime(() => applyChromeThemeAppearance(appearance), { liveOnly: true });
  if (appearance === lastNativeThemeAppearance) return;
  lastNativeThemeAppearance = appearance;
  applyAppIcon();
  // Covers live OS appearance changes while the setting is "system". Explicit
  // app theme changes already invalidated before assigning themeSource; doing
  // it again here is harmless and keeps this path self-contained.
  forEachWindowRuntime(refreshActivePageTintForThemeChange, { liveOnly: true });
}

// Swap the chosen macOS Dock icon. Windows uses one fixed Sunrise icon embedded
// into Blanc.exe by electron-builder.
function applyAppIcon() {
  // getSettings() already falls back a stale retired icon id (hand-edited or
  // copied settings.json) to the default — nothing further to validate here.
  const { appIcon } = settings.getSettings();
  const developmentPreviewPath = !app.isPackaged && process.env.BLANC_DEV_DOCK_ICON_PREVIEW
    ? path.resolve(process.env.BLANC_DEV_DOCK_ICON_PREVIEW)
    : null;
  const developmentDarkPreviewPath = !app.isPackaged && process.env.BLANC_DEV_DOCK_ICON_DARK_PREVIEW
    ? path.resolve(process.env.BLANC_DEV_DOCK_ICON_DARK_PREVIEW)
    : null;
  applyDockAppIcon({
    app,
    nativeImage,
    appIcon,
    developmentPreviewPath,
    developmentDarkPreviewPath,
    darkAppearance: nativeTheme.shouldUseDarkColors,
  });
}

function developmentPreviewPath(environmentKey) {
  const rawPath = process.env[environmentKey];
  return !app.isPackaged && rawPath ? path.resolve(rawPath) : null;
}

const hasLiveWindow = () => !!rt().window && !rt().window.isDestroyed();

/** @type {Map<string, { id: string, view: WebContentsView, title: string, url: string, isLoading: boolean, canGoBack: boolean, canGoForward: boolean, favicon: string | null, bookmarked: boolean, blockedCount: number, private: boolean, pinned: boolean, muted: boolean, audible: boolean, pageBg: string | null, themeColor: string | null }>} */
const tabs = new Map();
/**
 * @typedef {object} SleepSnapshot
 * @property {import('electron').WebContentsView|null} view
 *   For a storage-bearing tab, its renderer-discarded view is retained until
 *   wake so Chromium's browser-process sessionStorage namespace survives. For
 *   an ordinary close teardown it is nulled by the 'destroyed' observer.
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

// wc.id of every parked (held) closed-tab view, process-wide. Consulted by
// the permission handlers via setHeldRequesterCheck — the tab record is gone
// by park time, so tabIdByWebContentsId cannot answer for a held page.
const heldWebContents = new Set();

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
    if (d.pictureInPictureElement) return { dirty: true };
    return {
      dirty: false,
      deepScrolled: window.scrollY > 3 * window.innerHeight,
      hasSessionStorage: !!window.sessionStorage?.length,
    };
  } catch {
    return { dirty: true };
  }
})()`;

/**
 * Is there work in this document a reload would destroy? Any frame that fails
 * to answer during the shared 250 ms budget is dirty by default.
 *
 * @returns {Promise<{dirty:boolean,hasSessionStorage:boolean}>}
 */
async function probeTabDirty(tab, wc) {
  // Our error page holds no recoverable work. It would otherwise fail safe on
  // its privileged frame and defeat the space-saving use case for dead tabs.
  if (typeof tab.url === 'string' && tab.url.startsWith('blanc://error')) {
    tab.deepScrolled = false;
    return { dirty: false, hasSessionStorage: false };
  }

  let frames;
  try {
    frames = wc.mainFrame?.framesInSubtree ?? [];
  } catch {
    return { dirty: true, hasSessionStorage: false };
  }
  if (frames.length === 0) return { dirty: true, hasSessionStorage: false };

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
  if (answers === 'timeout') return { dirty: true, hasSessionStorage: false };

  let deepScrolled = false;
  let hasSessionStorage = false;
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object') return { dirty: true, hasSessionStorage: false };
    if (answer.dirty) return { dirty: true, hasSessionStorage: false };
    if (answer.deepScrolled) deepScrolled = true;
    if (answer.hasSessionStorage) hasSessionStorage = true;
  }
  tab.deepScrolled = deepScrolled;
  return { dirty: deepScrolled, hasSessionStorage };
}

/** True while sleepTab has replaced a tab's listeners with its temporary
 * teardown pair. A concurrent user close cancels the sleep intent. */
let sleepTeardownInProgress = false;

/**
 * Release only the renderer process while retaining its WebContents. Chromium
 * keeps sessionStorage and navigation state in the browser process, so waking
 * this same contents is a reload without copying site data into Blanc.
 */
async function discardRendererKeepingStorage(tab, wc, owner, { broadcast, navEpoch }) {
  const rendererIsExclusive = () => {
    try { return hasExclusiveRenderer(wc, webContents.getAllWebContents()); }
    catch { return false; }
  };
  if (!rendererIsExclusive()) return false;
  if (await hasBeforeUnloadListener(wc)) return false;

  // The CDP inspection above is asynchronous. Repeat every mutable eligibility
  // check immediately before the irreversible renderer kill — including
  // capture, which a background tab can legitimately begin during the await,
  // and Glance, which can make the tab visible during it.
  if (!tabs.has(tab.id) || tab.id === rt().activeTabId || tab.id === rt().glanceTabId
      || tab.navEpoch !== navEpoch || tab.isLoading
      || !tab.sleeping || tab.capturing || liveContents(tab) !== wc
      // A mid-probe Move-Tab-to-New-Window re-homes the tab; the active/glance
      // checks above read the runtime that STARTED this sleep, so they would
      // miss a tab that is now the destination window's visible page.
      || windowRuntimes.runtimeForTab(tab.id) !== rt()
      || !rendererIsExclusive()) return false;

  const wcId = wc.id;
  const quieted = await new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wc.removeListener('render-process-gone', onGone);
      resolve(value);
    };
    const onGone = bindWindowRuntime(owner, () => finish(true));
    wc.once('render-process-gone', onGone);
    timer = setTimeout(() => finish(false), 5000);
    try { wc.forcefullyCrashRenderer(); } catch { finish(false); }
  });

  if (!quieted || !tabs.has(tab.id)) return false;
  tab.view = null;
  tab.asleep = true;
  tab.sleeping = false;
  tab.blockedCount = 0;
  tab.audible = false;
  tab.isLoading = false;
  tab.pageBg = null;
  tab.themeColor = null;
  // The discarded document's capture anchors die with its renderer — a woken
  // document must not inherit report eligibility without a fresh grant. The
  // normal render-process-gone clear deliberately skips sleeping tabs.
  if (tab.captureRecord) clearCaptureState({ kind: 'tab', tab, record: tab.captureRecord });
  tabIdByWebContentsId.delete(wcId);
  lastMainFrameMethod.delete(wcId);
  if (broadcast) broadcastTabs();
  return true;
}

/**
 * Discard one tab's renderer. This is best-effort only: it never throws or
 * wakes a tab, and any uncertain precondition leaves the tab awake.
 *
 * @returns {Promise<boolean>} true exactly when destruction was observed
 */
async function sleepTab(id, { broadcast = true } = {}) {
  const tab = tabs.get(id);
  const wc = liveContents(tab);
  if (!tab || !wc || tab.asleep || tab.sleeping || tab.waking) return false;
  // Quieting discards the renderer the hint was probed in.
  fillHintScheduler?.clearTab(tab);

  const epochAtProbe = tab.navEpoch;
  let snapshot;
  try {
    const nav = wc.navigationHistory;
    snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
  } catch {
    return false;
  }
  if (!snapshot) return false;

  let probe = { dirty: true, hasSessionStorage: false };
  try { probe = await probeTabDirty(tab, wc); } catch {}
  if (probe.dirty) return false;

  // The probe has an async frame budget; validate synchronously immediately
  // before teardown so it can never discard a tab the user just activated —
  // one that began CAPTURING after candidate selection, or one that became
  // the visible Glance reference while an earlier candidate's probe awaited.
  if (!tabs.has(id) || id === rt().activeTabId || id === rt().glanceTabId
      || tab.navEpoch !== epochAtProbe
      || tab.isLoading || tab.sleeping || tab.capturing || !liveContents(tab)
      // Same moved-tab blind spot as the sessionStorage path: the runtime
      // that started this sleep no longer owns a tab moved mid-probe.
      || windowRuntimes.runtimeForTab(id) !== rt()) return false;

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
  const owner = windowRuntimes.runtimeForTab(id) ?? primaryRuntime;

  // Closing a WebContents destroys its sessionStorage namespace. Real sites
  // use that storage routinely, so retain the contents and kill only its
  // exclusive renderer. A beforeunload listener or any uncertainty refuses
  // this path instead of bypassing a page's unload protection.
  if (probe.hasSessionStorage) {
    const quieted = await discardRendererKeepingStorage(tab, wc, owner, {
      broadcast,
      navEpoch: epochAtProbe,
    });
    if (quieted) return true;
    tab.sleeping = false;
    sleepSnapshots.delete(id);
    return false;
  }

  sleepTeardownInProgress = true;
  const wcId = wc.id;
  // Remove Blanc's stale-document listeners, but preserve Electron's own.
  // Electron can deliver queued visibility work after close() destroys the
  // native object; blanket listener removal turns that into the uncaught
  // BrowserWindow.visibilityChanged "Object has been destroyed" exception.
  unwireTabView(wc);

  let aborted = false;
  let teardownTimeout;
  let destroyedHandler;
  let preventUnloadHandler;
  const outcome = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    destroyedHandler = bindWindowRuntime(owner, () => {
      tab.view = null;
      tab.asleep = true;
      tab.sleeping = false;
      tab.blockedCount = 0;
      tab.audible = false;
      tab.isLoading = false;
      tab.pageBg = null;
      tab.themeColor = null;
      // unwireTabView() above removed the normal render-process-gone capture
      // clear; the discarded document's anchors must not survive into
      // whatever a wake later loads.
      if (tab.captureRecord) clearCaptureState({ kind: 'tab', tab, record: tab.captureRecord });
      const record = sleepSnapshots.get(id);
      if (record) record.view = null;
      tabIdByWebContentsId.delete(wcId);
      lastMainFrameMethod.delete(wcId);
      finish('quiet');
    });
    wc.once('destroyed', destroyedHandler);

    // Polarity matters: this fires when the page objects to unload. Calling
    // preventDefault here would override that objection and destroy the tab.
    preventUnloadHandler = () => {
      aborted = true;
      finish('aborted');
    };
    wc.once('will-prevent-unload', preventUnloadHandler);

    wc.close({ waitForBeforeUnload: true });
    // A wedged renderer must not remain permanently `sleeping`.
    teardownTimeout = setTimeout(() => finish('unresponsive'), 5000);
  });
  clearTimeout(teardownTimeout);

  if (outcome === 'quiet') {
    sleepTeardownInProgress = false;
    if (broadcast) broadcastTabs();
    return true;
  }

  // An unload objection or timeout leaves the WebContents alive. Remove the
  // temporary teardown observers before reinstalling the ordinary tab set.
  if (!wc.isDestroyed()) {
    wc.removeListener('destroyed', destroyedHandler);
    wc.removeListener('will-prevent-unload', preventUnloadHandler);
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

/** Downgrade a held entry to its snapshot: destroy the view (unless the
 *  renderer already died), clear the registry, cancel the hold timer. Safe
 *  to call twice and from the firewall's own destroyed handler. */
function downgradeHeldEntry(entry) {
  clearTimeout(entry.holdTimer);
  entry.holdTimer = null;
  if (entry.wcId != null) heldWebContents.delete(entry.wcId);
  entry.wcId = null;
  const view = entry.view;
  entry.view = null;
  entry.heldAt = null;
  const wc = view?.webContents;
  if (wc && !wc.isDestroyed()) {
    // The held firewall is Blanc-owned and recorded exactly. Preserve every
    // Electron-owned listener through close() so queued visibility teardown
    // cannot call BrowserWindow.visibilityChanged on a destroyed object.
    removeHeldFirewall(entry, wc);
    wc.close();
  } else {
    entry.firewallListeners = null;
  }
  // NO rt()/broadcast here: the before-quit sweep calls this while iterating
  // every runtime OUTSIDE any bindWindowRuntime scope (acceptance mode makes
  // that throw; production would resolve the wrong window). Callers that
  // clear a held marker the panel is showing broadcast themselves, bound.
}

/** Held-state firewall (spec §3.4): a parked page keeps executing for the
 *  grace window with no tab record, so it must never be left bare. Every
 *  Electron callback is bound to the owning window runtime — a crash or
 *  expiry in a background window must never resolve through the focused
 *  fallback and mutate the wrong window (the downloads.js/capture rule). */
function installHeldFirewall(entry, wc, owner) {
  // Method-installed, NOT an EventEmitter listener — listener removal never
  // clears the one wireTabView set. Without this a held page could
  // window.open into a boundToTab closure over a deleted record.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Every firewall listener is recorded on the entry so the adoption unpark
  // can remove EXACTLY this set (removeHeldFirewall) — never a name-based
  // strip, which took out Electron's own listeners in both directions
  // (window-open pipeline SIGSEGV; visibilityChanged destroyed-object throw).
  entry.firewallListeners = [];
  const guard = (event, handler, { once = false } = {}) => {
    if (once) wc.once(event, handler);
    else wc.on(event, handler);
    entry.firewallListeners.push([event, handler]);
  };
  // Frozen at close: main-frame navigation is refused outright. Subframes
  // are left alone so the page survives restore intact (§3.4).
  guard('will-navigate', (event) => { if (event.isMainFrame) event.preventDefault(); });
  guard('will-redirect', (event) => { if (event.isMainFrame) event.preventDefault(); });
  // A video can BEGIN during the hold; the restored tab must not be
  // quietable mid-playback. Writes to the entry, never a tab record.
  guard('media-started-playing', () => { entry.seed.usedMedia = true; });
  // A crashed renderer does not destroy its WebContents; without these the
  // restore path would re-attach a sad-tab instead of using the snapshot.
  const downgrade = bindWindowRuntime(owner, () => {
    downgradeHeldEntry(entry);
    // The renderer's reopen state just changed; downgradeHeldEntry itself
    // must stay callable from unbound teardown, so the bound caller broadcasts.
    if (hasLiveWindow()) scheduleBroadcastTabs();
  });
  guard('render-process-gone', downgrade);
  guard('destroyed', downgrade, { once: true });
}

/** Adoption unpark: remove exactly the firewall's recorded listeners. The
 *  deny setWindowOpenHandler needs no removal — wireTabView re-installs the
 *  tab handler over it. */
function removeHeldFirewall(entry, wc) {
  for (const [event, handler] of entry.firewallListeners ?? []) {
    wc.removeListener(event, handler);
  }
  entry.firewallListeners = null;
}

/** Park a closing tab's live view into its closed entry (Tier 0). Returns
 *  false on any uncertainty; the caller then destroys normally (Tier 1).
 *  Called only from closeTab, where rt() is the verified owner. */
function parkTabView(tab, entry) {
  const wc = liveContents(tab);
  if (!wc) return false;
  // Final synchronous guard, same shape as sleepTab's: capture state can
  // change between eligibility selection and this call (§5.1a).
  if (tab.capturing || (tab.captureRecord?.anchors?.length ?? 0) > 0) return false;
  const owner = rt();
  const view = tab.view;
  // Registry FIRST, then strip, then firewall: no instant exists in which a
  // request resolves against neither the tab record nor the firewall (§3.4).
  heldWebContents.add(wc.id);
  unwireTabView(wc); // exact removal of wireTabView's set; Electron's stay
  installHeldFirewall(entry, wc, owner);
  view.setVisible(false);
  wc.setAudioMuted(true);
  entry.view = view;
  entry.wcId = wc.id;
  entry.heldAt = Date.now();
  // The timer fires, but the pure policy decides: runtime expiry goes
  // through expireHolds so the tested function is the production truth —
  // and an entry already downgraded early (newer hold, crash) is simply
  // not due when the sweep runs.
  entry.holdTimer = setTimeout(bindWindowRuntime(owner, () => {
    entry.holdTimer = null;
    const due = new Set(expireHolds(owner.closedEntries ?? [], { now: Date.now() }));
    let downgraded = false;
    for (const candidate of owner.closedEntries ?? []) {
      if (due.has(candidate.id)) {
        downgradeHeldEntry(candidate);
        downgraded = true;
      }
    }
    // Bound caller broadcasts (see downgradeHeldEntry's no-rt() contract).
    if (downgraded && hasLiveWindow()) scheduleBroadcastTabs();
  }), CLOSED_GRACE_MS);
  tabIdByWebContentsId.delete(wc.id);
  lastMainFrameMethod.delete(wc.id);
  return true;
}

/** `/sleep`: quiet every eligible background tab now. It bypasses only the
 * idle threshold; the ordinary safety predicate and teardown revalidation
 * remain authoritative. */
async function sleepBackgroundTabsNow() {
  if (isQuitting || sessionPersistenceSuspended || startupNavigationGateActive || !net.isOnline()) {
    return [];
  }
  const runtime = rt();
  const list = runtime.tabOrder.map((tid) => tabs.get(tid)).filter(Boolean);
  const permissionPendingTabIds = new Set(
    [...runtime.permissionPrompts.values()].map((pending) => pending?.tabId).filter(Boolean)
  );
  const ids = sleepCandidates(list, {
    now: Date.now(),
    thresholdMs: null,
    activeTabId: runtime.activeTabId,
    ignoreThreshold: true,
    snapshotCount: sleepSnapshots.size,
    permissionPendingTabIds,
    popupChildCounts,
    visibleTabIds: new Set([runtime.glanceTabId].filter(Boolean)),
  });
  const quieted = [];
  for (const id of ids) {
    if (await sleepTab(id, { broadcast: false })) quieted.push(id);
  }
  if (quieted.length) broadcastTabs();
  return quieted;
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

/** Turn a void reload/history action into the same main-frame completion
 * promise loadURL/restore provide. Listeners are installed before action(). */
function waitForRetainedNavigation(wc, action) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      wc.removeListener('did-finish-load', onFinish);
      wc.removeListener('did-fail-load', onFail);
      wc.removeListener('destroyed', onDestroyed);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onFinish = () => finish(resolve);
    const onFail = (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      finish(reject, new Error(`${errorDescription || 'Navigation failed'}: ${validatedURL || ''}`));
    };
    const onDestroyed = () => finish(reject, new Error('WebContents destroyed during wake'));
    wc.once('did-finish-load', onFinish);
    wc.on('did-fail-load', onFail);
    wc.once('destroyed', onDestroyed);
    try { action(); } catch (error) { finish(reject, error); }
  });
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
  let retained = false;

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
    const retainedView = snapshot?.view;
    const retainedContents = retainedView?.webContents;
    retained = !!retainedContents && !retainedContents.isDestroyed();
    const view = retained ? retainedView : createTabView(tab);
    tab.view = view;
    if (!retained) wireTabView(tab, view, { owner, adopted: false });
    wc = view.webContents;
    tabIdByWebContentsId.set(wc.id, id);
    wc.setAudioMuted(effectiveTabMuted(tab));
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
  } else if (retained) {
    if (atIndex === null) {
      first = waitForRetainedNavigation(wc, () => wc.reload());
    } else {
      const index = Math.max(0, Math.min(snapshot.entries.length - 1, atIndex));
      first = waitForRetainedNavigation(wc, () => wc.navigationHistory.goToIndex(index));
    }
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
    visibleTabIds: new Set([rt().glanceTabId].filter(Boolean)),
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

// A tab's pending prompts die with it. Resolving null denies WITHOUT
// persisting (the same sentinel flushPermissionPrompts uses at window
// close), so an Allow clicked after the close can no longer grant or save
// a decision for the vanished requester.
function cancelPermissionPromptsForTab(tabId) {
  const runtime = rt();
  let cancelled = false;
  for (const [promptId, pending] of runtime.permissionPrompts) {
    if (pending?.tabId !== tabId) continue;
    runtime.permissionPrompts.delete(promptId);
    pending.resolve(null);
    cancelled = true;
  }
  if (cancelled && runtime.permissionPrompts.size === 0) detachPermissionView();
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
let onePasswordConfigurationKey = JSON.stringify([
  initialPresentationSettings.onePasswordEnabled,
  initialPresentationSettings.onePasswordAccount,
]);
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
 * What crosses the IPC boundary is one number, only when it changes, and at
 * most once a frame. Beyond the range main sends a single zero and then says
 * nothing at all. */

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

  // Three decimals is finer than the effect can render, and makes "unchanged"
  // the common case while you move around away from the pill.
  const next = { k: Number(k.toFixed(3)) };
  const prev = runtime.islandProximity;
  if (next.k === prev.k) return;

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
    if (!hasLiveWindow()) return;
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

function activeGlanceTab() {
  const id = rt().glanceTabId;
  if (!id || id === rt().activeTabId) return null;
  const tab = tabs.get(id);
  return tab && windowRuntimes.runtimeForTab(id) === rt() ? tab : null;
}

function glanceGeometry(layout = currentChromeLayout()) {
  if (!activeGlanceTab()) return null;
  return calculateGlanceLayout(layout.pageBounds, rt().glanceRatio);
}

function currentTabBounds(tab) {
  const layout = currentChromeLayout();
  const glance = glanceGeometry(layout);
  if (!glance) return layout.pageBounds;
  if (tab?.id === rt().glanceTabId) return glance.glance;
  if (tab?.id === rt().activeTabId) return glance.primary;
  return layout.pageBounds;
}

function overlayBounds() {
  const layout = currentChromeLayout();
  const glance = glanceGeometry(layout);
  if (rt().overlayMode === 'find') {
    if (!glance) return layout.findBounds;
    const width = Math.min(560, glance.primary.width);
    return {
      x: glance.primary.x + Math.round((glance.primary.width - width) / 2),
      y: rt().chromeHeight,
      width,
      height: Math.min(160, glance.primary.height),
    };
  }
  if (rt().overlayMode === 'palette' || rt().overlayMode === 'panel') {
    if (!glance) return rt().overlayMode === 'palette' ? layout.paletteBounds : layout.panelBounds;
    return {
      x: glance.primary.x,
      y: 0,
      width: glance.primary.width,
      height: rt().window.getContentBounds().height,
    };
  }
  if (rt().overlayMode === 'glance') {
    const windowHeight = rt().window.getContentBounds().height;
    if (glance && rt().overlayPurpose === 'change') {
      return {
        x: glance.glanceHeader.x,
        y: glance.glanceHeader.y,
        width: glance.glanceHeader.width,
        height: Math.min(Math.max(0, windowHeight - glance.glanceHeader.y), 520),
      };
    }
    return {
      x: layout.pageBounds.x,
      y: 0,
      width: layout.pageBounds.width,
      height: Math.min(windowHeight, 520),
    };
  }
  if (rt().overlayMode === 'shield') {
    return calculateShieldBounds({
      windowWidth: rt().window.getContentBounds().width,
      stripHeight: rt().chromeHeight,
      anchorRight: rt().shieldAnchorRight,
    });
  }
  if (rt().overlayMode === 'capture') {
    return calculateCaptureBounds({
      windowWidth: rt().window.getContentBounds().width,
      stripHeight: rt().chromeHeight,
      anchorRight: rt().captureAnchorRight,
      rowCount: captureRowCount(),
    });
  }
  return layout.panelBounds;
}

// --- Floating permission prompt (bottom-center, own view) ------------------
// The strip document only paints the top band — everything below chromeHeight
// is covered by the active tab's WebContentsView — and a prompt beside the
// island competes with it. So prompts render in their own small transparent
// view, attached bottom-center only while owner.permissionPrompts is
// non-empty, and always stacked above whatever else is on screen.

function permissionViewBounds() {
  const { width, height } = rt().window.getContentBounds();
  const w = Math.min(560, Math.max(0, width - 24));
  const h = 64; // bar + its 12px bottom margin, drawn by permission.html
  return { x: Math.round((width - w) / 2), y: Math.max(0, height - h), width: w, height: h };
}

function ensurePermissionView() {
  if (rt().permissionView && !rt().permissionView.webContents.isDestroyed()) return rt().permissionView;
  const owner = rt();
  rt().permissionView = new WebContentsView({
    webPreferences: {
      partition: CHROME_PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const view = rt().permissionView;
  const wcId = view.webContents.id;
  windowRuntimes.registerChromeSurface(owner, wcId);
  view.webContents.once('destroyed', bindWindowRuntime(owner, () => {
    windowRuntimes.unregisterChromeSurface(wcId);
    if (rt().permissionView === view) {
      rt().permissionView = null;
      rt().permissionViewAttached = false;
    }
  }));
  view.setBackgroundColor('#00000000');
  lockPrivilegedNavigation(view.webContents, CHROME_PERMISSION_URL);
  installChromeShortcuts(view.webContents);
  view.webContents.loadURL(CHROME_PERMISSION_URL);
  // Prompts sent before the document's first load finished would be lost —
  // replay everything still pending (the renderer dedupes by id).
  view.webContents.once('did-finish-load', bindWindowRuntime(owner, () => {
    for (const pending of rt().permissionPrompts.values()) {
      if (pending.payload) view.webContents.send('permissions:prompt', pending.payload);
    }
  }));
  return view;
}

/** Keep the prompt above the tab view, overlay, and utility sheet — call
 * after any of them (re)attach. addChildView on an existing child re-stacks
 * it topmost. */
function restackPermissionView() {
  if (rt().permissionViewAttached && rt().permissionView && hasLiveWindow()) {
    rt().window.contentView.addChildView(rt().permissionView);
  }
}

function attachPermissionView() {
  if (!hasLiveWindow()) return;
  const view = ensurePermissionView();
  view.setBounds(permissionViewBounds());
  rt().window.contentView.addChildView(view);
  rt().permissionViewAttached = true;
}

function detachPermissionView() {
  if (!rt().permissionViewAttached) return;
  rt().permissionViewAttached = false;
  if (hasLiveWindow() && rt().permissionView) {
    rt().window.contentView.removeChildView(rt().permissionView);
  }
}

// --- 1Password fill capsule view (fill-status.html) ---------------------
// Same lifecycle family as the permission view above, with one deliberate
// difference: a dedicated narrow preload (fill-status-preload.js) instead of
// the rich browserAPI bridge, and explicit readiness wiring — loadURL
// rejection and did-fail-load are real failure inputs to the surface's
// first-visible-presentation boundary, which the permission precedent never
// needed (spec §1, plan Task 6).

function fillStatusViewBounds() {
  const { width, height } = rt().window.getContentBounds();
  const w = Math.min(560, Math.max(0, width - 24));
  // Title row + up-to-two-line body + padding + the 12px bottom margin the
  // document draws. The capsule bottom-anchors inside this band, so keep it
  // as tight as the two-line case allows — the view intercepts clicks over
  // the page for its whole bounds (same rule as the find capsule).
  const h = 88;
  return { x: Math.round((width - w) / 2), y: Math.max(0, height - h), width: w, height: h };
}

function ensureFillStatusView() {
  if (rt().fillStatusView && !rt().fillStatusView.webContents.isDestroyed()) return rt().fillStatusView;
  const owner = rt();
  owner.fillStatusViewLoaded = false;
  owner.fillStatusView = new WebContentsView({
    webPreferences: {
      partition: CHROME_PARTITION,
      preload: path.join(__dirname, 'fill-status-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const view = owner.fillStatusView;
  // Capture the id up front, like ensurePermissionView's wcId: it may be
  // unreadable by the time a destroy callback runs, and every signal must
  // carry THIS view's identity so a recreated view's late failure can't
  // touch its replacement's message (surface behavior 5c).
  const wcId = view.webContents.id;
  windowRuntimes.registerChromeSurface(owner, wcId);
  view.webContents.once('destroyed', bindWindowRuntime(owner, () => {
    windowRuntimes.unregisterChromeSurface(wcId);
    if (rt().fillStatusView === view) {
      rt().fillStatusView = null;
      rt().fillStatusViewAttached = false;
      rt().fillStatusViewLoaded = false;
    }
    fillStatusSurface?.viewGone(owner.id, wcId);
  }));
  view.webContents.on('render-process-gone', bindWindowRuntime(owner, () => {
    rt().fillStatusViewLoaded = false;
    fillStatusSurface?.viewGone(owner.id, wcId);
  }));
  view.setBackgroundColor('#00000000');
  lockPrivilegedNavigation(view.webContents, CHROME_FILL_STATUS_URL);
  view.webContents.loadURL(CHROME_FILL_STATUS_URL)
    .catch(bindWindowRuntime(owner, () => fillStatusSurface?.loadFailed(owner.id, wcId)));
  view.webContents.on('did-fail-load', bindWindowRuntime(owner, (_e, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame) fillStatusSurface?.loadFailed(owner.id, wcId);
  }));
  // `on`, not `once`: a crashed-and-reloaded document must re-signal
  // readiness so a queued show can still replay.
  view.webContents.on('did-finish-load', bindWindowRuntime(owner, () => {
    rt().fillStatusViewLoaded = true;
    fillStatusSurface?.rendererReady(owner.id, wcId);
  }));
  return view;
}

/** Keep the capsule above the tab view; permission prompts stay above it
 * (call restackPermissionView after this wherever both apply). */
function restackFillStatusView() {
  if (rt().fillStatusViewAttached && rt().fillStatusView && hasLiveWindow()) {
    rt().window.contentView.addChildView(rt().fillStatusView);
  }
}

function attachFillStatusView() {
  if (!hasLiveWindow()) return;
  const view = ensureFillStatusView();
  view.setBounds(fillStatusViewBounds());
  rt().window.contentView.addChildView(view);
  rt().fillStatusViewAttached = true;
  restackPermissionView();
}

function detachFillStatusView() {
  if (!rt().fillStatusViewAttached) return;
  rt().fillStatusViewAttached = false;
  if (hasLiveWindow() && rt().fillStatusView) {
    rt().window.contentView.removeChildView(rt().fillStatusView);
  }
}

function createOverlay() {
  const owner = rt();
  // A menu open when the previous window died may never have fired its close
  // callback — never let a leaked ticket disarm the new overlay's blur guard.
  rt().addressMenuTicket = 0;
  rt().overlayView = new WebContentsView({
    webPreferences: {
      partition: CHROME_PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRuntimes.registerChromeSurface(owner, rt().overlayView.webContents.id);
  // If the overlay's webContents dies on its own (renderer crash,
  // render-process-gone) rather than through the window's 'closed' handler,
  // make sure it never lingers in the surface index or as a dangling
  // reference. Locals capture the view + id at creation time since bare
  // overlayView no longer exists after the Task 7 sweep.
  const overlay = rt().overlayView; // just assigned above
  const overlayWcId = overlay.webContents.id;
  overlay.webContents.on('render-process-gone', bindWindowRuntime(owner, (_event, details) => {
    diagnostics.recordRendererCrash('overlay', details);
  }));
  overlay.webContents.once('destroyed', bindWindowRuntime(owner, () => {
    windowRuntimes.unregisterChromeSurface(overlayWcId);
    if (rt().overlayView === overlay) rt().overlayView = null;
  }));
  // Fully transparent: the panel floats over live web content, so only what
  // overlay.html actually paints may be opaque.
  rt().overlayView.setBackgroundColor('#00000000');
  lockPrivilegedNavigation(rt().overlayView.webContents, CHROME_OVERLAY_URL);
  installChromeShortcuts(rt().overlayView.webContents);
  rt().overlayView.webContents.loadURL(CHROME_OVERLAY_URL);

  // A show requested before the overlay document finished its first load
  // would be lost — leaving an invisible view blocking clicks. Replay it.
  rt().overlayView.webContents.once('did-finish-load', bindWindowRuntime(owner, () => {
    if (rt().overlayMode) {
      rt().overlayView.webContents.send('overlay:show', {
        mode: rt().overlayMode,
        prefill: rt().overlayPrefill,
        purpose: rt().overlayPurpose,
      });
      rt().overlayView.webContents.focus();
    }
  }));

  // Dismiss on Escape at the main-process level so it works no matter
  // which element inside the overlay holds focus. When the footer workspace
  // popover (or one of its editors) is open, forward Esc to the overlay so
  // it can cancel/close the popover first — the island stays up.
  rt().overlayView.webContents.on('before-input-event', bindWindowRuntime(owner, (event, input) => {
    if (rt().overlayMode && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      if (rt().workspaceSwitcherOpen && rt().overlayView && !rt().overlayView.webContents.isDestroyed()) {
        rt().overlayView.webContents.send('overlay:escape');
        return;
      }
      hideOverlay({ reason: 'escape' });
    }
  }));

  // Losing focus (page click, cmd-tab, devtools) with the command bar open
  // would leave a stale panel floating over the page. Find mode survives
  // blur deliberately — users click around the page between matches.
  rt().overlayView.webContents.on('blur', bindWindowRuntime(owner, () => {
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

  // The address menu and the tab-row menu share the overlay webContents and the
  // SAME blur-guard ticket (they are mutually exclusive by target — editable
  // input vs. row). One deps object so the subtle release policy (stale-ticket
  // check, GTK async-focus 80ms sample, dismiss-without-stealing-focus) has a
  // single definition; drift between two copies would corrupt the shared guard.
  const overlayMenuGuardDeps = {
    isOverlayLive: bindWindowRuntime(owner, () =>
      hasLiveWindow()
      && rt().overlayView && !rt().overlayView.webContents.isDestroyed()
      && (rt().overlayMode === 'panel' || rt().overlayMode === 'palette')),
    getWindow: bindWindowRuntime(owner, () => rt().window),
    getOverlayBounds: bindWindowRuntime(owner, () => overlayBounds()),
    acquireMenuGuard: bindWindowRuntime(owner, () => { rt().addressMenuTicket = ++rt().addressMenuSeq; return rt().addressMenuTicket; }),
    releaseMenuGuard: bindWindowRuntime(owner, (ticket) => {
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
      setTimeout(bindWindowRuntime(owner, () => {
        if (rt().addressMenuTicket || !hasLiveWindow()) return;
        if (!rt().window.isFocused()) return hideOverlay({ refocusContent: false });
        refocusOverlayAfterMenu();
      }), 80);
    }),
  };

  attachAddressMenu(rt().overlayView.webContents, {
    ...overlayMenuGuardDeps,
    actions: {
      pasteAndGo: bindWindowRuntime(owner, (text) => { if (rt().activeTabId) pasteAndGo(rt().activeTabId, text); }),
    },
  });

  // Tab-row context menu, same webContents; shares the guard above.
  attachRowMenu(rt().overlayView.webContents, {
    ...overlayMenuGuardDeps,
    resolveTab: bindWindowRuntime(owner, (rawId) => {
      const id = tabs.has(rawId) ? rawId : (tabs.has(Number(rawId)) ? Number(rawId) : null);
      return id == null ? null : tabContextData(tabs.get(id), owner);
    }),
    actions: menuContextActions(owner),
  });

  // Workspace-row context menu (Rename/Delete) — a separate module from the
  // tab-row menu above (see workspace-context-menu-model.js's header), same
  // webContents and shared guard, mutually exclusive by which id the
  // renderer recorded on the last right-click.
  attachWorkspaceRowMenu(rt().overlayView.webContents, {
    ...overlayMenuGuardDeps,
    resolveWorkspace: bindWindowRuntime(owner, (rawId) =>
      (typeof rawId === 'string' && rawId ? namedWorkspaces.get(rawId) : null)),
    actions: workspaceMenuContextActions(owner),
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

function showOverlay(mode, { prefill, purpose } = {}) {
  if (!hasLiveWindow() || !rt().overlayView) return;
  bumpSurfaceGeneration();
  // One floating layer at a time: summoning the island dismisses the sheet
  // (the overlay takes focus itself — no tab refocus in between).
  hideUtilitySheet({ refocusContent: false });
  // Opening the panel is a freshness signal: pull other devices' tabs
  // (throttled to 1/min inside refreshSession — tab-sync spec §6).
  if (mode === 'panel' || mode === 'palette') sync.refreshSession();
  rt().overlayMode = mode;
  rt().overlayPrefill = prefill ?? null;
  rt().overlayPurpose = purpose ?? null;
  // (Re-)adding moves the overlay to the top of the child-view stack.
  // Stack order: tab < fill capsule < overlay < permission prompt.
  restackFillStatusView();
  rt().window.contentView.addChildView(rt().overlayView);
  restackPermissionView();
  if (rt().overlayExitTimer) {
    clearTimeout(rt().overlayExitTimer);
    rt().overlayExitTimer = null;
  }
  const bounds = overlayBounds();
  rt().overlayView.setBounds(bounds);
  // A detached overlay renderer can trail the chrome by one broadcast under
  // sustained tab churn. Glance eligibility must be correct in the first
  // painted frame, not eventually after the picker is already interactive.
  // Refresh only that mode here; this is a projection send, not a persistence
  // or Tab Sync change notification.
  if (mode === 'glance') {
    rt().overlayView.webContents.send('tabs:updated', currentTabsPayload());
  }
  rt().overlayView.webContents.send('overlay:show', {
    mode,
    prefill,
    purpose,
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

// The one place a typed character opens the island. The start page, the
// pill's own keydown, and the "/" chip all funnel here so there is never a
// validated path beside an unvalidated one. showOverlay's prefill is already
// consumed by applyMode in overlay.js; the "New Group…" menu item is the
// existing precedent, passing '/group '.
function openIslandTyping(char) {
  if (!isValidPrefillChar(char)) return;
  showOverlay('panel', { prefill: char });
}

/** How long the panel takes to retract. Keep in step with styles.css. */
const OVERLAY_RETRACT_MS = 200;

function hideOverlay({ refocusContent = true, reason = null } = {}) {
  if (!rt().overlayMode) return;
  bumpSurfaceGeneration();
  const closingMode = rt().overlayMode;
  const closingPurpose = rt().overlayPurpose;
  const closingTrigger = rt().shieldTrigger;
  rt().overlayMode = null;
  rt().overlayPurpose = null;
  rt().workspaceSwitcherOpen = false;
  rt().shieldAnchorRight = null;
  rt().captureAnchorRight = null;
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
    const cancelled = reason === 'escape' || reason === 'cancel';
    const restoreTrigger = cancelled
      ? (
          closingMode === 'shield' ? closingTrigger
            : closingMode === 'capture' ? 'capture'
              // The Change control only exists while Glance is still open —
              // if the reference tab closed under the picker, fall through to
              // the ordinary content refocus instead of a hidden button.
              : closingMode === 'glance' && closingPurpose === 'change' && activeGlanceTab() ? 'glance-change'
                : null
        )
      : null;
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

function liveUtilitySheet(runtime = rt()) {
  const view = runtime.utilitySheetView;
  const wc = liveViewContents(view);
  return wc ? { view, wc } : null;
}

// Electron can fault natively when loadURL is called again on this cached
// WebContents while its prior utility-page navigation is still settling. The
// acceptance runner made that race repeatable by opening/hiding several sheets
// faster than their documents committed; a user can do the same from menus or
// shortcuts. Keep one promise chain per native view and let only its newest
// requested destination run.
const utilitySheetNavigations = new WeakMap();

function utilitySheetNavigationState(view) {
  let state = utilitySheetNavigations.get(view);
  if (!state) {
    state = { generation: 0, settledGeneration: 0, tail: Promise.resolve() };
    utilitySheetNavigations.set(view, state);
  }
  return state;
}

function cancelUtilitySheetNavigation(view) {
  const state = view ? utilitySheetNavigations.get(view) : null;
  if (!state) return;
  state.generation += 1;
  state.settledGeneration = state.generation;
}

function scheduleUtilitySheetNavigation(runtime, sheet, url) {
  const state = utilitySheetNavigationState(sheet.view);
  const generation = ++state.generation;
  const navigate = async () => {
    if (
      state.generation !== generation ||
      runtime.utilitySheetView !== sheet.view ||
      runtime.utilitySheetUrl !== url ||
      liveViewContents(sheet.view) !== sheet.wc
    ) return;
    try {
      await sheet.wc.loadURL(url);
    } catch {
      // A superseded/failed internal-page load is reflected by ready:false in
      // the test surface; it is not an uncaught main-process failure.
    }
  };
  state.tail = state.tail.then(navigate, navigate).finally(() => {
    if (state.generation === generation) state.settledGeneration = generation;
  });
  return state.tail;
}

function utilitySheetNavigationReady(runtime, sheet) {
  if (!sheet || !runtime.utilitySheetUrl) return false;
  const state = utilitySheetNavigations.get(sheet.view);
  return !!state &&
    state.settledGeneration === state.generation &&
    !sheet.wc.isLoadingMainFrame() &&
    sameUtilityPage(sheet.wc.getURL(), runtime.utilitySheetUrl);
}

function createUtilitySheet() {
  const runtime = rt();
  const view = new WebContentsView({ webPreferences: TAB_WEB_PREFERENCES });
  view.setBackgroundColor('#00000000');
  const wc = liveViewContents(view);
  if (!wc) return null;
  runtime.utilitySheetView = view;
  installChromeShortcuts(wc);
  // Esc dismisses no matter what inside the page holds focus (mirrors the
  // island overlay's handler). When a Settings picker (or similar) has armed
  // escape interest, forward Esc into the sheet first so the picker can close
  // without dismissing the whole sheet — same layering as workspaceSwitcherOpen.
  wc.on('before-input-event', bindWindowRuntime(runtime, (event, input) => {
    if (runtime.utilitySheetView !== view) return;
    if (runtime.utilitySheetUrl && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      if (runtime.utilitySheetEscapeArmed && !wc.isDestroyed()) {
        wc.send('pages:surface:escape');
        return;
      }
      hideUtilitySheet();
    }
  }));
  // A crashed sheet renderer is dismissed and destroyed; the next open
  // lazily recreates it. Close the dead webContents — dropping the
  // reference alone leaks the crashed guest. Default refocus: nothing else
  // will hand focus back after a crash.
  wc.on('render-process-gone', bindWindowRuntime(runtime, (_event, details) => {
    diagnostics.recordRendererCrash('utility-sheet', details);
    if (runtime.utilitySheetView !== view) return;
    hideUtilitySheet();
    if (!wc.isDestroyed()) wc.close();
    if (runtime.utilitySheetView === view) {
      runtime.utilitySheetView = null;
      runtime.utilitySheetUrl = null;
    }
  }));
  // A clean close does not emit render-process-gone. Never leave the cached
  // JS reference pointing at a WebContentsView whose `.webContents` now reads
  // back undefined; the next utility-page open would otherwise pass a dead
  // native object into loadURL/addChildView.
  wc.once('destroyed', bindWindowRuntime(runtime, () => {
    if (runtime.utilitySheetView !== view) return;
    cancelUtilitySheetNavigation(view);
    if (hasLiveWindow()) runtime.window.contentView.removeChildView(view);
    runtime.utilitySheetView = null;
    runtime.utilitySheetUrl = null;
  }));
  // Default-deny (design §4): utility→utility stays in-sheet; http(s)
  // opens a real tab (createTab's dismissal covers the sheet); approved
  // handoff protocols go to the OS; everything else — and every
  // window.open — dies.
  wc.on('will-navigate', bindWindowRuntime(runtime, (event, targetUrl) => {
    if (runtime.utilitySheetView !== view) return event.preventDefault();
    if (isUtilityUrl(targetUrl)) {
      runtime.utilitySheetUrl = targetUrl; // keep the toggle honest across in-sheet nav
      runtime.utilitySheetEscapeArmed = false; // document is about to be replaced
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
  return { view, wc };
}

/** Page identity, not URL spelling: each utility page is one document per
 * blanc:// host, and accepted spellings differ (typed "blanc://settings"
 * vs the menu's "blanc://settings/"). */
function sameUtilityPage(a, b) {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
}

function showUtilityPage(url) {
  if (!hasLiveWindow()) return;
  const runtime = rt();
  let sheet = liveUtilitySheet(runtime);
  // Toggle: a direct re-invocation (menu/accelerator) of the shown page
  // closes it. Overlay-hosted entry points can never hit this — summoning
  // the overlay already dismissed the sheet.
  if (runtime.utilitySheetUrl && sheet && sameUtilityPage(runtime.utilitySheetUrl, url)) return hideUtilitySheet();
  // One floating layer at a time, in both directions.
  hideOverlay({ refocusContent: false });
  if (!sheet) {
    // A WebContentsView keeps its JS wrapper after close(), but its
    // `.webContents` becomes undefined. Clear both halves of the cached state
    // before constructing the replacement so stale callbacks cannot win.
    runtime.utilitySheetView = null;
    runtime.utilitySheetUrl = null;
    sheet = createUtilitySheet();
  }
  if (!sheet) return;
  bumpSurfaceGeneration(runtime);
  runtime.utilitySheetUrl = url;
  runtime.utilitySheetEscapeArmed = false;
  scheduleUtilitySheetNavigation(runtime, sheet, url);
  // Mirror tabs: a detached view's document still reports visibilityState
  // 'visible' and never background-throttles — toggle real visibility.
  sheet.view.setVisible(true);
  runtime.window.contentView.addChildView(sheet.view);
  // A pending permission prompt must stay above the sheet — a buried prompt
  // has no visible Allow/Block until the sheet happens to be dismissed.
  bindWindowRuntime(runtime, restackPermissionView)();
  resizeActiveView();
  sheet.wc.focus();
}

function hideUtilitySheet({ refocusContent = true } = {}) {
  const runtime = rt();
  if (!runtime.utilitySheetUrl) return;
  bumpSurfaceGeneration(runtime);
  runtime.utilitySheetUrl = null;
  runtime.utilitySheetEscapeArmed = false;
  cancelUtilitySheetNavigation(runtime.utilitySheetView);
  const sheet = liveUtilitySheet(runtime);
  if (hasLiveWindow() && sheet) {
    runtime.window.contentView.removeChildView(sheet.view);
    sheet.view.setVisible(false);
  }
  if (refocusContent) liveContents(tabs.get(runtime.activeTabId))?.focus();
}

let onePasswordFillController = null;
// The capsule surface controller (Task 6 wires it); declared here because
// bumpSurfaceGeneration below must reference it before it exists.
let fillStatusSurface = null;

/** The single mutator for runtime.surfaceGeneration — every working-surface
 * transition (overlay, utility sheet, Glance, permission arrival, real tab
 * switch) funnels through here so the 1Password fill flow's invalidation
 * and the capsule's dismissal can never disagree. Never inline the
 * increment at a call site. */
function bumpSurfaceGeneration(runtime = rt()) {
  runtime.surfaceGeneration += 1;
  fillStatusSurface?.invalidatePending(runtime.id);
}

// --- Ambient fill hint (spec §5) ---------------------------------------
// Structure-only probe on the ACTIVE tab; the scheduler owns epochs, the
// identity token, and the single recheck (fill-hint.js, unit-tested).
// Probe callbacks resolve outside any ALS binding, so the hint write
// rebinds the tab's own runtime before broadcasting — same rule as the
// capture broadcasts.
const HINT_PROBE_SCRIPT = ONE_PASSWORD_AVAILABLE ? buildHintProbeScript() : null;
const fillHintScheduler = !ONE_PASSWORD_AVAILABLE ? null : createFillHintScheduler({
  runProbe: (tab) => liveContents(tab).executeJavaScriptInIsolatedWorld(
    FILL_WORLD_ID, [{ code: HINT_PROBE_SCRIPT }]
  ),
  isEligible: (tab) => {
    const wc = liveContents(tab);
    if (!wc || wc.isDestroyed() || tab.asleep) return false;
    const { onePasswordEnabled, onePasswordAccount } = settings.getSettings();
    if (!onePasswordEnabled || !String(onePasswordAccount ?? '').trim()) return false;
    const url = wc.getURL();
    if (!parseOnePasswordWebUrl(url) || isUtilityUrl(url)) return false;
    const runtime = windowRuntimes.runtimeForTab(tab.id);
    return runtime?.activeTabId === tab.id; // private tabs eligible; quiet excluded above
  },
  tabEpoch: (tab) => tab.navEpoch,
  contentsToken: (tab) => liveContents(tab)?.id ?? null,
  onHint: (tab, hinted) => {
    if ((tab.fillHint === true) === hinted) return;
    tab.fillHint = hinted;
    const runtime = windowRuntimes.runtimeForTab(tab.id);
    if (runtime) withWindowRuntime(runtime, () => broadcastTabs());
  },
  setTimeout,
  clearTimeout,
});

function captureOnePasswordTarget(runtime) {
  if (!runtime || !runtime.window || runtime.window.isDestroyed()) return null;
  const tab = tabs.get(runtime.activeTabId);
  const wc = liveContents(tab);
  if (!tab || !wc || wc.isDestroyed()) return null;
  const island = runtime.islandRect;
  return {
    runtime,
    runtimeId: runtime.id,
    tabId: tab.id,
    navEpoch: tab.navEpoch,
    url: wc.getURL(),
    webContents: wc,
    window: runtime.window,
    pickerPoint: island
      ? { x: island.x + Math.round(island.width / 2), y: island.y + island.height }
      : { x: 16, y: runtime.chromeHeight },
  };
}

function isOnePasswordTargetCurrent(target) {
  if (!target?.runtime || target.runtime.id !== target.runtimeId) return false;
  if (!target.window || target.window.isDestroyed()) return false;
  if (target.runtime.activeTabId !== target.tabId) return false;
  if (target.surfaceGeneration !== undefined
      && target.surfaceGeneration !== target.runtime.surfaceGeneration) return false;
  const tab = tabs.get(target.tabId);
  if (!tab || tab.navEpoch !== target.navEpoch) return false;
  const wc = liveContents(tab);
  return wc === target.webContents && !wc.isDestroyed() && wc.getURL() === target.url;
}

/** True when the ONLY reason the target is stale is a surface transition —
 * the user opened ⌘L/a sheet/Glance, switched tabs (even away and back), or
 * a permission prompt arrived. Such aborts are silent: the user chose to
 * leave (spec: Flow-level invalidation). */
function onePasswordSurfaceChanged(target) {
  if (!target?.runtime || target.surfaceGeneration === undefined) return false;
  return target.surfaceGeneration !== target.runtime.surfaceGeneration;
}

function prepareOnePasswordTarget(target) {
  return withWindowRuntime(target.runtime, () => {
    hideOverlay({ refocusContent: false });
    hideUtilitySheet({ refocusContent: false });
    // Capture AFTER the controller-owned cleanup above: a palette-started
    // fill closes the overlay as part of starting, which must not
    // self-invalidate (spec: Flow-level invalidation).
    target.surfaceGeneration = target.runtime.surfaceGeneration;
  });
}

/** Native-dialog fallback for the capsule surface: the only main-side
 * consumer of FILL_COPY. Decision kinds keep Cancel as default/cancel id
 * (today's `defaultId: 1` safety); notices are a single OK. */
async function showFillFallbackDialog(target, kind) {
  if (!target?.window || target.window.isDestroyed?.()) return 'cancel';
  const entry = FILL_COPY[kind];
  const def = FILL_KINDS[kind];
  if (!entry || !def) return 'cancel';
  const decision = def.mode === FILL_MODES.DECISION;
  const { response } = await dialog.showMessageBox(target.window, {
    type: decision ? 'question' : 'warning',
    title: entry.title,
    message: entry.title,
    detail: entry.body,
    buttons: decision ? [entry.primaryLabel, entry.cancelLabel] : ['OK'],
    defaultId: decision ? 1 : 0,
    cancelId: decision ? 1 : 0,
    noLink: true,
  });
  return decision && response === 0 ? 'primary' : 'cancel';
}

/** CSS field rect → window anchor, read against the tab's CURRENT view
 * bounds and zoom (vertical tabs, Glance, and non-100% zoom all move the
 * mapping). Null when the tab/view no longer matches the captured target —
 * the controller then falls back to the island pill anchor. */
function onePasswordToWindowPoint(target, rect) {
  const tab = tabs.get(target.tabId);
  const view = tab?.view;
  const wc = liveContents(tab);
  if (!view || !wc || wc !== target.webContents || wc.isDestroyed()) return null;
  return pickerAnchorPoint({ rect, viewBounds: view.getBounds(), zoomFactor: wc.getZoomFactor() });
}

function getFillStatusSurface() {
  if (!ONE_PASSWORD_AVAILABLE) return null;
  if (!fillStatusSurface) {
    fillStatusSurface = createFillStatusSurface({
      ensureView: (target) => withWindowRuntime(target.runtime, () => {
        const view = ensureFillStatusView();
        return view
          ? {
            webContents: view.webContents,
            id: view.webContents.id,
            loaded: rt().fillStatusViewLoaded === true,
          }
          : null;
      }),
      attach: (target) => withWindowRuntime(target.runtime, () => attachFillStatusView()),
      hide: (target) => withWindowRuntime(target.runtime, () => detachFillStatusView()),
      showFallbackDialog: showFillFallbackDialog,
      restoreFocus: (target) => {
        // Reason-aware: the surface only calls this on plain dismissals,
        // and a stale target (page changed, surface replaced) no-ops.
        if (isOnePasswordTargetCurrent(target)) target.webContents.focus();
      },
      setTimeout,
      clearTimeout,
    });
  }
  return fillStatusSurface;
}

function getOnePasswordFillController() {
  if (!ONE_PASSWORD_AVAILABLE) return null;
  if (!onePasswordFillController) {
    const surface = getFillStatusSurface();
    onePasswordFillController = createCredentialFillController({
      broker: onePasswordBroker,
      Menu,
      getSettings: settings.getSettings,
      captureTarget: captureOnePasswordTarget,
      isTargetCurrent: isOnePasswordTargetCurrent,
      surfaceChanged: onePasswordSurfaceChanged,
      prepareTarget: prepareOnePasswordTarget,
      openSettings: () => openInternalPage('blanc://settings/'),
      notify: (target, kind) => surface.notice(target, kind),
      confirm: (target, kind) => surface.decision(target, kind),
      toWindowPoint: onePasswordToWindowPoint,
    });
  }
  return onePasswordFillController;
}

function fillLoginFromOnePassword() {
  const controller = getOnePasswordFillController();
  return controller ? controller.fill(rt()) : Promise.resolve(false);
}

function normalizeAddressInput(input) {
  const trimmed = input.trim();
  const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)?.[1]?.toLowerCase();
  if (scheme) {
    // Script-executing schemes must never be navigable from the address bar.
    if (scheme === 'http' || scheme === 'https' || scheme === 'blanc') return trimmed;
    return settings.searchUrlFor(trimmed);
  }
  if (/^localhost(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`;
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`; // bare IPv4
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
  // Keep this projection self-contained: unit tests lift it without the rest
  // of Electron. The full byte/dimension validator already ran at every tab,
  // session, bookmark, and sync ingress; this final guard ensures only PNG
  // data—not a page-controlled URL—can ever cross into privileged chrome.
  const rendererFavicon = (value) =>
    typeof value === 'string' && value.startsWith('data:image/png;base64,')
      ? value
      : null;
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
        favicon: rendererFavicon(tab.favicon),
        bookmarked: tab.bookmarked,
        blockedCount: tab.blockedCount,
        private: tab.private,
        pinned: tab.pinned,
        muted: tab.muted,
        // isCurrentlyAudible() describes a playing stream even when Electron
        // has muted its output. Chrome should report sound only when it can
        // actually reach the speakers.
        audible: tab.audible && !(tab.muted || tab.backgroundAutoplayMuted),
        groupId: tab.groupId,
        pageBg: tab.pageBg,
        themeColor: tab.themeColor,
        // The sole Quiet Tabs field chrome may see. Operational sleep state
        // and snapshots remain main-process-only.
        asleep: tab.asleep,
        // Capture projection only — the record (anchors, frame counts) is
        // main-process-only, like every capture-state internal (spec §8).
        capture: tab.capture ?? { audio: false, video: false },
        // Ambient login-form hint — display state only, never persisted
        // or synced (spec §5).
        fillHint: tab.fillHint === true,
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
      const committedUrl = rest.asleep ? rest.url : committedUrlOf(tab.view);
      const connection = connectionFor({
        url: committedUrl,
        isLoading: rest.isLoading,
      });
      const targetUrl = tab.certificateError?.url ?? committedUrl ?? '';
      let certificateRecord = null;
      try {
        const wc = liveContents(tab);
        if (wc) certificateRecord = certificateObserver.get(wc.session, targetUrl);
      } catch { /* a view can disappear while projecting; fail neutral */ }
      const siteInfo = buildSiteInfo(targetUrl, {
        certificateRecord,
        certificateError: tab.certificateError,
        blockedCount: rest.blockedCount,
      });
      if (rest.private && rest.favicon) {
        // A page-favicon URL belongs to the tab's browsing session. Sending a
        // private tab's remote URL into persistent chrome would make the chrome
        // session fetch it again merely to paint the pill/overlay/rail, escaping
        // the non-persistent private-session boundary. Private rows deliberately
        // use the renderer's neutral fallback instead.
        return { ...rest, favicon: null, excepted, shield, connection, siteInfo };
      }
      return { ...rest, excepted, shield, connection, siteInfo };
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

// Rolling ads-blocked counter for the start page's margin note, plus the
// per-day buckets its tally layout charts. Weeks start Monday 00:00 local;
// the count resets lazily on the first touch (read or increment) after a
// week boundary. The arithmetic lives in adblock-stats.js, unit-tested.
let adblockStatsStore = null;
const ensureAdblockStats = () => {
  if (!adblockStatsStore) {
    adblockStatsStore = new JsonStore('adblock-stats', { weekStart: 0, blocked: 0, days: [0, 0, 0, 0, 0, 0, 0] });
    // A profile written by a build without buckets loads as {weekStart, blocked}.
    adblockStats.normalizeWeekStats(adblockStatsStore.data);
  }
  return adblockStatsStore;
};

function adblockWeekStats() {
  const s = ensureAdblockStats();
  if (s.data.weekStart !== adblockStats.currentWeekStart()) {
    s.update((d) => adblockStats.rollWeekStats(d));
  }
  return s;
}

let isQuitting = false;
let sessionPersistenceSuspended = false;
app.on('before-quit', () => {
  isQuitting = true;
  onePasswordBroker?.stop();
  for (const snapshot of [...sleepSnapshots.values()]) {
    const wc = snapshot.view?.webContents;
    if (wc && !wc.isDestroyed()) wc.close();
  }
  sleepSnapshots.clear(); // retained views, POST bodies, and form values
  for (const runtime of windowRuntimes.all()) {
    for (const entry of runtime.closedEntries ?? []) {
      if (entry.view) downgradeHeldEntry(entry);
      clearTimeout(entry.expiryTimer);
      entry.expiryTimer = null;
    }
  }
});

/** Builds one window's persistable session entry — the exact shape
 * persistSession() writes into session.json's windows[] array. Pulled out
 * of persistSession so the Named Workspace capture path can reuse this same
 * proven shape (private-tab exclusion, active-index rule, id/profileId)
 * instead of re-deriving it and risking drift between the two callers. */
function captureWindowEntry(runtime, { previousActiveIndex = 0 } = {}) {
  // Private tabs leave no trail, error pages persist their real destination,
  // and url-less adopted children drop out in lockstep with their metadata.
  const entries = persistableEntries(runtime.tabOrder.map((id) => tabs.get(id)));
  const entry = {
    id: runtime.id,
    profileId: runtime.profileId,
    // Named Workspaces single-window binding (Task 6): a POINTER, never the
    // tab set — the workspace's own tabs already live in workspaces.json,
    // autosaved separately (see autosaveWorkspaceBindings). null for a
    // scratch window. This is what lets releaseStartup re-bind the window to
    // the same workspace on the next launch instead of silently reverting to
    // scratch and leaving workspaces.json's copy stale the moment anything
    // is edited post-relaunch.
    workspaceId: runtime.workspaceId ?? null,
    urls: entries.map((item) => item.url),
    groupIds: entries.map((item) => item.groupId),
    pinned: entries.map((item) => item.pinned),
    meta: entries.map((item) => sessionTabMeta(tabs.get(item.id))),
    groups: runtime.groups.filter((group) => entries.some((item) => item.groupId === group.id)),
    activeIndex: previousActiveIndex,
  };
  // A private or provisional active tab preserves this window's last good
  // persisted selection rather than shifting focus on the next launch.
  const activeIndex = entries.findIndex((item) => item.id === runtime.activeTabId);
  if (activeIndex >= 0) entry.activeIndex = activeIndex;
  return entry;
}

function persistSession() {
  // Teardown closes tabs one by one; saving then would erode the session
  // file down to whatever closed last before the process exits.
  if (isQuitting || sessionPersistenceSuspended || tabs.size === 0) return;
  if (sessionReadOnly) return; // a newer format owns this file — never rewrite it
  ensureSessionStore().update((d) => {
    const previous = loadWorkspace(d);
    const previousById = new Map(previous.windows.map((entry) => [entry.id, entry]));
    const windows = windowRuntimes.all().map((runtime) => captureWindowEntry(runtime, {
      previousActiveIndex: previousById.get(runtime.id)?.activeIndex ?? 0,
    }));
    const activeWindowId = windowRuntimes.all().includes(focusedRuntime)
      ? focusedRuntime.id
      : windows[0]?.id ?? PRIMARY_WINDOW_ID;
    Object.assign(d, buildSaveShape(windows, d, { activeWindowId }));
  });
  // Named Workspaces autosave rides this exact call site: same guards above
  // (never during teardown/suspension/quit), same 250ms JsonStore debounce,
  // no new timer. Kept out of this function's own body — not folded in as a
  // loop here — so test/unit/session-meta.test.js's vm-sandboxed lift of
  // persistSession's literal source (it cannot require() this Electron-only
  // file) never needs to know the profile-scoped workspaces store exists;
  // that test stubs this one call as a no-op.
  autosaveWorkspaceBindings();
}

function removePersistedProfileWorkspaces(profileId) {
  if (isQuitting || sessionPersistenceSuspended || sessionReadOnly) return false;
  const store = ensureSessionStore();
  const removed = removeProfileWorkspaces(store.data, profileId);
  if (removed.readOnly) {
    sessionReadOnly = true;
    return false;
  }
  return store.updateAndFlush((data) => {
    Object.assign(data, buildSaveShape(removed.windows, data, {
      activeWindowId: removed.activeWindowId,
    }));
  });
}

/** Clearing history must not leave the same page titles sitting in
 * session.json's meta column — history.clearHistory() only rewrites
 * history.json. The next session write re-derives metadata for open tabs. */
function clearSessionMeta() {
  if (sessionReadOnly) return;
  ensureSessionStore().update((d) => {
    if (Array.isArray(d.windows)) {
      for (const windowEntry of d.windows) {
        if (windowEntry && typeof windowEntry === 'object') delete windowEntry.meta;
      }
    }
    delete d.meta;
  });
}

// --- Capture indicator (spec §3) ------------------------------------------
const CAPTURE_STOP_TIMEOUT_MS = 1500;

function resolveCaptureSurface(surfaceId) {
  if (typeof surfaceId === 'string' && surfaceId.startsWith('popup:')) {
    const wcId = Number(surfaceId.slice(6));
    if (windowRuntimes.runtimeForAuxiliaryContent(wcId) !== rt()) return null;
    const popup = popupCaptures.get(wcId);
    return popup && !popup.wc.isDestroyed()
      ? { kind: 'popup', record: popup.record, wc: popup.wc } : null;
  }
  const tab = tabs.get(surfaceId);
  if (tab && windowRuntimes.runtimeForTab(tab.id) !== rt()) return null;
  const wc = liveContents(tab);
  // Read-only here too: a surface without a record has nothing to stop.
  return tab && wc && tab.captureRecord
    ? { kind: 'tab', tab, record: tab.captureRecord, wc } : null;
}

function stopCaptureSurface(surfaceId) {
  const surface = resolveCaptureSurface(surfaceId);
  if (!surface) return;
  // Token the timeout on the record's generation: if this capture clears
  // and a NEW call starts inside the window (grant bumps generation), the
  // stale timer must not reload the new call out from under the user.
  const generation = surface.record.generation;
  for (const frame of surface.wc.mainFrame.framesInSubtree) {
    try { frame.send('capture:stop'); } catch {}
  }
  // The chip stays lit until truth clears it: a confirmed stop arrives as
  // ordinary zero snapshots; an uninstrumented surface gets reloaded and
  // clears on the reload's main-frame commit (spec §5).
  setTimeout(() => {
    if (surface.record.generation !== generation) return;
    const p = captureProjection(surface.record);
    if ((p.audio || p.video) && !surface.wc.isDestroyed()) surface.wc.reload();
  }, CAPTURE_STOP_TIMEOUT_MS);
}

function focusCaptureSurface(surfaceId) {
  const surface = resolveCaptureSurface(surfaceId);
  if (!surface) return;
  if (surface.kind === 'tab') setActiveTab(surface.tab.id);
  else BrowserWindow.fromWebContents(surface.wc)?.focus();
}
// Auxiliary popups are capture surfaces too (spec §3.3). PROCESS-WIDE and
// deliberately not runtime-owned: detachWindow wipes auxiliaryOwner on macOS
// window close, but an outlivesOpener popup keeps capturing across it.
const popupCaptures = new Map(); // wcId -> { record, wc }

// READ-ONLY resolution: never creates a record. Only the grant observer
// (ensureCaptureSurfaceForSender) may create one — grant-only off→on means
// an unsolicited report must find nothing to write into.
function captureSurfaceForSender(wc) {
  const tab = tabs.get(tabIdByWebContentsId.get(wc.id));
  if (tab) {
    return tab.captureRecord
      ? { kind: 'tab', tab, record: tab.captureRecord, wc: liveContents(tab) }
      : null;
  }
  const popup = popupCaptures.get(wc.id);
  return popup ? { kind: 'popup', record: popup.record, wc: popup.wc } : null;
}

function ensureCaptureSurfaceForSender(wc) {
  const tab = tabs.get(tabIdByWebContentsId.get(wc.id));
  if (tab) {
    if (!tab.captureRecord) tab.captureRecord = createCaptureRecord();
    return { kind: 'tab', tab, record: tab.captureRecord, wc: liveContents(tab) };
  }
  const popup = popupCaptures.get(wc.id);
  return popup ? { kind: 'popup', record: popup.record, wc: popup.wc } : null;
}

// Capture events arrive over native boundaries main.js doesn't bind — a bare
// ipcMain.on (never chromeOn: web content must not gain chrome-IPC trust),
// the permission request handler, and popup WebContents events — so every
// broadcast here must rebind the runtime itself (same rule downloads.js
// documents for its session callbacks).
function scheduleCaptureBroadcast(surface) {
  const owner = surface?.kind === 'tab'
    ? windowRuntimes.runtimeForTab(surface.tab.id)
    : windowRuntimes.runtimeForAuxiliaryContent(surface?.wc?.id);
  if (!owner) return;
  bindWindowRuntime(owner, () => {
    scheduleBroadcastTabs();
    if (rt().overlayMode !== 'capture') return;
    // The open popover tracks live truth: an emptied list closes it, a
    // changed row count resizes the card in place.
    if (captureRowCount() === 0) hideOverlay({ refocusContent: false });
    else if (rt().overlayView) rt().overlayView.setBounds(overlayBounds());
  })();
}

function refreshCaptureProjection(surface) {
  const p = captureProjection(surface.record);
  if (surface.kind === 'tab') {
    surface.tab.capture = p;
    surface.tab.capturing = p.audio || p.video;
  }
  scheduleCaptureBroadcast(surface);
}

function clearCaptureState(surface) {
  clearCaptureRecord(surface.record);
  refreshCaptureProjection(surface);
}

const captureHostOf = (url) => { try { return new URL(url).host; } catch { return ''; } };

/** Rows for every capturing surface + the window-wide chip union. Derived
 * fresh each broadcast so a closed tab or dead popup drops out by itself. */
function captureBroadcastState(serialized) {
  const rows = [];
  for (const row of serialized) {
    if (row.capture?.audio || row.capture?.video) {
      rows.push({
        surfaceId: row.id, host: captureHostOf(row.url), kind: 'tab',
        audio: !!row.capture.audio, video: !!row.capture.video,
      });
    }
  }
  for (const [wcId, popup] of popupCaptures) {
    if (windowRuntimes.runtimeForAuxiliaryContent(wcId) !== rt()) continue;
    if (popup.wc.isDestroyed()) continue;
    const p = captureProjection(popup.record);
    if (!p.audio && !p.video) continue;
    rows.push({
      surfaceId: `popup:${wcId}`, host: captureHostOf(popup.wc.getURL()), kind: 'popup',
      audio: p.audio, video: p.video,
    });
  }
  return {
    captureChip: {
      audio: rows.some((row) => row.audio),
      video: rows.some((row) => row.video),
    },
    capturePopover: { rows },
  };
}

/** Row count without a full serialize — sizes the popover card. */
function captureRowCount() {
  let count = 0;
  for (const tabId of rt().tabOrder) {
    const tab = tabs.get(tabId);
    if (tab.capture?.audio || tab.capture?.video) count += 1;
  }
  for (const [wcId, popup] of popupCaptures) {
    if (windowRuntimes.runtimeForAuxiliaryContent(wcId) !== rt()) continue;
    if (popup.wc.isDestroyed()) continue;
    const p = captureProjection(popup.record);
    if (p.audio || p.video) count += 1;
  }
  return count;
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

function currentTabsPayload() {
  const widthMetrics = verticalTabsMetrics();
  // Serialize once and hand the same list to the popover, so connection is
  // derived a single time per broadcast.
  const serialized = serializeTabs();
  const runtime = rt();
  return {
    tabs: serialized,
    activeTabId: runtime.activeTabId,
    glanceTabId: activeGlanceTab()?.id ?? null,
    groups: runtime.groups,
    // Closed entries cross only as the five-field projection (spec §4.1);
    // snapshots, seeds, slot metadata, and view references stay in main.
    closed: projectEntries(runtime.closedEntries ?? []),
    tabLayout,
    adblockEnabled: settings.getSettings().adblockEnabled,
    shieldPopover: activeShieldPopover(serialized),
    ...captureBroadcastState(serialized),
    ...widthMetrics,
  };
}

function broadcastTabs() {
  persistSession();
  // The Dock menu's active-tab line reflects the frontmost window, which may
  // not be rt() — refresh unconditionally, before the rt()-liveness return.
  refreshDockMenu();
  // Existing Tab Sync consent covers Personal's primary workspace only.
  if (rt().id === PRIMARY_WINDOW_ID && rt().profileId === DEFAULT_PROFILE_ID) {
    tabsync.noteTabsChanged();
  }
  if (!rt().window || rt().window.isDestroyed()) return;
  const runtime = rt();
  const payload = currentTabsPayload();
  rt().window.webContents.send('tabs:updated', payload);
  runtime.overlayView?.webContents.send('tabs:updated', payload);
}

function broadcastDownloadsActivity() {
  forEachWindowRuntime(() => {
    rt().window.webContents.send('chrome:downloads', downloadsActivity());
  }, { liveOnly: true });
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
  const glanceTab = activeGlanceTab();
  const glance = glanceTab ? glanceGeometry(layout) : null;
  if (tab?.view) tab.view.setBounds(glance?.primary ?? layout.pageBounds);
  if (glanceTab?.view && glance) glanceTab.view.setBounds(glance.glance);
  if (rt().overlayMode && rt().overlayView) rt().overlayView.setBounds(overlayBounds());
  if (rt().permissionViewAttached && rt().permissionView) {
    rt().permissionView.setBounds(permissionViewBounds());
  }
  if (rt().fillStatusViewAttached && rt().fillStatusView) {
    rt().fillStatusView.setBounds(fillStatusViewBounds());
  }
  const sheet = rt().utilitySheetUrl ? liveUtilitySheet() : null;
  if (sheet) sheet.view.setBounds(layout.utilityBounds);
  // The BrowserWindow renderer and native child views must move in the same
  // frame. A dedicated geometry event avoids turning every pointermove or
  // window resize into a tab/session-sync broadcast.
  rt().window.webContents.send('chrome:vertical-tabs-width', verticalTabsMetrics(layout));
  rt().window.webContents.send('chrome:glance-layout', glance);
}

function applyVerticalTabsWidth(nextWidth) {
  const next = normalizeVerticalTabsWidth(nextWidth);
  if (next === verticalTabsPreferredWidth) return false;
  verticalTabsPreferredWidth = next;
  forEachWindowRuntime(() => resizeActiveView(), { liveOnly: true });
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

  forEachWindowRuntime(() => {
    // A floating overlay is tied to the old pane center. Dismiss it in the
    // same main-process turn, then rebound the attached page/sheet without
    // navigating either document. The Settings sheet stays open so its own
    // layout choice does not eject the user mid-interaction.
    hideOverlay({ refocusContent: false });
    resizeActiveView();
    if (!rt().utilitySheetUrl) liveContents(tabs.get(rt().activeTabId))?.focus();
    broadcastTabs();
  }, { liveOnly: true });
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

function installVerticalTabsShortcut(webContents, owner = rt()) {
  webContents.on('before-input-event', bindWindowRuntime(owner, (event, input) => {
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

function installGlanceShortcut(webContents, owner = rt()) {
  webContents.on('before-input-event', bindWindowRuntime(owner, (event, input) => {
    const primaryModifier = process.platform === 'darwin'
      ? input.meta && !input.control
      : input.control && !input.meta;
    if (
      input.type !== 'keyDown' ||
      input.isAutoRepeat ||
      String(input.key).toLowerCase() !== 'g' ||
      !input.shift ||
      input.alt ||
      !primaryModifier
    ) return;
    // Browser-level shortcut: handle it whichever page or trusted surface has
    // focus, then suppress the duplicate native-menu accelerator dispatch.
    event.preventDefault();
    toggleGlance();
  }));
}

function installChromeShortcuts(webContents, owner = rt()) {
  installVerticalTabsShortcut(webContents, owner);
  installGlanceShortcut(webContents, owner);
  // Escape dismisses a visible fill capsule no matter which surface holds
  // focus (the capsule's own document also handles Escape when focused).
  // Guarded by this window's attach flag, so other windows' messages and
  // ordinary Escape uses are untouched.
  if (ONE_PASSWORD_AVAILABLE) {
    webContents.on('before-input-event', bindWindowRuntime(owner, (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'Escape') return;
      if (!rt().fillStatusViewAttached) return;
      event.preventDefault();
      fillStatusSurface?.invalidatePending(rt().id);
    }));
  }
  installPlatformMainMenuShortcut({
    webContents,
    Menu,
    getWindow: bindWindowRuntime(owner, () => rt().window),
  });
}

/** Convert a page-controlled favicon source into inert fixed-size PNG pixels
 * before it can cross into privileged chrome or persistent stores. */
async function setTabFavicon(tab, source) {
  const candidate = typeof source === 'string' ? source : null;
  const previousSource = tab.faviconSource ?? null;
  const epoch = (tab.faviconEpoch ?? 0) + 1;
  tab.faviconEpoch = epoch;
  tab.faviconSource = candidate;
  if (!candidate) {
    const changed = tab.favicon !== null;
    tab.favicon = null;
    if (changed) scheduleBroadcastTabs();
    if (tab.bookmarked) bookmarks.updateFavicon(tab.url, null);
    return true;
  }
  const urlAtStart = tab.url;
  const sanitized = await sanitizeFavicon(candidate, undefined, {
    allowNetwork: !tab.private,
    browsingSession: liveContents(tab)?.session,
    pageUrl: tab.url,
  });
  if (
    !tabs.has(tab.id) ||
    tab.faviconEpoch !== epoch ||
    tab.faviconSource !== candidate ||
    (tab.url !== urlAtStart && shouldClearFaviconOnNavigate(urlAtStart, tab.url))
  ) return false;
  const next = resolvedFavicon(tab.favicon, candidate, sanitized);
  if (!sanitized) tab.faviconSource = previousSource;
  const changed = tab.favicon !== next;
  tab.favicon = next;
  // Write decision lives in mayWriteFavoriteFavicon: not gated on
  // tab.bookmarked (redirect heal), but private tabs never write Favorites.
  // updateFavicon no-ops when nothing matches.
  if (mayWriteFavoriteFavicon(tab, sanitized)) bookmarks.updateFavicon(tab.url, sanitized);
  // The Billboard can reuse real site artwork without making a request of its
  // own. Keep one bounded, profile-local icon only after a successful normal
  // visit has already produced a sanitized PNG.
  if (sanitized && !tab.private && tab.historyEligible) {
    history.cacheSiteIcon(tab.url, sanitized);
  }
  if (changed) scheduleBroadcastTabs();
  if (sanitized) sync.captureTabIcon(tab).catch(() => {});
  return true;
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
  const owner = windowRuntimes.runtimeForTab(tab.id);
  if (!owner) return;
  setTimeout(bindWindowRuntime(owner, () => samplePageTint(tab)), 150);
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

/** Member record for a group entry: identity + field-copied snapshot. The
 *  sleep record's retained view is NOT taken — closeTab destroys it. */
function closedMemberRecord(id) {
  const tab = tabs.get(id);
  const sleepRecord = sleepSnapshots.get(id);
  let snapshot = null;
  if (sleepRecord) {
    snapshot = { entries: sleepRecord.entries, index: sleepRecord.index, droppedPageState: sleepRecord.droppedPageState };
  } else {
    try {
      const nav = liveContents(tab)?.navigationHistory;
      if (nav) snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
    } catch {}
  }
  snapshot = sanitizeSnapshot(snapshot, { restorableCommit: tab.restorableCommit === true });
  return {
    url: tab.url, title: tab.title, favicon: tab.favicon ?? null,
    pinned: !!tab.pinned, muted: !!tab.muted, private: !!tab.private, snapshot,
    // Batch entries (Close Other Tabs) span groups; each member re-resolves
    // this against the surviving groups at restore time. Group entries carry
    // their group at the entry level and ignore this field.
    groupId: tab.groupId ?? null,
  };
}

function closeGroup(groupId) {
  const runtime = rt();
  const group = runtime.groups.find((g) => g.id === groupId);
  const ids = runtime.tabOrder.filter((id) => tabs.get(id)?.groupId === groupId);
  if (!group || ids.length === 0) return;
  // Capture EVERYTHING first: pruneEmptyGroups destroys the record mid-loop
  // otherwise, and quiet members must be snapshotted, never woken (§2.2).
  const entry = buildGroupEntry({
    id: group.id, name: group.name, collapsed: group.collapsed,
    index: runtime.groups.indexOf(group),
    activeMemberIndex: Math.max(0, ids.indexOf(runtime.activeTabId)),
  }, ids.map(closedMemberRecord), Date.now());
  const anchorIndex = runtime.tabOrder.indexOf(ids[0]);
  for (const id of ids) closeTab(id, { record: false, selectReplacement: false });
  if (entry.tabs.length > 0) pushClosedEntry(entry); // an all-private group records nothing
  // One replacement selection at the end, not one per member.
  if (!runtime.activeTabId) {
    if (runtime.tabOrder.length > 0) {
      setActiveTab(runtime.tabOrder[Math.min(Math.max(anchorIndex, 0), runtime.tabOrder.length - 1)]);
    } else if (hasLiveWindow()) {
      setActiveTab(createTab());
    }
  }
  broadcastTabs();
  scheduleMenuRebuild();
}

// ---------------------------------------------------------------------------
// Named Workspaces: capture, apply, switch, single-window binding, autosave.
// Four distinct operations, only ever reached from their own named entry
// point below — conflating them is a data-loss bug (a save-as that tore down
// and recreated its own tabs would destroy any private tab in the window):
//   1. saveCurrentWindowAsWorkspace — save-as an EXISTING window's LIVE tab
//      set into a brand new workspace. No tab teardown, never calls
//      applyWorkspaceToWindow.
//   2. switchWindowToWorkspace — open/switch to an EXISTING workspace. Saves
//      this window's outgoing state, resolves the binding, then either
//      focuses the window that already has it open or calls
//      applyWorkspaceToWindow (the only OTHER caller allowed to — see 4).
//      Refuses up front (the scratch guard) when this window is unbound and
//      holds real tabs, unless the caller passes force:true.
//   3. Plain focus (inside switchWindowToWorkspace) — already open elsewhere;
//      focus that window and touch nothing else.
//   4. createBlankWorkspaceAndSwitch — create a brand new EMPTY workspace
//      (Patron-gated, and scratch-guarded the same way as #2, checked BEFORE
//      the record is created) and switch into it via #2 itself, never a
//      second copy of the apply protocol.
// ---------------------------------------------------------------------------

/** captureWindowEntry's `groups` field is main.js's own runtime.groups array
 * (filtered), so its elements are the SAME live objects toggleGroupCollapsed
 * (etc.) mutates in place. workspaces.js/workspaces-model.js only shallow-
 * copy the ARRAY on their way into the store (captureColumns' `asArray`), not
 * each group object — so handing a raw captureWindowEntry() result to
 * namedWorkspaces.create/saveCapture would let a later in-place group edit on
 * this SAME runtime silently corrupt the store's retained in-memory copy
 * behind its update()/debounced-save tracking. Named Workspaces persists a
 * point-in-time snapshot, so every capture reaching the store gets its own
 * independent group copies — captureWindowEntry itself must not change
 * (Task 5A behavior lock), so the fix lives here at the one seam that feeds
 * the workspaces store instead. */
function workspaceCapture(runtime, { previousActiveIndex = 0 } = {}) {
  const entry = captureWindowEntry(runtime, { previousActiveIndex });
  return {
    ...entry,
    groups: entry.groups.map((group) => ({ id: group.id, name: group.name, collapsed: !!group.collapsed })),
  };
}

/** The live process-wide {workspaceId: windowId} binding map, derived fresh
 * from window-runtime records every call — runtime.workspaceId is the only
 * storage, so there is nothing else to keep in sync.
 *
 * Review round 2 correction: derived from EVERY runtime, not just ones with
 * a live window. A windowless runtime (macOS dock-close of the primary
 * window, which deliberately keeps its workspaceId set — see
 * window-runtime-registry.js) is a REAL, current holder of its workspace,
 * not a stale one — the workspace is still bound, only the native window is
 * gone. Filtering it out here (an earlier version of this fix did) would
 * make resolveOpen see the workspace as unbound and let a second window
 * SWAP it away — silently stealing "Work" out from under the window that
 * still owns it, the moment its dock-closed holder came back and both
 * windows' next autosave raced over the same record. So every entry here is
 * a window-runtime record that exists in the registry, live or not; a
 * "focus" decision against a windowless entry means recreate-then-focus
 * (see switchWindowToWorkspace's focus branch), never swap. */
function deriveWorkspaceBindings() {
  const bindings = Object.create(null);
  for (const runtime of windowRuntimes.all()) {
    if (runtime.workspaceId) bindings[runtime.workspaceId] = String(runtime.id);
  }
  return bindings;
}

/** Write a {workspaceId: windowId} bindings map — as produced by one of
 * workspaces-model's bindingsAfterSwap/Unbind/Delete transitions — back onto
 * every runtime's workspaceId field, the map's only storage. Walks ALL
 * runtimes (live or not), matching deriveWorkspaceBindings() above: a
 * windowless holder's binding is real and must be reconciled exactly like a
 * live one's. This is the seam that makes those three model functions the
 * actual, load-bearing source of the transition logic (unit-tested in
 * workspaces-model.test.js) instead of a parallel hand-rolled version here
 * that no test could reach. */
function applyWorkspaceBindings(bindings) {
  const byWindowId = new Map();
  for (const workspaceId of Object.keys(bindings ?? {})) {
    byWindowId.set(bindings[workspaceId], workspaceId);
  }
  for (const runtime of windowRuntimes.all()) {
    runtime.workspaceId = byWindowId.get(String(runtime.id)) ?? null;
  }
}

/** Named Workspaces autosave: any bound (non-scratch) window's tab set is
 * re-captured on every persistSession() call, so it rides that function's
 * exact guards and its 250ms JsonStore debounce — no new timer. A scratch
 * window (workspaceId null) writes nothing to workspaces.json. Review round
 * 2, Fix 2: also floors against an empty capture. persistSession's own
 * tabs.size===0 guard is process-wide, so a second open window with real
 * tabs defeats it for THIS runtime — switchWindowToWorkspace's scratch-
 * during-swap window (see its own comment) is the primary fix for the
 * scenario that motivated this, but a runtime with genuinely zero
 * persistable tabs must never be allowed to overwrite a workspace's real
 * saved tabs with nothing. Defense in depth, not the only line. */
function autosaveWorkspaceBindings() {
  forEachWindowRuntime((runtime) => {
    if (!runtime.workspaceId) return; // scratch window — nothing to save
    const workspace = namedWorkspaces.get(runtime.workspaceId);
    if (!workspace) return; // deleted underneath us; unbound via its own path
    const capture = workspaceCapture(runtime, { previousActiveIndex: workspace.activeIndex });
    if (capture.urls.length === 0) return; // never overwrite real tabs with nothing
    namedWorkspaces.saveCapture(runtime.workspaceId, capture);
  }, { liveOnly: true });
}

/** Scratch guard (follow-up to Task 9, found by hands-on testing): the live
 * tabs workspaces-model's scratchSwitchGuardResult needs, gathered from
 * THIS window — kept out of the pure model so it never has to know about the
 * tabs Map or the runtime shape. Returns the exact
 * {ok:false, error:'unsaved-scratch', tabCount, privateCount} response every guarded call
 * site returns verbatim, or null when the switch is safe to proceed
 * (bound window whose persistable tabs autosave covers AND no private pages,
 * or a scratch window holding nothing but blank newtabs). Must be called
 * from inside the requesting window's own withWindowRuntime scope, exactly
 * like every other function in this section.
 *
 * Passes the LIVE tab list, not persistableEntries: that filter drops
 * private tabs, which applyWorkspaceToWindow still closes with no recovery. */
function scratchGuardResult(runtime) {
  return scratchSwitchGuardResult({
    bound: !!runtime.workspaceId,
    tabs: runtime.tabOrder.map((id) => tabs.get(id)),
    blankNewTabUrl: NEW_TAB_URL,
  });
}

/** Create/save-as: capture this window's LIVE tab set into a brand new Named
 * Workspace and bind the window to it. No tab teardown, and this must NEVER
 * call applyWorkspaceToWindow — the window's tabs already ARE the set being
 * saved, so re-applying them would close and recreate every tab (destroying
 * any private tab in the window) just to arrive back where it started. */
function saveCurrentWindowAsWorkspace(runtime, name) {
  return withWindowRuntime(runtime, () => {
    // No prior NAMED selection exists yet for this window, so a private or
    // provisional active tab falls back to the first persistable tab — the
    // captureWindowEntry default (previousActiveIndex 0), exactly like
    // persistSession treats a window never yet written to session.json.
    const result = namedWorkspaces.create({ name, capture: workspaceCapture(runtime) });
    if (result.ok) {
      runtime.workspaceId = result.workspace.id;
      // Write the binding pointer to session.json NOW. Binding alone only
      // changes memory: persistSession runs off tab activity, so saving a
      // workspace and quitting without touching a tab left session.json
      // holding workspaceId: null. The window then came back scratch, edits
      // went only to session.json, and reopening the workspace applied its
      // stale snapshot over the newer work — the exact loss Task 6 exists to
      // prevent. The swap path already persists for the same reason.
      persistSession();
    }
    return result;
  });
}

/** Open an EXISTING Named Workspace in this window. The ONLY caller allowed
 * to invoke applyWorkspaceToWindow (checklist step 2d in the plan).
 *
 * Scratch guard (follow-up to Task 9): `force` is the overlay's explicit
 * "discard and switch" — omitted (or false), a scratch (unbound) window
 * holding real tabs is refused up front, before ANYTHING below runs: no
 * outbound save, no binding resolution, no apply. Checked first, ahead of
 * even the outbound-save step. A bound window still triggers it when it
 * holds private pages (autosave does not cover those). */
function switchWindowToWorkspace(runtime, workspaceId, { force = false } = {}) {
  return withWindowRuntime(runtime, () => {
    const workspace = namedWorkspaces.get(workspaceId);
    if (!workspace) return { ok: false, error: 'not-found' };

    if (!force) {
      const guard = scratchGuardResult(runtime);
      if (guard) return guard;
    }

    // (a) Outbound save: capture THIS window's current state under its OLD
    // binding (if any) before anything moves, so nothing the user did in it
    // is lost. previousActiveIndex is the workspace's own last selection —
    // the named-workspace analogue of persistSession's previousById lookup —
    // so sitting on a private tab keeps that selection instead of jumping
    // to 0.
    if (runtime.workspaceId) {
      const outgoing = namedWorkspaces.get(runtime.workspaceId);
      if (outgoing) {
        namedWorkspaces.saveCapture(runtime.workspaceId, workspaceCapture(runtime, {
          previousActiveIndex: outgoing.activeIndex,
        }));
      }
    }

    // (b) Resolve against every OTHER window's binding — live or windowless
    // (deriveWorkspaceBindings' own comment). Captured once and reused below
    // for the swap transition too, so both see the exact same pre-swap
    // state.
    const before = deriveWorkspaceBindings();
    const decision = resolveOpen(before, workspaceId, String(runtime.id));

    if (decision.action === 'noop') return { ok: true, action: 'noop' }; // already here

    if (decision.action === 'focus') {
      // (c) Already bound elsewhere — never steal it, focus it instead.
      // Review round 2 correction: the holder may be windowless (macOS
      // dock-close of the primary window preserves its workspaceId; see
      // deriveWorkspaceBindings' comment). Recreate its window first via
      // the same createMainWindow path app.on('activate') already uses when
      // no windows remain, then focus — same restore-then-focus idiom as
      // second-instance/openExternalUrl's window activation. This window's
      // own tabs are untouched either way.
      const target = windowRuntimes.all().find((candidate) => String(candidate.id) === decision.windowId);
      // Report honestly, and WITH an error code: every other failure path
      // carries one, and a bare { ok:false } would make the UI fail silently
      // (no notice, no state change) instead of telling the user anything.
      if (!target) return { ok: false, action: 'focus', error: 'focus-failed', windowId: decision.windowId };
      if (!target.window || target.window.isDestroyed()) createMainWindow(target);
      if (target.window.isMinimized()) target.window.restore();
      target.window.focus();
      return { ok: true, action: 'focus', windowId: decision.windowId };
    }

    // (d) Unbound everywhere (resolveOpen already proved that against the
    // COMPLETE — live and windowless — bindings map above) — this window
    // takes it.
    //
    // Review round 2, Fix 1 (root cause of Important findings 1 and 2, and
    // the Minor about `finally` clobbering): the binding must not be
    // observable to autosave until the tab swap it describes has actually
    // finished. The original code bound runtime.workspaceId to the NEW
    // workspace, then called applyWorkspaceToWindow — but that function's
    // own points 1-2 (hideOverlay/hideUtilitySheet/closeGlance) ran BEFORE
    // persistence was suspended, and any of them firing a broadcastTabs
    // (closeGlance does) would run persistSession -> autosaveWorkspaceBindings
    // with the NEW workspaceId already set but the OLD (outgoing) tabs still
    // live — silently overwriting the new workspace's saved tabs with the
    // window's stale previous set before the swap had even started closing
    // anything.
    //
    // Fix: this window goes scratch (workspaceId null — no autosave target
    // at all) for the ENTIRE swap, persistence is suspended for the ENTIRE
    // swap (not just the tab churn — applyWorkspaceToWindow no longer owns
    // suspend/restore or the final persistSession(), see its own comment),
    // and the binding commits only after applyWorkspaceToWindow returns
    // normally, reconciled through workspaces-model's bindingsAfterSwap
    // (releases this window's own previous workspace — the workspace's
    // previous window is provably already empty, since resolveOpen's
    // 'swap' decision means nothing in `before` holds this id) rather than
    // a hand-rolled field write, so the unit-tested transition rule in
    // workspaces-model.test.js is the thing actually gating this, not a
    // parallel copy of its logic. A throw mid-apply leaves the window
    // scratch rather than bound to a half-applied set — and deliberately
    // NOT re-bound to the OLD workspace either, which would let a later
    // autosave overwrite the workspace the user was leaving with the
    // half-destroyed outgoing set. sessionPersistenceSuspended is restored
    // to whatever it was before (almost always false), not clobbered to
    // false, so a hypothetical future caller that already had persistence
    // suspended for its own reason isn't silently re-enabled by this one.
    const prevSuspended = sessionPersistenceSuspended;
    sessionPersistenceSuspended = true;
    runtime.workspaceId = null;
    try {
      applyWorkspaceToWindow(runtime, workspace);
      // commit only after a clean apply
      applyWorkspaceBindings(bindingsAfterSwap(before, { workspaceId: workspace.id, windowId: String(runtime.id) }));
    } finally {
      sessionPersistenceSuspended = prevSuspended;
    }
    // Checklist point 9 (moved here from applyWorkspaceToWindow — see its
    // comment): reflect the new live set, now correctly attributed, once.
    persistSession();
    return { ok: true, action: 'swap' };
  });
}

/** Create a brand-new, EMPTY Named Workspace and switch this window into it
 * — the locked spec's "create" operation (Task 9 shipped only save-as, so
 * every workspace was necessarily a copy of the current window; this is the
 * follow-up). Patron-gated: creating is the only Named Workspaces operation
 * that re-checks entitlement (list/open/rename/remove stay usable on a
 * lapsed Patron — it's the user's own data). The scratch guard is checked
 * BEFORE the record is created, not after, so a cancelled confirmation never
 * leaves an orphan empty workspace behind — creating first and relying on
 * switchWindowToWorkspace's own guard would check one step too late. Once
 * the record exists, binding and applying it is EXACTLY the same operation
 * as opening any other freshly-created workspace — delegated to
 * switchWindowToWorkspace itself (with force:true, since a real guard
 * decision — or an explicit caller override — already happened here) rather
 * than a second copy of the apply protocol. */
function createBlankWorkspaceAndSwitch(runtime, name, { force = false } = {}) {
  return withWindowRuntime(runtime, () => {
    if (!settings.isPatronActive()) return { ok: false, error: 'not-patron' };

    if (!force) {
      const guard = scratchGuardResult(runtime);
      if (guard) return guard;
    }

    const created = namedWorkspaces.create({
      name,
      capture: { urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] },
    });
    // {ok:false, error:'invalid-name'|'duplicate-name'|'limit'|'invalid-record'}
    // — never carries a workspace record, safe to return verbatim.
    if (!created.ok) return created;

    const switched = switchWindowToWorkspace(runtime, created.workspace.id, { force: true });
    // Only fails if the just-created record vanished before this ran (e.g. a
    // concurrent delete) — surfaced verbatim rather than assumed impossible.
    if (!switched.ok) return switched;
    return { ...switched, workspaceId: created.workspace.id };
  });
}

/** Replace this window's current tabs with one Named Workspace's captured
 * set. Copies the full restore/close protocol releaseStartup and closeGroup
 * already use — a partial copy pollutes undo, wakes quiet tabs, drops
 * groups, or rewrites session.json to a half-empty window. Reachable ONLY
 * from switchWindowToWorkspace's swap branch (2d) above.
 *
 * Review round 2, Fix 1: checklist points 3 (suspend/restore
 * sessionPersistenceSuspended) and 9 (the final persistSession()) moved to
 * that caller — they must bracket the BINDING commit (runtime.workspaceId),
 * not just this function's tab churn, so only the caller can own them. This
 * function assumes persistence is already suspended and the window already
 * scratch when it's called, leaves both exactly as it found them, and
 * throws through to the caller on any unexpected failure rather than
 * swallowing it (the caller relies on that: it only commits the binding
 * after this returns normally). */
function applyWorkspaceToWindow(runtime, workspace) {
  withWindowRuntime(runtime, () => {
    // 1. Dismiss floating chrome before touching tabs — the same guard other
    // main-process navigations use.
    hideOverlay({ refocusContent: false });
    hideUtilitySheet({ refocusContent: false });
    // 2. Glance is window-local and never persisted; it must not survive
    // into the incoming set.
    closeGlance({ focusContent: false });

    // 4. Batch-close every current tab exactly like closeGroup does:
    // record:false keeps Recently Closed from filling with the outgoing
    // set, selectReplacement:false stops each individual close from picking
    // (and immediately discarding) a replacement tab mid-swap. Snapshot
    // tabOrder first — closeTab mutates it as it goes.
    for (const id of [...runtime.tabOrder]) {
      closeTab(id, { record: false, selectReplacement: false });
    }

    // 5. Groups must exist on the runtime BEFORE any createTab call below —
    // createTab silently drops groupId otherwise (its own body:
    // `groupId && rt().groups.some((g) => g.id === groupId) ? groupId :
    // null`). Reconstructed as fresh, validated objects — the same
    // discipline session restore and reopenGroupEntry already apply when
    // reading a group record back from storage — so the runtime never
    // aliases the workspace record's own group objects; without this, a
    // later toggleGroupCollapsed on this window would silently corrupt
    // workspaces.json's in-memory copy behind saveCapture's back (the
    // mirror image of workspaceCapture's fix above, on the read side).
    runtime.groups = (Array.isArray(workspace.groups) ? workspace.groups : [])
      .filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string')
      .map((group) => ({ id: group.id, name: group.name, collapsed: !!group.collapsed }));

    // 6. Drop utility/forbidden URLs and keep the parallel columns zipped —
    // exactly what releaseStartup does before creating anything.
    const cleaned = filterRestoredSession({
      urls: workspace.urls,
      groupIds: workspace.groupIds,
      pinned: workspace.pinned,
      meta: workspace.meta,
      activeIndex: workspace.activeIndex,
    }, (url) => isUtilityUrl(url) || isForbiddenTopLevelUrl(url));

    // 7. Tabs are born quiet; only the selected one wakes (setActiveTab's
    // synchronous wakeTab prefix), so a switch is cheap regardless of how
    // many tabs the workspace holds.
    const restoredIds = cleaned.urls.map((url, index) => createTab(url, {
      groupId: cleaned.groupIds?.[index] ?? null,
      pinned: !!cleaned.pinned?.[index],
      asleep: true,
      title: cleaned.meta?.[index]?.title ?? '',
      favicon: cleaned.meta?.[index]?.favicon ?? null,
    }));
    pruneEmptyGroups();
    const target = restoreTargetId(restoredIds, cleaned.activeIndex);
    // 8. A workspace with nothing left after filtering (or saved empty) must
    // never leave the window tabless. NEW_TAB_URL, not newTabUrl() — the
    // checklist's floor is the blank internal newtab, not the user's
    // configured home page.
    setActiveTab(target ?? createTab(NEW_TAB_URL), { focusContent: true });
  });
}

/** Delete a Named Workspace and release whichever window (live or not) was
 * showing it, via workspaces-model's own bindingsAfterDelete transition
 * ("whatever window showed it becomes scratch") reconciled back onto
 * runtime.workspaceId by applyWorkspaceBindings — not a hand-rolled
 * equivalent. Bindings are 1:1 by construction (switchWindowToWorkspace's
 * bindingsAfterSwap always releases a window's previous workspace before
 * claiming a new one), so at most one runtime can match.
 *
 * Profile contract (Minor, review round 2): like every other function in
 * this file's Named Workspaces section, this relies on ambient
 * activeLocalProfileId() context to resolve namedWorkspaces.remove(id)
 * against the CORRECT profile's workspaces.json — it takes no runtime
 * parameter, matching workspaces.js's own list/get/create/rename/saveCapture
 * convention. Callers (Task 7/8's eventual IPC handler) must invoke this
 * from inside a withWindowRuntime/withLocalProfile scope bound to the
 * correct window — chromeHandle/chromeOn already do this for every existing
 * IPC handler in this file, so a handler built the normal way gets it for
 * free, but this is not self-enforcing the way an explicit `runtime`
 * parameter would be. deriveWorkspaceBindings/applyWorkspaceBindings below
 * are profile-agnostic by construction (any runtime that happens to hold a
 * given workspace's id belongs to that workspace's profile already, since
 * binding only ever happens through this file's own profile-scoped calls),
 * so they do not need — and must not gain — a profile filter of their own. */
function removeNamedWorkspace(id) {
  const result = namedWorkspaces.remove(id);
  if (result.ok) {
    applyWorkspaceBindings(bindingsAfterDelete(deriveWorkspaceBindings(), id));
  }
  return result;
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
  // An explicit user choice supersedes the temporary background-autoplay
  // guard. This keeps the visible mute control truthful in both directions.
  tab.backgroundAutoplayMuted = false;
  liveContents(tab)?.setAudioMuted(effectiveTabMuted(tab));
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
  // A real navigation destroys the document and its tracks; capture truth
  // starts over (spec §3.2). Same-document navs don't come through here.
  if (tab.captureRecord) clearCaptureState({ kind: 'tab', tab, record: tab.captureRecord });
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
  const owner = windowRuntimes.runtimeForTab(openerTabId) ?? rt();
  popupChildCounts.set(openerTabId, (popupChildCounts.get(openerTabId) ?? 0) + 1);
  childWindow.webContents.once('destroyed', bindWindowRuntime(owner, () => {
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
  // Optional (not in tab-view's required list): active-tab main-frame and
  // same-document navigations dismiss that window's fill capsule.
  dismissFillStatusForNavigation: (owner) => fillStatusSurface?.invalidatePending(owner.id),
  // Optional ambient-hint triggers (fill-hint.js owns all revalidation).
  onFillHintLoad: (tab) => fillHintScheduler?.notePageLoad(tab),
  onFillHintInPageNavigation: (tab) => fillHintScheduler?.noteInPageNavigation(tab),
  onFillHintNavigationStart: (tab) => fillHintScheduler?.clearTab(tab),
  broadcastTabs,
  scheduleBroadcastTabs,
  scheduleSampleTint,
  scheduleMenuRebuild,
  createTab,
  setActiveTab,
  closeTab,
  openInternalPage,
  currentChromeLayout,
  currentTabBounds,
  hideOverlay,
  hasLiveWindow,
  reclaimAddressBarFocus,
  shouldReclaimAddressBarFocus,
  installChromeShortcuts,
  watchCursorFor,
  isUtilityUrl,
  handOffToOs,
  setTabFavicon,
  registerPopupCaptureSurface(wc) {
    popupCaptures.set(wc.id, { record: createCaptureRecord(), wc });
    const drop = () => { popupCaptures.delete(wc.id); scheduleCaptureBroadcast(null); };
    const wipe = () => {
      const popup = popupCaptures.get(wc.id);
      if (popup) { clearCaptureRecord(popup.record); scheduleCaptureBroadcast(null); }
    };
    wc.once('destroyed', drop);
    wc.on('render-process-gone', wipe);
    wc.on('did-navigate', wipe);
  },
  clearTabCaptureState(tab) {
    if (tab.captureRecord) clearCaptureState({ kind: 'tab', tab, record: tab.captureRecord });
  },
  recordRendererCrash: (surface, details) => diagnostics.recordRendererCrash(surface, details),
  sanitizeCertificate,
  certificateErrorQuery,
  isStartupGateActive: () => startupNavigationGateActive,
  startupQueuedNavigations,
  onMainFrameCommit,
  noteWakeSuppressed,
  notePopupChild,
});

function createTab(url = newTabUrl(), { private: isPrivate = false, groupId = null, view = null, pinned = false, muted = false, restoreHistory = null, openerTabId = null, asleep = false, title = null, favicon = null, adoptView = null } = {}) {
  if (isForbiddenTopLevelUrl(url)) url = NEW_TAB_URL;
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
  // A Tier 0 reopen hands back the view parked at close: a live document that
  // predates this record. It is `adopting`, never `adopted` — there is no
  // opener relationship, so none of the window.open family rules apply.
  const adopting = !adopted && !!adoptView;
  if (adopting) view = adoptView;
  // Session restore builds every tab quiet: no view, renderer process, or
  // navigation — only the record the chrome draws. An adopted child is
  // already live and can never be born quiet.
  const bornQuiet = asleep && !adopted && !adopting;
  if (!bornQuiet) view ??= createTabView({
    private: isPrivate,
    profileId: owner.profileId,
  });

  const tab = {
    id,
    runtimeId: owner.id,
    profileId: owner.profileId,
    view: bornQuiet ? null : view,
    title: typeof title === 'string' && title ? title : 'New Tab',
    url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    favicon: validFavicon(favicon),
    faviconSource: validFavicon(favicon),
    faviconEpoch: 0,
    bookmarked: false,
    blockedCount: 0,
    private: isPrivate,
    pinned,
    muted,
    backgroundAutoplayMuted: false,
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
    // Monotonic main-frame navigation generation used to reject stale async
    // quiet-tab probes and snapshot work after a page swap.
    navEpoch: 0,
    // In-memory only: bounded details for the rejected top-level TLS load.
    certificateError: null,
    // --- Quiet Tabs (spec §3). None of these are serialized except `asleep`;
    // serializeTabs is an explicit allowlist precisely so they cannot leak. ---
    asleep: bornQuiet,        // renderer discarded; tab.view is null
    sleeping: false,          // teardown in progress
    waking: false,            // a wake generation is open
    wakeGeneration: 0,        // monotonic, never reset
    lastActiveAt: null,       // ms epoch; null until first stamp
    adopted,                  // an adopted window.open child is never quietable
    openerTabId,              // family-awareness for sleepCandidates
    usedMedia: false,         // 'media-started-playing'; cleared ONLY on main-frame nav
    // --- Capture indicator (spec §3). Projection + record; never serialized
    // beyond the explicit `capture` allowlist entry, never persisted. ---
    capture: { audio: false, video: false },
    capturing: false,         // projection mirror for the pure sleep policy
    captureRecord: null,      // created by the grant observer only
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

  // A quiet-born tab has no webContents until wakeTab builds one. Everything
  // below this point dereferences the view, so return before wiring/navigation.
  if (bornQuiet) {
    scheduleMenuRebuild();
    return id;
  }

  const wc = view.webContents;
  tabIdByWebContentsId.set(wc.id, id);
  // Adoption: the caller (reopenEntry) already removed the held firewall's
  // recorded listeners; wireTabView below re-installs the tab set.
  wireTabView(tab, view, { owner, adopted });

  if (adopting) {
    // The document predates this record (§3.3): re-attach chrome's listener
    // set, wake the audio path (wireTabView only ever mutes), and resync
    // what the island paints. Favicon stays the park-time value — Electron
    // has favicon events but no getter.
    wc.setAudioMuted(effectiveTabMuted(tab));
    view.setVisible(true);
    tab.url = wc.getURL() || tab.url;
    tab.title = wc.getTitle() || tab.title;
    // Every other re-derivation of this flag hangs off a navigation event, and
    // an adoption performs none — leaving the heart drawn empty on a favorited
    // page, where a click would delete the favorite instead of adding it.
    tab.bookmarked = bookmarks.isBookmarked(tab.url);
    tab.canGoBack = wc.navigationHistory.canGoBack();
    tab.canGoForward = wc.navigationHistory.canGoForward();
  }
  // Load failures surface via the did-fail-load handler above; the
  // rejected promise here is the same event and must not crash main.
  // Adopted window.open children are loaded by Chromium itself as part of
  // the window-open dance — a competing loadURL here would cancel it. An
  // adopting Tier 0 reopen already has its document; navigating would throw
  // away exactly the live state the hold existed to keep.
  if (!adopted && !adopting) {
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
  if (!next || windowRuntimes.runtimeForTab(id) !== rt()) return;
  // The wake's synchronous prefix creates its view before returning. This is
  // deliberately before every guard below, including the no-window path.
  if (next.asleep) wakeTab(id).catch(() => {});
  // A script-closed adopted tab prunes itself via its 'destroyed' handler,
  // but a deferred activation (the window-open setImmediate) can race the
  // event — never attach or focus a dead webContents.
  if (!liveContents(next)) return;

  // A tab whose media first started while hidden stays silent until the user
  // actually reveals it. This guard is separate from the persistent user mute.
  if (revealTabAudio(next)) liveContents(next)?.setAudioMuted(effectiveTabMuted(next));

  // Re-selecting the active tab is a no-op.
  if (id === rt().activeTabId) return;
  // A real tab switch is a surface transition: without this, switching away
  // and back during a broker await would restore every current-state
  // predicate and let the fill proceed on a tab the user left.
  bumpSurfaceGeneration();
  const promotingGlance = id === rt().glanceTabId;

  // Tab switches dismiss the sheet; the switched-to tab takes focus via
  // the existing flow below.
  hideUtilitySheet({ refocusContent: false });

  rt().lastActiveByCluster.set(clusterKeyForTab(next), id);
  rt().activationHistory = recordActivation(rt().activationHistory, id);

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
  if (rt().overlayMode === 'find' || rt().overlayMode === 'shield' || rt().overlayMode === 'capture') {
    hideOverlay({ refocusContent: false });
  }

  const prevId = rt().activeTabId;
  const prev = prevId ? tabs.get(prevId) : null;
  // EXPLICIT activation of the reference tab (Make main, an island row,
  // Cmd/Ctrl+digit) swaps the two visible roles. Interacting inside the
  // reference pane never reaches here — its focus handler deliberately does
  // not activate (the reference must be usable without changing roles). Keep
  // the previous active tab visible as the new Glance pane: the action is a
  // swap between two already-owned tabs, never a cross-window move.
  if (promotingGlance) {
    rt().glanceTabId = prev && windowRuntimes.runtimeForTab(prev.id) === rt()
      ? prev.id
      : null;
  }
  if (prev) {
    // Quiet Tabs: the tab is leaving the foreground — this is the ONLY moment
    // that defines "idle since" (spec §4.3). Stamp before a potential detach
    // error so the tab cannot be left eligible without an idle timestamp.
    prev.lastActiveAt = Date.now();
  }
  if (prev?.view && prev.id !== rt().glanceTabId) {
    rt().window.contentView.removeChildView(prev.view);
    // A detached view's document still reports visibilityState 'visible',
    // so Chromium never background-throttles its timers (the newtab sprite
    // would keep animating at 6fps forever). Hide it explicitly;
    // reactivation always calls setVisible(true).
    prev.view.setVisible(false);
  }

  rt().activeTabId = id;
  fillHintScheduler?.noteActivated(next);
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
  const glanceTab = activeGlanceTab();
  if (glanceTab?.view) {
    glanceTab.view.setVisible(true);
    rt().window.contentView.addChildView(glanceTab.view);
  }
  // The freshly attached tab view must not stack above an open overlay —
  // nor above the sheet (defensive: §5 means they shouldn't coexist here,
  // but a race must never paint a tab over either floating layer).
  const sheet = rt().utilitySheetUrl ? liveUtilitySheet() : null;
  if (sheet) rt().window.contentView.addChildView(sheet.view);
  restackFillStatusView(); // below the overlay and permission prompt
  if (rt().overlayMode && rt().overlayView) rt().window.contentView.addChildView(rt().overlayView);
  restackPermissionView();
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

async function setGlanceTab(id) {
  let tab = tabs.get(id);
  // A tab mid-sleep-teardown (`sleeping`) still reads back live contents, but
  // its renderer is already being discarded — attaching it would paint a dead
  // pane. Refuse; the picker reports the failure and a retry finds it asleep
  // and takes the wake path.
  if (
    !hasLiveWindow() || !tab || id === rt().activeTabId || tab.sleeping ||
    windowRuntimes.runtimeForTab(id) !== rt()
  ) return false;

  if (tab.asleep && !(await wakeTab(id))) return false;
  // Wake is asynchronous. Re-resolve every ownership/liveness condition so a
  // tab closed, moved, or superseded while loading can never be attached.
  tab = tabs.get(id);
  if (
    !hasLiveWindow() || !tab || id === rt().activeTabId || tab.sleeping ||
    windowRuntimes.runtimeForTab(id) !== rt()
  ) return false;
  if (!liveContents(tab) || !tab.view) return false;

  hideUtilitySheet({ refocusContent: false });
  const previous = activeGlanceTab();
  if (previous?.view && previous.id !== id) {
    rt().window.contentView.removeChildView(previous.view);
    previous.view.setVisible(false);
    previous.lastActiveAt = Date.now();
  }

  bumpSurfaceGeneration();
  rt().glanceTabId = id;
  tab.view.setVisible(true);
  rt().window.contentView.addChildView(tab.view);
  // Floating trusted surfaces must stay above both page panes.
  const sheet = rt().utilitySheetUrl ? liveUtilitySheet() : null;
  if (sheet) rt().window.contentView.addChildView(sheet.view);
  restackFillStatusView(); // below the overlay and permission prompt
  if (rt().overlayMode && rt().overlayView) rt().window.contentView.addChildView(rt().overlayView);
  restackPermissionView();
  resizeActiveView();
  broadcastTabs();
  scheduleMenuRebuild();
  rt().window.webContents.send('chrome:glance-status', `${tab.title || 'Tab'} opened in Glance`);
  return true;
}

function closeGlance({ focusContent = true } = {}) {
  const tab = activeGlanceTab();
  if (!rt().glanceTabId) return false;
  bumpSurfaceGeneration();
  rt().glanceTabId = null;
  if (tab?.view && hasLiveWindow()) {
    rt().window.contentView.removeChildView(tab.view);
    tab.view.setVisible(false);
    tab.lastActiveAt = Date.now();
  }
  resizeActiveView();
  broadcastTabs();
  scheduleMenuRebuild();
  if (hasLiveWindow()) rt().window.webContents.send('chrome:glance-status', 'Glance closed');
  if (focusContent) liveContents(tabs.get(rt().activeTabId))?.focus();
  return true;
}

function promoteGlance() {
  const id = activeGlanceTab()?.id;
  if (!id) return false;
  setActiveTab(id, { focusContent: true });
  const promoted = rt().activeTabId === id;
  if (promoted && hasLiveWindow()) {
    rt().window.webContents.send('chrome:glance-status', 'Glance made main');
  }
  return promoted;
}

function openGlancePicker() {
  if (!hasLiveWindow() || rt().tabOrder.length < 2) return false;
  rt().window.focus();
  showOverlay('glance', { purpose: activeGlanceTab() ? 'change' : 'open' });
  return true;
}

function toggleGlance() {
  return activeGlanceTab() ? closeGlance() : openGlancePicker();
}

function resizeGlanceAt(point) {
  const layout = currentChromeLayout();
  const glance = glanceGeometry(layout);
  if (!glance) return null;
  rt().glanceRatio = ratioForGlanceDivider(layout.pageBounds, point, glance.direction);
  resizeActiveView();
  return rt().glanceRatio;
}

function resetGlanceRatio() {
  if (!activeGlanceTab()) return null;
  rt().glanceRatio = DEFAULT_GLANCE_RATIO;
  resizeActiveView();
  return rt().glanceRatio;
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

// One list per window runtime, newest last. At most one entry holds a live
// view; a newer hold downgrades the incumbent rather than being refused
// (§2.1), and eviction destroys any view it pushes out (§5.4).
function pushClosedEntry(entry) {
  const owner = rt();
  const list = rt().closedEntries ??= [];
  if (entry.view) {
    for (const existing of list) if (existing.view) downgradeHeldEntry(existing);
  }
  list.push(entry);
  entry.expiryTimer = setTimeout(bindWindowRuntime(owner, () => {
    const due = new Set(expireEntries(owner.closedEntries ?? [], { now: Date.now() }));
    if (due.has(entry.id)) forgetClosedEntry(entry.id);
  }), CLOSED_ENTRY_TTL_MS);
  while (list.length > MAX_CLOSED_ENTRIES) {
    const evicted = list.shift();
    disposeClosedEntry(evicted);
  }
  scheduleMenuRebuild();
}

/** Drop every resource owned by one undo entry. Forgetting during the live
 * grace window destroys the parked page rather than leaving it hidden. */
function disposeClosedEntry(entry) {
  if (!entry) return;
  clearTimeout(entry.expiryTimer);
  entry.expiryTimer = null;
  clearTimeout(entry.holdTimer);
  if (entry.view) downgradeHeldEntry(entry);
  else entry.holdTimer = null;
}

/** Remove one entry without reopening it. Renderer ids are proposals; main
 * re-resolves them against the focused window's own list. */
function forgetClosedEntry(entryId, { broadcast = true } = {}) {
  const list = rt().closedEntries ?? [];
  const at = list.findIndex((entry) => entry.id === String(entryId));
  if (at === -1) return false;
  const [entry] = list.splice(at, 1);
  disposeClosedEntry(entry);
  if (hasLiveWindow()) {
    scheduleMenuRebuild();
    if (broadcast) broadcastTabs();
  }
  return true;
}

function clearClosedEntries() {
  const list = rt().closedEntries ?? [];
  if (!list.length) return false;
  for (const entry of list) disposeClosedEntry(entry);
  list.length = 0;
  if (hasLiveWindow()) {
    scheduleMenuRebuild();
    broadcastTabs();
  }
  return true;
}

/** Restore a group whole: record at its recorded cluster index, members
 *  born quiet with their snapshots parked in sleepSnapshots (the session-
 *  restore pattern), only the active member woken (§2.4). It sits ABOVE the
 *  close/reopen pair on purpose: close-tab-shutdown.test.js lifts closeTab by
 *  slicing to the next `function reopenClosedTab()`, so nothing may be
 *  inserted between those two. */
function reopenGroupEntry(entry) {
  const runtime = rt();
  let group = runtime.groups.find((g) => g.name === entry.group.name);
  if (!group) {
    group = { id: entry.group.id, name: entry.group.name, collapsed: !!entry.group.collapsed };
    runtime.groups.splice(Math.min(entry.group.index, runtime.groups.length), 0, group);
  }
  const ids = entry.tabs.map((member) => {
    const id = createTab(member.url, {
      groupId: group.id, pinned: member.pinned, muted: member.muted,
      asleep: true, title: member.title, favicon: member.favicon,
    });
    if (id && member.snapshot) {
      sleepSnapshots.set(id, {
        view: null,
        entries: member.snapshot.entries,
        index: member.snapshot.index,
        droppedPageState: member.snapshot.droppedPageState,
      });
    }
    return id;
  }).filter(Boolean);
  if (ids.length === 0) return;
  setActiveTab(ids[Math.min(entry.activeMemberIndex, ids.length - 1)]);
  broadcastTabs();
  scheduleMenuRebuild();
}

/** Restore a Close-Other-Tabs batch: members born quiet with their snapshots
 *  parked (the reopenGroupEntry pattern), each rejoining its recorded group
 *  only if that group still exists — no group is created. Placed ABOVE the
 *  close/reopen pair for the same source-slicing reason as reopenGroupEntry. */
function reopenBatchEntry(entry) {
  const ids = entry.tabs.map((member) => {
    const groupId = member.groupId && rt().groups.some((g) => g.id === member.groupId)
      ? member.groupId
      : null;
    const id = createTab(member.url, {
      groupId, pinned: member.pinned, muted: member.muted,
      asleep: true, title: member.title, favicon: member.favicon,
    });
    if (id && member.snapshot) {
      sleepSnapshots.set(id, {
        view: null,
        entries: member.snapshot.entries,
        index: member.snapshot.index,
        droppedPageState: member.snapshot.droppedPageState,
      });
    }
    return id;
  }).filter(Boolean);
  if (ids.length === 0) return;
  setActiveTab(ids[0]);
  broadcastTabs();
  scheduleMenuRebuild();
}

function closeTab(id) {
  const { record = true, selectReplacement = true } = arguments[1] ?? {};
  // First statement: any later early return must not strand recovery data.
  const sleepRecord = sleepSnapshots.get(id) ?? null;
  const retainedView = sleepRecord?.view ?? null;
  sleepSnapshots.delete(id);
  // A user close during a sleep teardown wins: do not rewire a tab going away.
  sleepTeardownInProgress = false;
  const tab = tabs.get(id);
  if (tab) fillHintScheduler?.clearTab(tab);
  if (!tab || windowRuntimes.runtimeForTab(id) !== rt()) return;
  forgetTabWebContentsIds(id);

  // Capture the prompt condition BEFORE cancelling — cancellation erases the
  // evidence the tier check reads (§5.1b).
  const promptPending = permissionPendingTabIds().has(id);
  cancelPermissionPromptsForTab(id);

  const closedIndex = rt().tabOrder.indexOf(id);
  let parked = false;
  if (record && !isQuitting && !rt().closing) {
    // Snapshot: field-copy from the sleep record (its view is NOT ours to
    // take — the storage-bearing quiet path leaves a live view there, §2.1),
    // else shape one from the live navigation history.
    let snapshot = null;
    if (sleepRecord) {
      snapshot = { entries: sleepRecord.entries, index: sleepRecord.index, droppedPageState: sleepRecord.droppedPageState };
    } else {
      try {
        const nav = liveContents(tab)?.navigationHistory;
        if (nav) snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
      } catch {}
    }
    snapshot = sanitizeSnapshot(snapshot, { restorableCommit: tab.restorableCommit === true });

    const openerAlive = !!(tab.openerTabId && tabs.has(tab.openerTabId));
    let hasManagedChild = false;
    for (const other of tabs.values()) {
      if (other.openerTabId === id) { hasManagedChild = true; break; }
    }
    // Private tabs, blank newtabs, and unusable URLs refuse here — the single
    // recording gate, deliberately not duplicated at any call site.
    const tier = holdEligibility(tab, {
      hasSnapshot: !!snapshot,
      promptPending,
      openerAlive,
      hasManagedChild,
      popupChildCount: popupChildCounts.get(id) ?? 0,
    });
    if (tier !== 'refuse') {
      const groupName = rt().groups.find((g) => g.id === tab.groupId)?.name ?? null;
      const entry = buildTabEntry(tab, snapshot, { index: closedIndex, groupName }, Date.now());
      if (tier === 'hold') parked = parkTabView(tab, entry);
      pushClosedEntry(entry);
    }
  }

  const wasActive = id === rt().activeTabId;
  const wasGlance = id === rt().glanceTabId;
  if (wasGlance) rt().glanceTabId = null;
  if (wasGlance && hasLiveWindow() && tab.view) {
    rt().window.contentView.removeChildView(tab.view);
  }
  if (wasActive && hasLiveWindow() && tab.view) rt().window.contentView.removeChildView(tab.view);

  rt().tabsWantingAddressBarFocus.delete(id);
  tabs.delete(id);
  popupChildCounts.delete(id);
  windowRuntimes.detachTab(id);
  rt().tabOrder = rt().tabOrder.filter((tid) => tid !== id);
  rt().activationHistory = (rt().activationHistory ?? []).filter((tid) => tid !== id);
  pruneEmptyGroups();
  const wc = tab.view?.webContents ?? retainedView?.webContents;
  if (wc) lastMainFrameMethod.delete(wc.id);
  // A parked view is detached from the model but deliberately still alive:
  // parking replaces destruction, never the removeChildView above.
  if (wc && !wc.isDestroyed() && !parked) wc.close();

  if (wasActive) {
    // Electron destroys the active view during app shutdown. Do not select a
    // surviving quiet tab here: setActiveTab would wake it and construct a
    // fresh WebContentsView while the native window is being torn down.
    if (isQuitting || rt().closing) {
      rt().activeTabId = null;
      return;
    }
    // A caller sequencing several closes (group close) owns the selection
    // itself; picking a neighbour per close would flash through the members.
    if (!selectReplacement) { rt().activeTabId = null; return; }
    const survivingGlanceId = rt().glanceTabId && tabs.has(rt().glanceTabId)
      ? rt().glanceTabId
      : null;
    if (survivingGlanceId) {
      // Closing the main page leaves the visible reference as the sole page.
      // Promote it and collapse Glance rather than silently choosing a third
      // background tab for the newly-empty primary pane.
      rt().glanceTabId = null;
      rt().activeTabId = null;
      setActiveTab(survivingGlanceId);
      return;
    }
    // Return to the previously active tab (activation history, most recent
    // surviving first); the right-neighbor rule is the fallback once history
    // is exhausted — e.g. right after session restore, where only the
    // selected tab was ever activated.
    const mruId = previousSurvivor(rt().activationHistory,
      (tid) => tabs.has(tid) && windowRuntimes.runtimeForTab(tid) === rt());
    if (mruId) {
      setActiveTab(mruId);
    } else if (rt().tabOrder.length > 0) {
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
  // Closing the underlying reference is also a layout transition. The normal
  // broadcast updates the header state, but only an explicit resize gives the
  // surviving main WebContentsView its full page bounds in the same turn.
  if (wasGlance && hasLiveWindow()) resizeActiveView();
  if (wasGlance && hasLiveWindow()) {
    rt().window.webContents.send('chrome:glance-status', 'Glance closed because its tab was closed');
  }
  broadcastTabs();
  scheduleMenuRebuild();
}

function reopenClosedTab() {
  const entry = rt().closedEntries?.pop();
  if (entry) reopenEntry(entry);
}

/** Restore one consumed entry. Tier 0 adopts the parked view; a dead or
 *  unattachable view falls through to the snapshot (§3.2). */
/** Explicit-quiet eligibility for one tab: the sweep's full sleepCandidates
 * policy (pinned, audible, opener families, permission-pending, glance, …)
 * minus only the idle threshold, evaluated in the tab's own window runtime.
 * The menu's enabled bit and sleepTabNow share this single predicate so the
 * item can never render enabled for a tab the action would refuse. */
function explicitSleepEligible(tab, owner) {
  if (!tab || !owner) return false;
  return withWindowRuntime(owner, () => {
    const tabList = rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean);
    return sleepCandidates(tabList, {
      activeTabId: rt().activeTabId,
      ignoreThreshold: true,
      snapshotCount: sleepSnapshots.size,
      maxSnapshots: MAX_SLEEP_SNAPSHOTS,
      permissionPendingTabIds: permissionPendingTabIds(),
      popupChildCounts,
      visibleTabIds: new Set([rt().glanceTabId].filter(Boolean)),
    }).includes(tab.id);
  });
}

/** "Quiet This Tab Now" (internal sleep vocabulary per the Quiet Tabs naming
 * rule). sleepTab's own async revalidation remains the backstop. */
function sleepTabNow(id) {
  const tab = tabs.get(id);
  if (!tab || !explicitSleepEligible(tab, windowRuntimes.runtimeForTab(id))) return;
  sleepTab(id);
}

/** "Close Other Tabs" — closeGroup's batch discipline: capture everything
 * first, select the kept tab ONCE up front (so no close ever needs a
 * per-member replacement, which would cascade activation — and wake — through
 * doomed tabs; closeTab's own comment forbids that caller pattern), close
 * with record/selectReplacement off, then record ONE batch entry so a single
 * ⌘⇧T undoes the whole action instead of flooding the 25-entry history. */
function closeOtherTabsInWindow(keepId) {
  if (!tabs.has(keepId) || windowRuntimes.runtimeForTab(keepId) !== rt()) return;
  const doomed = closableTabIds({ tabOrder: [...rt().tabOrder], tabsById: tabs, keepId });
  if (!doomed.length) return;
  const entry = buildBatchEntry(doomed.map(closedMemberRecord), Date.now());
  if (rt().activeTabId !== keepId) setActiveTab(keepId, { focusContent: false });
  for (const id of doomed) closeTab(id, { record: false, selectReplacement: false });
  if (entry.tabs.length > 0) pushClosedEntry(entry); // an all-private rest records nothing
  broadcastTabs();
  scheduleMenuRebuild();
}

/** "New Group…" handoff: open the command panel prefilled with /group, bound
 * to the right-clicked tab. The target rides the overlay:show purpose payload
 * so it is delivered atomically with the prefill AND replayed by the
 * did-finish-load path — a separate message would be lost on a slow first
 * load or crashed-overlay recreate, silently grouping the active tab. */
function beginNewGroup(tabId) {
  showOverlay('panel', { prefill: '/group ', purpose: { beginGroupTabId: tabId } });
}

function reopenEntry(entry) {
  clearTimeout(entry.expiryTimer);
  entry.expiryTimer = null;
  clearTimeout(entry.holdTimer);
  if (entry.kind === 'group') return reopenGroupEntry(entry);
  if (entry.kind === 'batch') return reopenBatchEntry(entry);
  const resolvedGroupId = entry.groupId && rt().groups.some((g) => g.id === entry.groupId)
    ? entry.groupId
    : null;
  const common = { pinned: entry.pinned, muted: entry.muted, groupId: resolvedGroupId };

  if (entry.view && entry.view.webContents && !entry.view.webContents.isDestroyed()) {
    const wcId = entry.wcId;
    // Unpark BEFORE adoption: remove exactly the firewall's recorded
    // listeners; wireTabView then re-installs the tab set (and its own
    // setWindowOpenHandler over the deny).
    removeHeldFirewall(entry, entry.view.webContents);
    const id = createTab(entry.url, {
      ...common, adoptView: entry.view, title: entry.title, favicon: entry.favicon,
    });
    if (id) {
      heldWebContents.delete(wcId);
      const tab = tabs.get(id);
      Object.assign(tab, entry.seed); // usedMedia, historyEligible, restorableCommit, httpEntryCount, deepScrolled
      finishReopen(id, entry);
      return;
    }
  }
  downgradeHeldEntry(entry);
  const id = createTab(entry.url, {
    ...common,
    restoreHistory: entry.snapshot
      ? { entries: entry.snapshot.entries, index: entry.snapshot.index }
      : null,
  });
  if (id) finishReopen(id, entry);
}

/** Slot splice + group-by-name fallback + activation, shared by all tiers. */
function finishReopen(id, entry) {
  const order = rt().tabOrder;
  const from = order.indexOf(id);
  if (from !== -1) {
    order.splice(from, 1);
    order.splice(Math.min(entry.index, order.length), 0, id);
  }
  if (!tabs.get(id)?.groupId && entry.groupName) groupTabByName(id, entry.groupName);
  setActiveTab(id);
  broadcastTabs();
  scheduleMenuRebuild();
}

function reorderTab(id, toIndex) {
  if (windowRuntimes.runtimeForTab(id) !== rt()) return;
  const from = rt().tabOrder.indexOf(id);
  if (from === -1) return;
  const clamped = Math.max(0, Math.min(rt().tabOrder.length - 1, toIndex));
  rt().tabOrder.splice(from, 1);
  rt().tabOrder.splice(clamped, 0, id);
  broadcastTabs();
  scheduleMenuRebuild();
}

function reorderTabWithinBucket(id, beforeId) {
  if (windowRuntimes.runtimeForTab(id) !== rt()) return false;
  if (beforeId != null && windowRuntimes.runtimeForTab(beforeId) !== rt()) return false;
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

function lastActiveTabId(runtime = rt()) {
  if (!runtime?.activeTabId) return null;
  return previousActiveSurvivor(
    runtime.activationHistory,
    runtime.activeTabId,
    (id) => tabs.has(id) && windowRuntimes.runtimeForTab(id) === runtime
  );
}

/** ⌥⌘Z: alternate between the two most recently active live tabs. */
function switchToLastActiveTab() {
  const id = lastActiveTabId();
  if (!id) return false;
  setActiveTab(id);
  return true;
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
  if (rt().activeTabId) toggleBookmarkForTab(rt().activeTabId);
}

/** Favoriting samples tab.favicon at click time. When it hasn't resolved yet —
 * or an earlier attempt failed on a page that has since settled — the favorite
 * keeps a null icon indefinitely, because the only other writer is a LATER
 * favicon event, and a settled page never emits one. So: wait out any in-flight
 * attempt, then make exactly one fresh attempt from the page's declared links.
 * setTabFavicon's own heal writes the result through; nothing here touches the
 * store directly. Fire-and-forget — a favorite is saved either way. */
function healFaviconForTab(tab) {
  const wc = liveContents(tab);
  if (!wc) return;
  Promise.resolve(tab.faviconPending).catch(() => {}).then(() => {
    if (!tabs.has(tab.id) || tab.private) return null;
    if (tab.favicon) {
      bookmarks.updateFavicon(tab.url, tab.favicon);
      return null;
    }
    return updateFaviconAfterDomReady(tab, wc, { setTabFavicon });
  }).catch(() => {});
}

/** Per-tab favorite toggle for the context menu; same guards as the active-tab
 * version (private tabs never populate synced Favorites). */
function toggleBookmarkForTab(id) {
  const tab = tabs.get(id);
  if (!tab || tab.private || !/^https?:\/\//.test(tab.url)) return;
  tab.bookmarked = bookmarks.toggleBookmark(tab.url, tab.title, tab.favicon);
  broadcastTabs();
  scheduleMenuRebuild();
  if (tab.bookmarked && !tab.favicon) healFaviconForTab(tab);
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
  if (tab.bookmarked && !tab.favicon) healFaviconForTab(tab);
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
    if (tab.bookmarked && !tab.favicon) healFaviconForTab(tab);
  }
  broadcastTabs();
  scheduleMenuRebuild();
}

/** Bookmark state can change from the bookmarks page; re-derive per tab. */
function refreshBookmarkFlags() {
  forEachWindowRuntime((runtime) => {
    for (const id of runtime.tabOrder) {
      const tab = tabs.get(id);
      if (tab) tab.bookmarked = bookmarks.isBookmarked(tab.url);
    }
    broadcastTabs();
  });
  scheduleMenuRebuild();
}

const ZOOM_STEP = 0.5;
const ZOOM_MIN = -8;
const ZOOM_MAX = 8;

/** Zoom acts on what the user is looking at: the sheet when open, else the active tab. */
function zoomTargetWebContents() {
  if (rt().utilitySheetUrl) return liveUtilitySheet()?.wc ?? null;
  return liveContents(tabs.get(rt().activeTabId));
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
    rt().permissionView && !rt().permissionView.webContents.isDestroyed()
      ? { webContents: rt().permissionView.webContents, url: CHROME_PERMISSION_URL }
      : null,
    rt().fillStatusView && !rt().fillStatusView.webContents.isDestroyed()
      ? { webContents: rt().fillStatusView.webContents, url: CHROME_FILL_STATUS_URL }
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
    return withWindowRuntime(runtime, () => {
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
    withWindowRuntime(runtime, () => {
      if (!isTrustedChromeSender(event)) {
        console.warn(`[ipc] ${channel}: denied for untrusted sender`);
        return;
      }
      handler(event, ...args);
    });
  });
}

// Named Workspaces IPC projection + freshness broadcast. Deliberately kept
// here next to chromeHandle/chromeOn rather than in the capture/apply/switch
// section up near removeNamedWorkspace, so nothing added for Task 7 can ever
// land inside the exact function-boundary text slices workspaces-apply.test.js
// lifts out of this file's source (applyWorkspaceToWindow/deriveWorkspaceBindings/
// applyWorkspaceBindings) — inserting here cannot shift those markers.
//
// PROJECTION ONLY: {id, name, active, tabCount} per item — never urls, meta,
// groups, profileId, createdAt, or the raw workspace record. Must be called
// from inside a window-runtime scope (chromeHandle/chromeOn already provide
// one) so rt() and the ambient local-profile context that namedWorkspaces
// resolves its file through both refer to the requesting window.
function workspacesProjection() {
  return {
    patronActive: settings.isPatronActive(),
    items: namedWorkspaces.list().map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      active: workspace.id === rt().workspaceId,
      tabCount: workspace.urls.length,
    })),
  };
}

/** Freshness: push the current projection to every OPEN window's chrome
 * surfaces after a mutation, so a pull-once ⌘L list can never keep showing a
 * stale "active" row after a switch happened from elsewhere. Recomputed
 * separately INSIDE each runtime's own scope (forEachWindowRuntime rebinds
 * both the window runtime and the local-profile context per iteration) —
 * a workspace list, and which row is active, is per-profile and per-window,
 * so one shared payload would leak one profile's workspace names into
 * another's window or mislabel which row is bound. Sent to both the chrome
 * window and the overlay — the two surfaces this preload is exposed to that
 * can plausibly render the list — mirroring how chrome:island-proximity
 * targets the window's webContents and chrome:remote-tabs-updated targets
 * the overlay's. */
function broadcastWorkspacesUpdated() {
  forEachWindowRuntime((runtime) => {
    const payload = workspacesProjection();
    runtime.window.webContents.send('chrome:workspaces-updated', payload);
    if (runtime.overlayView && !runtime.overlayView.webContents.isDestroyed()) {
      runtime.overlayView.webContents.send('chrome:workspaces-updated', payload);
    }
  }, { liveOnly: true });
}

// Workspace row context-menu targets (Rename/Delete, Task 8). Both funnel
// into showOverlay with a purpose payload — the SAME channel beginNewGroup
// (below) already uses to open an editing UI for a specific target inside an
// already-open panel. No new IPC: the renderer's overlay:show handler reads
// purpose.renameWorkspaceId/deleteWorkspaceId and renders that one row
// in-place as an inline editor or an inline delete-confirm. Placed here
// (next to workspacesProjection/broadcastWorkspacesUpdated, not the
// capture/apply/switch section above) for the same reason Task 7 placed its
// own additions here: nothing added for Task 8 can land inside the exact
// function-boundary text slices workspaces-apply.test.js lifts out of this
// file's source.
function beginRenameWorkspace(workspaceId) {
  showOverlay('panel', { purpose: { renameWorkspaceId: workspaceId } });
}
function beginDeleteWorkspace(workspaceId) {
  showOverlay('panel', { purpose: { deleteWorkspaceId: workspaceId } });
}
function workspaceMenuContextActions(owner) {
  const b = (fn) => bindWindowRuntime(owner, fn);
  return {
    rename: b((id) => beginRenameWorkspace(id)),
    remove: b((id) => beginDeleteWorkspace(id)),
  };
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
  chromeHandle('tabs:reopen-closed', () => reopenClosedTab());
  chromeHandle('tabs:reopen-entry', (_e, entryId) => {
    // Renderer input is a proposal: main re-resolves the id against its own
    // list; a stale or forged id is a no-op (the reorderTabWithinBucket rule).
    const list = rt().closedEntries ?? [];
    const at = list.findIndex((entry) => entry.id === String(entryId));
    if (at === -1) return;
    const [entry] = list.splice(at, 1);
    reopenEntry(entry);
  });
  chromeHandle('tabs:forget-closed-entry', (_e, entryId) => forgetClosedEntry(entryId));
  chromeHandle('tabs:clear-closed', () => clearClosedEntries());
  chromeHandle('tabs:switch', (_e, id) => setActiveTab(id));
  chromeHandle('tabs:activate-from-rail', (_e, id) => activateTabFromRail(id));
  chromeHandle('tabs:set-glance', (_e, id) => setGlanceTab(id));
  chromeHandle('tabs:open-glance-picker', () => openGlancePicker());
  chromeHandle('tabs:close-glance', () => closeGlance());
  chromeHandle('tabs:promote-glance', () => promoteGlance());
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
      const sectionMap = { blocking: '#group-privacy', patron: '#group-patron' };
      const fragment = name === 'settings' && Object.prototype.hasOwnProperty.call(sectionMap, section) ? sectionMap[section] : '';
      openInternalPage(`blanc://${name}/${fragment}`);
    }
  });
  chromeHandle('tabs:get-all', () => ({
    tabs: serializeTabs(),
    activeTabId: rt().activeTabId,
    glanceTabId: activeGlanceTab()?.id ?? null,
    groups: rt().groups,
    closed: projectEntries(rt().closedEntries ?? []),
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
  chromeOn('chrome:workspace-switcher', (_e, open) => {
    rt().workspaceSwitcherOpen = !!open;
  });
  // The "/" chip. No payload — the prefill is fixed, so nothing crosses IPC
  // that needs validating; it goes through the helper anyway so there is one
  // path that opens the panel with a prefill.
  chromeOn('chrome:open-island-commands', () => openIslandTyping('/'));
  // The pill's own keydown, when the pill holds keyboard focus.
  chromeOn('chrome:open-island-typing', (_e, char) => openIslandTyping(char));
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
  chromeOn('chrome:open-capture', (_e, anchor) => {
    if (rt().overlayMode === 'capture') return hideOverlay({ refocusContent: false }); // re-click toggles
    if (captureRowCount() === 0) return; // chip should be hidden; nothing to show
    rt().captureAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
    broadcastTabs(); // fresh state.capturePopover before the overlay renders
    showOverlay('capture');
  });
  chromeOn('chrome:capture-stop', (_e, surfaceId) => stopCaptureSurface(surfaceId));
  chromeOn('chrome:capture-focus', (_e, surfaceId) => {
    hideOverlay({ refocusContent: false });
    focusCaptureSurface(surfaceId);
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
  chromeOn('chrome:resize-glance', (_e, point) => resizeGlanceAt(point));
  chromeHandle('chrome:reset-glance', () => resetGlanceRatio());
  chromeOn('overlay:close', (_e, reason) => hideOverlay({ reason }));
  chromeOn('chrome:downloads-ack', () => {
    acknowledgeDownloads();
    broadcastDownloadsActivity();
  });

  // Data + actions behind the island's slash commands and Quick Switcher.
  chromeHandle('chrome:history-list', (_e, opts) => history.listHistory(opts ?? {}));
  chromeHandle('chrome:favorites-list', () => bookmarks.listBookmarks());
  chromeHandle('chrome:remote-tabs-list', () => sync.listRemoteDevices());
  if (ONE_PASSWORD_AVAILABLE) {
    chromeHandle('chrome:onepassword-fill', () => fillLoginFromOnePassword());
  }

  // Named Workspaces. Per the locked spec, Patron only ever ADDS: list/open/
  // rename/remove stay fully usable on a lapsed Patron (it's the user's own
  // data), so save-as and create-blank are the ONLY handlers that re-check
  // entitlement. open and create-blank additionally carry the scratch guard
  // (Task 9 follow-up): both can switch this window's tabs out from under
  // it, so both accept an optional {force:true} that skips the guard —
  // threaded straight through to switchWindowToWorkspace/
  // createBlankWorkspaceAndSwitch, never re-decided here. Every handler here
  // is a chromeHandle registration, which is what makes rt() and
  // namedWorkspaces' ambient local-profile context resolve to the REQUESTING
  // window/profile rather than whichever window last ran — a raw
  // ipcMain.handle would silently read/write the wrong profile's
  // workspaces.json.
  chromeHandle('chrome:workspaces-list', () => workspacesProjection());
  chromeHandle('chrome:workspaces-save-as', (_e, name) => {
    if (!settings.isPatronActive()) return { ok: false, error: 'not-patron' };
    const result = saveCurrentWindowAsWorkspace(rt(), name);
    // {ok:false, error: 'invalid-name'|'duplicate-name'|'limit'|'invalid-record'}
    // — namedWorkspaces.create's failure shape never carries a workspace
    // record, so it is safe to return verbatim.
    if (!result.ok) return result;
    broadcastWorkspacesUpdated();
    // Only the new id crosses the wire, never result.workspace itself.
    return { ok: true, workspaceId: result.workspace.id, ...workspacesProjection() };
  });
  chromeHandle('chrome:workspaces-open', (_e, id, opts) => {
    const result = switchWindowToWorkspace(rt(), id, { force: !!opts?.force });
    // {ok:false, error:'not-found'}, the scratch guard's
    // {ok:false, error:'unsaved-scratch', tabCount}, or the honest
    // {ok:false, action:'focus', windowId} report when the bound window
    // couldn't be recreated — none of these carry a workspace record.
    if (!result.ok) return result;
    broadcastWorkspacesUpdated();
    return { ...result, ...workspacesProjection() };
  });
  chromeHandle('chrome:workspaces-create-blank', (_e, name, opts) => {
    const result = createBlankWorkspaceAndSwitch(rt(), name, { force: !!opts?.force });
    // {ok:false, error:'not-patron'|'unsaved-scratch'|'invalid-name'|
    // 'duplicate-name'|'limit'|'invalid-record'|'not-found'|'focus-failed'} —
    // never a workspace record either.
    if (!result.ok) return result;
    broadcastWorkspacesUpdated();
    return { ...result, ...workspacesProjection() };
  });
  chromeHandle('chrome:workspaces-rename', (_e, id, name) => {
    const result = namedWorkspaces.rename(id, name);
    if (!result.ok) return result; // {ok:false, error:'not-found'|'invalid-name'|'duplicate-name'}
    broadcastWorkspacesUpdated();
    return { ok: true, ...workspacesProjection() };
  });
  chromeHandle('chrome:workspaces-remove', (_e, id) => {
    const result = removeNamedWorkspace(id);
    if (!result.ok) return result; // {ok:false, error:'not-found'}
    broadcastWorkspacesUpdated();
    return { ok: true, ...workspacesProjection() };
  });

  chromeHandle('chrome:search-suggestions', async (event, query) => {
    const currentSettings = settings.getSettings();
    const configuredEngine = currentSettings.searchEngine;
    const engineId = settings.SEARCH_ENGINES[configuredEngine] ? configuredEngine : 'duckduckgo';
    const engine = settings.SEARCH_ENGINES[engineId];
    const response = { engine: engineId, label: engine.label, suggestions: [] };

    searchSuggestionRequests.get(event.sender)?.abort();

    // The opt-out and private tabs are hard stops at the trusted main-process
    // boundary. Path/URL/credential-shaped input is independently rejected by
    // searchSuggestionService before its fetch implementation can run. Exact-
    // query search still works; only live provider suggestions pause.
    const tab = rt().activeTabId ? tabs.get(rt().activeTabId) : null;
    if (
      !settings.isFirstRunComplete() ||
      !currentSettings.searchSuggestions ||
      !tab ||
      tab.private
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
  chromeHandle('chrome:history-clear', () => {
    history.clearHistory();
    clearSessionMeta();
  });
  chromeHandle('chrome:adblock-toggle', () => runBlockAdsCommand());
  chromeHandle('chrome:adblock-exempt-active', () => runAllowAdsCommand());
  chromeHandle('chrome:sleep-background-tabs', () => sleepBackgroundTabsNow());
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
    buildMenu(focusedRuntime ?? primaryRuntime);
  }, 100);
}

/** Native-menu items for every open tab in cluster order (matching the pill
 * and panel switcher), with pins first within their own cluster. Clicking jumps to it.
 * Titles/domains reflect state as of the last menu rebuild, not the
 * current instant — see the Global Constraints note on this. */
function tabMenuItems(owner = rt()) {
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
      click: bindWindowRuntime(owner, () => setActiveTab(id)),
    };
  });
}

/** Double a literal '&' so native menus on Windows/Linux don't swallow it as
 * an Alt-mnemonic (macOS has no mnemonics). Apply to every menu label built
 * from user content — tab/favorite titles and folder names. */
const escapeMenuLabel = (label) => (process.platform === 'darwin' ? label : label.replace(/&/g, '&&'));

/** Native Favorites-menu items: folder submenus first (alphabetical), then
 * ungrouped favorites inline — mirroring the Favorites page. */
function favoritesMenuItems(owner = rt()) {
  const label = (b) => {
    const t = b.title || b.url;
    return t.length > 120 ? `${t.slice(0, 119)}…` : t;
  };
  const open = (b) => ({ label: escapeMenuLabel(label(b)), click: bindWindowRuntime(owner, () => setActiveTab(createTab(b.url))) });
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
  ['/reopen', 'Reopen the tab you just closed'],
  ['/pin', 'Pin or unpin this tab'],
  ['/mute', 'Mute or unmute this tab'],
  ['/sleep', 'Quiet background tabs and free their memory'],
  ['/group <name>', 'Move this tab into a group, creating it on first use'],
  ['/ungroup', 'Take this tab out of its group'],
  ['/close-group', 'Close every tab in this group'],
  ['/find', 'Find in page'],
  ['/block-ads', 'Block ads here, or toggle blocking everywhere'],
  ['/allow-ads', 'Allow ads on this site'],
  ['/1password', 'Fill a login from 1Password'],
  ['/theme [system|light|dark]', 'Cycle appearance, or switch directly to system, light, or dark'],
  ['/patron', 'Support Blanc with a Patron subscription'],
  ['/workspace', 'Switch to a named workspace, or type a new name to save this window'],
];

// A hand-picked subset of the full inventory (blanc://shortcuts/, via
// listShortcuts()) for a quick reference right in the Help menu — not
// exhaustive by design, "Show All Shortcuts…" links to the rest.
// This chord is deliberately macOS-only: Ctrl+Alt is AltGr on international
// Windows/Linux layouts, where Ctrl+Alt+Z may be ordinary text input.
const LAST_ACTIVE_TAB_ACCELERATOR = process.platform === 'darwin'
  ? 'Cmd+Alt+Z'
  : null;
const ONE_PASSWORD_ACCELERATOR = ONE_PASSWORD_AVAILABLE
  ? 'Cmd+Alt+P'
  : null;
const COMMON_KEYSTROKES = [
  ['New Window', 'CmdOrCtrl+N'],
  ['New Tab', 'CmdOrCtrl+T'],
  ['New Private Tab', 'CmdOrCtrl+Shift+N'],
  ['Close Tab', 'CmdOrCtrl+W'],
  ['Reopen Closed Tab', 'CmdOrCtrl+Shift+T'],
  ['Search & Commands', 'CmdOrCtrl+L'],
  ['Find in Page', 'CmdOrCtrl+F'],
  ...(ONE_PASSWORD_ACCELERATOR
    ? [['Fill Login from 1Password', ONE_PASSWORD_ACCELERATOR]]
    : []),
  ['Toggle Vertical Tabs', 'CmdOrCtrl+Alt+V'],
  ['Open or Close Glance', 'CmdOrCtrl+Shift+G'],
  ...(LAST_ACTIVE_TAB_ACCELERATOR
    ? [['Switch to Last Active Tab', LAST_ACTIVE_TAB_ACCELERATOR]]
    : []),
  ['Next Tab', 'Ctrl+Tab'],
  ['Previous Tab', 'Ctrl+Shift+Tab'],
  ['Next Tab in Group', 'Alt+CmdOrCtrl+Right'],
  ['Previous Tab in Group', 'Alt+CmdOrCtrl+Left'],
  ['Next Group', 'Alt+CmdOrCtrl+Down'],
  ['Previous Group', 'Alt+CmdOrCtrl+Up'],
];

function buildMenu(runtime = focusedRuntime ?? primaryRuntime) {
  return withWindowRuntime(runtime, () => buildMenuForRuntime(runtime));
}

function buildMenuForRuntime(runtime) {
  const isMac = process.platform === 'darwin';
  // On Windows/Linux native menus a lone "&" marks the next char as an Alt
  // mnemonic and is swallowed; a literal ampersand must be doubled. macOS
  // has no mnemonics, so leave labels untouched there.
  const mn = escapeMenuLabel; // literal '&' → '&&' on Win/Linux; see helper
  const favItems = favoritesMenuItems(runtime); // computed once; drives the separator below
  const profileItems = localProfiles.listLocalProfiles()
    .filter((profile) => !profileDeletions.hasPendingProfileDeletion(profile.id))
    .map((profile) => ({
    label: profile.name,
    type: 'checkbox',
    checked: profile.id === runtime.profileId,
    click: () => openExistingProfileWindow(profile.id),
  }));
  // Every native click: handler is wrapped here — Electron invokes menu
  // clicks from outside any JS causality chain our own bound roots created,
  // so each one must re-establish the runtime context at invocation time
  // (same reasoning as the tab-webContents listeners above).
  const bound = (fn) => bindWindowRuntime(runtime, fn);
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
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: bound(() => openNewWindow({ profileId: runtime.profileId })) },
        { label: 'New Profile Window', click: bound(() => openNewProfileWindow()) },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: bound(() => setActiveTab(createTab(newTabUrl()), { focusContent: false, focusAddress: true })) },
        { label: 'New Private Tab', accelerator: 'CmdOrCtrl+Shift+N', click: bound(() => setActiveTab(createTab(PRIVATE_NEW_TAB_URL, { private: true }), { focusContent: false, focusAddress: true })) },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: bound(() => rt().activeTabId && closeTab(rt().activeTabId)) },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          enabled: (runtime.closedEntries?.length ?? 0) > 0,
          click: bound(reopenClosedTab),
        },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: bound(() => rt().activeTabId && tabs.get(rt().activeTabId)?.view.webContents.print()) },
        { type: 'separator' },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: bound(() => openInternalPage('blanc://downloads/')) },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: bound(() => openInternalPage('blanc://settings/')) },
        { type: 'separator' },
        ...(isMac ? [] : [{ label: 'Check for Updates…', click: bound(checkForUpdatesManually) }, { type: 'separator' }]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Profiles',
      submenu: [
        { label: 'New Profile Window', click: bound(() => openNewProfileWindow()) },
        { label: 'Manage Profiles…', click: bound(() => openInternalPage('blanc://settings/')) },
        { type: 'separator' },
        ...profileItems,
      ],
    },
    { role: 'editMenu' }, // required for copy/paste/undo to work in inputs
    {
      label: 'View',
      submenu: [
        { label: mn('Search & Commands'), accelerator: 'CmdOrCtrl+L', click: bound(toggleIsland) },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: bound(openFindBar) },
        ...(ONE_PASSWORD_AVAILABLE ? [{
          label: 'Fill Login from 1Password',
          accelerator: ONE_PASSWORD_ACCELERATOR,
          click: bound(fillLoginFromOnePassword),
        }] : []),
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
        {
          id: 'toggle-glance',
          label: activeGlanceTab() ? 'Close Glance' : 'Open Glance…',
          accelerator: 'CmdOrCtrl+Shift+G',
          enabled: !!activeGlanceTab() || rt().tabOrder.length > 1,
          click: bound(toggleGlance),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        {
          id: 'switch-last-active-tab',
          label: 'Switch to Last Active Tab',
          ...(LAST_ACTIVE_TAB_ACCELERATOR
            ? { accelerator: LAST_ACTIVE_TAB_ACCELERATOR }
            : {}),
          enabled: !!lastActiveTabId(runtime),
          click: bound(switchToLastActiveTab),
        },
        { type: 'separator' },
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
        ...tabMenuItems(runtime),
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
          submenu: SLASH_COMMANDS
            .filter(([cmd]) => ONE_PASSWORD_AVAILABLE || cmd !== '/1password')
            .map(([cmd, hint]) => ({ label: mn(`${cmd} — ${hint}`) })),
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

/** The tab fields + window facts the shared context-menu model reads. `owner`
 * is the window runtime the menu belongs to. Null if the tab isn't in it. */
function tabContextData(tab, owner) {
  if (!tab || tab.runtimeId !== owner.id) return null;
  return {
    tab: {
      id: tab.id, url: tab.url, title: tab.title,
      pinned: !!tab.pinned, muted: !!tab.muted, private: !!tab.private,
      asleep: !!tab.asleep, bookmarked: !!tab.bookmarked,
      groupId: tab.groupId ?? null, capturing: !!tab.capturing,
    },
    groups: owner.groups.map((g) => ({ id: g.id, name: g.name })),
    activeTabId: owner.activeTabId,
    canCloseOthers: closableTabIds({ tabOrder: owner.tabOrder, tabsById: tabs, keepId: tab.id }).length > 0,
    canMoveToNewWindow: owner.tabOrder.length > 1,
    canQuiet: explicitSleepEligible(tab, owner),
  };
}

/** The action closures the context-menu runner calls, bound to `owner`. */
function menuContextActions(owner) {
  const b = (fn) => bindWindowRuntime(owner, fn);
  return {
    copy: (text) => clipboard.writeText(text),
    // A quiet tab has no live renderer to reload — waking IS its reload
    // (same branch openInternalPage takes).
    reload: b((id) => {
      const tab = tabs.get(id);
      if (!tab) return;
      if (tab.asleep) { wakeTab(id).catch(() => {}); return; }
      liveContents(tab)?.reload();
    }),
    duplicate: b((id) => duplicateTab(id)),
    togglePin: b((id) => toggleTabPinned(id)),
    toggleMute: b((id) => toggleTabMuted(id)),
    toggleFavorite: b((id) => toggleBookmarkForTab(id)),
    setGroup: b((id, gid) => setTabGroup(id, gid)),
    beginNewGroup: b((id) => beginNewGroup(id)),
    // Mirrors the row's glance chip: once the pane actually opens, dismiss the
    // panel so it isn't left floating over the fresh Glance split (a quiet tab
    // wakes first inside setGlanceTab, so success can take a beat).
    glance: b(async (id) => { if (await setGlanceTab(id)) hideOverlay(); }),
    quiet: b((id) => sleepTabNow(id)),
    newTab: b(() => setActiveTab(createTab(newTabUrl()), { focusContent: false, focusAddress: true })),
    newPrivateTab: b(() => setActiveTab(createTab(PRIVATE_NEW_TAB_URL, { private: true }), { focusContent: false, focusAddress: true })),
    closeOthers: b((id) => closeOtherTabsInWindow(id)),
    moveToNewWindow: b((id) => moveTabToNewWindow(id)),
    reopenClosed: b(() => reopenClosedTab()),
    close: b((id) => closeTab(id)),
  };
}

function createMainWindow(runtime = primaryRuntime, options = {}) {
  return withWindowRuntime(runtime, () => createMainWindowForRuntime(runtime, options));
}

function profileWindowTitle(profile) {
  return profile?.id === DEFAULT_PROFILE_ID
    ? 'Blanc'
    : `${profile?.name ?? 'Profile'} — Blanc`;
}

function createMainWindowForRuntime(runtime, { ensureStartTab = false } = {}) {
  if (runtime.window && !runtime.window.isDestroyed()) return runtime;
  runtime.closing = false;
  installProfileSessionPolicies(runtime.profileId);
  const localProfile = localProfiles.getLocalProfile(runtime.profileId);
  // Packaged Windows builds inherit the multi-resolution icon embedded in
  // Blanc.exe. Unpackaged development needs the same icon supplied explicitly
  // because its executable is Electron.exe.
  const windowIcon = windowsDevelopmentIconPath({ app });
  const newWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    title: profileWindowTitle(localProfile),
    backgroundColor: chromeBackgroundColor(),
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      partition: CHROME_PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRuntimes.attachWindow(runtime, { window: newWindow });
  windowRuntimes.registerChromeSurface(runtime, newWindow.webContents.id);
  // The chrome document's static <title> is just its document label. Keep the
  // native window title bound to profile identity across loads and reloads.
  newWindow.on('page-title-updated', bindWindowRuntime(runtime, (event) => {
    event.preventDefault();
    newWindow.setTitle(profileWindowTitle(localProfiles.getLocalProfile(runtime.profileId)));
  }));
  // The strip's own 68px band. Its document IS the window, so no offset.
  watchCursorFor(newWindow.webContents, { x: 0, y: 0 },
    (fn) => bindWindowRuntime(runtime, fn));

  lockPrivilegedNavigation(rt().window.webContents, CHROME_INDEX_URL);
  installChromeShortcuts(rt().window.webContents);
  rt().window.webContents.on('render-process-gone', bindWindowRuntime(runtime, (_event, details) => {
    diagnostics.recordRendererCrash('chrome', details);
  }));
  attachChromeMenu(rt().window.webContents, {
    getWindow: bindWindowRuntime(runtime, () => rt().window),
    resolveActiveTab: bindWindowRuntime(runtime, () =>
      tabContextData(tabs.get(rt().activeTabId), runtime)),
    // Vertical-rail rows: same string→number id coercion as the overlay rows.
    resolveTab: bindWindowRuntime(runtime, (rawId) => {
      const id = tabs.has(rawId) ? rawId : (tabs.has(Number(rawId)) ? Number(rawId) : null);
      return id == null ? null : tabContextData(tabs.get(id), runtime);
    }),
    actions: menuContextActions(runtime),
  });
  rt().window.loadURL(CHROME_INDEX_URL);
  createOverlay();
  rt().window.on('resize', bindWindowRuntime(runtime, resizeActiveView));
  rt().window.on('focus', bindWindowRuntime(runtime, () => {
    focusedRuntime = runtime;
    setFocusedLocalProfile(runtime.profileId);
    buildMenu(runtime);
    refreshDockMenu(); // frontmost window changed → new active-tab line
    refocusAddressBarIfWanted();
  }));
  const dockReopenLifecycle = createDockReopenLifecycle({
    platform: process.platform,
    runtime,
    primaryRuntime,
    window: newWindow,
    tabs,
    liveContents,
    getIsQuitting: () => isQuitting,
    ensureStartTab,
    createStartTab: () => createTab(newTabUrl()),
    activateTab: (id) => setActiveTab(id),
    flushExternalUrls,
  });
  rt().window.on('close', bindWindowRuntime(runtime, dockReopenLifecycle.onWindowClose));
  rt().window.on('closed', bindWindowRuntime(runtime, () => {
    // Destroy the views the window owned — detachWindow only forgets them.
    liveViewContents(runtime.overlayView)?.close();
    liveViewContents(runtime.utilitySheetView)?.close();
    liveViewContents(runtime.permissionView)?.close();
    // A pending fill decision must not survive its window invisibly and
    // keep activeFlow occupied — release it (covers the native-fallback
    // case too, where no view exists), then destroy the capsule view.
    fillStatusSurface?.invalidatePending(runtime.id);
    liveViewContents(runtime.fillStatusView)?.close();
    flushPermissionPrompts(runtime);
    if (!isQuitting && runtime !== primaryRuntime) {
      // Named Workspaces: a real (non-primary) window close is a real,
      // permanent unbind — unlike the primary's dock-close below, this
      // runtime is never coming back. Routed through workspaces-model's own
      // bindingsAfterUnbind ("a window closed... it binds nothing"),
      // reconciled via applyWorkspaceBindings, for the same reason
      // switchWindowToWorkspace and removeNamedWorkspace do: the tested
      // transition rule gates this, not a parallel hand-rolled field write.
      applyWorkspaceBindings(bindingsAfterUnbind(deriveWorkspaceBindings(), { windowId: String(runtime.id) }));
      for (const tabId of [...runtime.tabOrder]) closeTab(tabId, { record: false });
      for (const entry of runtime.closedEntries ?? []) disposeClosedEntry(entry);
      runtime.closedEntries = [];
      windowRuntimes.discardRuntime(runtime);
      if (!sessionReadOnly) persistSession();
    } else {
      // The primary window's workspaceId deliberately survives detachWindow,
      // same as its tabs/groups below: dock-reopen recreates the window over
      // the SAME workspace, not a scratch one. See window-runtime-registry.js.
      for (const entry of runtime.closedEntries ?? []) {
        if (entry.view) downgradeHeldEntry(entry);
      }
      windowRuntimes.detachWindow(runtime);
    }
    const next = windowRuntimes.all().find((candidate) =>
      candidate.window && !candidate.window.isDestroyed() && !candidate.closing) ?? primaryRuntime;
    focusedRuntime = next;
    setFocusedLocalProfile(next.profileId);
    refreshDockMenu(); // frontmost window changed (or all closed)
    if (windowRuntimes.all().some((candidate) =>
      candidate.window && !candidate.window.isDestroyed())) {
      buildMenu(next);
    }
    // The detached favicon rasterizer view isn't a BrowserWindow, so it would
    // otherwise linger past the last window (blocking `window-all-closed` quit
    // on Windows/Linux). Recreated lazily on the next non-PNG capture.
    if (!windowRuntimes.all().some((candidate) =>
      candidate.window && !candidate.window.isDestroyed())) iconRaster.dispose();
  }));

  // Tabs survive window close (macOS dock-reopen recreates the window);
  // re-attach the active tab's view or the new window sits over nothing.
  // First launch has no activeTabId yet — app.whenReady handles that one.
  rt().window.webContents.once('did-finish-load', bindWindowRuntime(
    runtime,
    dockReopenLifecycle.onChromeReady
  ));
  return runtime;
}

function createWindowRuntimeId() {
  return `window_${crypto.randomUUID().replace(/-/g, '')}`;
}

/** The frontmost window's active tab, as the Dock menu's top line. Mirrors the
 * app menu's private-leak rule (tabMenuItems): a private active tab shows a
 * generic label and no favicon, never its real title/URL. macOS-only. */
function dockActiveTabDescriptor() {
  if (process.platform !== 'darwin') return null;
  // No line while every window is closed (macOS dock-close): a Dock-icon
  // click already reopens the last workspace, and a tab line over an empty
  // app reads as a phantom window.
  if (!focusedRuntime?.window || focusedRuntime.window.isDestroyed()) return null;
  const id = focusedRuntime.activeTabId;
  const tab = id != null ? tabs.get(id) : null;
  if (!tab) return null;
  if (tab.private) return { label: 'Private tab', iconDataUrl: null };
  const raw = tab.title || (tab.isLoading ? 'Loading…' : 'New Tab');
  const label = raw.length > 75 ? `${raw.slice(0, 74)}…` : raw;
  const favicon = typeof tab.favicon === 'string' && tab.favicon.startsWith('data:image/')
    ? tab.favicon : null;
  return { label, iconDataUrl: favicon };
}

/** Push the current frontmost active tab onto the Dock menu. Cheap: the handle
 * rebuilds only when the visible line changes, so this is safe to call on every
 * tab broadcast and focus change. No-op until app-ready and off macOS. */
function refreshDockMenu() {
  dockMenuHandle?.update(dockActiveTabDescriptor());
}

/** Dock "active tab" line click: raise the frontmost window, recreating one on
 * macOS if every window is closed (as a Dock-icon click would). */
function focusDockActiveWindow() {
  const win = focusedRuntime?.window;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(primaryRuntime, { ensureStartTab: true });
  }
  focusedRuntime = primaryRuntime;
  setFocusedLocalProfile(primaryRuntime.profileId);
}

function openNewWindow(options = {}) {
  const requestedProfileId = options?.profileId
    ?? focusedRuntime?.profileId
    ?? DEFAULT_PROFILE_ID;
  const profileId = localProfiles.getLocalProfile(requestedProfileId)?.id
    ?? DEFAULT_PROFILE_ID;
  if (profileDeletions.hasPendingProfileDeletion(profileId)) {
    throw new Error('This local profile is being deleted');
  }
  const runtime = windowRuntimes.createRuntime({
    id: createWindowRuntimeId(),
    profileId,
  });
  createMainWindow(runtime);
  return withWindowRuntime(runtime, () => {
    let tabId = null;
    if (options.adoptTabId != null && tabs.has(options.adoptTabId)) {
      // Adopt an existing tab (Move Tab to New Window) instead of seeding a
      // fresh one — the caller has already detached it from its old window.
      tabId = options.adoptTabId;
      const tab = tabs.get(tabId);
      tab.runtimeId = runtime.id;
      windowRuntimes.attachTab(runtime, tabId);
      runtime.tabOrder = [tabId];
      // Re-home the per-tab listener set: wireTabView binds its owner runtime
      // once at attach time, so without this every media/find/beforeunload/
      // window.open handler would keep acting on the OLD window. A retained-
      // storage quiet tab keeps a live, still-wired WebContents in its sleep
      // snapshot (wakeTab's retained branch deliberately skips rewiring), so
      // that view needs the same treatment as an awake one.
      const wiredView = liveContents(tab) ? tab.view : (sleepSnapshots.get(tabId)?.view ?? null);
      const wiredWc = wiredView?.webContents;
      if (wiredWc && !wiredWc.isDestroyed()) {
        unwireTabView(wiredWc);
        wireTabView(tab, wiredView, { owner: runtime, adopted: !!tab.adopted });
      }
      setActiveTab(tabId); // attaches (and wakes a discarded quiet tab) here
    } else {
      tabId = options.private
        ? createTab(PRIVATE_NEW_TAB_URL, { private: true })
        : createTab(newTabUrl());
      if (tabId) setActiveTab(tabId, { focusContent: false, focusAddress: true });
    }
    focusedRuntime = runtime;
    setFocusedLocalProfile(runtime.profileId);
    runtime.window.show();
    runtime.window.focus();
    broadcastTabs();
    buildMenu(runtime);
    return runtime.id;
  });
}

/** "Move Tab to New Window": detach the tab from its window and adopt it into
 * a fresh one via openNewWindow's adoptTabId mode (shared scaffold = shared
 * guards and bring-up sequencing). Ungrouped on move — a group spanning two
 * windows isn't a modeled concept (context-menus design §6). Pin and mute
 * state travel with the tab. */
function moveTabToNewWindow(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  // Never mid-sleep-transition: teardown/wake own the view lifecycle, and
  // sleepTab's revalidation now also refuses a tab that changed runtimes.
  if (tab.sleeping || tab.waking) return;
  const source = windowRuntimes.runtimeForTab(id);
  if (!source || source.tabOrder.length <= 1) return; // sole tab — no-op
  // Checked BEFORE the source surgery: openNewWindow throws on a pending
  // profile deletion, which would otherwise strand a detached tab.
  if (profileDeletions.hasPendingProfileDeletion(source.profileId)) return;

  // 1. Detach from the source window. A pending permission prompt belongs to
  //    this window's runtime and would float over unrelated content (and its
  //    per-tab cancel path could never find it again post-move) — cancel it,
  //    same as closeTab; the page re-requests in the new window. If the tab
  //    is the Glance pane, close that; if active, hand focus to the MRU
  //    survivor (closeTab's rule) with the right-neighbour as fallback. The
  //    view is already detached at that point (active → survivor selection,
  //    Glance → closeGlance, background → never attached).
  withWindowRuntime(source, () => {
    cancelPermissionPromptsForTab(id);
    if (rt().glanceTabId === id) closeGlance({ focusContent: false });
    if (rt().activeTabId === id) {
      const mruId = previousSurvivor(rt().activationHistory,
        (tid) => tid !== id && tabs.has(tid) && windowRuntimes.runtimeForTab(tid) === rt());
      const survivor = mruId ?? pickSurvivorTabId(source.tabOrder, id);
      if (survivor != null) setActiveTab(survivor, { focusContent: false });
    }
    source.tabOrder = source.tabOrder.filter((tid) => tid !== id);
    source.activationHistory = (source.activationHistory ?? []).filter((tid) => tid !== id);
    rt().tabsWantingAddressBarFocus.delete(id);
    tab.groupId = null; // ungroup BEFORE pruning, or the empty group survives
    pruneEmptyGroups();
    broadcastTabs(); // persists the session as part of the broadcast
  });

  // 2. Shared window bring-up + adoption (runtimeId, attachTab, listener
  //    rewire, activation, focus, menu) all live in openNewWindow's adopt
  //    branch, keeping guards and sequencing in one place.
  openNewWindow({ profileId: source.profileId, adoptTabId: id });
}

function openNewProfileWindow(name) {
  const profile = localProfiles.createLocalProfile(name);
  const runtimeId = openNewWindow({ profileId: profile.id });
  scheduleMenuRebuild();
  return { profile, runtimeId };
}

function createNamedLocalProfileWindow(name) {
  try {
    return { ok: true, ...openNewProfileWindow(name) };
  } catch (error) {
    return { ok: false, message: error.message || 'Couldn’t create that profile.' };
  }
}

function openExistingProfileWindow(profileId) {
  if (profileDeletions.hasPendingProfileDeletion(profileId)) {
    return { ok: false, message: 'That profile is being deleted.' };
  }
  const profile = localProfiles.getLocalProfile(profileId);
  if (!profile) return { ok: false, message: 'That profile no longer exists.' };
  return { ok: true, runtimeId: openNewWindow({ profileId: profile.id }) };
}

function refreshProfilePresentation(profile) {
  forEachWindowRuntime((runtime) => {
    if (runtime.profileId !== profile.id || !runtime.window || runtime.window.isDestroyed()) return;
    runtime.window.setTitle(profileWindowTitle(profile));
  });
  scheduleMenuRebuild();
}

function renameNamedLocalProfile(profileId, name) {
  try {
    if (profileDeletions.hasPendingProfileDeletion(profileId)) {
      return { ok: false, message: 'That profile is being deleted.' };
    }
    const profile = localProfiles.renameLocalProfile(profileId, name);
    if (!profile) return { ok: false, message: 'That profile no longer exists.' };
    refreshProfilePresentation(profile);
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, message: error.message || 'Couldn’t rename that profile.' };
  }
}

function namedProfileDataDirectory(profileId) {
  if (profileId === DEFAULT_PROFILE_ID) throw new Error('Personal cannot be deleted');
  const root = path.resolve(app.getPath('userData'), 'profiles');
  const target = path.resolve(root, profileId);
  if (path.dirname(target) !== root) throw new Error('Invalid local profile data path');
  return target;
}

async function destroyProfileWindow(runtime) {
  const window = runtime.window;
  if (!window || window.isDestroyed()) return;
  // Electron's BrowserWindow visibility listener reads native state on every
  // hide event. Destroying a still-visible window can queue that event after
  // the native object is gone, where the listener throws "Object has been
  // destroyed". Settle visibility first, then perform the intentional forced
  // close that prevents a tab's beforeunload handler retaining deleted data.
  if (window.isVisible()) {
    await new Promise((resolve) => {
      window.once('hide', resolve);
      window.hide();
    });
  }
  if (window.isDestroyed()) return;
  await new Promise((resolve) => {
    window.once('closed', resolve);
    // Confirmation is the terminal commit point. beforeunload cannot retain a
    // window whose local cookie jar and product records are being erased.
    window.destroy();
  });
}

async function clearNamedProfileSessions(profileId) {
  const owned = profileSessionRegistry.forProfile(profileId);
  await Promise.all([owned.normal, owned.private].flatMap((browsingSession) => [
    browsingSession.clearStorageData(),
    browsingSession.clearCache(),
    browsingSession.clearAuthCache(),
  ]));
}

const deletingProfileIds = new Set();
let profileDeletionRecoveryTimer = null;

function scheduleProfileDeletionRecovery() {
  if (profileDeletionRecoveryTimer) return;
  profileDeletionRecoveryTimer = setTimeout(() => {
    profileDeletionRecoveryTimer = null;
    resumePendingProfileDeletions().catch((error) => {
      console.warn('[profiles] could not resume profile deletion:', error.message);
    });
  }, 1000);
}

async function completeNamedProfileDeletion(profileId, {
  closeWindows = false,
  ensureSurvivingWindow = false,
} = {}) {
  const errors = [];
  const profile = localProfiles.getLocalProfile(profileId);

  if (ensureSurvivingWindow) {
    const hasSurvivor = windowRuntimes.all().some((runtime) =>
      runtime.profileId !== profileId && runtime.window && !runtime.window.isDestroyed());
    if (!hasSurvivor) openNewWindow({ profileId: DEFAULT_PROFILE_ID });
  }

  if (closeWindows) {
    const ownedRuntimes = windowRuntimes.all()
      .filter((runtime) => runtime.profileId === profileId);
    try {
      await Promise.all(ownedRuntimes.map(destroyProfileWindow));
    } catch (error) {
      errors.push(error);
    }
    if (windowRuntimes.all().some((runtime) =>
      runtime.profileId === profileId && runtime.window && !runtime.window.isDestroyed())) {
      return {
        complete: false,
        message: 'Waiting for the profile windows to close before erasing local data.',
      };
    }
  }

  try {
    await clearNamedProfileSessions(profileId);
  } catch (error) {
    errors.push(error);
  }
  try {
    discardProfileDownloads(profileId);
    discardProfileStoreEntries(profileId);
    fs.rmSync(namedProfileDataDirectory(profileId), { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }

  if (!removePersistedProfileWorkspaces(profileId)) {
    errors.push(new Error('Couldn’t remove this profile’s saved workspaces.'));
  }
  try {
    if (profile) localProfiles.removeLocalProfile(profileId, { flush: true });
  } catch (error) {
    errors.push(error);
  }
  profileSessionRegistry.remove(profileId);

  if (errors.length) {
    return {
      complete: false,
      message: `Profile deletion is still finishing: ${errors[0].message || 'cleanup will retry automatically.'}`,
    };
  }
  try {
    profileDeletions.clearProfileDeletion(profileId);
  } catch {
    return {
      complete: false,
      message: 'Profile data was removed, but final cleanup bookkeeping will retry automatically.',
    };
  }
  return { complete: true };
}

async function resumePendingProfileDeletions() {
  for (const profileId of profileDeletions.pendingProfileDeletions()) {
    const hasLiveWindow = windowRuntimes.all().some((runtime) =>
      runtime.profileId === profileId && runtime.window && !runtime.window.isDestroyed());
    const result = await completeNamedProfileDeletion(profileId, {
      closeWindows: hasLiveWindow,
      ensureSurvivingWindow: hasLiveWindow,
    });
    if (!result.complete) {
      console.warn(`[profiles] pending deletion for ${profileId}: ${result.message}`);
    }
  }
}

async function deleteNamedLocalProfile(profileId, confirmation) {
  const profile = localProfiles.getLocalProfile(profileId);
  if (!profile || profile.id === DEFAULT_PROFILE_ID) {
    return { ok: false, message: 'Only a named profile can be deleted.' };
  }
  if (confirmation !== profile.name) {
    return { ok: false, message: `Type “${profile.name}” exactly to delete this profile.` };
  }
  if (sessionReadOnly) {
    return { ok: false, message: 'This Blanc build cannot safely remove a newer saved workspace.' };
  }
  if (profileDeletions.hasPendingProfileDeletion(profile.id) || deletingProfileIds.has(profile.id)) {
    return { ok: true, pending: true, message: 'That profile is already being deleted.' };
  }

  try {
    profileDeletions.markProfileDeletion(profile.id);
  } catch (error) {
    return { ok: false, message: error.message || 'Couldn’t safely start profile deletion.' };
  }

  deletingProfileIds.add(profile.id);
  try {
    const result = await completeNamedProfileDeletion(profile.id, {
      closeWindows: true,
      ensureSurvivingWindow: true,
    });
    scheduleMenuRebuild();
    if (result.complete) return { ok: true, profile };
    scheduleProfileDeletionRecovery();
    return { ok: true, pending: true, message: result.message };
  } catch (error) {
    scheduleProfileDeletionRecovery();
    return {
      ok: true,
      pending: true,
      message: `Profile deletion is still finishing: ${error.message || 'cleanup will retry automatically.'}`,
    };
  } finally {
    deletingProfileIds.delete(profile.id);
  }
}

function windowRuntimeSnapshots() {
  return windowRuntimes.all().map((runtime) => ({
    id: runtime.id,
    profileId: runtime.profileId,
    profileName: localProfiles.getLocalProfile(runtime.profileId)?.name ?? 'Personal',
    title: runtime.window && !runtime.window.isDestroyed() ? runtime.window.getTitle() : null,
    tabOrder: [...runtime.tabOrder],
    activeTabId: runtime.activeTabId,
    glanceTabId: runtime.glanceTabId,
    // Count only: a closed entry can hold a live view and page state, neither
    // of which may be copied into a snapshot structure.
    closedEntryCount: (runtime.closedEntries ?? []).length,
    tabs: runtime.tabOrder.map((id) => {
      const tab = tabs.get(id);
      return tab ? { id, url: tab.url, private: !!tab.private } : null;
    }).filter(Boolean),
    groups: runtime.groups.map(({ id, name, collapsed }) => ({ id, name, collapsed })),
    attached: !!runtime.window && !runtime.window.isDestroyed(),
  }));
}

function closeWindowRuntime(id) {
  const runtime = windowRuntimes.all().find((candidate) => candidate.id === id);
  if (!runtime || runtime === primaryRuntime || !runtime.window || runtime.window.isDestroyed()) return false;
  runtime.window.close();
  return true;
}

function runInWindowRuntime(id, work) {
  const runtime = windowRuntimes.all().find((candidate) => candidate.id === id);
  if (!runtime) return null;
  return withWindowRuntime(runtime, work);
}

function openTabInWindow(id, url, options = {}) {
  return runInWindowRuntime(id, () => {
    const tabId = createTab(url, options);
    if (tabId) setActiveTab(tabId);
    return tabId;
  });
}

function setGlanceTabInWindow(runtimeId, tabId) {
  return runInWindowRuntime(runtimeId, () => setGlanceTab(tabId));
}

function closeTabInWindow(runtimeId, tabId) {
  return runInWindowRuntime(runtimeId, () => {
    if (windowRuntimes.runtimeForTab(tabId) !== rt()) return false;
    closeTab(tabId);
    return true;
  });
}

function closeGlanceInWindow(runtimeId) {
  return runInWindowRuntime(runtimeId, () => closeGlance({ focusContent: false }));
}

function reopenClosedTabInWindow(runtimeId) {
  return runInWindowRuntime(runtimeId, () => {
    const before = rt().activeTabId;
    reopenClosedTab();
    return rt().activeTabId !== before ? rt().activeTabId : null;
  });
}

function profileTabSessionSnapshot(tabId) {
  const tab = tabs.get(tabId);
  const runtime = tab ? windowRuntimes.runtimeForTab(tab.id) : null;
  const wc = liveContents(tab);
  if (!tab || !runtime || !wc) return null;
  const owned = profileSessionRegistry.forProfile(runtime.profileId);
  const expected = tab.private ? owned.private : owned.normal;
  const personal = profileSessionRegistry.forProfile(DEFAULT_PROFILE_ID);
  return {
    profileId: runtime.profileId,
    private: !!tab.private,
    matchesProfileSession: wc.session === expected,
    persistent: wc.session.isPersistent(),
    isolatedFromPersonal: runtime.profileId === DEFAULT_PROFILE_ID
      ? true
      : wc.session !== (tab.private ? personal.private : personal.normal),
  };
}

function localProfileSnapshots() {
  return localProfiles.listLocalProfiles()
    .filter((profile) => !profileDeletions.hasPendingProfileDeletion(profile.id));
}

function profileBookmarkUrls(runtimeId) {
  return runInWindowRuntime(runtimeId, () =>
    bookmarks.listBookmarks().map((bookmark) => bookmark.url));
}

function saveProfileFavorite(runtimeId, url, title = url) {
  return runInWindowRuntime(runtimeId, () => {
    bookmarks.saveFavorite(String(url), String(title));
    return bookmarks.isBookmarked(String(url));
  });
}

// Re-apply the current WebRTC policy to every open tab (used when the setting changes).
function applyWebrtcPolicyToAllTabs() {
  const policy = webrtcPolicyFor(settings.getSettings().webrtcPolicy);
  for (const tab of tabs.values()) {
    liveContents(tab)?.setWebRTCIPHandlingPolicy(policy);
  }
}

// Broadcast the call-audio choice to every WebContents on a browsing session,
// including held views and auxiliary popups that are intentionally absent from
// the live tab map. Their session preload applies it in the page's main world.
function broadcastWebrtcAudioBufferToBrowsingContents() {
  const mode = settings.getSettings().webrtcAudioBuffer;
  return sendWebrtcAudioBufferMode({
    contents: webContents.getAllWebContents(),
    sessions: profileSessionRegistry?.all() ?? [],
    mode,
  });
}

// Last-applied encrypted-DNS values, so onSettingsChanged only reconfigures the
// resolver + clears its cache when DNS actually changes — the listener fires on
// every settings write, and clearing the cache mid-session isn't free.
let lastSecureDns = null;
let lastSecureDnsTemplate = null;

app.whenReady().then(bindWindowRuntime(primaryRuntime, async () => {
  profileSessionRegistry = createProfileSessionRegistry({
    defaultSession: session.defaultSession,
    fromPartition: (partition) => session.fromPartition(partition),
  });
  configureProfileSessions(profileSessionRegistry);
  const personalSessions = profileSessionRegistry.forProfile(DEFAULT_PROFILE_ID);
  const ses = personalSessions.normal;
  const privateSes = personalSessions.private;
  const browsingSessions = profileSessionRegistry.all();
  for (const browsingSession of browsingSessions) certificateObserver.observe(browsingSession);
  const chromeSes = session.fromPartition(CHROME_PARTITION);
  const developmentBrandMarkPath = developmentPreviewPath('BLANC_DEV_BRAND_MARK_PREVIEW');
  const developmentDockIconPath = developmentPreviewPath('BLANC_DEV_DOCK_ICON_PREVIEW');
  const developmentDarkDockIconPath = developmentPreviewPath('BLANC_DEV_DOCK_ICON_DARK_PREVIEW');
  setupChromeProtocol({ session: chromeSes, net, developmentBrandMarkPath });
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
    getParentWindow: () => {
      const runtime = focusedRuntime ?? primaryRuntime;
      return runtime.window && !runtime.window.isDestroyed() ? runtime.window : null;
    },
  });

  // Unlike a webPreferences preload, a session preload also reaches adopted
  // target=_blank children without replacing the Chromium-created opener
  // context. Google Identity Services can use either a popup or tab-style
  // child depending on the relying site, so the Chrome compatibility surface
  // must cover both paths.
  const installSessionPreloads = (targetSessions) => {
    for (const browsingSession of targetSessions) {
      browsingSession.registerPreloadScript({
        type: 'frame',
        filePath: path.join(__dirname, 'chrome-compat-preload.js'),
      });
      browsingSession.registerPreloadScript({
        type: 'frame',
        filePath: path.join(__dirname, 'webrtc-audio-buffer-preload.js'),
      });
      // Capture instrumentation relay (spec §4). Per the §4.1 spike, session
      // preloads only reach MAIN frames on our configuration — subframe grants
      // stay unconfirmable and fail toward stuck-on, never silently-off.
      browsingSession.registerPreloadScript({
        type: 'frame',
        filePath: path.join(__dirname, 'capture-preload.js'),
      });
    }
  };
  // The session preload needs the persisted target before page scripts run.
  // This synchronous reply is one enum read from the in-memory settings store;
  // no page API or browsing data crosses the isolated-world boundary.
  ipcMain.on(WEBRTC_AUDIO_BUFFER_GET_CHANNEL, (event) => {
    event.returnValue = settings.getSettings().webrtcAudioBuffer;
  });
  installSessionPreloads(browsingSessions);

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
  let installClientHintFallback = () => {};
  if (chromeMajor) {
    const chUa = `"Not;A=Brand";v="8", "Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}"`;
    const chUaFull = `"Not;A=Brand";v="8.0.0.0", "Chromium";v="${chromeFull}", "Google Chrome";v="${chromeFull}"`;
    const setHeader = (headers, name, value, { add = false } = {}) => {
      const existing = Object.keys(headers).find((key) => key.toLowerCase() === name);
      if (existing || add) headers[existing || name] = value;
    };
    installClientHintFallback = (targetSessions) => {
      for (const browsingSession of targetSessions) {
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
    };
    installClientHintFallback(browsingSessions);
  }

  applyTheme();
  lastNativeThemeAppearance = resolvedThemeAppearance();
  applyAppIcon();
  // Unpackaged Electron can restore Electron.app's bundle icon when the first
  // native window is realized. Reapply Blanc's selected flat icon afterward
  // so the development Dock tile matches Settings from the first launch.
  if (process.platform === 'darwin' && !app.isPackaged) {
    app.once('browser-window-created', applyAppIcon);
  }
  dockMenuHandle = installDockMenu({
    app, Menu, nativeImage,
    actions: {
      newWindow: () => openNewWindow(),
      newPrivateWindow: () => openNewWindow({ private: true }),
      focusActiveWindow: () => focusDockActiveWindow(),
    },
  });
  refreshDockMenu();
  // Also follow a live OS appearance change while the preference is "system".
  nativeTheme.on('updated', bindWindowRuntime(primaryRuntime, handleNativeThemeUpdated));

  setupPermissionPolicy(ses, {
    profileId: DEFAULT_PROFILE_ID,
    ...nativeMediaPermissionOptions,
  });
  setupPermissionPolicy(privateSes, {
    persistDecisions: false,
    profileId: DEFAULT_PROFILE_ID,
    ...nativeMediaPermissionOptions,
  });
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
      const payload = { id: promptId, origin, permission, mediaTypes };
      // A quiet sweep excludes tabs with a prompt open: responding after the
      // renderer is gone would persist a decision for a page the user cannot see.
      // The payload is retained so a still-loading prompt view can replay it.
      owner.permissionPrompts.set(promptId, { resolve, tabId: tab?.id ?? null, payload });
      // A prompt arrival replaces the user's working surface for the fill
      // flow too — invalidate a mid-broker fill, not just a visible capsule.
      bumpSurfaceGeneration(owner);
      bindWindowRuntime(owner, () => {
        attachPermissionView();
        rt().permissionView.webContents.send('permissions:prompt', payload);
      })();
    })
  );
  setHeldRequesterCheck((wc) => !!wc && heldWebContents.has(wc.id));
  setCaptureGrantObserver(({ requestingWebContents, mediaTypes, requestingUrl, isMainFrame }) => {
    if (!requestingWebContents) return;
    const surface = ensureCaptureSurfaceForSender(requestingWebContents);
    if (!surface) return;
    let origin = null;
    try { origin = new URL(requestingUrl).origin; } catch { return; }
    applyGrant(surface.record, { scopes: mediaTypes, origin, isMainFrame });
    refreshCaptureProjection(surface);
  });

  // Live PermissionStatus (Permissions contract): when a media decision
  // changes, push each affected surface its OWN truthful state so retained
  // status objects update and fire `change`. No session filtering needed —
  // mediaQueryState reads the store belonging to each surface's session, so
  // an unaffected session just receives its unchanged state and the
  // main-world patch drops the no-op. Origin matching keeps the push to
  // surfaces already showing that origin; everything else re-queries fresh.
  setPermissionDecisionObserver(({ origin, mediaTypes }) => {
    const push = (wc) => {
      if (!wc || wc.isDestroyed()) return;
      const url = wc.getURL();
      let frameOrigin = null;
      try { frameOrigin = new URL(url).origin; } catch { return; }
      if (frameOrigin !== origin) return;
      for (const mediaType of mediaTypes) {
        const state = mediaQueryState(wc.session, url, mediaType);
        if (state) wc.send('capture:permission-changed', { mediaType, state });
      }
    };
    for (const tab of tabs.values()) push(liveContents(tab));
    for (const { wc } of popupCaptures.values()) push(wc);
  });

  // Reports/settlements REFINE DISPLAY STATE toward off (spec §9) — they are
  // not security truth; the macOS system indicator is the malicious-page
  // backstop. Sender identity comes from the event, never the payload.
  ipcMain.on('capture:report', (event, raw) => {
    const surface = captureSurfaceForSender(event.sender); // read-only: never creates
    // Grant-only off→on: a surface with no anchor — never granted, or cleared
    // by navigation — accepts no reports at all, so fabricated counts can't
    // light the chip.
    if (!surface || surface.record.anchors.length === 0) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const frame = event.senderFrame;
    if (!frame) return;
    let origin = null;
    try { origin = new URL(frame.url).origin; } catch { return; }
    const isMainFrame = frame === event.sender.mainFrame;
    if (payload.type === 'settlement'
        && (payload.outcome === 'resolved' || payload.outcome === 'rejected')
        && Array.isArray(payload.scopes)) {
      applySettlement(surface.record, {
        origin, isMainFrame, outcome: payload.outcome, scopes: payload.scopes,
      });
    } else if (payload.type === 'snapshot') {
      applyFrameReport(surface.record, frame.frameToken ?? `${event.sender.id}:main`, {
        origin, isMainFrame,
        audioLive: payload.audioLive, videoLive: payload.videoLive,
      });
    } else return;
    refreshCaptureProjection(surface);
  });

  // Truthful mic/camera state for the main-world permissions.query shim in
  // capture-preload.js. Read-only display truth: it consults the same stored
  // decisions the request handler uses and can never grant, prompt, or
  // change what Electron's strict check reports. The origin comes from the
  // SENDER frame — a page can only ever learn its own origin's state — and
  // only main frames are answered, matching where the shim runs (§4.1: the
  // session preload never reaches subframes). Null means "no answer"; the
  // shim then falls back to the real strict query.
  ipcMain.handle('capture:permission-query', (event, mediaType) => {
    if (mediaType !== 'audio' && mediaType !== 'video') return null;
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame) return null;
    return mediaQueryState(event.sender.session, frame.url, mediaType);
  });

  if (ONE_PASSWORD_AVAILABLE) {
    // Capsule replies: chromeOn already proved the sender is one of this
    // runtime's registered chrome surfaces; the surface then enforces the
    // requestId echo and per-kind verb set.
    chromeOn('fill:reply', (event, payload) => {
      // chromeOn proved the sender is one of THIS runtime's trusted chrome
      // surfaces; require it to be this runtime's capsule view specifically,
      // and hand the surface the sender's exact identity so a reply can only
      // resolve a record owned by that same window and view.
      const view = rt().fillStatusView;
      const senderIsCapsule = view && !view.webContents.isDestroyed()
        && event.sender === view.webContents;
      fillStatusSurface?.handleReply(
        senderIsCapsule ? { runtimeId: rt().id, viewId: view.webContents.id } : null,
        payload,
      );
    });
  }

  chromeOn('permissions:respond', (_e, { id, allow }) => {
    const sender = rt(); // the sender's runtime, established by chromeOn
    const pending = sender.permissionPrompts.get(id);
    if (!pending) return; // wrong window's chrome, or a stale prompt — ignore
    sender.permissionPrompts.delete(id);
    pending.resolve(!!allow);
    // Last answer dismisses the floating prompt surface entirely.
    if (sender.permissionPrompts.size === 0) detachPermissionView();
  });

  // downloads.js invokes this from its own session/DownloadItem listeners —
  // a native event boundary main.js doesn't control — so the callback must
  // rebind the runtime itself rather than rely on setupDownloads' call site.
  setupDownloads(ses, broadcastDownloadsActivity, {
    private: false,
    profileId: DEFAULT_PROFILE_ID,
  });
  setupDownloads(privateSes, broadcastDownloadsActivity, {
    private: true,
    profileId: DEFAULT_PROFILE_ID,
  });
  let adblockStartupState = { phase: 'idle', attempt: 0, error: null };
  let adblockStartupController = null;
  let adblockEngineReady = false;
  let releaseStartup = async () => {};
  let chooseSessionRecovery = async () => ({ ok: false, error: 'not-ready' });
  let sessionRecoveryState = {
    required: false,
    phase: 'none',
    tabCount: 0,
    windowCount: 0,
    error: null,
  };
  const startPageStatus = () => {
    const current = settings.getSettings();
    return {
      startup: adblockStartupState,
      recovery: sessionRecoveryState,
      // Carried on every status push so a start page opened in one window
      // re-inks when the layout is changed from Settings or another window.
      layout: current.newtabLayout,
      privacy: {
        required: !settings.isFirstRunComplete(),
        searchSuggestions: current.searchSuggestions,
        usagePing: current.usagePing,
      },
      // Drives the start page's Patron callout. Broadcast on every
      // settings change (below), and setPatron() fires those listeners, so
      // an activation mid-session hides the callout without a reload.
      patronActive: settings.isPatronActive(),
    };
  };
  const broadcastStartPageStatus = () => {
    const status = startPageStatus();
    for (const tab of tabs.values()) {
      if (!tab.url?.startsWith('blanc://newtab')) continue;
      liveContents(tab)?.send('pages:start:status', status);
    }
  };
  // A layout picked in Settings (or arriving from Profile Sync) must reach
  // every open start page, not just the one that made the change.
  settings.onSettingsChanged(() => broadcastStartPageStatus());
  // pages.js's IPC surface derives runtime ownership from the sender before
  // any window-local hook runs. A background window's ledger/sheet can never
  // read or mutate the focused window's groups or overlay.
  const pagesRegistration = setupPages({
    sessions: browsingSessions,
    developmentBrandMarkPath,
    developmentDockIconPath,
    developmentDarkDockIconPath,
    sessionsForCurrentRuntime: () => {
      const owned = profileSessionRegistry.forProfile(rt().profileId);
      return [owned.normal, owned.private];
    },
    runInPageRuntime: (event, work) => {
      const runtime = runtimeForPageWebContents(event.sender);
      if (!runtime) throw new Error('pages IPC sender has no window runtime');
      return withWindowRuntime(runtime, work);
    },
    onDataChanged: refreshBookmarkFlags,
    onHistoryCleared: clearSessionMeta,
    // Parent for the favorites-import file dialog (evaluated lazily at click).
    getMainWindow: () => (hasLiveWindow() ? rt().window : undefined),
    // Utility sheet: only the sheet view itself may close the sheet — the
    // strict pages:surface:close guard verifies the sender against this.
    utilitySheet: {
      isSheetSender: (wc) => {
        const sheet = liveUtilitySheet();
        return !!sheet && wc === sheet.wc;
      },
      close: () => hideUtilitySheet(),
      setEscapeArmed: (armed) => {
        rt().utilitySheetEscapeArmed = !!armed;
      },
    },
    pageSurfaces: {
      owns: (host, wc) => {
        const runtime = runtimeForPageWebContents(wc);
        if (!runtime) return false;
        return withWindowRuntime(runtime, () => {
          if (UTILITY_PAGES.has(host)) return liveUtilitySheet()?.wc === wc;
          if (host !== 'newtab' && host !== 'mahjong') return false;
          const tabId = tabIdByWebContentsId.get(wc.id);
          return !!tabId && windowRuntimes.runtimeForTab(tabId) === runtime;
        });
      },
    },
    telemetry: {
      mahjongPlayed: (wc) =>
        maybeSendProductUsage(wc, () => sendMahjongPlay()),
      newtabLayoutUsed: (wc, layout) =>
        maybeSendProductUsage(wc, () => sendNewtabLayoutUsed(layout)),
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
      topSites: (wc, options = {}) => {
        const owner = tabs.get(tabIdByWebContentsId.get(wc.id));
        if (!owner || owner.private) return [];

        // Reuse only locally stored, already-sanitized bookmark PNGs. A top
        // site without one gets the existing letter tile; the start page must
        // never contact a website or a third-party favicon service to draw it.
        const faviconsBySite = new Map();
        for (const favorite of bookmarks.listBookmarks()) {
          const key = topSiteKey(favorite.url);
          if (key && favorite.favicon && !faviconsBySite.has(key)) {
            faviconsBySite.set(key, favorite.favicon);
          }
        }
        // Also reuse icons already held by live or quiet tabs in this local
        // profile. This gives an existing profile an immediate local backfill
        // while the bounded history cache fills naturally on later visits.
        for (const tab of tabs.values()) {
          if (tab.profileId !== owner.profileId || tab.private || !tab.favicon) continue;
          const key = topSiteKey(tab.url);
          if (key) faviconsBySite.set(key, tab.favicon);
        }
        return history.listTopSites(options).map(({ key, url, title, favicon }) => ({
          key,
          url,
          title,
          favicon: favicon ?? faviconsBySite.get(key) ?? null,
        }));
      },
      focusGroup,
      blockedThisWeek: () => adblockWeekStats().data.blocked,
      blockedByDay: () => [...adblockWeekStats().data.days],
      blockedBarHeights: () => adblockStats.barHeights(adblockWeekStats().data.days),
      remoteDevices: () => sync.listRemoteDevices(),
      status: startPageStatus,
      setLayout: (name) => settings.setSettings({ newtabLayout: name }),
      openIsland: (char) => openIslandTyping(char),
      // Runs inside runInPageRuntime, so the tab lands in the sheet's own
      // window and createTab's dismissal closes the sheet under it.
      openWelcomeTour: () => {
        const id = createTab('blanc://newtab/?tour=1');
        if (id) setActiveTab(id);
      },
      // Only what the onboarding dialog can itself change — never the whole
      // settings object.
      onboardingState: () => {
        const current = settings.getSettings();
        return { adblockEnabled: current.adblockEnabled, theme: current.theme };
      },
      applySettings: (clean) => settings.setSettings(clean),
      retryAdblock: () => adblockStartupController?.retry() ?? startPageStatus().startup,
      continueWithoutAdblock: () =>
        adblockStartupController?.continueWithoutBlocking() ?? startPageStatus().startup,
      recoverSession: (choice) => chooseSessionRecovery(choice),
      completePrivacy: (choices) => {
        const result = settings.completeFirstRunPrivacyChoices(choices);
        if (result.completed) {
          maybeSendLaunchPing();
          broadcastStartPageStatus();
        }
        return { completed: result.completed, error: result.error ?? null };
      },
    },
    profiles: {
      list: () => ({
        currentId: rt().profileId,
        profiles: localProfiles.listLocalProfiles()
          .filter((profile) => !profileDeletions.hasPendingProfileDeletion(profile.id)),
      }),
      create: createNamedLocalProfileWindow,
      open: openExistingProfileWindow,
      rename: renameNamedLocalProfile,
      remove: deleteNamedLocalProfile,
    },
    // listShortcuts() reads only the live Electron application menu — no
    // runtime-owned state — so this one hook is left unwrapped.
    shortcuts: {
      list: () => ({
        rows: listShortcuts(),
        onePasswordAvailable: ONE_PASSWORD_AVAILABLE,
      }),
    },
    onePasswordAvailable: () => ONE_PASSWORD_AVAILABLE,
    // Settings status card (Task 9): presence is a hint, Verify is truth.
    onePasswordAppDetected: () => {
      try { return fs.existsSync('/Applications/1Password.app'); } catch { return false; }
    },
    onePasswordVerify: (probed) => onePasswordBroker.verifyAccount(probed),
    openOnePasswordApp: () => { shell.openPath('/Applications/1Password.app').catch(() => {}); },
  });

  const configuredProfileSessions = new Set([DEFAULT_PROFILE_ID]);
  installProfileSessionPolicies = (profileId = DEFAULT_PROFILE_ID) => {
    const owned = profileSessionRegistry.forProfile(profileId);
    if (configuredProfileSessions.has(owned.profileId)) return owned;
    const targetSessions = [owned.normal, owned.private];
    for (const targetSession of targetSessions) certificateObserver.observe(targetSession);
    pagesRegistration.addSessions(targetSessions);
    installSessionPreloads(targetSessions);
    installClientHintFallback(targetSessions);
    setupPermissionPolicy(owned.normal, {
      profileId: owned.profileId,
      ...nativeMediaPermissionOptions,
    });
    setupPermissionPolicy(owned.private, {
      persistDecisions: false,
      profileId: owned.profileId,
      ...nativeMediaPermissionOptions,
    });
    setupDownloads(owned.normal, broadcastDownloadsActivity, {
      private: false,
      profileId: owned.profileId,
    });
    setupDownloads(owned.private, broadcastDownloadsActivity, {
      private: true,
      profileId: owned.profileId,
    });
    setupWebAuthn({
      app,
      session: targetSessions,
      dialog,
      getParentWindow: () => {
        const runtime = windowRuntimes.all().find((candidate) =>
          candidate.profileId === owned.profileId &&
          candidate.window && !candidate.window.isDestroyed() && candidate.window.isFocused());
        return runtime?.window ?? null;
      },
    });
    if (adblockEngineReady) {
      for (const targetSession of targetSessions) {
        attachAdBlockerToSession(targetSession, {
          enabled: settings.getSettings().adblockEnabled,
        });
      }
    }
    configuredProfileSessions.add(owned.profileId);
    return owned;
  };

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
      tabs, getTabOrder: () => rt().tabOrder, getGroups: () => rt().groups, getActiveTabId: () => rt().activeTabId, getIslandRect: () => rt().islandRect, clusterSlots,
      createTab, setActiveTab, closeTab, duplicateTab, toggleTabPinned, toggleTabMuted,
      setGlanceTab, closeGlance, promoteGlance, resizeGlanceAt, resetGlanceRatio,
      getGlanceTabId: () => rt().glanceTabId,
      getGlanceGeometry: () => hasLiveWindow() ? glanceGeometry() : null,
      groupTabByName, toggleGroupCollapsed, reorderTabWithinBucket, reopenClosedTab, closeGroup, newTabUrl,
      setTabLayout, setVerticalTabsWidth, broadcastTabs,
      openNewWindow, windowRuntimeSnapshots, closeWindowRuntime, openTabInWindow,
      setGlanceTabInWindow, closeGlanceInWindow, closeTabInWindow, reopenClosedTabInWindow,
      createNamedLocalProfileWindow, renameNamedLocalProfile, deleteNamedLocalProfile,
      localProfileSnapshots, profileBookmarkUrls, saveProfileFavorite,
      profileTabSessionSnapshot,
      isSessionPersistenceReady: () => !sessionPersistenceSuspended,
      getVerticalTabsMetrics: () => hasLiveWindow() ? verticalTabsMetrics() : null,
      getRailActivationSerial: () => rt().railActivationSerial,
      normalizeAddressInput, pasteAndGo, handoffProtocols: HANDOFF_PROTOCOLS, openInternalPage, openFindBar,
      // Fill-capsule hooks: drive the REAL surface (view creation, IPC,
      // readiness) against a real captured target — not a reimplementation.
      showFillStatusForTest: (kind) => {
        const surface = getFillStatusSurface();
        const target = captureOnePasswordTarget(rt());
        if (!surface || !target) return null;
        target.surfaceGeneration = target.runtime.surfaceGeneration;
        const def = FILL_KINDS[kind];
        if (!def) return null;
        if (def.mode === FILL_MODES.DECISION) {
          testFillStatusOutcome = null;
          surface.decision(target, kind).then((outcome) => { testFillStatusOutcome = outcome; });
          return { mode: 'decision' };
        }
        surface.notice(target, kind);
        return { mode: 'notice' };
      },
      fillStatusState: () => ({
        lastOutcome: testFillStatusOutcome,
        showing: fillStatusSurface?.isShowing() ?? false,
        attached: rt().fillStatusViewAttached === true,
        loaded: rt().fillStatusViewLoaded === true,
        viewFocused: rt().fillStatusView && !rt().fillStatusView.webContents.isDestroyed()
          ? rt().fillStatusView.webContents.isFocused()
          : false,
        viewContentsId: rt().fillStatusView && !rt().fillStatusView.webContents.isDestroyed()
          ? rt().fillStatusView.webContents.id
          : null,
      }),
      readFillStatusDom: (script) => {
        const wc = rt().fillStatusView?.webContents;
        if (!wc || wc.isDestroyed()) return null;
        return wc.executeJavaScript(String(script));
      },
      probeOnePasswordPackage: () => ONE_PASSWORD_AVAILABLE
        ? onePasswordBroker.probePackage()
        : Promise.resolve({ available: false, loaded: false, processCount: 0 }),
      runBlockAdsCommand, runAllowAdsCommand,
      getOverlayMode: () => rt().overlayMode, showOverlay, hideOverlay, getPrivateBrowsingSession,
      showUtilityPage, hideUtilitySheet,
      getUtilitySheetState: () => {
        const runtime = rt();
        const sheet = liveUtilitySheet(runtime);
        return {
          visible: !!(runtime.utilitySheetUrl && sheet),
          url: runtime.utilitySheetUrl,
          loadedUrl: sheet?.wc.getURL() ?? '',
          ready: utilitySheetNavigationReady(runtime, sheet),
        };
      },
      getUtilitySheetWebContents: () => liveUtilitySheet()?.wc ?? null,
      getOverlayWebContents: () => rt().overlayView?.webContents ?? null,
      getChromeWebContents: () => rt().window?.webContents ?? null,
      setWindowContentSize: (width, height) => {
        if (!hasLiveWindow()) return;
        rt().window.setContentSize(width, height);
        resizeActiveView();
      },
      getWindowContentBounds: () => hasLiveWindow() ? rt().window.getContentBounds() : null,
      // Pointer-driven scenarios front the window first: a real drag on the
      // rail implies an unoccluded, key window, and a busy desktop otherwise
      // leaves the chrome renderer deprioritized enough to starve the very
      // events the step is waiting on.
      focusMainWindow: () => {
        if (!hasLiveWindow()) return false;
        const win = rt().window;
        if (win.isMinimized()) win.restore();
        win.show();
        win.moveTop();
        app.focus({ steal: true });
        return win.isFocused();
      },
      getUtilitySheetBounds: () => liveUtilitySheet()?.view.getBounds() ?? null,
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
      persistedSessionData: () => JSON.parse(JSON.stringify(ensureSessionStore().data)),
      serializedTabsPayload: () => JSON.parse(JSON.stringify(serializeTabs())),
      sleepTab, wakeTab, runSleepSweep, sleepBackgroundTabsNow,
      getPermissionPrompts: () => rt().permissionPrompts,
      getSleepSnapshots: () => sleepSnapshots,
      // The live array, mirroring getSleepSnapshots: reset() empties it in
      // place. Entries never leave the main process — the hook only clears.
      getClosedEntries: () => rt().closedEntries ??= [],
      clearClosedEntries,
      setSleepThresholdOverride: (ms) => {
        sleepThresholdOverrideMs = Number.isFinite(ms) && ms >= 0 ? Number(ms) : null;
        return sleepThresholdOverrideMs;
      },
    });
  }

  // One 30-second sweep fans out across independent workspaces. The immediate
  // keeps WebContents lifecycle work outside settings fan-out turns.
  setInterval(() => {
    setImmediate(() => forEachWindowRuntime((runtime) => {
      runSleepSweep().catch((err) =>
        console.warn(`[quiet-tabs] sweep (${runtime.id}):`, err?.message));
    }));
  }, SLEEP_SWEEP_INTERVAL_MS);

  powerMonitor.on('resume', () => {
    // Machine sleep is not user idle. Avoid a simultaneous wake-time sweep.
    lastSleepSweepAt = Date.now();
    forEachWindowRuntime(restampBackgroundTabs);
  });

  // Per-tab blocked-request counter. `request.tabId` is the webContents id
  // of the frame the request came from. adblock.js's eventBridge fires this
  // from the network layer — not from any of our own bound roots.
  onRequestBlocked((request) => {
    adblockWeekStats().update((d) => adblockStats.recordBlocked(d));
    const tab = tabs.get(tabIdByWebContentsId.get(request.tabId));
    if (!tab) return;
    const runtime = windowRuntimes.runtimeForTab(tab.id);
    if (!runtime) return;
    withWindowRuntime(runtime, () => {
      tab.blockedCount += 1;
      scheduleBroadcastTabs();
    });
  });

  // Settings fan-out: settings.js calls every registered listener synchronously
  // from setSettings()/etc, which can be reached from pages.js's OWN unbound
  // 'pages:settings:set' IPC handler — not only from already-bound callers here.
  settings.onSettingsChanged((s) => {
    const nextOnePasswordConfigurationKey = JSON.stringify([
      s.onePasswordEnabled,
      s.onePasswordAccount,
    ]);
    if (nextOnePasswordConfigurationKey !== onePasswordConfigurationKey) {
      const [prevEnabled, prevAccount] = JSON.parse(onePasswordConfigurationKey);
      onePasswordConfigurationKey = nextOnePasswordConfigurationKey;
      // A disable/account change ends the old account-scoped SDK client
      // immediately; no authorization handle survives under a new setting.
      onePasswordBroker?.stop();
      // Ambient-hint transitions attach HERE, the central fan-out — every
      // writer (Settings toggle, Verify's persist-first save, any future
      // setSettings caller) flows through this listener by construction.
      const transition = configTransition(
        { onePasswordEnabled: prevEnabled, onePasswordAccount: prevAccount },
        { onePasswordEnabled: s.onePasswordEnabled, onePasswordAccount: s.onePasswordAccount },
      );
      if (transition === 'cleared') {
        fillHintScheduler?.clearAll();
      } else if (transition === 'became-eligible' && fillHintScheduler) {
        for (const runtime of windowRuntimes.all()) {
          const active = runtime.activeTabId != null ? tabs.get(runtime.activeTabId) : null;
          if (active) withWindowRuntime(runtime, () => fillHintScheduler.noteConfigChanged(active));
        }
      }
    }
    setAdBlockEnabled(s.adblockEnabled);
    applyTheme();
    applyAppIcon();
    applyVerticalTabsWidth(s.verticalTabsWidth);
    applyTabLayout(s.tabLayout);
    // setPatron() uses this same fan-out after activation and each scheduled
    // subscription validation. Re-project the derived entitlement so an open
    // Workspaces popover hides or restores creation controls immediately;
    // never expose the Patron record itself to chrome.
    broadcastWorkspacesUpdated();
    // WebRTC reapply is unconditional — setWebRTCIPHandlingPolicy is a cheap,
    // idempotent per-tab call and settings writes are infrequent/user-initiated.
    applyWebrtcPolicyToAllTabs();
    broadcastWebrtcAudioBufferToBrowsingContents();
    if (s.secureDns !== lastSecureDns || s.secureDnsTemplate !== lastSecureDnsTemplate) {
      lastSecureDns = s.secureDns;
      lastSecureDnsTemplate = s.secureDnsTemplate;
      app.configureHostResolver(hostResolverOptionsFor(s.secureDns, s.secureDnsTemplate));
      // Clear cached lookups on both sessions so the new resolver takes effect without
      // a restart. clearHostResolverCache returns a promise; Promise.allSettled collects
      // any rejection so a failed clear can't surface as an unhandled rejection.
      Promise.allSettled(
        profileSessionRegistry.all().map((sess) => sess.clearHostResolverCache())
      );
    }
  });

  let profileSyncStarted = false;
  /** Start profile/tab sync only after releaseStartup has replaced the
   * temporary startup tab with the complete restored Personal workspace.
   * tabicons treats its provider as authoritative and prunes cached pixels
   * for URLs absent from it; starting against the temporary new-tab record
   * used to erase every persisted icon on each launch, after which only the
   * one restored tab that woke could repopulate the sidecar. */
  const startProfileSync = () => {
    if (profileSyncStarted) return;
    profileSyncStarted = true;

    // sync.js/tabicons.js pull these providers from their own timers/session
    // flows — bind them rather than trust every caller to already be bound.
    tabsync.setSnapshotProvider(bindWindowRuntime(primaryRuntime, () => ({
      tabList: rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean),
      groups: rt().groups,
    })));
    tabicons.setSnapshotProvider(bindWindowRuntime(primaryRuntime, () => ({
      tabList: rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean),
    })));

    // Session/icon sync may run from palette open or Sync Now before this
    // point; keep those stores no-ops until the restored tab set is authoritative.
    sync.setTabStateReady(true);

    // A pull changed the cached device map: push the fresh list to the open
    // surfaces (overlay panel; any tab currently on the start page).
    const pushRemoteDevices = () => {
      forEachWindowRuntime((runtime) => {
        const devices = sync.listRemoteDevices();
        runtime.overlayView?.webContents.send('chrome:remote-tabs-updated', devices);
        for (const id of runtime.tabOrder) {
          const tab = tabs.get(id);
          if (!tab?.url?.startsWith('blanc://newtab')) continue;
          liveContents(tab)?.send('pages:start:remote-tabs', devices);
        }
      });
    };
    tabsync.onRemoteChanged(pushRemoteDevices);
    tabicons.onRemoteChanged(pushRemoteDevices);

    // Profile sync: sync-on-launch if configured, then follow local changes.
    // Failures are swallowed and surfaced only in Settings (never startup).
    sync.init();
    // Freshness pull when Blanc regains focus (tab-sync spec §6; throttled inside).
    app.on('browser-window-focus', () => sync.refreshSession());
    // Best-effort final push — fire-and-forget, never blocks quit (spec §6).
    app.on('before-quit', bindWindowRuntime(primaryRuntime, () => { sync.syncNow().catch(() => {}); }));
    // A sync pull that merged in favorites from another device refreshes the
    // pill's favorite state; open internal pages still pull on their next load,
    // as with any cross-surface bookmark change.
    bookmarks.onMerged(refreshBookmarkFlags);
  };

  // HTTP basic/digest auth: without this handler, 401-protected sites
  // (routers, staging servers) simply fail.
  app.on('login', (event, requestingWc, _details, authInfo, callback) => {
    event.preventDefault();
    const tabId = requestingWc ? tabIdByWebContentsId.get(requestingWc.id) : null;
    const runtime = (tabId ? windowRuntimes.runtimeForTab(tabId) : null)
      ?? windowRuntimes.runtimeForAuxiliaryContent(requestingWc?.id)
      ?? focusedRuntime
      ?? primaryRuntime;
    withWindowRuntime(runtime, () => {
      promptForCredentials(hasLiveWindow() ? rt().window : null, authInfo).then((creds) => {
        if (creds) callback(creds.username, creds.password);
        else callback(); // no args = cancel the request
      });
    });
  });

  registerIpcHandlers();
  buildMenu();

  // Snapshot the previous session before the local startup tab exists. Tab
  // broadcasts are temporarily prevented from overwriting this snapshot.
  await resumePendingProfileDeletions();
  const { windows, activeWindowId, readOnly } = loadWorkspace(ensureSessionStore().data);
  sessionReadOnly = readOnly;
  const pendingProfileIds = new Set(profileDeletions.pendingProfileDeletions());
  const savedWindows = windows
    .filter((saved) => !pendingProfileIds.has(saved.profileId))
    .map((saved) => {
    const cleaned = filterRestoredSession(
      saved,
      (url) => isUtilityUrl(url) || isForbiddenTopLevelUrl(url)
    );
    return {
      ...saved,
      profileId: localProfiles.getLocalProfile(saved.profileId)?.id ?? DEFAULT_PROFILE_ID,
      urls: cleaned.urls,
      groupIds: cleaned.groupIds,
      pinned: cleaned.pinned,
      meta: cleaned.meta,
      activeIndex: cleaned.activeIndex,
      groups: (Array.isArray(saved.groups) ? saved.groups : [])
        .filter((group) => group && typeof group.id === 'string' && typeof group.name === 'string')
        .map((group) => ({ id: group.id, name: group.name, collapsed: !!group.collapsed })),
    };
  });
  if (!savedWindows.length) {
    savedWindows.push(freshRecoveryWindow());
  }
  let restoredActiveWindowId = savedWindows.some((saved) => saved.id === activeWindowId)
    ? activeWindowId
    : savedWindows[0].id;
  const recoverySummary = summarizeRecoveryWindows(savedWindows, { newTabUrl: NEW_TAB_URL });
  const recoveryRequired = !sessionReadOnly &&
    diagnostics.sessionRecoveryPending() &&
    recoverySummary.hasRecoverableContent;
  if (recoveryRequired) {
    sessionRecoveryState = {
      required: true,
      phase: 'pending',
      tabCount: recoverySummary.tabCount,
      windowCount: recoverySummary.windowCount,
      error: null,
    };
  } else if (diagnostics.sessionRecoveryPending()) {
    // A single disposable blank tab has no meaningful recovery choice.
    diagnostics.resolveSessionRecovery();
  }
  sessionPersistenceSuspended = true;

  const blockingRequested =
    !acceptanceTestMode && settings.getSettings().adblockEnabled;
  const navigationGateRequested = blockingRequested || recoveryRequired;
  // Materialize every restored profile's session pair before the temporary
  // navigation gate is installed; a named workspace must never race startup
  // through an unconfigured partition.
  for (const profileId of new Set(savedWindows.map((saved) => saved.profileId))) {
    installProfileSessionPolicies(profileId);
  }
  if (navigationGateRequested) installStartupNavigationGate(profileSessionRegistry.all());

  // Normal launches create every saved window. Recovery creates one neutral
  // Personal window and does not materialize any saved web tab or profile
  // window until the user has made a durable choice.
  const orderedSavedWindows = () => [...savedWindows].sort((a, b) =>
    Number(a.id === restoredActiveWindowId) - Number(b.id === restoredActiveWindowId));
  const startupTabIds = new Map();
  const startupRuntimes = [];
  const savedStartupRuntimes = [];
  const chromeReadyPromises = [];
  const createStartupRuntime = (saved, { savedWorkspace = true } = {}) => {
    const existing = windowRuntimes.all().find((runtime) => runtime.id === saved.id);
    const runtime = saved.id === PRIMARY_WINDOW_ID
      ? primaryRuntime
      : (existing ?? windowRuntimes.createRuntime({ id: saved.id, profileId: saved.profileId }));
    // The primary runtime exists before session.json is read so early app
    // callbacks always have an owner. At this point it owns no tabs or native
    // window yet, so adopting its persisted profile is the one safe identity
    // initialization point.
    if (runtime === primaryRuntime) runtime.profileId = saved.profileId;
    createMainWindow(runtime);
    withWindowRuntime(runtime, () => {
      runtime.groups = savedWorkspace ? saved.groups : [];
      startupTabIds.set(runtime.id, createTab(NEW_TAB_URL));
    });
    startupRuntimes.push(runtime);
    if (savedWorkspace) savedStartupRuntimes.push(runtime);
    chromeReadyPromises.push(new Promise((resolve) => {
      runtime.window.webContents.once('did-finish-load', bindWindowRuntime(runtime, () => {
        const startupTabId = startupTabIds.get(runtime.id);
        if (startupTabId && tabs.has(startupTabId)) {
          setActiveTab(startupTabId, { focusContent: true });
        }
        resolve();
      }));
    }));
    return runtime;
  };
  if (recoveryRequired) {
    createStartupRuntime(recoveryHostWindow(), { savedWorkspace: false });
  } else {
    for (const saved of orderedSavedWindows()) createStartupRuntime(saved);
  }
  let savedById = new Map(savedWindows.map((saved) => [saved.id, saved]));
  focusedRuntime = recoveryRequired
    ? startupRuntimes[0]
    : (savedStartupRuntimes.find((runtime) => runtime.id === restoredActiveWindowId)
      ?? savedStartupRuntimes.at(-1)
      ?? primaryRuntime);
  setFocusedLocalProfile(focusedRuntime.profileId);
  focusedRuntime.window?.focus();

  let startupReleased = false;
  let pendingStartupRelease = null;
  let recoveryChoice = null;
  chooseSessionRecovery = async (choice) => {
    if (!sessionRecoveryState.required) {
      return { ok: false, error: 'not-pending', recovery: sessionRecoveryState };
    }
    if (!validRecoveryChoice(choice)) {
      return { ok: false, error: 'invalid-choice', recovery: sessionRecoveryState };
    }

    if (choice === 'fresh') {
      const fresh = freshRecoveryWindow();
      const written = ensureSessionStore().updateAndFlush((data) => {
        Object.assign(data, buildSaveShape([fresh], data, { activeWindowId: PRIMARY_WINDOW_ID }));
      });
      if (!written) {
        sessionRecoveryState = {
          ...sessionRecoveryState,
          error: 'Couldn’t replace the saved session. Check disk access and try again.',
        };
        broadcastStartPageStatus();
        return { ok: false, error: 'write-failed', recovery: sessionRecoveryState };
      }
      savedWindows.splice(0, savedWindows.length, fresh);
      restoredActiveWindowId = PRIMARY_WINDOW_ID;
      savedById = new Map([[PRIMARY_WINDOW_ID, fresh]]);
    }

    if (!diagnostics.resolveSessionRecovery()) {
      sessionRecoveryState = {
        ...sessionRecoveryState,
        error: 'Couldn’t save the recovery choice. Check disk access and try again.',
      };
      broadcastStartPageStatus();
      return { ok: false, error: 'write-failed', recovery: sessionRecoveryState };
    }

    recoveryChoice = choice;
    sessionRecoveryState = {
      ...sessionRecoveryState,
      required: false,
      phase: choice === 'restore' ? 'restoring' : 'fresh',
      error: null,
    };
    broadcastStartPageStatus();
    if (pendingStartupRelease) {
      const release = pendingStartupRelease;
      pendingStartupRelease = null;
      await releaseStartup(release);
    }
    return { ok: true, recovery: sessionRecoveryState };
  };

  releaseStartup = async ({ blocking, preservePreference = false } = {}) => {
    if (startupReleased) return;
    if (sessionRecoveryState.required) {
      pendingStartupRelease = { blocking, preservePreference };
      broadcastStartPageStatus();
      return;
    }
    startupReleased = true;
    if (recoveryChoice) {
      for (const saved of orderedSavedWindows()) createStartupRuntime(saved);
      focusedRuntime = savedStartupRuntimes.find((runtime) => runtime.id === restoredActiveWindowId)
        ?? savedStartupRuntimes.at(-1)
        ?? primaryRuntime;
      setFocusedLocalProfile(focusedRuntime.profileId);
    }
    await Promise.all(chromeReadyPromises);

    if (!blocking && !preservePreference && settings.getSettings().adblockEnabled) {
      // “Continue without blocking” is an explicit effective-state change,
      // not a shield that stays visually enabled while no engine exists.
      settings.setSettings({ adblockEnabled: false });
    }
    if (navigationGateRequested) {
      releaseStartupNavigationGate(profileSessionRegistry.all(), {
        blockerAttached: blocking,
      });
    }

    // Named Workspaces (Task 6): candidates are collected here, not applied
    // immediately, because a hand-edited or interrupted-write session.json
    // could point two restored windows at the SAME workspaceId — the de-dup
    // pass below (after every window's tabs exist) resolves that before
    // anything is actually bound.
    const workspaceCandidates = new Map(); // runtime -> workspaceId
    for (const runtime of savedStartupRuntimes) {
      const saved = savedById.get(runtime.id);
      if (!saved) continue;
      withWindowRuntime(runtime, () => {
        // Lazy restore: every saved tab is a labelled record with no renderer.
        // Only this window's selected tab wakes.
        const restoredIds = saved.urls.map((url, index) => createTab(url, {
          groupId: saved.groupIds?.[index] ?? null,
          pinned: !!saved.pinned?.[index],
          asleep: true,
          title: saved.meta?.[index]?.title ?? '',
          favicon: saved.meta?.[index]?.favicon ?? null,
        }));
        pruneEmptyGroups();
        // This window's tabs now exist, so it's safe to check whether the
        // saved binding still points at a real workspace. namedWorkspaces.get
        // resolves through the ambient activeLocalProfileId(), which
        // withWindowRuntime has already pointed at this runtime's own
        // profile (same pattern as every other per-runtime call in this
        // loop) — a workspace deleted, or owned by a profile that no longer
        // exists, while the app was closed must leave this window scratch,
        // never a dangling binding. Placed before the early return below so
        // a window whose restored tab set is empty is still considered.
        if (saved.workspaceId && namedWorkspaces.get(saved.workspaceId)) {
          workspaceCandidates.set(runtime, saved.workspaceId);
        }
        const target = restoreTargetId(restoredIds, saved.activeIndex);
        if (!target) return;
        // Activate first, then close the startup tab. The inverse briefly wakes
        // the wrong quiet tab and doubles renderer memory during restore.
        setActiveTab(target, { focusContent: true });
        const startupTabId = startupTabIds.get(runtime.id);
        if (startupTabId && tabs.has(startupTabId)) closeTab(startupTabId);
      });
    }
    // De-duplicate: only one window may bind a given workspace id — a second
    // bound window would give autosave two writers for the same
    // workspaces.json record, exactly the conflict the single-window binding
    // exists to prevent. Prefer the previously-focused window (the one the
    // OS fronts on relaunch) and leave every other candidate for that same
    // id scratch. Array.prototype.sort is stable, so on the (already-corrupt-
    // file) case where neither tied candidate is the focused window, the one
    // earlier in savedStartupRuntimes order wins deterministically rather than at
    // random.
    const claimedWorkspaceIds = new Set();
    const candidatesByPreference = [...workspaceCandidates.keys()].sort(
      (a, b) => Number(b === focusedRuntime) - Number(a === focusedRuntime)
    );
    for (const runtime of candidatesByPreference) {
      const workspaceId = workspaceCandidates.get(runtime);
      if (claimedWorkspaceIds.has(workspaceId)) continue;
      claimedWorkspaceIds.add(workspaceId);
      runtime.workspaceId = workspaceId;
    }

    // Recovery is an ephemeral neutral host. Destroy it while persistence is
    // still suspended so neither its id nor its disposable new tab can enter
    // session.json.
    const recoveryRuntime = windowRuntimes.all().find((runtime) => runtime.id === RECOVERY_WINDOW_ID);
    if (recoveryRuntime?.window && !recoveryRuntime.window.isDestroyed()) {
      recoveryRuntime.window.destroy();
    }

    // The first menu is built before session restore, while every workspace
    // is still empty. Rebuild after the real tab set exists so dynamic
    // commands such as Glance have truthful enabled states on first launch.
    buildMenu(focusedRuntime ?? primaryRuntime);

    sessionPersistenceSuspended = false;
    persistSession();
    sessionRecoveryState = {
      ...sessionRecoveryState,
      required: false,
      phase: 'complete',
      error: null,
    };
    broadcastStartPageStatus();
    focusedRuntime.window?.focus();

    // The icon sidecar's first authoritative snapshot must be the restored
    // workspace, never the disposable startup tab above.
    startProfileSync();

    // Cold-start URL handoff waits until the blocker decision and session
    // restore are both complete.
    pendingExternalUrls.push(...urlsFromArgv(process.argv.slice(1)));
    withWindowRuntime(focusedRuntime, flushExternalUrls);
    maybeSendLaunchPing();

    // Patron subscription revalidation — off the critical path, after the
    // navigation gate is released and session restore is done. The model's
    // own once-per-day cadence guard makes a too-frequent call a no-op.
    setImmediate(() => {
      patron.validateIfDue().catch(() => {});
      setInterval(() => patron.validateIfDue().catch(() => {}), patron.DAY_MS);
    });
  };

  const attachAdblockToAllProfileSessions = () => {
    adblockEngineReady = true;
    for (const browsingSession of profileSessionRegistry.all()) {
      attachAdBlockerToSession(browsingSession, {
        enabled: settings.getSettings().adblockEnabled,
      });
    }
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
      attachAdblockToAllProfileSessions();
      setAdBlockEnabled(settings.getSettings().adblockEnabled);
    }).catch((err) => {
      console.warn('[adblock] background initialization failed:', err.message);
    });
  } else {
    adblockStartupController = createAdblockStartupController({
      initialize: async () => {
        if (packagedAdblockFailureTestMode === 'always') {
          throw new Error('packaged smoke: simulated blocker initialization failure');
        }
        if (packagedAdblockInitializationFailuresRemaining > 0) {
          packagedAdblockInitializationFailuresRemaining -= 1;
          throw new Error('packaged smoke: simulated first initialization failure');
        }
        await setupAdBlocker(ses, {
          enabled: settings.getSettings().adblockEnabled,
        });
        attachAdblockToAllProfileSessions();
      },
      onStateChange: (state) => {
        adblockStartupState = state;
        broadcastStartPageStatus();
        if (state.phase === 'failed') {
          for (const runtime of startupRuntimes) {
            const startupTabId = startupTabIds.get(runtime.id);
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(primaryRuntime, { ensureStartTab: true });
    }
    focusedRuntime = primaryRuntime;
    setFocusedLocalProfile(primaryRuntime.profileId);
    refreshDockMenu();
    withWindowRuntime(primaryRuntime, refocusAddressBarIfWanted);
  });
}));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
