'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { waitForJson } = require('./support/wait-for-json');
const { trackJsonStores } = require('./support/track-json-stores');

// sync.js pairing entry points (design 2026-10-16 §5.4/§5.4a): begin and
// cancel a pairing, join from the off state, switch from the on state with
// disable()'s drain barrier, and copy a recovery code without it crossing
// IPC. The fake Worker serves /v1/pair in memory and records every request.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-pairing-'));
const requests = [];
const kv = new Map();          // pair:{id} → blob
const blobs = new Map();       // `${accountId}/${store}` → true (what PUTs landed)
let olderWorker = false;       // pair routes answer a plain-text 404
let deleteStatus = 204;        // account DELETE outcome
let putGate = null;            // when set, PUTs wait on it (in-flight simulation)
let onPutDispatched = () => {};
let postGate = null;           // when set, pair POSTs wait on it
let onPostDispatched = () => {};
let failNextEncrypt = false;   // one protectSyncKey failure
const appListeners = [];
const dialogReplies = [];
const clipboardWrites = [];

const jsonRes = (status, body) => ({ status, ok: status < 400, json: async () => body });
const textRes = (status, text) => ({ status, ok: status < 400, json: async () => { throw new Error('not json'); }, text: async () => text });

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
        requests.push({ url: u, method, body: options.body ?? null });
        const pair = u.match(/\/v1\/pair\/([0-9a-f]{64})$/);
        if (pair) {
          if (olderWorker) return textRes(404, 'not found');
          const key = `pair:${pair[1]}`;
          if (method === 'POST') {
            onPostDispatched();
            if (postGate) await postGate;
            if (kv.has(key)) return jsonRes(409, { error: 'exists' });
            kv.set(key, JSON.parse(options.body).blob);
            return jsonRes(201, {});
          }
          if (method === 'GET') {
            if (!kv.has(key)) return jsonRes(404, { error: 'not-found' });
            const blob = kv.get(key); kv.delete(key);
            return jsonRes(200, { blob });
          }
          if (method === 'DELETE') { kv.delete(key); return { status: 204, ok: true }; }
        }
        const blob = u.match(/\/v1\/blob\/([0-9a-f]{64})(?:\/([a-z]+))?$/);
        if (blob) {
          const [, accountId, store] = blob;
          if (method === 'GET') return blobs.has(`${accountId}/${store}`) ? jsonRes(200, { version: 'v', blob: blobs.get(`${accountId}/${store}`) }) : jsonRes(404, {});
          if (method === 'PUT') {
            onPutDispatched();
            if (putGate) await putGate;
            blobs.set(`${accountId}/${store}`, JSON.parse(options.body).blob);
            requests.push({ url: u, method: 'PUT-landed' });
            return jsonRes(200, { version: 'v2' });
          }
          if (method === 'DELETE') {
            if (deleteStatus !== 204) return { status: deleteStatus, ok: false };
            for (const k of [...blobs.keys()]) if (k.startsWith(accountId)) blobs.delete(k);
            requests.push({ url: u, method: 'DELETE-landed' });
            return { status: 204, ok: true };
          }
        }
        throw new Error(`unexpected ${method} ${u}`);
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => {
        if (failNextEncrypt) { failNextEncrypt = false; throw new Error('keychain locked'); }
        return Buffer.from(value);
      },
      decryptString: (value) => value.toString(),
    },
    dialog: { showMessageBox: async () => ({ response: dialogReplies.shift() ?? 1 }) },
    clipboard: { writeText: (text) => clipboardWrites.push(text) },
    app: { getPath: () => tmp, on: (event, fn) => appListeners.push([event, fn]) },
  },
};

const OWN_KEY = Buffer.alloc(32, 5);
const OWN_ACCOUNT = 'a'.repeat(64);
fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true, handle: 'anthony', accountId: OWN_ACCOUNT,
  protectedKey: Buffer.from(OWN_KEY.toString('base64')).toString('base64'), key: '',
  lastSyncedAt: 0, lastError: null, deviceId: 'this-device', syncTabs: true,
}));
fs.writeFileSync(path.join(tmp, 'tab-sync.json'), JSON.stringify({
  accountId: OWN_ACCOUNT,
  devices: { peer: { name: 'Peer', platform: 'darwin', updatedAt: Date.now(), tabs: [{ url: 'https://p.example/', title: 'P', groupId: null, pinned: false }], groups: [] } },
}));

const jsonStores = trackJsonStores();
const sync = require('../../src/main/sync');
const pairing = require('../../src/main/sync-pairing');
sync.setTabStateReady(true);

const readSync = () => JSON.parse(fs.readFileSync(path.join(tmp, 'sync.json'), 'utf8'));
const readDevices = (file) => JSON.parse(fs.readFileSync(path.join(tmp, file), 'utf8')).devices;
const pairRequests = (method) => requests.filter((r) => r.url.includes('/v1/pair/') && r.method === method);
const OTHER = { v: 1, handle: 'studio', accountId: 'c'.repeat(64), key: crypto.randomBytes(32).toString('base64') };
/** Park a secret the way another device's beginPairing would. */
function parkCode(code, payload = OTHER) {
  const { pairId, wrapKey } = pairing.pairingMaterial(code);
  kv.set(`pair:${pairId}`, pairing.wrapSecret(wrapKey, payload));
  return pairId;
}

test.after(async () => {
  await sync.disable().catch(() => {}); // clears the optional-store retry timer
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('beginPairing posts a wrapped secret under the code-derived pairId and keeps the code in memory only', async () => {
  const res = await sync.beginPairing();
  assert.equal(res.ok, true);
  assert.match(res.code, /^[A-Z2-9]{8}$/);
  assert.ok(res.expiresAt > Date.now() + 500_000);
  const { pairId, wrapKey } = pairing.pairingMaterial(res.code);
  const post = pairRequests('POST').at(-1);
  assert.ok(post.url.endsWith(pairId));
  const secret = pairing.unwrapSecret(wrapKey, JSON.parse(post.body).blob);
  assert.deepEqual(secret, { v: 1, handle: 'anthony', accountId: OWN_ACCOUNT, key: OWN_KEY.toString('base64') });
  assert.equal(JSON.stringify(readSync()).includes(res.code), false, 'the code never reaches sync.json');
  assert.deepEqual(sync.pairingState(), { active: true, code: res.code, expiresAt: res.expiresAt });
});

test('pairingState resumes the live code and expiresAt; cancelPairing DELETEs and clears it', async () => {
  const before = sync.pairingState();
  assert.equal(before.active, true);
  const res = await sync.cancelPairing();
  assert.deepEqual(res, { ok: true });
  assert.ok(pairRequests('DELETE').at(-1).url.endsWith(pairing.pairingMaterial(before.code).pairId));
  assert.deepEqual(sync.pairingState(), { active: false });
  assert.equal(kv.size, 0);
});

test('beginPairing retries a 409 with a fresh code, three times at most', async () => {
  const seen = [];
  const original = pairing.generateCode;
  // Force the first two codes to collide with parked entries.
  const taken = ['AAAAAAAA', 'BBBBBBBB'];
  for (const code of taken) parkCode(code);
  let n = 0;
  pairing.generateCode = () => { const code = n < 2 ? taken[n] : original(); n += 1; seen.push(code); return code; };
  try {
    const res = await sync.beginPairing();
    assert.equal(res.ok, true);
    assert.deepEqual(seen.slice(0, 2), taken);
    assert.equal(res.code, seen[2]);
  } finally {
    pairing.generateCode = original;
    await sync.cancelPairing();
    kv.clear();
  }
});

test('beginPairing on an older Worker is pair-unavailable and leaves no pairing state', async () => {
  olderWorker = true;
  try {
    const res = await sync.beginPairing();
    assert.deepEqual(res, { ok: false, error: 'pair-unavailable' });
    assert.deepEqual(sync.pairingState(), { active: false });
  } finally { olderWorker = false; }
});

test('copyRecoveryCode writes the code to the clipboard after the dialog confirms and returns no code', async () => {
  dialogReplies.push(0);
  const res = await sync.copyRecoveryCode({ texts: { message: 'm', detail: 'd', copy: 'Copy', cancel: 'Cancel' } });
  assert.deepEqual(res, { ok: true });
  assert.equal(clipboardWrites.length, 1);
  assert.deepEqual(pairing.decodeRecoveryCode(clipboardWrites[0]), { v: 1, handle: 'anthony', accountId: OWN_ACCOUNT, key: OWN_KEY.toString('base64') });
});

test('copyRecoveryCode writes nothing when the dialog is cancelled', async () => {
  dialogReplies.push(1);
  const res = await sync.copyRecoveryCode();
  assert.deepEqual(res, { ok: false, error: 'cancelled' });
  assert.equal(clipboardWrites.length, 1);
});

test('joinWithCode while enabled is sync-on', async () => {
  parkCode('K7MR4PX2');
  const res = await sync.joinWithCode('K7MR-4PX2');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'sync-on');
  assert.equal(readSync().accountId, OWN_ACCOUNT);
  kv.clear();
});

test('switchWithCode with a failed wipe keeps the old credentials enabled and the device caches', async () => {
  parkCode('K7MR4PX2');
  deleteStatus = 503;
  try {
    const res = await sync.switchWithCode('K7MR4PX2', { wipeRemote: true });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'wipe-failed:503');
    assert.equal(readSync().enabled, true);
    assert.equal(readSync().accountId, OWN_ACCOUNT);
    assert.ok(readDevices('tab-sync.json').peer, 'device cache untouched');
  } finally { deleteStatus = 204; kv.clear(); }
});

test('switchWithCode lets an in-flight PUT land before the DELETE, then adopts the new credentials and clears the caches', async () => {
  let release;
  putGate = new Promise((resolve) => { release = resolve; });
  let dispatched;
  const putDispatched = new Promise((resolve) => { dispatched = resolve; });
  onPutDispatched = () => dispatched();
  const pass = sync.syncNow(['bookmarks']);   // GET 404 → PUT dispatched and held
  await putDispatched;
  parkCode('K7MR4PX2');
  const switching = sync.switchWithCode('K7MR4PX2', { wipeRemote: true });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  putGate = null;
  const [, res] = await Promise.all([pass, switching]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const order = requests.map((r) => r.method);
  assert.ok(order.indexOf('DELETE-landed') > order.indexOf('PUT-landed'), `order ${JSON.stringify(order.slice(-12))}`);
  const s = readSync();
  assert.equal(s.enabled, true);
  assert.equal(s.accountId, OTHER.accountId);
  assert.equal(s.handle, 'studio');
  assert.equal(s.deviceId, 'this-device', 'deviceId survives a switch');
  assert.equal(s.syncTabs, true, 'tab-sharing consent survives a switch');
  await waitForJson(path.join(tmp, 'tab-sync.json'), (json) => !json.devices?.peer);
  assert.equal(readDevices('tab-sync.json').peer, undefined, 'old account devices cleared');
  assert.ok(requests.some((r) => r.method === 'GET' && r.url.includes(`/v1/blob/${OTHER.accountId}/`)), 'a sync against the new account followed');
});

test('joinWithCode with a wrong code is pair-not-found and stores nothing', async () => {
  await sync.disable();
  // JsonStore saves are debounced and written off the main thread.
  await waitForJson(path.join(tmp, 'sync.json'), (json) => json.enabled === false);
  const res = await sync.joinWithCode('ZZZZ-ZZZZ');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'pair-not-found');
  assert.equal(readSync().enabled, false);
});

test('joinWithCode with an invalid code is pair-invalid before any network call', async () => {
  const n = requests.length;
  const res = await sync.joinWithCode('K7MR4PX0');
  assert.equal(res.error, 'pair-invalid');
  assert.equal(requests.length, n);
});

test('joinWithCode on an older Worker is pair-unavailable', async () => {
  olderWorker = true;
  try {
    const res = await sync.joinWithCode('K7MR4PX2');
    assert.equal(res.error, 'pair-unavailable');
  } finally { olderWorker = false; }
});

test('joinWithCode stores credentials, syncs, and the device keeps its deviceId', async () => {
  parkCode('K7MR4PX2');
  const res = await sync.joinWithCode('k7mr 4px2');
  assert.equal(res.ok, true, JSON.stringify(res));
  const s = readSync();
  assert.equal(s.enabled, true);
  assert.equal(s.handle, 'studio');
  assert.equal(s.accountId, OTHER.accountId);
  assert.equal(s.deviceId, 'this-device');
  assert.ok(requests.some((r) => r.method === 'GET' && r.url.includes(`/v1/blob/${OTHER.accountId}/settings`)));
  await sync.disable();
});

test('a pasted recovery code joins with no network request', async () => {
  const code = pairing.encodeRecoveryCode(OTHER);
  const n = requests.length;
  const res = await sync.joinWithCode(` ${code}\n`);
  assert.equal(res.ok, true, JSON.stringify(res));
  const first = requests[n];
  assert.ok(first && first.url.includes('/v1/blob/'), 'the first request after the paste is the sync itself, not a pair lookup');
  assert.equal(readSync().accountId, OTHER.accountId);
  await sync.disable();
});

test('a truncated recovery code is pair-invalid', async () => {
  await waitForJson(path.join(tmp, 'sync.json'), (json) => json.enabled === false);
  const res = await sync.joinWithCode(pairing.encodeRecoveryCode(OTHER).slice(0, -12));
  assert.equal(res.error, 'pair-invalid');
  assert.equal(readSync().enabled, false);
});

// ---- Review fixes (final pass) ----
const OWN_PAYLOAD = { v: 1, handle: 'anthony', accountId: OWN_ACCOUNT, key: OWN_KEY.toString('base64') };

test('beginPairing retracts a still-live previous code before issuing a new one', async () => {
  await sync.joinWithCode(pairing.encodeRecoveryCode(OWN_PAYLOAD));
  await waitForJson(path.join(tmp, 'sync.json'), (json) => json.enabled === true);
  const first = await sync.beginPairing();
  const firstId = pairing.pairingMaterial(first.code).pairId;
  requests.length = 0;
  const second = await sync.beginPairing();
  assert.equal(second.ok, true);
  const order = requests.filter((r) => r.url.includes('/v1/pair/')).map((r) => `${r.method} ${r.url.slice(-8)}`);
  assert.equal(order[0], `DELETE ${firstId.slice(-8)}`, `the old entry goes first, got ${JSON.stringify(order)}`);
  assert.equal(kv.has(`pair:${firstId}`), false);
  assert.deepEqual(sync.pairingState().code, second.code);
  await sync.cancelPairing();
});

test('quitting retracts a live pairing code', async () => {
  sync.init(); // registers the before-quit listener, as startProfileSync does
  const res = await sync.beginPairing();
  const id = pairing.pairingMaterial(res.code).pairId;
  const quit = appListeners.filter(([event]) => event === 'before-quit').map(([, fn]) => fn);
  assert.ok(quit.length > 0, 'init registered a before-quit listener');
  requests.length = 0;
  for (const fn of quit) fn();
  await settleRequests();
  assert.ok(pairRequests('DELETE').some((r) => r.url.endsWith(id)), 'the entry is deleted on quit');
  assert.deepEqual(sync.pairingState(), { active: false });
});

test('a code still being parked when Sync is turned off is retracted, not left for a dead sync', async () => {
  let release;
  postGate = new Promise((resolve) => { release = resolve; });
  let dispatched;
  const posted = new Promise((resolve) => { dispatched = resolve; });
  onPostDispatched = () => dispatched();
  const begin = sync.beginPairing();
  await posted;
  const off = sync.disable();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  postGate = null;
  const [res] = await Promise.all([begin, off]);
  assert.equal(res.ok, false);
  await settleRequests();
  assert.equal(kv.size, 0, 'nothing stays parked for the sync that was turned off');
  assert.deepEqual(sync.pairingState(), { active: false });
  await waitForJson(path.join(tmp, 'sync.json'), (json) => json.enabled === false);
});

test('switchWithCode with a key-protect failure keeps the old credentials and never deletes the old account', async () => {
  await sync.joinWithCode(pairing.encodeRecoveryCode(OWN_PAYLOAD));
  await waitForJson(path.join(tmp, 'sync.json'), (json) => json.enabled === true && json.accountId === OWN_ACCOUNT);
  parkCode('K7MR4PX2');
  requests.length = 0;
  failNextEncrypt = true;
  const res = await sync.switchWithCode('K7MR4PX2', { wipeRemote: true });
  assert.equal(res.ok, false);
  assert.match(String(res.error), /^key-store:|^key-protect-failed$/);
  assert.ok(!requests.some((r) => r.method === 'DELETE-landed'), 'the old account was not erased');
  const s = readSync();
  assert.equal(s.enabled, true);
  assert.equal(s.accountId, OWN_ACCOUNT);
  kv.clear();
});

test('switchWithCode to the sync this device already uses never erases it, even with the box on', async () => {
  parkCode('K7MR4PX2', OWN_PAYLOAD);
  requests.length = 0;
  const res = await sync.switchWithCode('K7MR4PX2', { wipeRemote: true });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(!requests.some((r) => r.method === 'DELETE-landed'), 'no wipe of the account being joined');
  assert.equal(readSync().accountId, OWN_ACCOUNT);
  assert.equal(readSync().enabled, true);
});

async function settleRequests() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
