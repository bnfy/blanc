/**
 * Explicit permission policy for web content. Electron's default is to
 * ALLOW everything a Chromium permission prompt would normally gate —
 * the wrong default for a browser. Until there's a per-site prompt UI,
 * the policy is deny-by-default with a small allowlist of low-risk,
 * user-visible capabilities.
 */
const ALLOWED = new Set([
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write', // copy-to-clipboard buttons
]);

function setupPermissionPolicy(session) {
  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const allowed = ALLOWED.has(permission);
    if (!allowed) {
      console.log(`[permissions] denied "${permission}" for ${details.requestingUrl ?? 'unknown origin'}`);
    }
    callback(allowed);
  });

  // Synchronous checks (navigator.permissions.query etc.) must agree with
  // the request handler or sites see inconsistent state.
  session.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));

  // Screen capture: deny by never providing a stream.
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

module.exports = { setupPermissionPolicy };
