'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBlockingRecovery } = require('../../src/main/blocking-recovery');
const { createAdblockStartupController } = require('../../src/main/adblock-startup');
function fixture() {
  let attempts = 0; let providerRetries = 0; const released = [];
  const controller = createAdblockStartupController({
    initialize: async () => { if (++attempts === 1) throw new Error('initialization failed'); },
    onReleased: async ({ blocking }) => released.push(blocking),
  });
  const recovery = createBlockingRecovery({ startup: () => controller, providers: () => ({ retry: async () => { providerRetries++; } }) });
  return { controller, recovery, released, retries: () => providerRetries };
}
test('Settings retry after initialization failure releases the actual startup gate with blocking', async () => {
  const f = fixture(); await f.controller.start();
  assert.equal(f.controller.status().phase, 'failed'); assert.deepEqual(f.released, []);
  await f.recovery.retry();
  assert.equal(f.controller.status().phase, 'ready'); assert.deepEqual(f.released, [true]);
  assert.equal(f.retries(), 0);
  await f.recovery.retry(); assert.equal(f.retries(), 1);
  assert.deepEqual(f.released, [true]);
});
test('explicit disable after startup failure releases once without blocking', async () => {
  const f = fixture(); await f.controller.start();
  assert.equal(await f.recovery.continueIfDisabled(true), false); assert.deepEqual(f.released, []);
  assert.equal(await f.recovery.continueIfDisabled(false), true);
  assert.equal(f.controller.status().phase, 'continued'); assert.deepEqual(f.released, [false]);
  assert.equal(await f.recovery.continueIfDisabled(false), false); assert.deepEqual(f.released, [false]);
});
test('disabling during initialization does not prematurely release browsing', async () => {
  let complete; let released = 0;
  const controller = createAdblockStartupController({ initialize: () => new Promise(resolve => { complete = resolve; }), onReleased: async () => released++ });
  const recovery = createBlockingRecovery({ startup: () => controller, providers: () => ({}) });
  const pending = controller.start();
  assert.equal(await recovery.continueIfDisabled(false), false); assert.equal(released, 0);
  complete(); await pending; assert.equal(released, 1);
});
test('production Settings controls use startup recovery and the global disable observer', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  assert(main.includes('retry: () => blockingRecovery.retry()'));
  assert(main.includes('blockingRecovery.continueIfDisabled(s.adblockEnabled)'));
});
