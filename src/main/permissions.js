const {
  normalizedMediaTypes,
  storedDecision,
  rememberDecision,
} = require('./permission-decisions');
const { withLocalProfile } = require('./local-profile-context');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');

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
  const read = session ? queryReaders.get(session) : null;
  if (!read) return null;
  const origin = normalizedOrigin(rawUrl);
  // Origins that can never be prompted (file://, internal schemes) are
  // truthfully denied — the request handler would deny them promptlessly.
  if (!origin) return 'denied';
  const decision = storedDecision(read(), origin, 'media', mediaType);
  if (decision === 'allow') return 'granted';
  if (decision === 'deny') return 'denied';
  return 'prompt';
}

function setupPermissionPolicy(
  session,
  { persistDecisions = true, profileId = DEFAULT_PROFILE_ID } = {}
) {
  // Incognito/private sessions use this in-memory map. Normal browsing keeps
  // using site-permissions.json and remains manageable from Settings.
  const ephemeralDecisions = {};
  const readDecisions = () => withLocalProfile(
    profileId,
    () => persistDecisions ? ensureStore().data.decisions : ephemeralDecisions
  );
  queryReaders.set(session, readDecisions);
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

  session.setPermissionRequestHandler((wc, permission, callback, details) =>
    withLocalProfile(profileId, async () => {
    if (AUTO_ALLOWED.has(permission)) return callback(true);
    if (!PROMPTED.has(permission)) return callback(false);

    const origin = normalizedOrigin(details.requestingUrl);
    if (!origin) return callback(false);

    const mediaTypes = normalizedMediaTypes(details.mediaTypes);
    const scopes = permission === 'media' && mediaTypes.length ? mediaTypes : [null];
    const saved = scopes.map((mediaType) =>
      storedDecision(readDecisions(), origin, permission, mediaType));
    if (saved.some((decision) => decision === 'deny')) return callback(false);
    if (saved.every((decision) => decision === 'allow')) {
      notifyCaptureGrant(wc, permission, mediaTypes, details);
      return callback(true);
    }
    if (!prompter) return callback(false);

    // null = the prompt couldn't be shown (no window). Deny for now but
    // DON'T persist it, or a transient no-window moment would silently
    // block the site forever. Only a real Allow/Block answer is remembered.
    const allow = await prompter({ origin, permission, mediaTypes, requestingWebContents: wc });
    if (allow === null) return callback(false);
    saveDecision(origin, permission, mediaTypes, allow);
    if (allow) notifyCaptureGrant(wc, permission, mediaTypes, details);
    callback(allow);
    })
  );

  // Synchronous checks (navigator.permissions.query, Notification.permission)
  // must agree with the request handler or sites see inconsistent state.
  session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) =>
    withLocalProfile(profileId, () => {
    if (AUTO_ALLOWED.has(permission)) return true;
    if (!PROMPTED.has(permission)) return false;
    const origin = normalizedOrigin(requestingOrigin);
    if (!origin) return false;
    const mediaType = permission === 'media' && ['audio', 'video'].includes(details?.mediaType)
      ? details.mediaType
      : null;
    return storedDecision(readDecisions(), origin, permission, mediaType) === 'allow';
    })
  );

  // Screen capture: still deny by never providing a stream (no picker UI yet).
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

module.exports = {
  setupPermissionPolicy, setPermissionPrompter, setCaptureGrantObserver, listDecisions, removeDecision,
  mediaQueryState, setPermissionDecisionObserver, mediaScopesForDecisionKey,
};
