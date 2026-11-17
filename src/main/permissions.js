const {
  normalizedMediaTypes,
  storedDecision,
  rememberDecision,
} = require('./permission-decisions');
const { withLocalProfile } = require('./local-profile-context');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');
const { addressSpaceOfHost, gatedScope, classifyRequest } = require('./local-network-access');

/**
 * Permission policy for web content. Electron's default is ALLOW
 * everything — the wrong default for a browser. Three tiers:
 *  - AUTO_ALLOWED: low-risk, user-visible; granted silently.
 *  - PROMPTED: asked once per origin via the chrome prompt bar, decision
 *    persisted in site-permissions.json (managed from Settings).
 *  - everything else: denied.
 */
const AUTO_ALLOWED = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);
const PROMPTED = new Set(['media', 'geolocation', 'notifications']);

// Local Network Access (spec 2026-11-17-local-network-access-design.md). The
// two scopes are stored like any PROMPTED permission (`origin|scope`); the
// legacy combined name is answered from both. Blanc's own request gate
// (localNetworkPolicyFor, run by the blocking coordinator) is what actually
// decides: Electron 45 neither enforces nor requests these by itself.
const LNA_SCOPES = ['loopback-network', 'local-network'];
const LNA_LEGACY = 'local-network-access';
const LNA_TARGET_SPACE = { 'loopback-network': 'loopback', 'local-network': 'local' };
const lnaScopesFor = (name) => (name === LNA_LEGACY ? LNA_SCOPES : LNA_SCOPES.includes(name) ? [name] : null);

// store.js requires electron at load, so it's pulled in lazily: the module
// itself then loads under plain `node --test`, and the private-permissions
// unit test doubles as a canary — any code path that touches persistence
// with persistDecisions:false would blow up on the electron require.
let store = null;
const ensureStore = () => {
  if (!store) {
    const { JsonStore } = require('./store');
    store = new JsonStore(
      'site-permissions', { decisions: {} }, { scope: 'profile' }
    );
  }
  return store;
};

/** @type {((req: {origin: string, permission: string, mediaTypes: string[], requestingWebContents: Electron.WebContents}) => Promise<boolean | null>) | null} */
let prompter = null;
function setPermissionPrompter(fn) { prompter = fn; }

/** Held-view firewall hook (§5.1c): while a closed tab's view is parked for
 *  reopen, EVERY permission is denied — checked before the stored-decision
 *  lookup so a remembered grant cannot reach a held page, and re-checked
 *  after the prompt await. Never persisted. */
let heldRequester = () => false;
function setHeldRequesterCheck(fn) { heldRequester = typeof fn === 'function' ? fn : () => false; }

/** Capture-indicator hook (spec §3.1): notified on EVERY allowed `media`
 * request — the unspoofable off→on signal. Display refinement only ever
 * flows the other way (capture-state.js). */
let captureGrantObserver = null;
function setCaptureGrantObserver(fn) { captureGrantObserver = fn; }

/** Live-status hook for the truthful permissions.query shim: notified when a
 * media decision changes so retained PermissionStatus objects update and fire
 * `change` (the Permissions contract). `session` is null for changes to the
 * persisted store made outside any session (Settings "forget"). */
let decisionObserver = null;
function setPermissionDecisionObserver(fn) { decisionObserver = fn; }

/** The same hook for Local Network Access decisions: `{ session, origin }`,
 * session null for a removal in Settings. */
let localNetworkObserver = null;
function setLocalNetworkDecisionObserver(fn) { localNetworkObserver = typeof fn === 'function' ? fn : null; }
const notifyLocalNetworkChange = (session, origin) => {
  if (!localNetworkObserver) return;
  try { localNetworkObserver({ session, origin }); } catch {}
};
const notifyDecisionChange = (session, origin, mediaTypes) => {
  if (!decisionObserver || !mediaTypes.length) return;
  try { decisionObserver({ session, origin, mediaTypes }); } catch {}
};

/** Parse a stored decision key into the shim-relevant scopes, or null for
 * non-media keys. A broad legacy `origin|media` key affects both devices. */
function mediaScopesForDecisionKey(key) {
  if (typeof key !== 'string') return null;
  const [origin, permission, mediaType] = key.split('|');
  if (!origin || permission !== 'media') return null;
  if (mediaType === 'audio' || mediaType === 'video') return { origin, mediaTypes: [mediaType] };
  if (mediaType === undefined) return { origin, mediaTypes: ['audio', 'video'] };
  return null;
}
const notifyCaptureGrant = (wc, permission, mediaTypes, details) => {
  if (permission !== 'media' || !captureGrantObserver) return;
  captureGrantObserver({
    requestingWebContents: wc,
    mediaTypes,
    requestingUrl: details?.requestingUrl ?? null,
    isMainFrame: details?.isMainFrame !== false,
  });
};

function normalizedOrigin(rawUrl) {
  try {
    const origin = new URL(rawUrl).origin;
    // Only real sites get prompts. This also — deliberately — denies every
    // PROMPTED permission for file:// tabs with no prompt shown: origin is
    // the literal string 'null' for file:// (and any other opaque origin),
    // there's nowhere to persist a decision keyed by a filesystem path, and
    // real browsers restrict these same permissions for file:// too. Not a
    // bug to "fix" by prompting local files — silent-deny is the intended,
    // safe default here.
    return origin.startsWith('http') ? origin : null;
  } catch {
    return null;
  }
}

function listDecisions() {
  return { ...ensureStore().data.decisions };
}

function removeDecision(key) {
  ensureStore().update((d) => { delete d.decisions[key]; });
  const scopes = mediaScopesForDecisionKey(key);
  if (scopes) notifyDecisionChange(null, scopes.origin, scopes.mediaTypes);
  const [origin, permission] = typeof key === 'string' ? key.split('|') : [];
  if (origin && LNA_SCOPES.includes(permission)) notifyLocalNetworkChange(null, origin);
}

/** 'granted' | 'denied' | 'prompt' for a Local Network Access name, from the
 * page origin's own address space and its stored decisions. A scope the page
 * would never be gated for (a localhost page calling localhost) is granted. */
function localNetworkState(decisions, origin, name) {
  const scopes = lnaScopesFor(name);
  if (!scopes) return null;
  const pageSpace = addressSpaceOfHost(new URL(origin).hostname);
  const states = scopes.map((scope) => {
    if (!gatedScope(pageSpace, LNA_TARGET_SPACE[scope])) return 'granted';
    const decision = storedDecision(decisions, origin, scope);
    return decision === 'allow' ? 'granted' : decision === 'deny' ? 'denied' : 'prompt';
  });
  if (states.every((state) => state === 'granted')) return 'granted';
  if (states.every((state) => state === 'denied')) return 'denied';
  return 'prompt';
}

// Session → its readDecisions, so mediaQueryState can answer for whichever
// browsing session a query arrives from (regular persists, private is
// ephemeral) without ever widening what setupPermissionPolicy closes over.
const queryReaders = new WeakMap();

/**
 * Truthful three-state for the main-world navigator.permissions.query shim
 * (mic/camera preflight compatibility). Display truth only: it never grants,
 * never prompts, and never changes what the strict check handler below
 * reports to Electron. Undecided reads 'prompt' — the state the strict
 * check deliberately flattens to denied — so preflighting sites ask
 * normally instead of declaring the device blocked. Returns null for
 * anything outside the narrow contract (unknown session or media type);
 * the caller must fall back to the real query rather than invent a state.
 */
function mediaQueryState(session, rawUrl, mediaType) {
  if (mediaType !== 'audio' && mediaType !== 'video') return null;
  const reader = session ? queryReaders.get(session) : null;
  if (!reader) return null;
  const origin = normalizedOrigin(rawUrl);
  // Origins that can never be prompted (file://, internal schemes) are
  // truthfully denied — the request handler would deny them promptlessly.
  if (!origin) return 'denied';
  const decision = storedDecision(reader.readDecisions(), origin, 'media', mediaType);
  const nativeState = reader.nativeMediaAccessState(mediaType);
  if (nativeState === 'denied' || nativeState === 'restricted') return 'denied';
  if (decision === 'allow') {
    if (nativeState === 'not-determined' || nativeState === 'unknown') return 'prompt';
    return 'granted';
  }
  if (decision === 'deny') return 'denied';
  return 'prompt';
}

/**
 * Truthful three-state for the main-world Local Network Access query shim
 * (local-network-preload.js). Never prompts or grants; null means "no
 * answer" (unknown session, a name outside the three, a non-web page) and
 * the shim falls back to the real query.
 */
function localNetworkQueryState(session, rawUrl, name) {
  if (!lnaScopesFor(name)) return null;
  const reader = session ? queryReaders.get(session) : null;
  if (!reader) return null;
  const origin = normalizedOrigin(rawUrl);
  if (!origin) return null;
  return localNetworkState(reader.readDecisions(), origin, name);
}

function frameInfoOf(details) {
  try {
    const frame = details.frame;
    if (!frame || frame.isDestroyed?.()) return null;
    return { frameOrigin: frame.origin || null, topOrigin: frame.top?.origin || null };
  } catch {
    return null;
  }
}

/**
 * The blocking coordinator's Local Network Access policy for one session:
 * null when a request isn't gated, otherwise a promise of allow (true) or
 * cancel (false). Decisions are saved through the session's own store, so a
 * private session keeps them in memory only.
 */
function localNetworkPolicyFor(session) {
  return (details) => {
    const reader = queryReaders.get(session);
    if (!reader) return null;
    const gated = classifyRequest(details, frameInfoOf(details));
    if (!gated) return null;
    if (gated.mode === 'deny' || !gated.origin) return Promise.resolve(false);
    const webContents = details.webContents ?? null;
    if (gated.mode === 'stored-only' || !webContents) {
      return Promise.resolve(reader.localNetworkDecision(gated.origin, gated.scope) === 'allow');
    }
    return reader.requestLocalNetwork({ webContents, origin: gated.origin, scopes: [gated.scope] });
  };
}

function setupPermissionPolicy(
  session,
  {
    persistDecisions = true,
    profileId = DEFAULT_PROFILE_ID,
    requestNativeMediaAccess = async () => true,
    nativeMediaAccessState = () => null,
  } = {}
) {
  // Incognito/private sessions use this in-memory map. Normal browsing keeps
  // using site-permissions.json and remains manageable from Settings.
  const ephemeralDecisions = {};
  const readDecisions = () => withLocalProfile(
    profileId,
    () => persistDecisions ? ensureStore().data.decisions : ephemeralDecisions
  );
  const readNativeMediaAccessState = typeof nativeMediaAccessState === 'function'
    ? nativeMediaAccessState
    : () => null;
  const hasNativeMediaAccessLayer = (mediaTypes) =>
    mediaTypes.some((mediaType) => readNativeMediaAccessState(mediaType) !== null);
  const saveDecision = (origin, permission, mediaTypes, allow) => withLocalProfile(profileId, () => {
    if (persistDecisions) {
      ensureStore().update((d) => rememberDecision(d.decisions, origin, permission, mediaTypes, allow));
    } else {
      rememberDecision(ephemeralDecisions, origin, permission, mediaTypes, allow);
    }
    if (permission === 'media') {
      notifyDecisionChange(session, origin, normalizedMediaTypes(mediaTypes));
    }
  });

  // One prompt per (tab, site, scopes): a sign-in page probing several ports
  // at once waits on a single answer. Every caller gets the same outcome.
  const pendingLocalNetwork = new Map();
  const localNetworkDecision = (origin, scope) => storedDecision(readDecisions(), origin, scope);
  const requestLocalNetwork = ({ webContents, origin, scopes }) => {
    if (heldRequester(webContents)) return Promise.resolve(false);
    const saved = scopes.map((scope) => localNetworkDecision(origin, scope));
    if (saved.some((decision) => decision === 'deny')) return Promise.resolve(false);
    if (saved.every((decision) => decision === 'allow')) return Promise.resolve(true);
    if (!prompter) return Promise.resolve(false);
    const key = `${webContents?.id ?? ''}|${origin}|${scopes.join(',')}`;
    if (pendingLocalNetwork.has(key)) return pendingLocalNetwork.get(key);
    const permission = scopes.length === 1 ? scopes[0] : LNA_LEGACY;
    const asked = (async () => {
      let allow = null;
      try { allow = await prompter({ origin, permission, mediaTypes: [], requestingWebContents: webContents }); }
      catch { allow = null; }
      // Same rules as every prompt: only a real answer is saved, and never
      // for a tab that closed or was parked while the prompt was open.
      if (allow === null || webContents?.isDestroyed?.() || heldRequester(webContents)) return false;
      for (const scope of scopes) saveDecision(origin, scope, [], allow);
      notifyLocalNetworkChange(session, origin);
      return allow === true;
    })().finally(() => pendingLocalNetwork.delete(key));
    pendingLocalNetwork.set(key, asked);
    return asked;
  };

  queryReaders.set(session, {
    readDecisions,
    nativeMediaAccessState: readNativeMediaAccessState,
    localNetworkDecision,
    requestLocalNetwork,
  });

  session.setPermissionRequestHandler((wc, permission, callback, details) =>
    withLocalProfile(profileId, async () => {
    if (heldRequester(wc)) return callback(false);
    if (permission === 'display-capture') return callback(false);
    if (permission === 'media' && normalizedMediaTypes(details?.mediaTypes).length === 0) {
      return callback(false);
    }
    if (AUTO_ALLOWED.has(permission)) return callback(true);
    const lnaScopes = lnaScopesFor(permission);
    if (lnaScopes) {
      // Electron 45 never sends these; if a later runtime does, they go
      // through the same prompt and store as Blanc's own gate.
      const lnaOrigin = normalizedOrigin(details?.requestingUrl);
      if (!lnaOrigin) return callback(false);
      const pageSpace = addressSpaceOfHost(new URL(lnaOrigin).hostname);
      const gatedScopes = lnaScopes.filter((scope) => gatedScope(pageSpace, LNA_TARGET_SPACE[scope]));
      if (!gatedScopes.length) return callback(true);
      return callback(await requestLocalNetwork({ webContents: wc, origin: lnaOrigin, scopes: gatedScopes }));
    }
    if (!PROMPTED.has(permission)) return callback(false);

    const origin = normalizedOrigin(details.requestingUrl);
    if (!origin) return callback(false);

    const mediaTypes = normalizedMediaTypes(details.mediaTypes);
    const scopes = permission === 'media' && mediaTypes.length ? mediaTypes : [null];
    const saved = scopes.map((mediaType) =>
      storedDecision(readDecisions(), origin, permission, mediaType));
    if (saved.some((decision) => decision === 'deny')) return callback(false);
    if (saved.every((decision) => decision === 'allow')) {
      let nativeAllowed = true;
      if (permission === 'media' && mediaTypes.length && hasNativeMediaAccessLayer(mediaTypes)) {
        try { nativeAllowed = await requestNativeMediaAccess(mediaTypes); }
        catch { nativeAllowed = false; }
        // TCC is process-wide and may have changed while its native prompt was
        // open. Refresh retained PermissionStatus objects from ground truth.
        notifyDecisionChange(session, origin, mediaTypes);
      }
      if (!nativeAllowed || wc?.isDestroyed?.() || heldRequester(wc)) return callback(false);
      notifyCaptureGrant(wc, permission, mediaTypes, details);
      return callback(true);
    }
    if (!prompter) return callback(false);

    // null = the prompt couldn't be shown (no window). Deny for now but
    // DON'T persist it, or a transient no-window moment would silently
    // block the site forever. Only a real Allow/Block answer is remembered.
    const allow = await prompter({ origin, permission, mediaTypes, requestingWebContents: wc });
    if (allow === null) return callback(false);
    // The requester can close while the prompt hangs. A late Allow must not
    // grant to — or persist a decision for — a tab the user already discarded.
    // Optional-chained: existing unit harnesses pass wc = null
    // (private-permissions.test.js, permissions-query-state.test.js).
    if (wc?.isDestroyed?.() || heldRequester(wc)) return callback(false);
    saveDecision(origin, permission, mediaTypes, allow);
    if (!allow) return callback(false);

    let nativeAllowed = true;
    if (permission === 'media' && mediaTypes.length && hasNativeMediaAccessLayer(mediaTypes)) {
      try { nativeAllowed = await requestNativeMediaAccess(mediaTypes); }
      catch { nativeAllowed = false; }
      notifyDecisionChange(session, origin, mediaTypes);
    }
    if (!nativeAllowed || wc?.isDestroyed?.() || heldRequester(wc)) return callback(false);
    notifyCaptureGrant(wc, permission, mediaTypes, details);
    callback(true);
    })
  );

  // Synchronous checks (navigator.permissions.query, Notification.permission)
  // must agree with the request handler or sites see inconsistent state.
  session.setPermissionCheckHandler((wc, permission, requestingOrigin, details) =>
    withLocalProfile(profileId, () => {
    if (heldRequester(wc)) return false;
    if (permission === 'display-capture') return false;
    if (permission === 'media' && details?.mediaType !== 'audio' && details?.mediaType !== 'video') {
      return false;
    }
    if (AUTO_ALLOWED.has(permission)) return true;
    if (lnaScopesFor(permission)) {
      // Decisions belong to the top-level site; a cross-origin frame is
      // refused, as Blanc's request gate refuses it.
      const own = normalizedOrigin(requestingOrigin);
      const top = normalizedOrigin(details?.embeddingOrigin ?? requestingOrigin);
      if (!own || own !== top) return false;
      return localNetworkState(readDecisions(), top, permission) === 'granted';
    }
    if (!PROMPTED.has(permission)) return false;
    const origin = normalizedOrigin(requestingOrigin);
    if (!origin) return false;
    const mediaType = permission === 'media' && ['audio', 'video'].includes(details?.mediaType)
      ? details.mediaType
      : null;
    const allowed = storedDecision(readDecisions(), origin, permission, mediaType) === 'allow';
    if (!allowed || permission !== 'media' || !mediaType) return allowed;
    const nativeState = readNativeMediaAccessState(mediaType);
    return nativeState === null || nativeState === 'granted';
    })
  );

  // Screen capture: still deny by never providing a stream (no picker UI yet).
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

module.exports = {
  setupPermissionPolicy, setPermissionPrompter, setCaptureGrantObserver, listDecisions, removeDecision,
  mediaQueryState, setPermissionDecisionObserver, mediaScopesForDecisionKey, setHeldRequesterCheck,
  localNetworkPolicyFor, localNetworkQueryState, setLocalNetworkDecisionObserver,
};
