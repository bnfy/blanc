'use strict';

// These familiar links retain the explicit typed-address shortcut.
const DIRECT_HANDOFF_PROTOCOLS = new Set(['mailto:', 'tel:', 'facetime:', 'sms:']);

// Native apps register their own URL schemes with the OS. A browser cannot
// enumerate those schemes in advance. Like Chromium's external-protocol
// handler, reject browser/internal and dangerous OS schemes, then ask the OS
// whether an application is registered and require explicit user consent.
// This is deliberately a denylist, not a list of supported services.
const BROWSER_PROTOCOLS = new Set([
  'http:', 'https:', 'about:', 'blob:', 'filesystem:', 'blanc:',
  'data:', 'javascript:', 'vbscript:',
]);
// These are not browser document schemes; consume page-initiated navigation so
// Chromium cannot try a second, unreviewed route after our OS handoff declines.
const BLOCKED_OS_PROTOCOLS = new Set([
  'chrome:', 'chrome-extension:', 'devtools:', 'blanc-chrome:',
  'blanc-import:', 'file:', 'view-source:',
  'afp:', 'applescript:', 'disk:', 'disks:', 'hcp:', 'ie.http:', 'mk:',
  'ms-help:', 'nntp:', 'res:', 'shell:', 'vnd.ms.radio:',
  // System-command, installer, settings and network-file handlers are not
  // app-login callbacks. Do not expose them to arbitrary web content.
  'cmd:', 'powershell:', 'terminal:', 'osascript:', 'ms-msdt:',
  'ms-appinstaller:', 'ms-settings:', 'search-ms:', 'search:',
  'smb:', 'ssh:', 'x-apple.systempreferences:',
]);
const DENIED_HANDOFF_PROTOCOLS = new Set([...BROWSER_PROTOCOLS, ...BLOCKED_OS_PROTOCOLS]);

function classifyExternalNavigation(url, { trusted = false } = {}) {
  if (typeof url !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(url)
    || /[\u0000-\u0020\u007f\\"`]/.test(url)) return { action: 'none' };
  let protocol;
  try { protocol = new URL(url).protocol; } catch { return { action: 'none' }; }
  if (protocol.length === 2) return { action: 'none' };
  if (BLOCKED_OS_PROTOCOLS.has(protocol)) return { action: 'deny', protocol };
  if (DENIED_HANDOFF_PROTOCOLS.has(protocol)) return { action: 'none' };
  // The address bar also accepts search operators such as site:example.com.
  // A typed custom app URL needs a slash; page-initiated links need not.
  if (trusted && !DIRECT_HANDOFF_PROTOCOLS.has(protocol)
    && !/^([a-z][a-z0-9+.-]*):\//i.test(url)) return { action: 'none' };
  return {
    action: trusted && DIRECT_HANDOFF_PROTOCOLS.has(protocol) ? 'open' : 'confirm',
    protocol,
  };
}

// Dependency injection keeps OS launches and native confirmation testable.
// No callback URL, authorization code, or token is displayed or persisted.
function createExternalHandoff({ getWindow, getApplicationName, showMessageBox, openExternal }) {
  let pending = false;
  // One page-initiated handoff may prompt per native activation, across all
  // tabs and frames. A timer cannot reopen a dismissed dialog indefinitely.
  let gestureSerial = 0;
  let promptedForGesture = -1;
  const handOff = function (url, { trusted = false, source } = {}) {
    const decision = classifyExternalNavigation(url, { trusted });
    if (decision.action === 'none') return false;
    // A typed search operator still belongs to the address bar, but a web
    // page's OS-control link must not fall through to Chromium navigation.
    if (decision.action === 'deny') return !trusted;
    if (!trusted && promptedForGesture === gestureSerial) return true;
    if (pending) return true;
    const parent = getWindow();
    if (!parent) return true;
    if (!trusted) promptedForGesture = gestureSerial;
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
  handOff.noteUserGesture = () => { gestureSerial += 1; };
  return handOff;
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
  DENIED_HANDOFF_PROTOCOLS,
  DIRECT_HANDOFF_PROTOCOLS,
  classifyExternalNavigation,
  createExternalHandoff,
  installExternalNavigationHandlers,
};
