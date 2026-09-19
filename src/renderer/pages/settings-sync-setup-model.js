'use strict';
// The Settings → Sync card's pure logic (design 2026-09-17 §4.2 and §4.4):
// the off-state setup flow as a reducer, plus the on-state's relative
// "last synced" formatter. Served flat to settings.html via a <script> tag AND
// require-able by node tests — the same dual-environment pattern as
// settings-verify-model.js.
//
// Network calls are ONE-SHOT EFFECTS returned by transition(), never derived
// from state: settings.js performs the returned effect exactly once and
// discards it. view() is pure presentation and carries no effect, so a
// re-render can never repeat a network mutation. An `enable` effect comes
// from exactly three transitions: start-path submit, a token-matching
// `found` preflight reply on the join path, and `start-new` after `notFound`.
// Every effect carries a token; back/choose/input while pending or enabling
// move the token on, so a reply from an abandoned attempt is dropped and the
// enable effect's own `path` (never live state) decides the result copy.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSyncSetupModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const trimmed = (value) => String(value ?? '').trim();

  // Mirror of main's rule so the button can disable before submit. Main
  // remains the authority and re-validates on every call.
  function passphraseStrong(p) {
    if (p.length >= 16) return true;
    if (p.length < 10) return false;
    return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length >= 2;
  }

  function createSyncSetupModel() {
    return { path: null, phase: 'idle', handle: '', passphrase: '', token: 0, notice: null };
  }

  const valid = (s) => trimmed(s.handle).length >= 2 && passphraseStrong(String(s.passphrase ?? ''));
  const creds = (s) => ({ handle: trimmed(s.handle), passphrase: String(s.passphrase ?? '') });
  const none = (state) => ({ state, effect: null });
  const busy = (s) => s.phase === 'pending' || s.phase === 'enabling';
  // Any move away from an in-flight attempt strands its reply.
  const nextToken = (s) => (busy(s) ? s.token + 1 : s.token);
  const enableEffect = (state) => ({
    state: { ...state, phase: 'enabling', notice: null },
    effect: { type: 'enable', token: state.token, path: state.path, ...creds(state) },
  });

  function transition(state, event) {
    switch (event.type) {
      case 'choose':
        if (event.path !== 'start' && event.path !== 'join') return none(state);
        return none({ ...state, path: event.path, phase: 'idle', notice: null, token: nextToken(state) });
      case 'back':
        return none({ ...state, path: null, phase: 'idle', notice: null, passphrase: '', token: nextToken(state) });
      case 'input':
        return none({
          ...state,
          handle: String(event.handle ?? ''),
          passphrase: String(event.passphrase ?? ''),
          token: nextToken(state),
          phase: 'idle',
          notice: null,
        });
      case 'submit': {
        if (!state.path || busy(state) || !valid(state)) return none(state);
        const token = state.token + 1;
        if (state.path === 'start') return enableEffect({ ...state, token });
        return { state: { ...state, token, phase: 'pending', notice: null }, effect: { type: 'preflight', token, ...creds(state) } };
      }
      case 'preflight-reply': {
        if (state.phase !== 'pending' || event.token !== state.token) return none(state);
        if (event.outcome === 'found') return enableEffect(state);
        if (event.outcome === 'notFound') return none({ ...state, phase: 'notFound', notice: null });
        return none({ ...state, phase: 'idle', notice: { kind: String(event.outcome ?? 'error'), message: String(event.message ?? '') } });
      }
      case 'start-new':
        if (state.phase !== 'notFound') return none(state);
        return enableEffect({ ...state, token: state.token + 1 });
      case 'enable-reply':
        if (state.phase !== 'enabling' || event.token !== state.token) return none(state);
        return none({
          ...state,
          phase: 'idle',
          passphrase: '',
          notice: event.ok ? null : { kind: 'error', message: String(event.message ?? '') },
        });
      default:
        return none(state);
    }
  }

  const NOTICES = {
    offline: 'Couldn’t reach the sync server. Check your connection and try again.',
    rateLimited: 'Too many attempts. Wait a minute and try again.',
  };

  function view(state) {
    const join = state.path === 'join';
    const start = state.path === 'start';
    return {
      pathChosen: !!state.path,
      path: state.path,
      fieldsVisible: !!state.path,
      setupTitle: join ? 'Connect this device' : (start ? 'Start syncing from this device' : 'Set up Sync'),
      setupIntro: join
        ? 'Use the same sync name and passphrase as your other device. Blanc checks them before saving anything here.'
        : (start
          ? 'Sync your favorites and settings across your devices, and, if you choose, open tabs. Everything is end-to-end encrypted — Blanc can’t read it, and can’t recover it if you forget your passphrase.'
          : 'Sync your favorites and settings across your devices, and, if you choose, open tabs. Everything is end-to-end encrypted.'),
      handleHint: join
        ? 'Enter the exact sync name you used on your other device.'
        : 'A label for your sync, like a username. You’ll type it again on your other devices.',
      passphraseHint: join
        ? 'Enter the exact passphrase. Case matters.'
        : '16+ characters, or 10+ mixing letters, numbers and symbols. Blanc can’t recover it if you forget it.',
      submitLabel: join ? 'Connect' : 'Turn on sync',
      finishTitle: join ? 'Connect this device' : 'Turn on Sync',
      finishHint: join
        ? 'Blanc will look for your encrypted sync before saving these credentials on this device.'
        : 'You’re ready — your favorites and settings will sync securely across your devices.',
      submitDisabled: busy(state) || !valid(state),
      showNotFound: state.phase === 'notFound',
      noticeText: state.notice ? (NOTICES[state.notice.kind] ?? state.notice.message) : '',
    };
  }

  // §4.4 asks for "Last synced {relative time}". An absolute timestamp makes
  // the reader do the arithmetic; elapsed time answers the only question the
  // row exists for — is this device current? Beyond a month the elapsed form
  // stops being informative, so it degrades to a plain date. Returns null when
  // there is nothing to show; the caller renders "Not synced yet".
  function relativeSyncTime(timestamp, now = Date.now()) {
    if (!timestamp) return null;
    const seconds = Math.floor((now - timestamp) / 1000);
    // A device whose clock runs ahead must not read as a negative age.
    if (seconds < 60) return 'just now';
    const plural = (value, unit) => `${value} ${unit}${value === 1 ? '' : 's'} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return plural(minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return plural(hours, 'hour');
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 30) return plural(days, 'day');
    return new Date(timestamp).toLocaleDateString();
  }

  return { createSyncSetupModel, transition, view, passphraseStrong, relativeSyncTime };
});
