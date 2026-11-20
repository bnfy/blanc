'use strict';
if (process.platform === 'win32'
  && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {

// Quiet (conditional) passkey requests on Windows. Sign-in pages call
// navigator.credentials.get({mediation: 'conditional'}) on load so a browser
// can list passkeys under the username field. Chrome and Edge keep that
// request silent until the person picks a passkey. Electron has no such list,
// so Chromium hands the request to Windows, which opens its modal "Sign in
// with a passkey" dialog on every visit, even with no passkey saved
// (reproduced in the Windows VM on 1.51.0, November 19, 2026; Edge stayed
// silent on the same page).
//
// So on Windows Blanc tells pages quiet requests are unavailable (sites then
// show their own "Sign in with a passkey" button) and holds any quiet request
// a page makes anyway until the page aborts it, never passing it to the
// browser. A passkey request the person starts is untouched. macOS and Linux
// were not shown to have the problem, so they keep Chromium's behavior.
//
// Session preloads reach main frames only: a sign-in form in an iframe is not
// covered. executeInMainWorld runs before the page's own scripts. The page
// function lives in these bytes; tests extract and run the marked function.
const { contextBridge } = require('electron');

// >>> mainworld
function installConditionalPasskeyGuard(scope) {
  const root = scope || globalThis;
  const credentials = root.navigator && root.navigator.credentials;
  const PublicKeyCredential = root.PublicKeyCredential;
  if (!credentials || typeof credentials.get !== 'function' || !PublicKeyCredential) return false;
  // Patch CredentialsContainer.prototype, so a page calling through the
  // prototype is guarded too.
  const container = Object.getPrototypeOf(credentials);
  const marker = Symbol.for('blanc.conditionalPasskeyGuard.v1');
  if (container[marker]) return false;
  const define = (target, key, value) => Object.defineProperty(target, key, { value, configurable: true, writable: true });
  const quiet = (options) => Boolean(options && options.publicKey && options.mediation === 'conditional');
  // Pending until the page aborts, as a quiet request nobody answers would be.
  const hold = (options) => new Promise((resolve, reject) => {
    const signal = options.signal;
    if (!signal) return;
    const abort = () => reject(signal.reason !== undefined
      ? signal.reason
      : new root.DOMException('signal is aborted without reason', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  for (const op of ['get', 'create']) {
    const real = container[op];
    define(container, op, function (options) {
      return quiet(options) ? hold(options) : real.apply(this, arguments);
    });
  }
  define(PublicKeyCredential, 'isConditionalMediationAvailable', async () => false);
  const realCapabilities = PublicKeyCredential.getClientCapabilities;
  define(PublicKeyCredential, 'getClientCapabilities', async function () {
    const capabilities = await realCapabilities.apply(this, arguments);
    return { ...capabilities, conditionalGet: false, conditionalCreate: false };
  });
  Object.defineProperty(container, marker, { value: true });
  return true;
}
// <<< mainworld

contextBridge.executeInMainWorld({ func: installConditionalPasskeyGuard });
}
