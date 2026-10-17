'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createPairingModel, pairingTransition, pairingView,
  createSwitchModel, switchTransition, switchView,
} = require('../../src/renderer/pages/settings-sync-pairing-model');

// The on-state panels (design 2026-10-16 §4.1, §4.1a, §5.5): one-shot
// effects returned by transitions, pure views.

const NOW = 1_800_000_000_000;

test('begin emits pair-begin once and began shows the formatted code', () => {
  const { state, effect } = pairingTransition(createPairingModel(), { type: 'begin' });
  assert.deepEqual(effect, { type: 'pair-begin' });
  assert.equal(state.phase, 'starting');
  assert.equal(pairingTransition(state, { type: 'begin' }).effect, null, 'a second begin while starting emits nothing');
  const shown = pairingTransition(state, { type: 'began', ok: true, code: 'K7MR4PX2', expiresAt: NOW + 600_000 }).state;
  const v = pairingView(shown, NOW + 12_000);
  assert.equal(v.showing, true);
  assert.equal(v.codeText, 'K7MR-4PX2');
  assert.equal(v.remainingText, '9:48');
  assert.equal(v.expired, false);
  assert.equal(v.beginVisible, false);
});

test('tick counts down and expires at expiresAt', () => {
  let { state } = pairingTransition(createPairingModel(), { type: 'begin' });
  ({ state } = pairingTransition(state, { type: 'began', ok: true, code: 'K7MR4PX2', expiresAt: NOW + 600_000 }));
  ({ state } = pairingTransition(state, { type: 'tick', now: NOW + 599_000 }));
  assert.equal(pairingView(state, NOW + 599_000).remainingText, '0:01');
  ({ state } = pairingTransition(state, { type: 'tick', now: NOW + 600_000 }));
  const v = pairingView(state, NOW + 600_000);
  assert.equal(v.expired, true);
  assert.equal(v.showing, false);
  assert.equal(v.beginVisible, true);
});

test('resume restores a live code without emitting an effect', () => {
  const { state, effect } = pairingTransition(createPairingModel(), { type: 'resume', active: true, code: 'K7MR4PX2', expiresAt: NOW + 300_000 });
  assert.equal(effect, null);
  assert.equal(pairingView(state, NOW).codeText, 'K7MR-4PX2');
  const idle = pairingTransition(createPairingModel(), { type: 'resume', active: false }).state;
  assert.equal(pairingView(idle, NOW).beginVisible, true);
});

test('cancel emits pair-cancel and returns to idle; a failed began shows its message', () => {
  let { state } = pairingTransition(createPairingModel(), { type: 'begin' });
  ({ state } = pairingTransition(state, { type: 'began', ok: true, code: 'K7MR4PX2', expiresAt: NOW + 600_000 }));
  const cancelled = pairingTransition(state, { type: 'cancel' });
  assert.deepEqual(cancelled.effect, { type: 'pair-cancel' });
  assert.equal(cancelled.state.phase, 'idle');
  const failed = pairingTransition(pairingTransition(createPairingModel(), { type: 'begin' }).state, { type: 'began', ok: false, message: 'Pairing isn’t available right now.' }).state;
  assert.equal(pairingView(failed, NOW).noticeText, 'Pairing isn’t available right now.');
  assert.equal(pairingView(failed, NOW).beginVisible, true);
});

test('switch: submit is disabled until the code is valid; toggle-wipe is carried in the effect', () => {
  let { state } = switchTransition(createSwitchModel(), { type: 'open' });
  assert.equal(switchView(state).open, true);
  assert.equal(switchView(state).submitDisabled, true);
  ({ state } = switchTransition(state, { type: 'code-input', code: 'k7mr 4px2' }));
  ({ state } = switchTransition(state, { type: 'toggle-wipe', on: true }));
  assert.equal(switchView(state).submitDisabled, false);
  const { state: pending, effect } = switchTransition(state, { type: 'submit' });
  assert.deepEqual(effect, { type: 'switch-code', token: pending.token, code: 'k7mr 4px2', wipeRemote: true });
  assert.equal(pending.phase, 'pending');
  assert.equal(switchView(pending).submitDisabled, true);
});

test('switch: a stale reply is ignored; a failed one keeps the panel open with the message; ok closes it', () => {
  let { state } = switchTransition(createSwitchModel(), { type: 'open' });
  ({ state } = switchTransition(state, { type: 'code-input', code: 'K7MR4PX2' }));
  const pending = switchTransition(state, { type: 'submit' }).state;
  const stale = switchTransition(pending, { type: 'switch-reply', token: pending.token - 1, ok: false, message: 'x' }).state;
  assert.equal(stale.phase, 'pending');
  const failed = switchTransition(pending, { type: 'switch-reply', token: pending.token, ok: false, message: 'wipe failed' }).state;
  assert.equal(switchView(failed).open, true);
  assert.equal(switchView(failed).noticeText, 'wipe failed');
  const done = switchTransition(pending, { type: 'switch-reply', token: pending.token, ok: true }).state;
  assert.equal(switchView(done).open, false);
  assert.equal(done.code, '');
  assert.equal(done.wipeRemote, false);
});
