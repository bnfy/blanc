'use strict';
// The Settings → 1Password Verify state machine as a pure reducer. Served
// flat to the settings page via a <script> tag AND require-able by node
// tests (same dual-environment pattern as fill-status-copy.js), so the
// stale/pending/reset paths carry real unit tests instead of source-lifts.
//
// state: { phase: 'idle'|'pending'|'connected'|'error', token, field, kind }
// The token rides out with each verification request and must be echoed in
// the reply; anything else is superseded and dropped.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancVerifyModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const trimmed = (value) => String(value ?? '').trim();

  function createVerifyModel() {
    return { phase: 'idle', token: 0, field: '', kind: null };
  }

  function onFieldInput(state, value) {
    // Any edit supersedes an in-flight verification and drops Connected.
    return { ...state, field: String(value ?? ''), token: state.token + 1, phase: 'idle', kind: null };
  }

  function onVerifyClick(state) {
    if (state.phase === 'pending' || !trimmed(state.field)) return state;
    return { ...state, token: state.token + 1, phase: 'pending', kind: null };
  }

  function onReply(state, reply) {
    if (!reply || reply.token !== state.token) return state; // superseded
    if (reply.stale) {
      // A cross-window edit produced no local input event — pending must
      // clear here or the button stays disabled forever. Never Connected.
      return { ...state, phase: 'idle', kind: null };
    }
    if (reply.ok === true && trimmed(state.field) === reply.account) {
      return { ...state, phase: 'connected', field: reply.account, kind: null };
    }
    if (reply.ok === true) return { ...state, phase: 'idle', kind: null }; // field drifted
    return { ...state, phase: 'error', kind: reply.kind ?? 'sdk-error' };
  }

  function view(state) {
    return {
      phase: state.phase,
      kind: state.kind,
      buttonDisabled: state.phase === 'pending' || !trimmed(state.field),
      normalizeFieldTo: state.phase === 'connected' ? state.field : null,
    };
  }

  return { createVerifyModel, onFieldInput, onVerifyClick, onReply, view };
});
