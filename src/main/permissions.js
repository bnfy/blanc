const {
  normalizedMediaTypes,
  storedDecision,
  rememberDecision,
} = require('./permission-decisions');

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
    store = new JsonStore('site-permissions', { decisions: {} });
  }
  return store;
};

/** @type {((req: {origin: string, permission: string, mediaTypes: string[]}) => Promise<boolean | null>) | null} */
let prompter = null;
function setPermissionPrompter(fn) { prompter = fn; }

/**
 * Display capture is deliberately separate from persisted site permissions.
 * Each getDisplayMedia call gets a new trusted chooser and a one-shot result.
 * Electron source objects remain in main and are returned here only after the
 * chooser's request/tab/origin binding has been revalidated.
 * @type {((req: {
 *   origin: string,
 *   frame: object,
 *   videoRequested: boolean,
 *   audioRequested: boolean,
 *   userGesture: boolean,
 * }) => Promise<object | null>) | null}
 */
let displayMediaPrompter = null;
function setDisplayMediaPrompter(fn) { displayMediaPrompter = fn; }

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
}

function setupPermissionPolicy(session, { persistDecisions = true } = {}) {
  // Incognito/private sessions use this in-memory map. Normal browsing keeps
  // using site-permissions.json and remains manageable from Settings.
  const ephemeralDecisions = {};
  const readDecisions = () => persistDecisions ? ensureStore().data.decisions : ephemeralDecisions;
  const saveDecision = (origin, permission, mediaTypes, allow) => {
    if (persistDecisions) {
      ensureStore().update((d) => rememberDecision(d.decisions, origin, permission, mediaTypes, allow));
    } else {
      rememberDecision(ephemeralDecisions, origin, permission, mediaTypes, allow);
    }
  };

  session.setPermissionRequestHandler(async (_wc, permission, callback, details) => {
    const requestedMediaTypes = normalizedMediaTypes(details?.mediaTypes);
    // Electron 43 sends getDisplayMedia through a preliminary `media` request
    // with an EMPTY mediaTypes array before invoking the dedicated display
    // handler. Prompting here mislabels the request as microphone and creates a
    // double prompt. An empty media request grants no camera/mic device by
    // itself, so admit only concrete HTTP(S) origins into the one-shot display
    // handler, which performs the actual gesture/frame/tab/origin validation
    // and trusted source choice. Ordinary getUserMedia requests name audio
    // and/or video and continue through the persisted prompt policy below.
    if (permission === 'media' && requestedMediaTypes.length === 0) {
      return callback(!!normalizedOrigin(details?.requestingUrl));
    }
    // This is only Chromium's gate into the one-shot display-media handler
    // below; it does not grant a stream. The handler independently validates
    // the frame, gesture, active tab, origin, navigation lifetime, and choice.
    if (permission === 'display-capture') {
      return callback(!!normalizedOrigin(details?.requestingUrl));
    }
    if (AUTO_ALLOWED.has(permission)) return callback(true);
    if (!PROMPTED.has(permission)) return callback(false);

    const origin = normalizedOrigin(details.requestingUrl);
    if (!origin) return callback(false);

    const mediaTypes = requestedMediaTypes;
    const scopes = permission === 'media' && mediaTypes.length ? mediaTypes : [null];
    const saved = scopes.map((mediaType) =>
      storedDecision(readDecisions(), origin, permission, mediaType));
    if (saved.some((decision) => decision === 'deny')) return callback(false);
    if (saved.every((decision) => decision === 'allow')) return callback(true);
    if (!prompter) return callback(false);

    // null = the prompt couldn't be shown (no window). Deny for now but
    // DON'T persist it, or a transient no-window moment would silently
    // block the site forever. Only a real Allow/Block answer is remembered.
    const allow = await prompter({ origin, permission, mediaTypes });
    if (allow === null) return callback(false);
    saveDecision(origin, permission, mediaTypes, allow);
    callback(allow);
  });

  // Synchronous checks (navigator.permissions.query, Notification.permission)
  // must agree with the request handler or sites see inconsistent state.
  session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    if (permission === 'display-capture') {
      return !!normalizedOrigin(requestingOrigin || details?.requestingUrl);
    }
    if (AUTO_ALLOWED.has(permission)) return true;
    if (!PROMPTED.has(permission)) return false;
    const origin = normalizedOrigin(requestingOrigin);
    if (!origin) return false;
    const mediaType = permission === 'media' && ['audio', 'video'].includes(details?.mediaType)
      ? details.mediaType
      : null;
    return storedDecision(readDecisions(), origin, permission, mediaType) === 'allow';
  });

  session.setDisplayMediaRequestHandler(async (request, callback) => {
    let answered = false;
    const answer = (streams = {}) => {
      if (answered) return;
      answered = true;
      callback(streams);
    };

    const origin = normalizedOrigin(request?.securityOrigin);
    const frame = request?.frame;
    const frameAlive = frame
      && (typeof frame.isDestroyed !== 'function' || !frame.isDestroyed());
    if (
      !origin
      || !frameAlive
      || request.videoRequested !== true
      || request.userGesture !== true
      || !displayMediaPrompter
    ) {
      return answer({});
    }

    try {
      const streams = await displayMediaPrompter({
        origin,
        frame,
        videoRequested: true,
        audioRequested: request.audioRequested === true,
        userGesture: true,
      });
      if (!streams?.video) return answer({});
      answer(streams);
    } catch {
      answer({});
    }
  });
}

module.exports = {
  setupPermissionPolicy,
  setPermissionPrompter,
  setDisplayMediaPrompter,
  listDecisions,
  removeDecision,
};
