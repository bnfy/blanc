'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDrmControls } = require('../../src/main/drm-controls');
test('ordinary builds do not inspect components or restart', async () => {
  const controls = createDrmControls({ support: { enabled: false, inspect() { throw Error('must not inspect'); } }, restart() { throw Error('must not restart'); } });
  assert.equal((await controls.status()).enabled, false);
  assert.equal(await controls.restart(), false);
});
test('DRM settings expose only sanitized state and gate a fresh restart decision', async () => {
  let state = 'ready', count = 0;
  const controls = createDrmControls({ support: { enabled: true, inspect: async () => ({ state, version: '/secret', error: '/secret', token: 'secret' }) }, restart: async () => { count++; return false; } });
  assert.deepEqual(await controls.status(), { enabled: true, state: 'ready', version: null, canRestart: false });
  assert.equal(await controls.restart(), false);
  state = 'restart-required'; assert.equal((await controls.status()).canRestart, true);
  assert.equal(await controls.restart(), false, 'cancelled unsaved-work guard is preserved');
  assert.equal(count, 1);
  state = 'ready'; assert.equal(await controls.restart(), false); assert.equal(count, 1);
});
