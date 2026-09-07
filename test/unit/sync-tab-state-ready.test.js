'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Regression for the pre-restore sync race: showOverlay('palette'|'panel')
// calls refreshSession() before startProfileSync registers snapshot providers.
// Without an explicit readiness gate, exportForSync(snapshot=null) converts the
// device's live session/icon entries into retractions and can PUT them.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-tab-ready-'));
const key = Buffer.alloc(32, 9);
const requests = [];

const electronId = require.resolve('electron');
const { encrypt, decrypt } = require('../../src/main/sync-crypto');
let serveTabRemotes = false;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (url, options = {}) => {
        const method = options.method ?? 'GET';
        requests.push({ url: String(url), method, body: options.body ?? null });
        if (method === 'GET') {
          const store = String(url).split('/').pop();
          if (serveTabRemotes && (store === 'session' || store === 'icons')) {
            const devices = {
              [DEVICE_ID]: store === 'session' ? LIVE_SESSION : LIVE_ICONS,
            };
            return {
              status: 200,
              ok: true,
              json: async () => ({
                version: 'remote-v1',
                blob: encrypt(key, JSON.stringify({ devices })),
              }),
            };
          }
          return { status: 404, ok: false };
        }
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

const DEVICE_ID = 'ready-device';
const LIVE_AT = Date.now() - 60_000;
const LIVE_SESSION = {
  name: 'MacBook',
  platform: 'darwin',
  updatedAt: LIVE_AT,
  tabs: [{ url: 'https://example.com/', title: 'Example', pinned: false, groupId: null }],
  groups: [],
};
const LIVE_ICONS = {
  updatedAt: LIVE_AT,
  icons: [{ url: 'https://example.com/', png: 'a'.repeat(64), updatedAt: LIVE_AT }],
};

fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'ready-test',
  accountId: 'c'.repeat(64),
  protectedKey: Buffer.from('wrapped-key').toString('base64'),
  key: '',
  lastSyncedAt: 1_700_000_123_000,
  lastError: 'Tabs were not refreshed on the previous pass.',
  deviceId: DEVICE_ID,
  syncTabs: true,
}));
fs.writeFileSync(path.join(tmp, 'tab-sync.json'), JSON.stringify({
  accountId: 'c'.repeat(64),
  devices: { [DEVICE_ID]: LIVE_SESSION },
}));
fs.writeFileSync(path.join(tmp, 'tab-icons.json'), JSON.stringify({
  accountId: 'c'.repeat(64),
  devices: { [DEVICE_ID]: LIVE_ICONS },
}));

const sync = require('../../src/main/sync');
const tabsync = require('../../src/main/tabsync');
const tabicons = require('../../src/main/tabicons');
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

test.after(async () => {
  await sync.disable().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
});

function readDevices(file) {
  return JSON.parse(fs.readFileSync(path.join(tmp, file), 'utf8')).devices;
}

test('opening the palette before tab state is ready does not retract or PUT', async () => {
  // Simulate showOverlay('palette') → refreshSession() during slow adblock
  // startup, before startProfileSync has registered providers or marked ready.
  sync.refreshSession();
  // refreshSession is fire-and-forget; give any incorrect pass a turn to run.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 0, 'palette-open must not contact the Worker before restore');
  assert.equal(readDevices('tab-sync.json')[DEVICE_ID].retracted, undefined);
  assert.deepEqual(readDevices('tab-sync.json')[DEVICE_ID].tabs, LIVE_SESSION.tabs);
  assert.equal(readDevices('tab-icons.json')[DEVICE_ID].retracted, undefined);
  assert.deepEqual(readDevices('tab-icons.json')[DEVICE_ID].icons, LIVE_ICONS.icons);
});

test('Settings Sync Now also skips session/icons until tab state is ready', async () => {
  requests.length = 0;
  const before = sync.status();
  assert.equal(before.lastSyncedAt, 1_700_000_123_000);
  assert.equal(before.lastError, 'Tabs were not refreshed on the previous pass.');

  const result = await sync.syncNow();
  assert.equal(result.ok, true);
  const storeNames = requests.map(({ url }) => url.split('/').pop());
  assert.ok(!storeNames.includes('session'), 'session must stay gated');
  assert.ok(!storeNames.includes('icons'), 'icons must stay gated');
  assert.ok(storeNames.includes('bookmarks') || storeNames.includes('settings'),
    'Favorites/settings may still sync');
  assert.equal(readDevices('tab-sync.json')[DEVICE_ID].retracted, undefined);
  assert.equal(readDevices('tab-icons.json')[DEVICE_ID].retracted, undefined);

  const after = sync.status();
  assert.equal(after.lastSyncedAt, before.lastSyncedAt,
    'partial pre-restore Sync Now must not advance lastSyncedAt');
  assert.equal(after.lastError, before.lastError,
    'partial pre-restore Sync Now must not clear lastError');
});

test('favicon capture is a no-op until tab state is ready', async () => {
  let captureReached = false;
  const original = tabicons.captureTab;
  tabicons.captureTab = async () => {
    captureReached = true;
    return true;
  };
  try {
    const captured = await sync.captureTabIcon({
      url: 'https://example.com/',
      favicon: 'https://example.com/favicon.ico',
      private: false,
    });
    assert.equal(captured, false);
    assert.equal(captureReached, false, 'capture must not run before tab state is ready');
  } finally {
    tabicons.captureTab = original;
  }
});

test('turning share-tabs off before restore still publishes retractions', async () => {
  // Consent-off must not wait for snapshot providers: quitting during a blocked
  // adblock startup would otherwise leave this device's tabs visible remotely.
  requests.length = 0;
  serveTabRemotes = true;
  sync.setSyncTabs(false);
  // Drive the same stores scheduleTabs(1000) would invoke.
  const result = await sync.syncNow(['session', 'icons']);
  assert.equal(result.ok, true);
  // JsonStore debounces writes; wait for the retraction to reach disk.
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(readDevices('tab-sync.json')[DEVICE_ID].retracted, true);
  assert.equal(readDevices('tab-icons.json')[DEVICE_ID].retracted, true);

  const puts = requests.filter(({ method }) => method === 'PUT');
  assert.deepEqual(
    puts.map(({ url }) => url.split('/').pop()).sort(),
    ['icons', 'session'],
    'both tab stores must PUT the consent retraction'
  );
  for (const put of puts) {
    const body = JSON.parse(put.body);
    const payload = JSON.parse(decrypt(key, body.blob));
    assert.equal(payload.devices[DEVICE_ID].retracted, true);
  }
  serveTabRemotes = false;
});

test('after restore marks ready, session/icons refresh can run with providers', async () => {
  requests.length = 0;
  sync.setSyncTabs(true);
  tabsync.setSnapshotProvider(() => ({
    tabList: [{
      url: 'https://example.com/',
      title: 'Example',
      pinned: false,
      groupId: null,
      private: false,
    }],
    groups: [],
  }));
  tabicons.setSnapshotProvider(() => ({
    tabList: [{
      url: 'https://example.com/',
      title: 'Example',
      pinned: false,
      groupId: null,
      private: false,
      favicon: null,
    }],
  }));
  sync.setTabStateReady(true);

  // Bypass the 60s refreshSession throttle from the earlier palette open.
  await sync.syncNow(['session', 'icons']);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const methods = requests.map(({ method }) => method);
  assert.ok(methods.includes('GET'), 'ready sync reaches the Worker');
  assert.equal(readDevices('tab-sync.json')[DEVICE_ID].retracted, undefined);
  assert.ok(readDevices('tab-sync.json')[DEVICE_ID].tabs.length > 0);
});

test('startProfileSync marks tab state ready only after snapshot providers exist', () => {
  const initializer = mainSource.indexOf('const startProfileSync = () =>');
  const bodyStart = mainSource.indexOf('{', initializer);
  const bodyEnd = mainSource.indexOf('\n  };', bodyStart);
  const body = mainSource.slice(bodyStart, bodyEnd);
  const tabsProvider = body.indexOf('tabsync.setSnapshotProvider');
  const iconsProvider = body.indexOf('tabicons.setSnapshotProvider');
  const ready = body.indexOf('sync.setTabStateReady(true)');
  const init = body.indexOf('sync.init()');

  assert.ok(tabsProvider >= 0, 'tabsync provider registration is present');
  assert.ok(iconsProvider >= 0, 'tabicons provider registration is present');
  assert.ok(ready > tabsProvider && ready > iconsProvider,
    'readiness must follow both snapshot providers');
  assert.ok(init > ready, 'sync.init must not run before tab state is marked ready');
});
