'use strict';
// Send to device on desktop (M7b addendum §3–§7): the optional sends store,
// presence, sendTab's results and the inbox, against an in-memory Worker.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');
const { encrypt, decrypt } = require('../../src/main/sync-crypto');

// These legacy Send tests exercise available-capacity behavior. Advance both
// clocks between cases so requests from earlier tests cannot consume this
// case's budget; the rolling-window and exhausted-departure tests cover waits.
// Strictly increasing stamps also make the two sequential sends deterministic.
let clock=Date.now();
test.mock.method(Date,'now',()=>++clock);
test.mock.method(performance,'now',()=>clock);
test.beforeEach(()=>{clock+=61000;});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-sends-'));
const key = Buffer.alloc(32, 9);
const OWN = '0a0b0c0d-1111-4222-8333-444455556666';
const NEO = '2f1c9a52-6a1e-4b8e-9d0a-1d2c3b4a5f60';
const PHONE = '7d6c5b4a-3333-4444-8555-666677778888';
const ACCOUNT = 'e'.repeat(64);

// The fake Worker: blobs by store, and a mode for the sends store.
const blobs = new Map();
const requests = [];
let mode = 'normal'; // 'normal' | 'old' (no sends store) | 'offline'
let beforeSendsPut = null; // runs once before the next sends PUT is answered
let version = 0;
const response = (status, body) => ({
  status, ok: status >= 200 && status < 300,
  json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});
async function fakeFetch(url, options = {}) {
  const method = options.method ?? 'GET';
  const store = String(url).split('/').pop();
  requests.push({ store, method });
  if (mode === 'offline') throw new Error('offline');
  if (mode === 'old' && store === 'sends') return response(404, 'unknown store');
  if (method === 'GET') {
    const rec = blobs.get(store);
    return rec ? response(200, rec) : response(404, 'not found');
  }
  const body = JSON.parse(options.body);
  if (store === 'sends' && beforeSendsPut) { const run = beforeSendsPut; beforeSendsPut = null; run(); }
  const current = blobs.get(store);
  if ((current?.version ?? null) !== body.ifVersion) return response(409, { error: 'conflict' });
  version += 1;
  blobs.set(store, { version: `v${version}`, blob: body.blob });
  return response(200, { version: `v${version}` });
}

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: { fetch: fakeFetch },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => Buffer.from(value),
      decryptString: () => key.toString('base64'),
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

const syncRecord = {
  enabled: true, handle: 'sends-test', accountId: ACCOUNT,
  protectedKey: Buffer.from('wrapped-key').toString('base64'), key: '',
  lastSyncedAt: 0, lastError: null, deviceId: OWN, syncTabs: false,
};
fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({ onboardingVersion: 1 }));
fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify(syncRecord));
fs.writeFileSync(path.join(tmp, 'tab-sync.json'), JSON.stringify({
  accountId: ACCOUNT,
  devices: {
    [NEO]: { name: 'MacBook Neo', platform: 'darwin', updatedAt: Date.now() - 60_000, tabs: [{ url: 'https://example.com/', title: 'E', pinned: false, groupId: null }], groups: [] },
  },
}));

const jsonStores = trackJsonStores();
const sync = require('../../src/main/sync');
const sends = require('../../src/main/sends');

const remoteSends = () => (blobs.has('sends') ? JSON.parse(decrypt(key, blobs.get('sends').blob)) : null);
const remoteSession = () => (blobs.has('session') ? JSON.parse(decrypt(key, blobs.get('session').blob)) : null);
function putRemoteSends(devices) {
  version += 1;
  blobs.set('sends', { version: `v${version}`, blob: encrypt(key, JSON.stringify({ devices })) });
}
const phoneEntry = (items = [], updatedAt = Date.now()) => ({ name: 'iPhone', platform: 'ios', updatedAt, items });
const sendsRequests = () => requests.filter((r) => r.store === 'sends');

test.after(async () => {
  mode = 'offline';
  await sync.disable().catch(() => {});
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('presence alone never creates the sends store', async () => {
  requests.length = 0;
  await sync.syncNow(['sends']);
  assert.deepEqual(sendsRequests().map((r) => r.method), ['GET']);
  assert.equal(blobs.has('sends'), false);
});

test('a device that does not share its tabs is still a target through presence', async () => {
  putRemoteSends({ [PHONE]: phoneEntry() });
  await sync.syncNow(['sends']);
  const ids = sync.listSendTargets().map((t) => t.id);
  assert.deepEqual(ids, [PHONE, NEO]);
  assert.equal(remoteSends().devices[OWN].name.length > 0, true, 'our presence was published once the store existed');
});

test('send puts at once and reports sent', async () => {
  requests.length = 0;
  const res = await sync.sendTab({ url: 'https://example.org/a', title: 'A', to: PHONE });
  assert.deepEqual(res, { status: 'sent' });
  assert.deepEqual(sendsRequests().map((r) => r.method), ['GET', 'PUT']);
  const own = remoteSends().devices[OWN];
  assert.equal(own.items.length, 1);
  assert.equal(own.items[0].to, PHONE);
  assert.equal(own.items[0].url, 'https://example.org/a');
});

test('send retries a 409 and keeps the other device entry', async () => {
  beforeSendsPut = () => putRemoteSends({ ...remoteSends().devices, [PHONE]: phoneEntry([{ id: 'p1', to: OWN, url: 'https://example.net/', title: 'From phone', sentAt: Date.now() }]) });
  const res = await sync.sendTab({ url: 'https://example.org/b', title: 'B', to: PHONE });
  assert.deepEqual(res, { status: 'sent' });
  const devices = remoteSends().devices;
  assert.deepEqual(devices[OWN].items.map((i) => i.title), ['B', 'A']);
  assert.equal(devices[PHONE].items[0].id, 'p1', 'the phone entry written meanwhile survives');
});

test('the inbox lists pages sent here, and a dismissed page stays hidden', async () => {
  await sync.syncNow(['sends']);
  const inbox = sync.listSentToThisDevice();
  assert.deepEqual(inbox.map((i) => [i.id, i.fromName]), [['p1', 'iPhone']]);
  assert.deepEqual(sync.hideSentItem('p1'), { id: 'p1', url: 'https://example.net/' });
  assert.equal(sync.hideSentItem('p1'), null);
  await sync.syncNow(['sends']);
  assert.deepEqual(sync.listSentToThisDevice(), [], 'a re-pull does not bring it back');
  await jsonStores.settle();
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'sends.json'), 'utf8'));
  assert.equal(Object.hasOwn(onDisk.dismissed, 'p1'), true, 'dismissed ids are saved');
});

test('send refuses a device that is not a target', async () => {
  assert.deepEqual(await sync.sendTab({ url: 'https://example.org/', title: '', to: OWN }), { status: 'invalid' });
  assert.deepEqual(await sync.sendTab({ url: 'https://example.org/', title: '', to: 'nobody' }), { status: 'invalid' });
  assert.deepEqual(await sync.sendTab({ url: 'file:///etc/hosts', title: '', to: PHONE }), { status: 'invalid' });
});

test('send reports unavailable on an older Worker and keeps nothing', async () => {
  mode = 'old';
  const before = sync.status();
  requests.length = 0;
  const res = await sync.sendTab({ url: 'https://example.org/c', title: 'C', to: PHONE });
  assert.deepEqual(res, { status: 'unavailable' });
  assert.deepEqual(sendsRequests().map((r) => r.method), ['GET'], 'no PUT is attempted after unknown store');
  const own = sends.exportForSync({ accountId: ACCOUNT, deviceId: OWN, deviceName: 'Mac', platform: 'darwin' }).devices[OWN];
  assert.equal(own.items.some((i) => i.title === 'C'), false);
  assert.deepEqual(sync.status().lastError, before.lastError);
  assert.equal(sync.status().lastSyncedAt, before.lastSyncedAt);
  mode = 'normal';
});

test('a pass on an older Worker leaves sync status alone', async () => {
  mode = 'old';
  const before = sync.status();
  await sync.syncNow(['sends']);
  assert.equal(sync.status().lastError, before.lastError);
  assert.equal(sync.status().lastSyncedAt, before.lastSyncedAt);
  mode = 'normal';
});

test('send reports failed offline and takes the item back', async () => {
  mode = 'offline';
  const res = await sync.sendTab({ url: 'https://example.org/d', title: 'D', to: PHONE });
  assert.deepEqual(res, { status: 'failed' });
  mode = 'normal';
  await sync.syncNow(['sends']);
  assert.equal(remoteSends().devices[OWN].items.some((i) => i.title === 'D'), false);
});

test('another account never sees this inbox or these dismissed ids', () => {
  const other = { accountId: 'f'.repeat(64), deviceId: OWN, deviceName: 'Mac', platform: 'darwin' };
  assert.deepEqual(sends.inbox(other), []);
  const back = { ...other, accountId: ACCOUNT };
  assert.deepEqual(sends.inbox(back), [], 'switching back starts clean too');
});

test('turning sync off publishes a retraction and clears the store', async () => {
  await sync.syncNow(['sends', 'session']);
  assert.ok(remoteSends().devices[OWN] && !remoteSends().devices[OWN].retracted);
  // Not sharing tabs, this device still announces itself in the open-tabs
  // store (presence alone), so Settings → Sync lists it on the others.
  const presence = remoteSession().devices[OWN];
  assert.ok(presence && !presence.retracted && presence.tabs.length === 0 && presence.name.length > 0);
  const res = await sync.disable();
  assert.equal(res.ok, true);
  assert.equal(remoteSends().devices[OWN].retracted, true);
  assert.equal(remoteSession().devices[OWN].retracted, true, 'leaving takes it off the other devices’ lists');
  assert.ok(remoteSends().devices[PHONE], 'other entries pass through untouched');
  assert.deepEqual(sync.listSendTargets(), []);
  assert.deepEqual(sync.listSentToThisDevice(), []);
  await jsonStores.settle();
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'sends.json'), 'utf8'));
  assert.deepEqual(onDisk, { accountId: '', devices: {}, dismissed: {} });
});
