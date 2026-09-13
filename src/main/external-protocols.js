'use strict';

// These familiar links retain the explicit typed-address shortcut.
const DIRECT_HANDOFF_PROTOCOLS = new Set(['mailto:', 'tel:', 'facetime:', 'sms:']);

// Browser-to-app handoffs need an affirmative allowlist. shell.openExternal
// passes the complete URL to an installed protocol handler, so treating every
// unknown scheme as safe would expose all of that handler's command surface to
// arbitrary web content. Additions here require an app-specific security and
// login-flow review.
const APP_HANDOFF_PROTOCOLS = new Set([
  'claude:',
]);
const HANDOFF_PROTOCOLS = new Set([...DIRECT_HANDOFF_PROTOCOLS, ...APP_HANDOFF_PROTOCOLS]);
const OAUTH_HANDOFF_PROTOCOLS = [
  // Microsoft Authentication Library's native-app callback convention.
  /^msauth\.[a-z0-9.-]+:$/,
  // Google OAuth's reversed-client-id callback convention.
  /^com\.googleusercontent\.apps\.[a-z0-9-]+:$/,
];

function isAppHandoffProtocol(protocol) {
  return APP_HANDOFF_PROTOCOLS.has(protocol)
    || OAUTH_HANDOFF_PROTOCOLS.some((pattern) => pattern.test(protocol));
}

function classifyExternalNavigation(url, { trusted = false } = {}) {
  if (typeof url !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(url)
    || /[\u0000-\u0020\u007f]/.test(url)) return { action: 'none' };
  let protocol;
  try { protocol = new URL(url).protocol; } catch { return { action: 'none' }; }
  if (!DIRECT_HANDOFF_PROTOCOLS.has(protocol) && !isAppHandoffProtocol(protocol)) {
    return { action: 'none' };
  }
  return {
    action: trusted && DIRECT_HANDOFF_PROTOCOLS.has(protocol) ? 'open' : 'confirm',
    protocol,
  };
}

// Dependency injection keeps OS launches and native confirmation testable.
// No callback URL, authorization code, or token is displayed or persisted.
function createExternalHandoff({ getWindow, getApplicationName, showMessageBox, openExternal }) {
  let pending = false;
  return function handOff(url, { trusted = false, source } = {}) {
    const decision = classifyExternalNavigation(url, { trusted });
    if (decision.action === 'none') return false;
    if (pending) return true;
    const parent = getWindow();
    if (!parent) return true;
    pending = true;
    const show = (options) => showMessageBox(parent, options);
    void (async () => {
      try {
        let name = '';
        // Electron's lookup API requires a URL containing ://. Handler
        // selection is scheme-based, so use a normalized probe while keeping
        // the original callback byte-for-byte for the eventual launch.
        try { name = getApplicationName(`${decision.protocol}//`); } catch { /* OS lookup can fail. */ }
        if (!name) {
          await show({ type: 'info', title: 'No application found',
            message: `No installed application can open ${decision.protocol} links.`,
            detail: 'Install the application, then restart its sign-in flow.', buttons: ['OK'] });
          return;
        }
        if (decision.action === 'confirm') {
          let origin = '';
          try {
            const parsed = new URL(source);
            if (['http:', 'https:'].includes(parsed.protocol)) origin = parsed.origin;
          } catch { /* Address-bar input has no referring page. */ }
          const { response } = await show({ type: 'question', title: 'Open external application?',
            message: `Open ${name}?`,
            detail: `${origin || 'This link'} wants to open an application on your computer (${decision.protocol}).`,
            buttons: ['Open Application', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true });
          // The initiating OAuth popup may close itself or navigate to a
          // fallback while this native prompt is open. The captured URL and
          // source are immutable, so its WebContents need not remain alive.
          if (response !== 0 || parent.isDestroyed()) return;
        }
        await openExternal(url);
      } catch {
        if (!parent.isDestroyed()) {
          try { await show({ type: 'error', title: 'Could not open application',
            message: 'The application could not be opened.',
            detail: 'Try opening the application yourself, then restart its sign-in flow.', buttons: ['OK'] });
          } catch { /* Window may close while showing the failure. */ }
        }
      } finally { pending = false; }
    })();
    return true;
  };
}

// Install on managed tabs and real OAuth popup windows. Server redirects do
// not emit will-navigate; iframe callbacks need will-frame-navigate too.
function installExternalNavigationHandlers(wc, handOff) {
  const navigate = (event) => {
    const frame = event.initiator || event.frame;
    const source = frame?.url || wc.getURL();
    if (handOff(event.url, { source })) event.preventDefault();
  };
  wc.on('will-frame-navigate', navigate);
  wc.on('will-redirect', navigate);
}

module.exports = {
  APP_HANDOFF_PROTOCOLS,
  DIRECT_HANDOFF_PROTOCOLS,
  HANDOFF_PROTOCOLS,
  classifyExternalNavigation,
  createExternalHandoff,
  installExternalNavigationHandlers,
};
