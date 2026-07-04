const { JsonStore } = require('./store');

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

let store = null;
const ensureStore = () => (store ??= new JsonStore('site-permissions', { decisions: {} }));

/** @type {((req: {origin: string, permission: string, mediaTypes: string[]}) => Promise<boolean | null>) | null} */
let prompter = null;
function setPermissionPrompter(fn) { prompter = fn; }

const keyFor = (origin, permission) => `${origin}|${permission}`;

function normalizedOrigin(rawUrl) {
  try {
    const origin = new URL(rawUrl).origin;
    return origin.startsWith('http') ? origin : null; // only real sites get prompts
  } catch {
    return null;
  }
}

function decisionFor(origin, permission) {
  return ensureStore().data.decisions[keyFor(origin, permission)] ?? null;
}

function rememberDecision(origin, permission, allow) {
  ensureStore().update((d) => { d.decisions[keyFor(origin, permission)] = allow ? 'allow' : 'deny'; });
}

function listDecisions() {
  return { ...ensureStore().data.decisions };
}

function removeDecision(key) {
  ensureStore().update((d) => { delete d.decisions[key]; });
}

function setupPermissionPolicy(session) {
  session.setPermissionRequestHandler(async (_wc, permission, callback, details) => {
    if (AUTO_ALLOWED.has(permission)) return callback(true);
    if (!PROMPTED.has(permission)) return callback(false);

    const origin = normalizedOrigin(details.requestingUrl);
    if (!origin) return callback(false);

    const saved = decisionFor(origin, permission);
    if (saved) return callback(saved === 'allow');
    if (!prompter) return callback(false);

    // null = the prompt couldn't be shown (no window). Deny for now but
    // DON'T persist it, or a transient no-window moment would silently
    // block the site forever. Only a real Allow/Block answer is remembered.
    const allow = await prompter({ origin, permission, mediaTypes: details.mediaTypes ?? [] });
    if (allow === null) return callback(false);
    rememberDecision(origin, permission, allow);
    callback(allow);
  });

  // Synchronous checks (navigator.permissions.query, Notification.permission)
  // must agree with the request handler or sites see inconsistent state.
  session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (AUTO_ALLOWED.has(permission)) return true;
    if (!PROMPTED.has(permission)) return false;
    const origin = normalizedOrigin(requestingOrigin);
    return !!origin && decisionFor(origin, permission) === 'allow';
  });

  // Screen capture: still deny by never providing a stream (no picker UI yet).
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

module.exports = { setupPermissionPolicy, setPermissionPrompter, listDecisions, removeDecision };
