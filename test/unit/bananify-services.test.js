'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const {
  OFFICIAL_APP_NAME,
  isBananifyServiceUrl,
  bananifyServiceAllowed,
} = require('../../src/main/bananify-services');
const { PING_ENDPOINT, EVENT_ENDPOINT, createTelemetrySender } = require('../../src/main/telemetry');
const { TAB_IMPORT_RELAY_ORIGIN, tabImportClaimUrl } = require('../../src/main/tab-import-handoff');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '..', '..');
const syncSource = fs.readFileSync(path.join(ROOT, 'src/main/sync.js'), 'utf8');
const SYNC_ENDPOINT = syncSource.match(/const SYNC_ENDPOINT = '([^']+)'/)?.[1];

const bananifyEndpoints = [
  ['sync', SYNC_ENDPOINT],
  ['launch ping', PING_ENDPOINT],
  ['usage event', EVENT_ENDPOINT],
  ['tab-import relay', TAB_IMPORT_RELAY_ORIGIN],
];

test('every endpoint Bananify hosts is recognized as a Bananify service', () => {
  assert.ok(SYNC_ENDPOINT, 'sync.js must still declare SYNC_ENDPOINT as a string literal');
  for (const [label, url] of bananifyEndpoints) {
    assert.equal(isBananifyServiceUrl(url), true, `${label} (${url})`);
  }
});

test('an official build may call Bananify services', () => {
  for (const [label, url] of bananifyEndpoints) {
    assert.equal(bananifyServiceAllowed(url, OFFICIAL_APP_NAME), true, label);
  }
});

test('a renamed build may not call Bananify services', () => {
  for (const [label, url] of bananifyEndpoints) {
    assert.equal(bananifyServiceAllowed(url, 'Foo Browser'), false, label);
  }
  assert.equal(bananifyServiceAllowed(PING_ENDPOINT, null), false, 'a build with no product name');
});

test('a renamed build may still call servers it runs itself', () => {
  assert.equal(bananifyServiceAllowed('https://sync.foo.example/v1/blob', 'Foo Browser'), true);
  assert.equal(bananifyServiceAllowed('http://127.0.0.1:8787', 'Foo Browser'), true);
});

test('lookalike hosts are not Bananify services, and unreadable URLs fail closed', () => {
  assert.equal(isBananifyServiceUrl('https://blancbrowser.com.example/'), false);
  assert.equal(isBananifyServiceUrl('https://notblancbrowser.com/'), false);
  assert.equal(isBananifyServiceUrl('https://bnfy-441.workers.dev.example/'), false);
  assert.equal(bananifyServiceAllowed('not a url', 'Foo Browser'), false);
});

// A future rename (product name changed for real) must fail here, loudly,
// rather than silently switching sync and usage counts off for every user.
test('the shipped product name is the official name, so official builds keep their services', () => {
  assert.equal(pkg.productName, OFFICIAL_APP_NAME);
  assert.equal(pkg.build.productName, OFFICIAL_APP_NAME);
  assert.equal(bananifyServiceAllowed(PING_ENDPOINT), true, 'the default reads the packaged product name');
});

test('a renamed build sends no launch ping or usage event to Bananify', () => {
  const calls = [];
  const sender = createTelemetrySender({
    isPackaged: () => true,
    fetchImpl: async (url) => { calls.push(url); },
    getInstallId: () => '01234567-89ab-4cde-8f01-23456789abcd',
    getVersion: () => '1.10.0',
    platform: 'darwin',
    arch: 'arm64',
    getSystemVersion: () => '26.4.1',
    newtabLayouts: ['ledger'],
    serviceAllowed: (url) => bananifyServiceAllowed(url, 'Foo Browser'),
    warn: () => {},
  });

  assert.equal(sender.sendLaunchPing(), false);
  assert.equal(sender.sendMahjongPlay(), false);
  assert.equal(sender.sendNewtabLayoutUsed('ledger'), false);
  assert.deepEqual(calls, []);
});

// Run the real claim function from main.js with a fake network boundary.
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const claimStart = mainSource.indexOf('function tabHandoffErrorMessage(');
const claimEnd = mainSource.indexOf('async function processTabHandoff(');

function claimHarness({ origin, appName }) {
  const fetched = [];
  const context = {
    AbortController, setTimeout, clearTimeout,
    tabImportClaimUrl,
    tabImportRelayOrigin: () => origin,
    bananifyServiceAllowed: (url) => bananifyServiceAllowed(url, appName),
    net: { fetch: async (url) => { fetched.push(url); return { ok: false }; } },
  };
  vm.createContext(context);
  vm.runInContext(mainSource.slice(claimStart, claimEnd), context);
  return { context, fetched };
}

const handoff = { id: 'AAAAAAAAAAAAAAAAAAAAAA', key: 'A'.repeat(43) };

test('main.js still defines the tab handoff claim functions this test runs', () => {
  assert.ok(claimStart > 0 && claimEnd > claimStart, 'claim source slice not found in main.js');
  const { context } = claimHarness({ origin: TAB_IMPORT_RELAY_ORIGIN, appName: OFFICIAL_APP_NAME });
  assert.equal(typeof context.claimTabHandoff, 'function');
  assert.equal(typeof context.tabHandoffErrorMessage, 'function');
});

test('a renamed build refuses a tab handoff before contacting the relay', async () => {
  const { context, fetched } = claimHarness({ origin: TAB_IMPORT_RELAY_ORIGIN, appName: 'Foo Browser' });
  await assert.rejects(context.claimTabHandoff(handoff), { message: 'service-unavailable' });
  assert.deepEqual(fetched, []);
  assert.match(context.tabHandoffErrorMessage('service-unavailable'), /official Blanc builds/);
});

test('an official build still claims tab handoffs from the relay', async () => {
  const { context, fetched } = claimHarness({ origin: TAB_IMPORT_RELAY_ORIGIN, appName: OFFICIAL_APP_NAME });
  await assert.rejects(context.claimTabHandoff(handoff), { message: 'unavailable' });
  assert.equal(fetched.length, 1);
  assert.ok(fetched[0].startsWith(`${TAB_IMPORT_RELAY_ORIGIN}/v1/handoffs/`));
});
