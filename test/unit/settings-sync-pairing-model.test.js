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

// The sheet after the code is taken (design 2026-10-28 §6.3–§6.4).
function shownModel() {
  const begun = pairingTransition(createPairingModel(), { type: 'begin' }).state;
  return pairingTransition(begun, { type: 'began', ok: true, code: 'K7MR4PX2', expiresAt: NOW + 600_000 }).state;
}

test('a not-ready begin shows its message and Add device can begin again', () => {
  const begun = pairingTransition(createPairingModel(), { type: 'begin' }).state;
  const failed = pairingTransition(begun, { type: 'began', ok: false, message: 'Sync is on, but couldn’t reach the server yet. Blanc will keep trying.' }).state;
  const v = pairingView(failed, NOW);
  assert.equal(v.showing, false);
  assert.match(v.noticeText, /couldn’t reach the server/);
  assert.equal(v.beginVisible, true);
  assert.deepEqual(pairingTransition(failed, { type: 'begin' }).effect, { type: 'pair-begin' });
});

test('joined keeps the sheet open, without the code, and names the device', () => {
  const joined = pairingTransition(shownModel(), { type: 'joined', name: 'iPhone', platform: 'ios' });
  assert.equal(joined.effect, null);
  const v = pairingView(joined.state, NOW);
  assert.equal(v.sheetOpen, true);
  assert.equal(v.showing, false);
  assert.equal(v.codeText, '');
  assert.equal(v.joined, true);
  assert.equal(v.joinedName, 'iPhone');
  assert.equal(v.joinedNameKey, null);
  assert.equal(v.askingSpaces, false);
});

test('joined only counts while a code is showing', () => {
  assert.equal(pairingTransition(createPairingModel(), { type: 'joined', name: 'iPhone', platform: 'ios' }).state.phase, 'idle');
});

test('the empty-name fallbacks', () => {
  const unknown = pairingView(pairingTransition(shownModel(), { type: 'joined', name: 'unknown device', platform: 'ios' }).state, NOW);
  assert.equal(unknown.joinedName, '');
  assert.equal(unknown.joinedNameKey, 'settings.sync.sheet.yourIphone');
  const blank = pairingView(pairingTransition(shownModel(), { type: 'joined', name: '', platform: 'linux' }).state, NOW);
  assert.equal(blank.joinedNameKey, 'settings.sync.sheet.yourDevice');
});

test('a pending question asks, Turn on opens the Spaces sheet, Not now acknowledges', () => {
  const joined = pairingTransition(shownModel(), { type: 'joined', name: 'iPhone', platform: 'ios' }).state;
  const asking = pairingTransition(joined, { type: 'question', deviceId: 'phone' }).state;
  assert.equal(pairingView(asking, NOW).askingSpaces, true);
  const on = pairingTransition(asking, { type: 'spaces-answer', answer: 'on' });
  assert.deepEqual(on.effect, { type: 'spaces-turn-on', deviceId: 'phone' });
  assert.equal(pairingView(on.state, NOW).sheetOpen, false, 'the Spaces sheet replaces this one');
  const notNow = pairingTransition(asking, { type: 'spaces-answer', answer: 'not-now' });
  assert.deepEqual(notNow.effect, { type: 'spaces-acknowledge', deviceId: 'phone' });
  assert.equal(pairingView(notNow.state, NOW).askingSpaces, false);
  assert.equal(pairingView(notNow.state, NOW).joined, true);
});

test('no question, or a question about another stage, does not ask', () => {
  const joined = pairingTransition(shownModel(), { type: 'joined', name: 'iPhone', platform: 'ios' }).state;
  assert.equal(pairingView(pairingTransition(joined, { type: 'question', deviceId: null }).state, NOW).askingSpaces, false);
  assert.equal(pairingTransition(shownModel(), { type: 'question', deviceId: 'phone' }).state.phase, 'showing');
});

test('done without answering emits only pair-cancel, never an acknowledge', () => {
  const joined = pairingTransition(shownModel(), { type: 'joined', name: 'iPhone', platform: 'ios' }).state;
  const asking = pairingTransition(joined, { type: 'question', deviceId: 'phone' }).state;
  const done = pairingTransition(asking, { type: 'done' });
  assert.deepEqual(done.effect, { type: 'pair-cancel' });
  assert.equal(pairingView(done.state, NOW).sheetOpen, false);
});

test('a reopened page resumes into the joined state', () => {
  const resumed = pairingTransition(createPairingModel(), { type: 'resume', active: false, joined: { name: 'iPhone', platform: 'ios' } }).state;
  assert.equal(pairingView(resumed, NOW).joined, true);
});

test('done shows the recovery line only for a generated sync whose prompt is not dismissed', () => {
  const joined = pairingTransition(shownModel(), { type: 'joined', name: 'iPhone', platform: 'ios' }).state;
  assert.equal(pairingView(joined, NOW, { recoveryPrompt: true }).recoveryLine, true);
  assert.equal(pairingView(joined, NOW, { recoveryPrompt: false }).recoveryLine, false);
  assert.equal(pairingView(shownModel(), NOW, { recoveryPrompt: true }).recoveryLine, false);
});

test('the pairing view is pure', () => {
  const joined = pairingTransition(shownModel(), { type: 'joined', name: 'iPhone', platform: 'ios' }).state;
  assert.deepEqual(pairingView(joined, NOW), pairingView(joined, NOW));
});

// Connect your iPhone (design 2026-10-28 §6.1–§6.2): with Sync off the sheet
// opens in a start state that creates nothing until Continue.
test('open with Sync off starts in start and creates nothing', () => {
  const { state, effect } = pairingTransition(createPairingModel(), { type: 'open', syncOn: false });
  assert.equal(effect, null);
  const v = pairingView(state, NOW);
  assert.equal(v.sheetOpen, true);
  assert.equal(v.startShown, true);
  assert.equal(v.showing, false);
  assert.equal(v.titleKey, 'settings.sync.connectIphone');
});

test('open with Sync on begins a code at once', () => {
  const { state, effect } = pairingTransition(createPairingModel(), { type: 'open', syncOn: true });
  assert.deepEqual(effect, { type: 'pair-begin' });
  const shown = pairingTransition(state, { type: 'began', ok: true, code: 'K7MR4PX2', expiresAt: NOW + 600_000 }).state;
  assert.equal(pairingView(shown, NOW).titleKey, 'settings.sync.connectIphone');
  assert.equal(pairingView(shownModel(), NOW).titleKey, 'settings.sync.addAnotherDevice', 'Add device keeps its title');
});

test('continue emits start-new once', () => {
  const start = pairingTransition(createPairingModel(), { type: 'open', syncOn: false }).state;
  const next = pairingTransition(start, { type: 'continue' });
  assert.deepEqual(next.effect, { type: 'start-new' });
  assert.equal(pairingTransition(next.state, { type: 'continue' }).effect, null);
  assert.equal(pairingView(next.state, NOW).startBusy, true);
});

test('started synced:true emits pair-begin', () => {
  const start = pairingTransition(createPairingModel(), { type: 'open', syncOn: false }).state;
  const starting = pairingTransition(start, { type: 'continue' }).state;
  assert.deepEqual(pairingTransition(starting, { type: 'started', synced: true }).effect, { type: 'pair-begin' });
});

test('started synced:false goes to notReady and retry tries the sync again', () => {
  const start = pairingTransition(createPairingModel(), { type: 'open', syncOn: false }).state;
  const starting = pairingTransition(start, { type: 'continue' }).state;
  const waiting = pairingTransition(starting, { type: 'started', synced: false }).state;
  const v = pairingView(waiting, NOW);
  assert.equal(v.sheetOpen, true);
  assert.equal(v.notReadyShown, true);
  assert.deepEqual(pairingTransition(waiting, { type: 'retry' }).effect, { type: 'retry-sync' });
});

test('a failed start shows its message in the start state', () => {
  const start = pairingTransition(createPairingModel(), { type: 'open', syncOn: false }).state;
  const starting = pairingTransition(start, { type: 'continue' }).state;
  const failed = pairingTransition(starting, { type: 'started', ok: false, message: 'Offline' }).state;
  assert.equal(pairingView(failed, NOW).startShown, true);
  assert.equal(pairingView(failed, NOW).noticeText, 'Offline');
});

test('add-this-first emits open-code-path and creates nothing', () => {
  const start = pairingTransition(createPairingModel(), { type: 'open', syncOn: false }).state;
  const next = pairingTransition(start, { type: 'add-this-first' });
  assert.deepEqual(next.effect, { type: 'open-code-path' });
  assert.equal(pairingView(next.state, NOW).sheetOpen, false);
});

test('cancel from the start state closes it without a pair-cancel', () => {
  const start = pairingTransition(createPairingModel(), { type: 'open', syncOn: false }).state;
  const next = pairingTransition(start, { type: 'cancel' });
  assert.equal(next.effect, null);
  assert.equal(pairingView(next.state, NOW).sheetOpen, false);
});
