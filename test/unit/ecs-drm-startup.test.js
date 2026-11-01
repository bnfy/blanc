'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startCandidateDrm, isWidevineComponentError } = require('../../scripts/ecs-drm-startup.cjs');

test('only typed native errors for the exact Widevine component can be nonfatal', () => {
  class ComponentError extends Error { constructor(id) { super('not inspected'); this.detail = { id, status: 'not-installed' }; } }
  class ComponentsError extends Error { constructor(errors) { super('not inspected'); this.errors = errors; } }
  assert.equal(isWidevineComponentError(new ComponentError('widevine'), 'widevine'), true);
  assert.equal(isWidevineComponentError(new ComponentsError([new ComponentError('widevine')]), 'widevine'), true);
  for (const error of [new Error('Update check error'), { detail: { id: 'widevine' } },
    new ComponentError('other'), new ComponentsError([]), new ComponentsError([new ComponentError('widevine'), new Error('bug')])]) {
    assert.equal(isWidevineComponentError(error, 'widevine'), false);
  }
});

test('candidate starts DRM asynchronously without gating browser readiness', async () => {
  let finish;
  const states = [];
  const pending = startCandidateDrm({
    drm: { prepare: () => new Promise(resolve => { finish = resolve; }), inspect: async () => ({ version: '4.10' }) },
    update: state => states.push(state),
  });
  assert.equal(states[0].drm.state, 'preparing');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.length, 1);
  finish({ state: 'ready', playbackVerified: false });
  assert.equal((await pending).state, 'ready');
  assert.equal(states[1].component.version, '4.10');
});

test('offline, disabled, timed-out and thrown preparation stay nonfatal and sanitized', async () => {
  for (const state of ['installation-failed', 'timed-out', 'updates-disabled', 'unsupported', 'restart-required', 'throw']) {
    const states = [];
    const result = await startCandidateDrm({
      drm: { prepare: async () => { if (state === 'throw') throw Error('/private/secret'); return { state }; }, inspect: async () => ({}) },
      update: value => states.push(value),
    });
    assert.equal(result.state, state === 'throw' ? 'installation-failed' : state);
    assert.ok(!JSON.stringify(states).includes('/private'));
  }
});
