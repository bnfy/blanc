const { app, ipcMain, webContents } = require('electron');
const { ElectronBlocker, ENGINE_VERSION } = require('@ghostery/adblocker-electron');
const enginePackage = require('@ghostery/adblocker-electron/package.json');
const path = require('path');
const settings = require('./settings');
const { installScriptletIsolation } = require('./adblock-scriptlets');
const {
  loadVerifiedAdblockSnapshot,
  adblockCacheName,
} = require('./adblock-snapshot');
const {
  isWebContentsExcepted,
  blockableHostname,
  installCosmeticExceptionHandlers,
} = require('./adblock-exceptions');
const { createAdblockEventBridge } = require('./adblock-events');
const { loadAdblockEngine } = require('./adblock-engine-loader');
const { createBlockingCoordinator } = require('./blocking-coordinator');
const { installOwnedCosmetics } = require('./adblock-owned-css');
const coordinator = createBlockingCoordinator();

const bundledSourcesPath = () => path.join(app.getAppPath(), 'adblock', 'sources');

/** @type {ElectronBlocker | null} */
let blocker = null;
let ownedCosmetics = null;
/** Every browsing session protected by the shared blocker engine. */
const attachedSessions = new Set();
const sessionFacades = new WeakMap();
const providers = new WeakMap();
function facadeFor(session) {
  if (!sessionFacades.has(session)) {
    sessionFacades.set(session, {
      registerPreloadScript: session.registerPreloadScript.bind(session),
      unregisterPreloadScript: session.unregisterPreloadScript.bind(session),
      // Ghostery owns cosmetic registration, never native request listeners.
      webRequest: { onBeforeRequest() {}, onHeadersReceived() {} },
    });
  }
  return sessionFacades.get(session);
}
const eventBridge = createAdblockEventBridge();

/** Read live (not cached) so edits to the exception list apply immediately. */
function isExcepted(details) {
  if (typeof details.webContentsId !== 'number') return false;
  return isWebContentsExcepted(
    webContents.fromId(details.webContentsId),
    settings.getSettings().adblockExceptions
  );
}

/**
 * Electron only allows ONE webRequest listener per event per session —
 * `enableBlockingInSession` registers its own onBeforeRequest/onHeadersReceived
 * listeners, and `disableBlockingInSession` clears them outright. The facade
 * intercepts those registrations. The coordinator checks the
 * per-site exception list first, and only delegates to the blocker's own
 * public `onBeforeRequest`/`onHeadersReceived` methods (exposed by the
 * library specifically for this kind of layering) when the site isn't
 * excepted. Browser policies remain owned by the coordinator.
 *
 * @param {Electron.Session} session
 */
// Both providers expose the same lifecycle, request, site and count contract.
// Tool APIs are an additional uBO capability, never assumed by the coordinator.
function providerForSession(session) {
  if (providers.has(session)) return providers.get(session);
  const provider = {
    id: 'blanc',
    initialize: async () => { attachAdBlockerToSession(session, { enabled: settings.getSettings().adblockEnabled }); return provider.status(); },
    status: () => ({ id: 'blanc', phase: blocker ? 'ready' : 'initializing', error: null }),
    setEnabled(value) {
      if (!blocker) return;
      const isEnabled = blocker.isBlockingEnabled(facadeFor(session));
      if (value && !isEnabled) applyBlockingWithExceptions(session);
      if (!value && isEnabled) {
        ownedCosmetics?.clearSession(session);
        blocker.disableBlockingInSession(facadeFor(session)); installBeforeRequestPolicy(session);
      }
    },
    decide(event, details) {
      if (!blocker || !attachedSessions.has(session)
        || !blocker.isBlockingEnabled(facadeFor(session)) || isExcepted(details)) return {};
      if (event !== 'onBeforeRequest' && event !== 'onHeadersReceived') return {};
      return new Promise(resolve => blocker[event](details, resolve));
    },
    observe() {},
    siteState: async tab => ({ enabled: !settings.getSettings().adblockExceptions.includes(blockableHostname(tab?.url)) }),
    setSite: async (_tab, url, value) => {
      const hostname = blockableHostname(url); if (!hostname) return;
      const exceptions = settings.getSettings().adblockExceptions.filter(item => item !== hostname);
      settings.setSettings({ adblockExceptions: value ? exceptions : [...exceptions, hostname] });
    },
    getBlockedCount: tab => tab?.blockedCount || 0,
    dispose: () => detachAdBlockerFromSession(session),
  };
  providers.set(session, provider); return provider;
}
function installBeforeRequestPolicy(session) {
  coordinator.setProvider(session, providerForSession(session));
}

function applyBlockingWithExceptions(session) {
  // `enableBlockingInSession` registers the library's cosmetic-filter IPC
  // handlers via the process-global `ipcMain.handle`, which throws if a
  // handler for the channel already exists. We attach the same blocker to
  // more than one session (default + the isolated private-browsing session),
  // so a second enable would otherwise crash startup with "Attempted to
  // register a second handler". Clear any prior registration first: the
  // handlers always dispatch to this one shared blocker instance, so which
  // session's enable call owns them is irrelevant. Removing when none is
  // registered is a safe no-op.
  ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters');
  ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled');
  blocker.enableBlockingInSession(facadeFor(session));
  installCosmeticExceptionHandlers(
    ipcMain,
    blocker,
    (wc) => !wc || !attachedSessions.has(wc.session)
      || !blocker.isBlockingEnabled(facadeFor(wc.session))
      || isWebContentsExcepted(wc, settings.getSettings().adblockExceptions)
  );
  installBeforeRequestPolicy(session);
}

/** Install the crash guard before startup releases any browsing. */
function installNavigationCrashGuard(session) {
  if (!session) return;
  coordinator.ensure(session);
}

/**
 * Loads (or builds + caches) the blocking engine, then attaches it to a
 * session so every request made through that session — from any tab —
 * is filtered. Because this runs at the network layer instead of through
 * Chrome's extension APIs, it isn't subject to Manifest V3's
 * declarativeNetRequest rule caps or the loss of the webRequest API.
 *
 * Cosmetic filtering (hiding leftover ad *elements*, not just blocking
 * requests) is handled by the library: `enableBlockingInSession` registers
 * a session preload script that reports DOM state, and the engine responds
 * by calling `insertCSS`/`executeJavaScript` on the page's webContents. Our
 * replacement IPC handlers apply the same per-site exception before either
 * kind of cosmetic injection is allowed.
 *
 * @param {Electron.Session} session - typically session.defaultSession
 * @param {{ enabled?: boolean }} [options]
 * @returns {Promise<ElectronBlocker>}
 */
async function setupAdBlocker(session, { enabled = true } = {}) {
  const snapshot = loadVerifiedAdblockSnapshot(bundledSourcesPath());
  const engineCache = path.join(
    app.getPath('userData'),
    adblockCacheName(snapshot.digest, snapshot.resourceDigest)
  );
  const simulateLockedCache = process.env.BLANC_TEST === '1'
    && process.env.BLANC_TEST_ADBLOCK_CACHE_WRITE_FAILURE === '1';
  const loaded = await loadAdblockEngine({
    cachePath: engineCache,
    snapshot,
    engineIdentity: { packageVersion: enginePackage.version, formatVersion: ENGINE_VERSION },
    deserialize: (bytes) => ElectronBlocker.deserialize(bytes),
    compile: (verified) => {
      const engine = ElectronBlocker.parse(verified.raw);
      engine.updateResources(verified.resources, verified.resourceDigest);
      return engine;
    },
    ...(simulateLockedCache ? {
      writeCache: async () => {
        const error = new Error('packaged smoke: simulated locked blocker cache');
        error.code = 'EPERM';
        throw error;
      },
    } : {}),
  });
  blocker = loaded.engine;
  for (const recovery of loaded.recoveries) {
    console.warn(`[adblock] recovered from ${recovery.stage}: ${recovery.message}`);
  }
  console.log(`[adblock] engine loaded from ${loaded.source}`);

  // Cosmetic filters can contain multiple uBO scriptlets for one page.
  // Ghostery executes each in the page's global scope; isolating their
  // declarations prevents one scriptlet from corrupting another's live
  // Proxy closures while preserving network blocking and cosmetic CSS.
  installScriptletIsolation(blocker);
  ownedCosmetics = installOwnedCosmetics(blocker, wc => wc && !wc.isDestroyed()
    && attachedSessions.has(wc.session) && blocker.isBlockingEnabled(facadeFor(wc.session)));
  eventBridge.bind(blocker);

  attachAdBlockerToSession(session, { enabled });
  return blocker;
}

/** Attach the already-built blocker to another session (private browsing). */
function attachAdBlockerToSession(session, { enabled = true } = {}) {
  if (!blocker || !session) return;
  attachedSessions.add(session);
  if (enabled && !blocker.isBlockingEnabled(facadeFor(session))) applyBlockingWithExceptions(session);
  else {
    if (!enabled && blocker.isBlockingEnabled(facadeFor(session))) {
      ownedCosmetics?.clearSession(session);
      blocker.disableBlockingInSession(facadeFor(session));
    }
    installBeforeRequestPolicy(session);
  }
}

/** Toggle blocking at runtime (used by the settings page). */
function setAdBlockEnabled(enabled) {
  if (!blocker) return;
  if (!enabled) ownedCosmetics?.clearAll();
  for (const session of attachedSessions) {
    const isEnabled = blocker.isBlockingEnabled(facadeFor(session));
    if (enabled && !isEnabled) applyBlockingWithExceptions(session);
    if (!enabled && isEnabled) {
      blocker.disableBlockingInSession(facadeFor(session));
      // The facade prevents Ghostery from altering native listeners.
      installBeforeRequestPolicy(session);
    }
  }
}

function getBlocker() {
  return blocker;
}

function detachAdBlockerFromSession(session) {
  attachedSessions.delete(session);
  if (blocker?.isBlockingEnabled(facadeFor(session))) blocker.disableBlockingInSession(facadeFor(session));
  // Disabling one cosmetic context removes global handlers; rebind them for
  // the surviving Blanc/private sessions without changing any native policy.
  if (blocker) installCosmeticExceptionHandlers(ipcMain, blocker, wc =>
    !wc || !attachedSessions.has(wc.session)
    || !blocker.isBlockingEnabled(facadeFor(wc.session))
    || isWebContentsExcepted(wc, settings.getSettings().adblockExceptions));
}

module.exports = {
  coordinator,
  providerForSession,
  detachAdBlockerFromSession,
  setupAdBlocker,
  installNavigationCrashGuard,
  attachAdBlockerToSession,
  setAdBlockEnabled,
  getBlocker,
  onRequestBlocked: eventBridge.onRequestBlocked,
};
