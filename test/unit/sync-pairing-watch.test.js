'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');

// The desktop notices the device that took its code (design 2026-10-28
// §6.3): a presence-only entry (tabs: []) counts, the device's chosen name
// wins, and the code stops being live the moment it's claimed.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-pairing-watch-'));
const requests = [];
const blobs = new Map();
let busy = false; // the Worker's new-account budget is spent: every PUT is 503

const jsonRes = (status, body) => ({ status, ok: status < 400, json: async () => body });

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
        const u = String(url);
        requests.push({ url: u, method });
        if (/\/v1\/pair\/[0-9a-f]{64}$/.test(u)) {
          if (method === 'POST') return jsonRes(201, {});
          return { status: 204, ok: true };
        }
        const blob = u.match(/\/v1\/blob\/([0-9a-f]{64})(?:\/([a-z]+))?$/);
        if (blob) {
          const key = `${blob[1]}/${blob[2]}`;
          if (method === 'GET') return blobs.has(key) ? jsonRes(200, { version: 'v', blob: blobs.get(key) }) : jsonRes(404, {});
          if (method === 'PUT') {
            if (busy) return jsonRes(503, { error: 'busy' });
            blobs.set(key, JSON.parse(options.body).blob);
            return jsonRes(200, { version: 'v2' });
          }
          if (method === 'DELETE') return { status: 204, ok: true };
        }
        throw new Error(`unexpected ${method} ${u}`);
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    clipboard: { writeText: () => {} },
    app: { getPath: () => tmp, on: () => {} },
  },
};

fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true, handle: 'anthony', accountId: 'a'.repeat(64),
  protectedKey: Buffer.from(Buffer.alloc(32, 5).toString('base64')).toString('base64'), key: '',
  lastSyncedAt: 1, lastError: null, deviceId: 'this-device', syncTabs: false,
}));
fs.writeFileSync(path.join(tmp, 'tab-sync.json'), JSON.stringify({
  accountId: 'a'.repeat(64),
  devices: { known: { name: 'Studio', platform: 'darwin', updatedAt: Date.now(), tabs: [], groups: [] } },
}));

const jsonStores = trackJsonStores();
const sync = require('../../src/main/sync');
const tabsync = require('../../src/main/tabsync');
const settings = require('../../src/main/settings');
sync.setTabStateReady(true);

const joined = [];
const live = [];
sync.onPairingJoined((device) => joined.push(device));
sync.onPairingCodeLive((value) => live.push(value));
const pairDeletes = () => requests.filter((r) => r.url.includes('/v1/pair/') && r.method === 'DELETE');
const arrive = (id, entry) => tabsync.mergeFromSync({ devices: { [id]: { updatedAt: Date.now(), tabs: [], groups: [], ...entry } } }, sync.sharedContext());

test.after(async () => {
  await sync.disable().catch(() => {});
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test.beforeEach(() => { joined.length = 0; live.length = 0; });
test.afterEach(() => sync.cancelPairing());

test('a presence-only new device marks the code joined', async () => {
  assert.equal((await sync.beginPairing()).ok, true);
  assert.deepEqual(live, [true]);
  const deletesBefore = pairDeletes().length;
  arrive('phone', { name: 'iPhone', platform: 'ios' });
  assert.deepEqual(joined, [{ deviceId: 'phone', name: 'iPhone', platform: 'ios' }]);
  assert.deepEqual(live, [true, false]);
  const state = sync.pairingState();
  assert.equal(state.active, false);
  assert.deepEqual(state.joined, { name: 'iPhone', platform: 'ios' });
  await new Promise(setImmediate);
  assert.equal(pairDeletes().length, deletesBefore + 1);
});

test('a device known when the code was shown does not', async () => {
  await sync.beginPairing();
  arrive('known', { name: 'Studio', platform: 'darwin' });
  assert.deepEqual(joined, []);
  assert.equal(sync.pairingState().active, true);
});

test('the chosen name wins', async () => {
  await sync.beginPairing();
  settings.setDeviceName('tablet', 'Kitchen iPad');
  arrive('tablet', { name: 'iPad', platform: 'ios' });
  assert.equal(joined[0].name, 'Kitchen iPad');
});

test('cancel ends the code and a later arrival is just a device', async () => {
  await sync.beginPairing();
  await sync.cancelPairing();
  assert.deepEqual(live, [true, false]);
  arrive('late', { name: 'Laptop', platform: 'linux' });
  assert.deepEqual(joined, []);
  assert.equal(sync.pairingState().joined, null);
});

test('a new code clears the last join', async () => {
  await sync.beginPairing();
  arrive('second', { name: 'iPhone', platform: 'ios' });
  assert.ok(sync.pairingState().joined);
  await sync.beginPairing();
  assert.equal(sync.pairingState().joined, null);
});

// Review fixes: the live-code signal (which drives capture exclusion) always
// ends, and a join never outlives the sync it happened in.
test('an expiry noticed by pairingState ends the live code', async () => {
  const reply = await sync.beginPairing();
  const realNow = Date.now;
  Date.now = () => reply.expiresAt + 1;
  try {
    assert.equal(sync.pairingState().active, false);
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual(live, [true, false]);
});

test('disable while a code is live ends it', async () => {
  await sync.beginPairing();
  await sync.disable();
  assert.deepEqual(live, [true, false]);
  const d = JSON.parse(fs.readFileSync(path.join(tmp, 'sync.json'), 'utf8'));
  d.enabled = true; d.lastSyncedAt = 1;
  // Re-enable for the tests below the way the fixture started.
  fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({ ...d, accountId: 'a'.repeat(64), handle: 'anthony', protectedKey: Buffer.from(Buffer.alloc(32, 5).toString('base64')).toString('base64') }));
});

test('turning Sync off forgets the last join', async () => {
  await sync.startNew({ handle: 'My Blanc' }).catch(() => {});
  if (!sync.status().enabled) return;
  await sync.resetRequestWindowForTest();
  await sync.syncNow();
  assert.equal((await sync.beginPairing()).ok, true);
  arrive('fresh-phone', { name: 'iPhone', platform: 'ios' });
  assert.ok(sync.pairingState().joined);
  await sync.disable();
  assert.equal(sync.pairingState().joined, null);
});
