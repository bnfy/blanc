'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');

// Sync without a passphrase (design 2026-10-28 §5.1): startNew() makes a
// random account, never derives one, and no pairing code is issued until that
// account has reached the Worker once.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-start-new-'));
const requests = [];
const blobs = new Map();
let busy = false; // the Worker's new-account budget is spent: every PUT is 503
let offline = false; // every request fails as if there were no network
let putGate = null; // when set, PUTs wait on it (a pass in flight)

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
        if (offline) throw new TypeError('fetch failed');
        if (/\/v1\/pair\/[0-9a-f]{64}$/.test(u)) {
          if (method === 'POST') return jsonRes(201, {});
          return { status: 204, ok: true };
        }
        const blob = u.match(/\/v1\/blob\/([0-9a-f]{64})(?:\/([a-z]+))?$/);
        if (blob) {
          const key = `${blob[1]}/${blob[2]}`;
          if (method === 'GET') return blobs.has(key) ? jsonRes(200, { version: 'v', blob: blobs.get(key) }) : jsonRes(404, {});
          if (method === 'PUT') {
            if (putGate) await putGate;
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

const jsonStores = trackJsonStores();
const syncCrypto = require('../../src/main/sync-crypto');
const realDeriveKeys = syncCrypto.deriveKeys;
let deriveCalls = 0;
syncCrypto.deriveKeys = (...args) => { deriveCalls += 1; return realDeriveKeys(...args); };
const sync = require('../../src/main/sync');
sync.setTabStateReady(true);

const readSync = () => JSON.parse(fs.readFileSync(path.join(tmp, 'sync.json'), 'utf8'));
const pairPosts = () => requests.filter((r) => r.url.includes('/v1/pair/') && r.method === 'POST');

test.after(async () => {
  await sync.disable().catch(() => {});
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Every pass spends the desktop's 10-GETs-a-minute window; start each test
// with an empty one so the suite doesn't wait out real minutes.
test.beforeEach(() => sync.resetRequestWindowForTest());

test.afterEach(async () => {
  busy = false;
  await sync.cancelPairing();
  await sync.disable();
});

test('startNew stores a random 64-hex account, a protected key and the given name', async () => {
  const reply = await sync.startNew({ handle: 'My Blanc' });
  assert.equal(reply.ok, true);
  assert.equal(reply.synced, true);
  const d = readSync();
  assert.equal(d.enabled, true);
  assert.match(d.accountId, /^[0-9a-f]{64}$/);
  assert.equal(d.handle, 'My Blanc');
  assert.ok(d.protectedKey.length > 0);
  assert.equal(d.key, '');
  assert.equal(d.origin, 'generated');
  assert.equal(d.recoveryPromptDismissed, false);
  assert.equal(sync.status().origin, 'generated');
});

test('startNew never derives keys', async () => {
  const before = deriveCalls;
  await sync.startNew({ handle: 'My Blanc' });
  assert.equal(deriveCalls, before);
});

test('two startNew accounts differ', async () => {
  await sync.startNew({ handle: 'My Blanc' });
  const first = readSync().accountId;
  await sync.disable();
  await sync.resetRequestWindowForTest();
  await sync.startNew({ handle: 'My Blanc' });
  assert.notEqual(readSync().accountId, first);
});

test('startNew falls back to My Blanc for a missing name', async () => {
  await sync.startNew({ handle: ' x ' });
  assert.equal(readSync().handle, 'My Blanc');
});

test('startNew while on is sync-on', async () => {
  await sync.startNew({ handle: 'My Blanc' });
  const reply = await sync.startNew({ handle: 'My Blanc' });
  assert.equal(reply.ok, false);
  assert.equal(reply.error, 'sync-on');
});

test('a 503 first PUT keeps Sync on and reports synced: false', async () => {
  busy = true;
  const reply = await sync.startNew({ handle: 'My Blanc' });
  assert.equal(reply.ok, true);
  assert.equal(reply.synced, false);
  const d = readSync();
  assert.equal(d.enabled, true);
  assert.ok(sync.status().lastError);
  assert.equal(d.lastSyncedAt, 0);
});

test('beginPairing before the first successful pass is not-ready', async () => {
  busy = true;
  await sync.startNew({ handle: 'My Blanc' });
  const before = pairPosts().length;
  assert.deepEqual(await sync.beginPairing(), { ok: false, error: 'not-ready' });
  assert.equal(pairPosts().length, before);
  busy = false;
  await sync.resetRequestWindowForTest();
  await sync.syncNow();
  const reply = await sync.beginPairing();
  assert.equal(reply.ok, true);
  assert.equal(pairPosts().length, before + 1);
});

test('dismissRecoveryPrompt sets it, and copyRecoveryCode marks it dismissed', async () => {
  await sync.startNew({ handle: 'My Blanc' });
  assert.deepEqual(sync.dismissRecoveryPrompt(), { ok: true });
  assert.equal(sync.status().recoveryPromptDismissed, true);
  await sync.disable();
  await sync.resetRequestWindowForTest();
  await sync.startNew({ handle: 'My Blanc' });
  assert.equal(sync.status().recoveryPromptDismissed, false);
  assert.equal((await sync.copyRecoveryCode()).ok, true);
  assert.equal(sync.status().recoveryPromptDismissed, true);
});

test('an offline first pass keeps Sync on and is not-ready', async () => {
  offline = true;
  try {
    const reply = await sync.startNew({ handle: 'My Blanc' });
    assert.equal(reply.ok, true);
    assert.equal(reply.synced, false);
    assert.equal((await sync.beginPairing()).error, 'not-ready');
  } finally {
    offline = false;
  }
});

test('a pass abandoned by turning Sync off is not reported as synced', async () => {
  let release;
  putGate = new Promise((resolve) => { release = resolve; });
  try {
    const started = sync.startNew({ handle: 'My Blanc' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const off = sync.disable();
    release();
    const reply = await started;
    await off;
    assert.equal(reply.synced, false);
  } finally {
    putGate = null;
  }
});
