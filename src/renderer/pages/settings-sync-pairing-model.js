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
    return { phase: 'idle', code: '', expiresAt: 0, notice: null, joined: null, questionId: null };
  }

  // The device that took the code (design 2026-10-28 §6.4). Desktop names a
  // nameless device 'unknown device'; the sheet says what kind it is instead.
  const joinedDevice = (event) => ({ name: String(event.name ?? ''), platform: String(event.platform ?? '') });
  const joinedState = (device) => ({ ...createPairingModel(), phase: 'joined', joined: device });

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
        if (!event.active && event.joined && state.phase !== 'joined') return none(joinedState(joinedDevice(event.joined)));
        if (!event.active) return none(state.phase === 'showing' ? createPairingModel() : state);
        return none({ ...state, phase: 'showing', code: String(event.code ?? ''), expiresAt: Number(event.expiresAt) || 0, notice: null });
      case 'tick':
        if (state.phase !== 'showing') return none(state);
        if (event.now >= state.expiresAt) return none({ ...state, phase: 'expired', code: '', expiresAt: 0 });
        return none(state);
      case 'cancel':
        if (state.phase !== 'showing') return none(state);
        return { state: createPairingModel(), effect: { type: 'pair-cancel' } };
      case 'joined':
        if (state.phase !== 'showing') return none(state);
        return none(joinedState(joinedDevice(event)));
      case 'question':
        if (state.phase !== 'joined' || !event.deviceId) return none(state);
        return none({ ...state, questionId: String(event.deviceId) });
      case 'spaces-answer': {
        if (state.phase !== 'joined' || !state.questionId) return none(state);
        const deviceId = state.questionId;
        if (event.answer === 'on') return { state: createPairingModel(), effect: { type: 'spaces-turn-on', deviceId } };
        return { state: { ...state, questionId: null }, effect: { type: 'spaces-acknowledge', deviceId } };
      }
      case 'done':
        if (state.phase !== 'joined') return none(state);
        // Clears main's record of the join; an unanswered question stays
        // pending for the Settings and start-page notices.
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

  function joinedName(device) {
    const name = device?.name && device.name !== 'unknown device' ? device.name : '';
    const key = name ? null : (device?.platform === 'ios' ? 'settings.sync.sheet.yourIphone' : 'settings.sync.sheet.yourDevice');
    return { name, key };
  }

  function pairingView(state, now, { recoveryPrompt = false } = {}) {
    const showing = state.phase === 'showing';
    const joined = state.phase === 'joined';
    const named = joinedName(state.joined);
    return {
      sheetOpen: showing || joined,
      joined,
      joinedName: joined ? named.name : '',
      joinedNameKey: joined ? named.key : null,
      askingSpaces: joined && !!state.questionId,
      recoveryLine: joined && !!recoveryPrompt,
      showing,
      codeText: showing ? formatCode(state.code) : '',
      remainingText: showing ? remainingText(state.expiresAt, now) : '',
      expired: state.phase === 'expired',
      noticeText: state.notice ?? '',
      beginVisible: !showing && !joined && state.phase !== 'starting',
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
