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
  // The interface language's translator: the page's blancI18n in the app,
  // the English catalog under Node (unit tests require this module directly).
  const i18n = root.blancI18n || (() => {
    const { createTranslator } = require('./i18n.js');
    const t = createTranslator({ locale: 'en', messages: require('./strings.en.js').messages });
    return { t, formatLocale: () => 'en' };
  })();
  const api = factory(i18n);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSyncSetupModel = api;
})(typeof self !== 'undefined' ? self : this, function ({ t, formatLocale }) {
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
    offline: t('settings.sync.notice.offline'),
    rateLimited: t('settings.sync.notice.rateLimited'),
  };

  function view(state) {
    const join = state.path === 'join';
    const start = state.path === 'start';
    return {
      pathChosen: !!state.path,
      path: state.path,
      fieldsVisible: !!state.path,
      setupTitle: join ? t('settings.sync.setup.joinTitle')
        : (start ? t('settings.sync.startSyncingFromThis') : t('settings.sync.syncSetupTitle')),
      setupIntro: join ? t('settings.sync.setup.joinIntro')
        : (start ? t('settings.sync.syncSetupIntro') : t('settings.sync.setup.intro')),
      handleHint: join ? t('settings.sync.setup.joinHandleHint') : t('settings.sync.setup.handleHint'),
      passphraseHint: join ? t('settings.sync.setup.joinPassphraseHint') : t('settings.sync.setup.passphraseHint'),
      submitLabel: join ? t('settings.sync.setup.connect') : t('settings.sync.syncSubmit'),
      finishTitle: join ? t('settings.sync.setup.joinTitle') : t('settings.sync.syncFinishTitle'),
      finishHint: join ? t('settings.sync.setup.joinFinishHint') : t('settings.sync.syncFinishHint'),
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
    if (seconds < 60) return t('settings.sync.ago.justNow');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('settings.sync.ago.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('settings.sync.ago.hours', { count: hours });
    const days = Math.floor(hours / 24);
    if (days === 1) return t('settings.sync.ago.yesterday');
    if (days < 30) return t('settings.sync.ago.days', { count: days });
    return new Date(timestamp).toLocaleDateString(formatLocale());
  }

  return { createSyncSetupModel, transition, view, passphraseStrong, relativeSyncTime };
});
