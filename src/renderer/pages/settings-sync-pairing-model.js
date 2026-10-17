'use strict';
// The Settings → Sync on-state panels' pure logic (design 2026-10-16 §4.1,
// §4.1a, §5.5): "Add another device" (a code with a countdown) and "Connect
// to a different sync with a code". Same dual-environment wrapper and
// one-shot-effect discipline as settings-sync-setup-model.js: transitions
// return { state, effect }, views are pure, and a reply only counts when its
// token matches the attempt still in flight.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSyncPairingModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Mirror of src/main/sync-pairing.js so the buttons can disable before
  // submit; main remains the authority and re-validates every code.
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const CODE_LENGTH = 8;
  function normalizeCode(input) {
    if (typeof input !== 'string') return null;
    const code = input.trim().toUpperCase().replace(/[-\s]/g, '');
    if (code.length !== CODE_LENGTH) return null;
    for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
    return code;
  }
  const isRecoveryCode = (input) => typeof input === 'string' && input.trim().startsWith('blanc-sync:');
  const codeAcceptable = (input) => !!normalizeCode(input) || isRecoveryCode(input);
  const formatCode = (code) => (code && code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code || '');

  const none = (state) => ({ state, effect: null });

  // ---- Add another device ----
  function createPairingModel() {
    return { phase: 'idle', code: '', expiresAt: 0, notice: null };
  }

  function pairingTransition(state, event) {
    switch (event.type) {
      case 'begin':
        if (state.phase === 'starting' || state.phase === 'showing') return none(state);
        return { state: { ...state, phase: 'starting', notice: null }, effect: { type: 'pair-begin' } };
      case 'began':
        if (state.phase !== 'starting') return none(state);
        if (event.ok) return none({ ...state, phase: 'showing', code: String(event.code ?? ''), expiresAt: Number(event.expiresAt) || 0, notice: null });
        return none({ ...state, phase: 'error', code: '', expiresAt: 0, notice: String(event.message ?? '') });
      case 'resume':
        if (state.phase === 'starting') return none(state);
        if (!event.active) return none(state.phase === 'showing' ? createPairingModel() : state);
        return none({ ...state, phase: 'showing', code: String(event.code ?? ''), expiresAt: Number(event.expiresAt) || 0, notice: null });
      case 'tick':
        if (state.phase !== 'showing') return none(state);
        if (event.now >= state.expiresAt) return none({ ...state, phase: 'expired', code: '', expiresAt: 0 });
        return none(state);
      case 'cancel':
        if (state.phase !== 'showing') return none(state);
        return { state: createPairingModel(), effect: { type: 'pair-cancel' } };
      case 'dismiss':
        return none(createPairingModel());
      default:
        return none(state);
    }
  }

  function remainingText(expiresAt, now) {
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function pairingView(state, now) {
    const showing = state.phase === 'showing';
    return {
      showing,
      codeText: showing ? formatCode(state.code) : '',
      remainingText: showing ? remainingText(state.expiresAt, now) : '',
      expired: state.phase === 'expired',
      noticeText: state.notice ?? '',
      beginVisible: !showing && state.phase !== 'starting',
    };
  }

  // ---- Connect to a different sync ----
  function createSwitchModel() {
    return { open: false, code: '', wipeRemote: false, phase: 'idle', token: 0, notice: null };
  }

  function switchTransition(state, event) {
    const nextToken = () => (state.phase === 'pending' ? state.token + 1 : state.token);
    switch (event.type) {
      case 'open':
        return none({ ...createSwitchModel(), open: true, token: nextToken() });
      case 'cancel':
        return none({ ...createSwitchModel(), token: nextToken() });
      case 'code-input':
        return none({ ...state, code: String(event.code ?? ''), phase: 'idle', notice: null, token: nextToken() });
      case 'toggle-wipe':
        return none({ ...state, wipeRemote: !!event.on });
      case 'submit': {
        if (!state.open || state.phase === 'pending' || !codeAcceptable(state.code)) return none(state);
        const token = state.token + 1;
        return {
          state: { ...state, token, phase: 'pending', notice: null },
          effect: { type: 'switch-code', token, code: state.code.trim(), wipeRemote: state.wipeRemote },
        };
      }
      case 'switch-reply':
        if (state.phase !== 'pending' || event.token !== state.token) return none(state);
        if (event.ok) return none({ ...createSwitchModel(), token: state.token });
        return none({ ...state, phase: 'idle', notice: String(event.message ?? '') });
      default:
        return none(state);
    }
  }

  function switchView(state) {
    return {
      open: state.open,
      codeValue: state.code,
      wipeRemote: state.wipeRemote,
      submitDisabled: !state.open || state.phase === 'pending' || !codeAcceptable(state.code),
      noticeText: state.notice ?? '',
    };
  }

  return {
    createPairingModel, pairingTransition, pairingView,
    createSwitchModel, switchTransition, switchView,
    normalizeCode, isRecoveryCode, formatCode,
  };
});
