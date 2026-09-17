'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// preflight() must read one blob and write nothing: no sync.json, no key
// protection, no enabled state — so the join path can catch a mistyped
// passphrase before enable() would fork a silent empty account.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-preflight-'));
let nextResponse = { status: 404, ok: false };
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
        fetchCalls.push({ url, method: options.method ?? 'GET' });
        if (nextResponse instanceof Error) throw nextResponse;
        return nextResponse;
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

// Wrap the real key derivation so the test can hold the buffer preflight()
// is given and prove it is zero-filled on every outcome.
const cryptoId = require.resolve('../../src/main/sync-crypto');
const realCrypto = require(cryptoId);
let lastKey = null;
require.cache[cryptoId].exports = {
  ...realCrypto,
  deriveKeys: (handle, passphrase) => {
    const derived = realCrypto.deriveKeys(handle, passphrase);
    lastKey = derived.key;
    return derived;
  },
};

const sync = require('../../src/main/sync');
const creds = { handle: 'preflight-test', passphrase: 'a passphrase long enough to pass' };
const isZeroed = (buf) => Buffer.isBuffer(buf) && buf.length === 32 && buf.every((b) => b === 0);

test.beforeEach(() => { fetchCalls = []; encryptCalls = 0; });

test('found: a 200 on the settings blob', async () => {
  nextResponse = { status: 200, ok: true, json: async () => ({}) };
  assert.deepEqual(await sync.preflight(creds), { ok: true, outcome: 'found' });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].method, 'GET');
  assert.match(fetchCalls[0].url, /\/v1\/blob\/[0-9a-f]+\/settings$/);
});

test('notFound: a 404 on the settings blob', async () => {
  nextResponse = { status: 404, ok: false };
  assert.deepEqual(await sync.preflight(creds), { ok: true, outcome: 'notFound' });
});

test('rateLimited, error, and offline map to distinct outcomes with messages', async () => {
  nextResponse = { status: 429, ok: false };
  let res = await sync.preflight(creds);
  assert.equal(res.ok, false); assert.equal(res.outcome, 'rateLimited'); assert.ok(res.message);

  nextResponse = { status: 500, ok: false };
  res = await sync.preflight(creds);
  assert.equal(res.ok, false); assert.equal(res.outcome, 'error'); assert.ok(res.message);

  nextResponse = new Error('ENOTFOUND');
  res = await sync.preflight(creds);
  assert.equal(res.ok, false); assert.equal(res.outcome, 'offline'); assert.ok(res.message);
});

test('invalid inputs never reach the network', async () => {
  nextResponse = { status: 200, ok: true };
  let res = await sync.preflight({ handle: 'a', passphrase: creds.passphrase });
  assert.equal(res.outcome, 'invalid');
  res = await sync.preflight({ handle: 'fine', passphrase: 'short' });
  assert.equal(res.outcome, 'invalid');
  assert.equal(fetchCalls.length, 0);
});

test('preflight zero-fills the derived key on every outcome', async () => {
  for (const response of [
    { status: 200, ok: true, json: async () => ({}) },
    { status: 404, ok: false },
    { status: 429, ok: false },
    { status: 500, ok: false },
    new Error('offline'),
  ]) {
    nextResponse = response;
    lastKey = null;
    await sync.preflight(creds);
    assert.ok(lastKey, 'deriveKeys ran');
    assert.ok(isZeroed(lastKey), `key must be zeroed after ${response.status ?? 'thrown network error'}`);
  }
});

test('preflight writes nothing on any outcome', async () => {
  for (const response of [
    { status: 200, ok: true, json: async () => ({}) },
    { status: 404, ok: false },
    { status: 429, ok: false },
    new Error('offline'),
  ]) {
    nextResponse = response;
    await sync.preflight(creds);
  }
  assert.equal(sync.status().enabled, false);
  assert.equal(sync.status().handle, '');
  assert.equal(encryptCalls, 0, 'protectSyncKey must not run');
  // status() above may itself create the store file with defaults, so check
  // the contents rather than the file's absence: nothing enabled, no handle,
  // no protected key.
  const file = path.join(tmp, 'sync.json');
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.enabled, false);
    assert.equal(data.handle, '');
    assert.equal(data.protectedKey, '');
  }
});

test('the settings page can reach preflight only through the guarded channel', () => {
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../../src/main/tab-preload.js'), 'utf8');
  assert.match(pages, /handle\('pages:settings:sync-preflight', 'settings', \(payload\) => sync\.preflight\(payload \?\? \{\}\)\)/);
  assert.match(preload, /syncPreflight: \(payload\) => invoke\('pages:settings:sync-preflight', payload\)/);
});
