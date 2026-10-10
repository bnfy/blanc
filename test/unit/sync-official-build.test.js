'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A renamed build (product name other than Blanc) must not store data on
// Bananify's sync server, but may still erase a copy it already put there.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-official-'));
let fetchCalls = [];
let encryptCalls = 0;

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
        fetchCalls.push({ url, method });
        if (method === 'DELETE') return { status: 204, ok: true };
        return method === 'GET' ? { status: 404, ok: false } : { status: 200, ok: true };
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => { encryptCalls += 1; return Buffer.from(value); },
      decryptString: () => Buffer.alloc(32, 7).toString('base64'),
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

// Simulate a build whose product name was changed from Blanc.
const servicesId = require.resolve('../../src/main/bananify-services');
const realServices = require(servicesId);
require.cache[servicesId].exports = {
  ...realServices,
  bananifyServiceAllowed: (url) => realServices.bananifyServiceAllowed(url, 'Foo Browser'),
};

fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'copied-profile',
  accountId: '7'.repeat(64),
  protectedKey: Buffer.from('wrapped-key').toString('base64'),
  key: '',
  lastSyncedAt: 0,
  lastError: null,
  deviceId: 'copied-device',
  syncTabs: false,
}));

const sync = require('../../src/main/sync');
const { englishT: t } = require('../support/english-t');
const { syncErrorText } = require('../../src/main/sync-messages');
sync.setTabStateReady(true);

const creds = { handle: 'renamed-build', passphrase: 'a passphrase long enough to pass' };

test.beforeEach(() => { fetchCalls = []; encryptCalls = 0; });

test('preflight explains sync is unavailable without contacting the server', async () => {
  const res = await sync.preflight(creds);
  assert.equal(res.ok, false);
  assert.equal(res.outcome, 'error');
  assert.match(syncErrorText(res.error, t), /official Blanc builds/);
  assert.deepEqual(fetchCalls, []);
});

test('a sync pass on an already-enabled profile makes no requests', async () => {
  const res = await sync.syncNow();
  assert.equal(res.ok, false);
  assert.match(syncErrorText(res.error, t), /official Blanc builds/);
  assert.deepEqual(fetchCalls, []);
});

test('enable refuses without protecting a key or contacting the server', async () => {
  const res = await sync.enable(creds);
  assert.equal(res.ok, false);
  assert.match(syncErrorText(res.error, t), /official Blanc builds/);
  assert.equal(encryptCalls, 0);
  assert.deepEqual(fetchCalls, []);
  assert.equal(sync.status().handle, 'copied-profile');
});

test('turning sync off can still erase the server copy', async () => {
  const res = await sync.disable({ wipeRemote: true });
  assert.equal(res.ok, true);
  assert.deepEqual(fetchCalls.map((call) => call.method), ['DELETE']);
  assert.equal(sync.status().enabled, false);
});
