'use strict';

const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');

// Regression for publish starvation: the session and icon publishes are
// trailing 15 s debounces, re-armed on every fingerprint change. A tab whose
// title changes more often than that (a ticker, a timer, a flashing unread
// title) must not postpone the publish forever — other devices would hold a
// stale snapshot with no error anywhere. The ceiling bounds the wait from the
// FIRST unpublished change (tab-sync spec §6).

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-ceiling-'));
const key = Buffer.alloc(32, 7);
const requests = [];

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (url, options = {}) => {
        const method = options.method ?? 'GET';
        requests.push({ url: String(url), method, at: Date.now(), body: options.body ?? null });
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

const DEVICE_ID = 'ceiling-device';
fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'ceiling-test',
  accountId: 'd'.repeat(64),
  protectedKey: Buffer.from('wrapped-key').toString('base64'),
  key: '',
  lastSyncedAt: 0,
  lastError: null,
  deviceId: DEVICE_ID,
  syncTabs: true,
}));

const jsonStores = trackJsonStores();
const sync = require('../../src/main/sync');
const tabsync = require('../../src/main/tabsync');
const tabicons = require('../../src/main/tabicons');
const { deviceName } = require('../../src/main/device-name');
const { decrypt } = require('../../src/main/sync-crypto');

test.after(async () => {
  // Under the mocked clock every store update is past JsonStore's 5 s save
  // ceiling, so it writes at once and queues a rewrite behind the write in
  // flight. The tests' own settle() drains callbacks, not file I/O, so
  // sync.json, tab-sync.json and tab-icons.json are still being written when
  // the last test ends.
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const SECOND = 1000;
let title = 'Clock 00:00';
const tabList = () => [{
  url: 'https://clock.example/', title, pinned: false, groupId: null, private: false, favicon: null,
}];

/** Let a fired timer's async pass dispatch its network requests. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

const sessionRequests = () => requests.filter(({ url }) => url.endsWith('/session'));

let started = false;
/** What startProfileSync does once per launch, under the test's mocked clock
 * so the sync-on-launch pass drains before the test's own changes. */
async function ensureStarted() {
  if (!started) {
    started = true;
    tabsync.setSnapshotProvider(() => ({ tabList: tabList(), groups: [] }));
    tabicons.setSnapshotProvider(() => ({ tabList: tabList() }));
    sync.setTabStateReady(true);
    sync.init();
    mock.timers.tick(5 * SECOND);
    await settle();
  }
  requests.length = 0;
}

test('a title that changes every 10 s still publishes within the ceiling', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_800_000_000_000 });
  try {
    await ensureStarted();

    const firstChangeAt = Date.now();
    // Nine minutes of churn: a new title every 10 s, each re-arming the 15 s
    // trailing timer. Without a ceiling no session publish ever fires.
    for (let tick = 1; tick <= 54; tick += 1) {
      title = `Clock 00:${String(tick * 10).padStart(2, '0')}`;
      tabsync.noteTabsChanged();
      mock.timers.tick(10 * SECOND);
      await settle();
    }

    const published = sessionRequests();
    assert.ok(published.length > 0, 'the session store must publish while titles keep churning');
    assert.ok(
      published[0].at - firstChangeAt <= 60 * SECOND,
      `first publish must land within 60 s of the first change (took ${published[0].at - firstChangeAt} ms)`
    );
    const put = published.find(({ method }) => method === 'PUT');
    const payload = JSON.parse(decrypt(key, JSON.parse(put.body).blob));
    assert.equal(payload.devices[DEVICE_ID].name, deviceName(),
      'the published entry carries the human device name, not the raw hostname');
  } finally {
    // Let the last armed publish fire: a timer dropped by reset() would leave
    // its pending-since mark behind for the next test's clock.
    mock.timers.tick(60 * SECOND);
    await settle();
    mock.timers.reset();
  }
});

test('the trailing 15 s still applies when changes stop', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_800_100_000_000 });
  try {
    await ensureStarted();
    title = 'Settled title';
    tabsync.noteTabsChanged();
    mock.timers.tick(14 * SECOND);
    await settle();
    assert.equal(sessionRequests().length, 0, 'nothing publishes before the trailing delay elapses');
    mock.timers.tick(2 * SECOND);
    await settle();
    assert.ok(sessionRequests().length > 0, 'one quiet change publishes after 15 s');
  } finally {
    mock.timers.reset();
  }
});
