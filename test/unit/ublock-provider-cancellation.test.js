'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, settle, until } = require('./support/ublock-provider-harness');

const STAGE = { cssLoad: 'cssHostLoad', cssBridgeLoad: 'cssHostLoad', install: 'install',
  extensionLoad: 'loadExtension', backgroundReady: 'background', bridgeLoad: 'bridge', ready: 'ready' };

for (const step of Object.keys(STAGE)) {
  test(`disposal settles an initialization whose ${step} never settles and leaves nothing open`, async t => {
    const h = createProviderHarness(t, { stall: { [step]: 'never' } });
    const started = h.provider.initialize();
    started.catch(() => {});
    await until(() => h.provider.status().stage === STAGE[step]);
    await new Promise(resolve => setTimeout(resolve, 20));
    const viewsBefore = h.created.views.length;
    h.provider.dispose();
    assert.equal(await settle(started), 'rejected', 'initialize() settles promptly');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(h.created.views.length, viewsBefore, 'no view is created after disposal');
    for (const view of h.created.views) assert(view.webContents.destroyed, 'every created view is closed');
    assert.equal(h.provider.status().phase, 'disposed');
  });
}

test('an extension load that finishes after disposal is unloaded', async t => {
  const h = createProviderHarness(t, { gates: { extensionLoad: true } });
  const started = h.provider.initialize();
  started.catch(() => {});
  await until(() => h.provider.status().stage === 'loadExtension');
  h.provider.dispose();
  assert.equal(await settle(started), 'rejected');
  h.release('extensionLoad');
  await until(() => h.created.removed.includes('ublockorigin'));
});
