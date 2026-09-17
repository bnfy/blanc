'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createSyncSetupModel, transition, view,
} = require('../../src/renderer/pages/settings-sync-setup-model');

const good = { handle: 'my sync', passphrase: 'a passphrase long enough to pass' };

function ready(path) {
  let { state } = transition(createSyncSetupModel(), { type: 'choose', path });
  ({ state } = transition(state, { type: 'input', ...good }));
  return state;
}

test('start path submit returns a single tokenized enable effect', () => {
  const { state, effect } = transition(ready('start'), { type: 'submit' });
  assert.deepEqual(effect, { type: 'enable', token: state.token, path: 'start', ...good });
  assert.equal(state.phase, 'enabling');
});

test('join path submit returns a preflight effect and moves to pending', () => {
  const { state, effect } = transition(ready('join'), { type: 'submit' });
  assert.equal(effect.type, 'preflight');
  assert.equal(effect.token, state.token);
  assert.equal(state.phase, 'pending');
});

test('a token-matching found reply is the only reply that enables', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const { state, effect } = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'found' });
  assert.deepEqual(effect, { type: 'enable', token: state.token, path: 'join', ...good });
  assert.equal(state.phase, 'enabling');
});

test('every non-found reply returns no effect', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const cases = [
    { outcome: 'notFound' },
    { outcome: 'offline', message: 'x' },
    { outcome: 'rateLimited', message: 'x' },
    { outcome: 'error', message: 'HTTP 500' },
    { outcome: 'invalid', message: 'too short' },
  ];
  for (const c of cases) {
    const { state, effect } = transition(pending, { type: 'preflight-reply', token: pending.token, ...c });
    assert.equal(effect, null, `${c.outcome} must not produce an effect`);
    assert.equal(state.phase, c.outcome === 'notFound' ? 'notFound' : 'idle');
  }
});

test('a stale-token reply changes nothing', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const { state, effect } = transition(pending, { type: 'preflight-reply', token: pending.token - 1, outcome: 'found' });
  assert.equal(effect, null);
  assert.equal(state, pending);
});

test('start-new after notFound enables; start-new elsewhere is inert', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const notFound = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'notFound' }).state;
  const startNew = transition(notFound, { type: 'start-new' });
  assert.deepEqual(startNew.effect, { type: 'enable', token: startNew.state.token, path: 'join', ...good });
  assert.equal(transition(ready('join'), { type: 'start-new' }).effect, null);
  assert.equal(transition(ready('start'), { type: 'start-new' }).effect, null);
});

test('submit while pending or enabling returns no effect', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  assert.equal(transition(pending, { type: 'submit' }).effect, null);
  const enabling = transition(ready('start'), { type: 'submit' }).state;
  assert.equal(transition(enabling, { type: 'submit' }).effect, null);
});

test('input while pending invalidates the in-flight reply', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const edited = transition(pending, { type: 'input', ...good, handle: 'other' }).state;
  assert.equal(edited.phase, 'idle');
  assert.equal(transition(edited, { type: 'preflight-reply', token: pending.token, outcome: 'found' }).effect, null);
});

test('weak inputs disable submit and never produce an effect', () => {
  let { state } = transition(createSyncSetupModel(), { type: 'choose', path: 'start' });
  ({ state } = transition(state, { type: 'input', handle: 'a', passphrase: 'short' }));
  assert.equal(view(state).submitDisabled, true);
  assert.equal(transition(state, { type: 'submit' }).effect, null);
});

test('view is pure presentation and carries no effect', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const a = view(pending); const b = view(pending);
  assert.deepEqual(a, b);
  assert.equal('effect' in a, false);
  assert.equal(a.submitLabel, 'Connect');
  assert.equal(view(ready('start')).submitLabel, 'Turn on sync');
  assert.equal(view(createSyncSetupModel()).pathChosen, false);
});

test('notice copy per outcome', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const offline = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'offline' }).state;
  assert.equal(view(offline).noticeText, 'Couldn’t reach the sync server. Check your connection and try again.');
  const limited = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'rateLimited' }).state;
  assert.equal(view(limited).noticeText, 'Too many attempts. Wait a minute and try again.');
  const err = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'error', message: 'HTTP 500' }).state;
  assert.equal(view(err).noticeText, 'HTTP 500');
  const notFound = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'notFound' }).state;
  assert.equal(view(notFound).showNotFound, true);
});

test('enable-reply returns to idle, clears the passphrase, keeps a failure message', () => {
  const enabling = transition(ready('start'), { type: 'submit' }).state;
  const failed = transition(enabling, { type: 'enable-reply', token: enabling.token, ok: false, message: 'Could not protect the sync key.' }).state;
  assert.equal(failed.phase, 'idle');
  assert.equal(failed.passphrase, '');
  assert.equal(view(failed).noticeText, 'Could not protect the sync key.');
  const okState = transition(enabling, { type: 'enable-reply', token: enabling.token, ok: true }).state;
  assert.equal(okState.notice, null);
});

test('a stale enable reply changes nothing after the flow moved on', () => {
  const submitted = transition(ready('start'), { type: 'submit' });
  const oldToken = submitted.effect.token;
  // Back, a path change, or an edit during enabling all move the token on.
  const backed = transition(submitted.state, { type: 'back' }).state;
  assert.notEqual(backed.token, oldToken);
  const stale = transition(backed, { type: 'enable-reply', token: oldToken, ok: false, message: 'late failure' });
  assert.equal(stale.effect, null);
  assert.equal(stale.state, backed, 'a stale reply must not touch the newer flow');
  const edited = transition(submitted.state, { type: 'input', ...good, handle: 'renamed' }).state;
  assert.equal(edited.phase, 'idle');
  assert.equal(transition(edited, { type: 'enable-reply', token: oldToken, ok: true }).state, edited);
  const rechosen = transition(submitted.state, { type: 'choose', path: 'join' }).state;
  assert.equal(transition(rechosen, { type: 'enable-reply', token: oldToken, ok: true }).state, rechosen);
});
