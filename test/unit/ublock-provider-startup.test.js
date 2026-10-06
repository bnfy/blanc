'use strict';
// Startup ordering with fake Electron views and a real verified package: the
// provider must await the install, keep web traffic held meanwhile, and
// report how long each startup stage took.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const realPackage = require('../../src/main/ublock-package');
const { createProviderHarness } = require('./support/ublock-provider-harness');
const STAGES = ['cssHostLoad', 'cssHostReady', 'install', 'loadExtension', 'background', 'bridge', 'ready'];

function fixture(t, install) { return createProviderHarness(t, { install }); }

test('startup awaits the verified install, holds web traffic meanwhile and times every stage', async t => {
  let reached, release;
  const atInstall = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const { provider, userData } = fixture(t, async options => {
    reached();
    await gate;
    return realPackage.installVerifiedPackageAsync(options);
  });
  const started = provider.initialize();
  await atInstall;
  const during = provider.status();
  assert.equal(during.phase, 'initializing');
  assert.equal(during.stage, 'install');
  assert.deepEqual(Object.keys(during.timings), ['cssHostLoad', 'cssHostReady']);
  assert.equal((await provider.decide('onBeforeRequest', { id: 1, url: 'https://example.org/', resourceType: 'mainFrame' })).cancel, true,
    'web traffic stays held while the install is pending');
  release();
  const ready = await started;
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.stage, null);
  assert.deepEqual(Object.keys(ready.timings), STAGES);
  for (const name of STAGES) assert(Number.isFinite(ready.timings[name]) && ready.timings[name] >= 0, name);
  assert(fs.existsSync(path.join(userData, 'managed-ublock', 'personal', 'extension', 'manifest.json')));
});

test('a failed verified install fails closed with the unchanged error and names its stage', async t => {
  const { provider } = fixture(t, async () => { throw new Error('ubo-package-integrity'); });
  await assert.rejects(provider.initialize());
  const failed = provider.status();
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.error, 'ubo-initialization-failed');
  assert.equal(failed.stage, 'install');
  assert.deepEqual(Object.keys(failed.timings), ['cssHostLoad', 'cssHostReady', 'install']);
  assert.equal((await provider.decide('onBeforeRequest', { id: 2, url: 'https://example.org/', resourceType: 'mainFrame' })).cancel, true);
});
