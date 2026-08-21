const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-icons-'));
const requests = [];
const retryTimers = [];
let responseStatus = 404;
const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;
global.setTimeout = (fn, delay, ...args) => {
  if (delay === 65_000) {
    const timer = { fn, delay, cleared: false };
    retryTimers.push(timer);
    return timer;
  }
  return realSetTimeout(fn, delay, ...args);
};
global.clearTimeout = (timer) => {
  if (timer && retryTimers.includes(timer)) {
    timer.cleared = true;
    return;
  }
  return realClearTimeout(timer);
};
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (url, opts = {}) => {
        requests.push({ url: String(url), method: opts.method ?? 'GET' });
        return { status: responseStatus, ok: responseStatus >= 200 && responseStatus < 300 };
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'compat-test',
  accountId: 'a'.repeat(64),
  key: Buffer.alloc(32, 7).toString('base64'),
  lastSyncedAt: 1234,
  lastError: 'A required store failed earlier.',
  deviceId: 'compat-device',
  syncTabs: true,
}));

const sync = require('../../src/main/sync');

test.after(async () => {
  await sync.disable();
  global.setTimeout = realSetTimeout;
  global.clearTimeout = realClearTimeout;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a missing optional icon store is not created from an empty local sidecar', async () => {
  const result = await sync.syncNow(['icons']);
  assert.equal(result.ok, true);
  assert.deepEqual(requests.map(({ method }) => method), ['GET']);
  assert.equal(retryTimers.length, 1, 'one bounded propagation retry is scheduled');
  retryTimers[0].fn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests.map(({ method }) => method), ['GET', 'GET']);
  assert.equal(retryTimers.length, 1, 'a still-missing older Worker is not polled forever');
  assert.equal(sync.status().lastSyncedAt, 1234);
  assert.equal(sync.status().lastError, 'A required store failed earlier.');
  const migrated = JSON.parse(fs.readFileSync(path.join(tmp, 'sync.json'), 'utf8'));
  assert.equal(migrated.key, '', 'legacy plaintext key is erased after migration');
  assert.ok(migrated.protectedKey, 'OS-wrapped replacement is persisted');
});

test('an optional icon-store outage cannot overwrite the primary profile sync status', async () => {
  requests.length = 0;
  responseStatus = 500;
  const result = await sync.syncNow(['icons']);
  assert.equal(result.ok, true);
  assert.deepEqual(requests.map(({ method }) => method), ['GET']);
  assert.equal(sync.status().lastSyncedAt, 1234);
  assert.equal(sync.status().lastError, 'A required store failed earlier.');
});
