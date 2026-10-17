'use strict';
// Chosen device names reach the drawer, the Quick Switcher and the start page
// through listRemoteDevices, and travel on the freshness pull (spec
// 2026-10-16-island-lower-section-design.md §7).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-device-names-'));
const key = Buffer.alloc(32, 7);
const requests = [];

const electronId = require.resolve('electron');
const { decrypt } = require('../../src/main/sync-crypto');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (url, options = {}) => {
        const method = options.method ?? 'GET';
        requests.push({ store: String(url).split('/').pop(), method, body: options.body ?? null });
        if (method === 'GET') return { status: 404, ok: false };
        return { status: 200, ok: true, json: async () => ({ version: 'v1' }) };
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => Buffer.from(value),
      decryptString: () => key.toString('base64'),
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

const OWN = '0a0b0c0d-1111-4222-8333-444455556666';
const NEO = '2f1c9a52-6a1e-4b8e-9d0a-1d2c3b4a5f60';
const ACCOUNT = 'd'.repeat(64);

fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({ onboardingVersion: 1 }));
fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'names-test',
  accountId: ACCOUNT,
  protectedKey: Buffer.from('wrapped-key').toString('base64'),
  key: '',
  lastSyncedAt: 0,
  lastError: null,
  deviceId: OWN,
  syncTabs: true,
}));
fs.writeFileSync(path.join(tmp, 'tab-sync.json'), JSON.stringify({
  accountId: ACCOUNT,
  devices: {
    [NEO]: {
      name: 'MacBook Neo',
      platform: 'darwin',
      updatedAt: Date.now() - 60_000,
      tabs: [{ url: 'https://example.com/', title: 'Example', pinned: false, groupId: null }],
      groups: [],
    },
  },
}));

const jsonStores = trackJsonStores();
const settings = require('../../src/main/settings');
const sync = require('../../src/main/sync');
const tabsync = require('../../src/main/tabsync');
const { deviceName } = require('../../src/main/device-name');

test.after(async () => {
  await sync.disable().catch(() => {}); // clears the optional-store retry timer
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a chosen name replaces the published one, and clearing it restores that', () => {
  assert.equal(sync.listRemoteDevices()[0].name, 'MacBook Neo');
  assert.equal(sync.renameRemoteDevice(NEO, '  Work laptop '), true);
  assert.equal(sync.listRemoteDevices()[0].name, 'Work laptop');
  assert.equal(sync.renameRemoteDevice(NEO, ''), true);
  assert.equal(sync.listRemoteDevices()[0].name, 'MacBook Neo');
  assert.equal(sync.renameRemoteDevice(NEO, 'Work laptop'), true);
});

test('only a device the drawer lists can be renamed from it', () => {
  assert.equal(sync.renameRemoteDevice('9f9f9f9f-0000-4000-8000-000000000000', 'Ghost'), false);
  assert.equal(sync.renameRemoteDevice(OWN, 'Not from the drawer'), false, 'this device is renamed in Settings');
  assert.equal(sync.renameRemoteDevice(NEO, 42), false, 'a name is a string or null');
  assert.equal(Object.hasOwn(settings.getDeviceNames(), OWN), false);
});

test('status carries this device’s chosen and published names', () => {
  const before = sync.status();
  assert.equal(before.deviceName, '');
  assert.equal(before.deviceNamePublished, deviceName());
  const after = sync.setThisDeviceName('Studio Mac');
  assert.equal(after.deviceName, 'Studio Mac');
  assert.equal(after.deviceNamePublished, deviceName());
  assert.equal(sync.setThisDeviceName('').deviceName, '');
  sync.setThisDeviceName('Studio Mac');
});

test('the freshness pull waits for tab state, carries settings, and runs at most once a minute', async () => {
  requests.length = 0;
  sync.refreshSession();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 0, 'nothing before tab state is ready');

  tabsync.setSnapshotProvider(() => ({
    tabList: [{ id: 't1', url: 'https://example.org/', title: 'Example', pinned: false, groupId: null, private: false }],
    groups: [],
  }));
  sync.setTabStateReady(true);
  sync.refreshSession();
  const deadline = Date.now() + 10_000;
  // The empty icon sidecar is never created on a 404, so two PUTs end the pass.
  const put = (store) => requests.some((r) => r.method === 'PUT' && r.store === store);
  while (!(put('session') && put('settings')) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const gets = requests.filter((r) => r.method === 'GET').map((r) => r.store).sort();
  assert.deepEqual(gets, ['icons', 'session', 'settings']);

  const session = requests.find((r) => r.method === 'PUT' && r.store === 'session');
  const published = JSON.parse(decrypt(key, JSON.parse(session.body).blob));
  assert.equal(published.devices[OWN].name, deviceName(), 'the published name never changes');
  const settingsPut = requests.find((r) => r.method === 'PUT' && r.store === 'settings');
  const names = JSON.parse(decrypt(key, JSON.parse(settingsPut.body).blob)).values.deviceNames;
  assert.equal(names[NEO].name, 'Work laptop');
  assert.equal(names[OWN].name, 'Studio Mac');

  const count = requests.length;
  sync.refreshSession();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(requests.length, count, 'throttled to once a minute');
});

test('a rename re-labels the drawer and open start pages', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const start = main.slice(main.indexOf('const startProfileSync = () => {'));
  const hook = start.match(/settings\.onSettingsChanged\(\(next\) => \{[\s\S]*?\n {4}\}\);/)?.[0];
  assert.ok(hook, 'startProfileSync watches settings for device-name changes');
  assert.match(hook, /deviceNamesEqual\(shownDeviceNames, next\.deviceNames\)/);
  assert.match(hook, /pushRemoteDevices\(\);/);
});
