'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createVerifyModel, onFieldInput, onVerifyClick, onReply, view,
} = require('../../src/renderer/pages/settings-verify-model');

const start = (field = 'My Team') => onFieldInput(createVerifyModel(), field);

test('a superseded reply is dropped entirely', () => {
  let state = onVerifyClick(start());
  const oldToken = state.token;
  state = onFieldInput(state, 'My Team Two'); // token moves on
  const after = onReply(state, { token: oldToken, ok: true, account: 'My Team' });
  assert.equal(after, state, 'stale-token reply must change nothing');
});

test('connected happy path normalizes the displayed field', () => {
  let state = onVerifyClick(onFieldInput(createVerifyModel(), '  My Team  '));
  state = onReply(state, { token: state.token, ok: true, account: 'My Team' });
  assert.equal(state.phase, 'connected');
  assert.equal(view(state).normalizeFieldTo, 'My Team');
  assert.equal(view(state).buttonDisabled, false);
});

test('a latest-token stale reply lands in idle with the button re-enabled', () => {
  let state = onVerifyClick(start());
  assert.equal(view(state).buttonDisabled, true, 'pending disables the button');
  state = onReply(state, { token: state.token, ok: false, stale: true });
  assert.equal(state.phase, 'idle', 'stale must clear pending, never render Connected');
  assert.equal(view(state).buttonDisabled, false,
    'a cross-window edit produces no local input event — the view must recompute');
});

test('input during pending re-enables for the new value and drops the in-flight reply', () => {
  let state = onVerifyClick(start());
  const oldToken = state.token;
  state = onFieldInput(state, 'Other Team');
  assert.equal(view(state).buttonDisabled, false);
  const after = onReply(state, { token: oldToken, ok: true, account: 'My Team' });
  assert.equal(after.phase, 'idle', 'the old verification must not connect the new value');
});

test('an empty field keeps Verify disabled in every phase and click is a no-op', () => {
  let state = onFieldInput(createVerifyModel(), '   ');
  assert.equal(view(state).buttonDisabled, true);
  assert.equal(onVerifyClick(state), state);
});

test('error replies render the kind', () => {
  let state = onVerifyClick(start());
  state = onReply(state, { token: state.token, ok: false, kind: 'not-authorized', account: 'My Team' });
  assert.equal(state.phase, 'error');
  assert.equal(view(state).kind, 'not-authorized');
  assert.equal(view(state).buttonDisabled, false, 'errors re-enable retry');
});

test('editing the field resets Connected to unverified', () => {
  let state = onVerifyClick(start());
  state = onReply(state, { token: state.token, ok: true, account: 'My Team' });
  assert.equal(state.phase, 'connected');
  state = onFieldInput(state, 'My Team X');
  assert.equal(state.phase, 'idle');
});
