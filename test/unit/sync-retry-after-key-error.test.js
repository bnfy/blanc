'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Regression coverage for the whole-pass syncing guard. Credential failures
// happen before the network/store loop, so they must still release the guard.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-key-retry-'));
const matchingKey = Buffer.alloc(32, 7);
let decryptCalls = 0;
let fetchCalls = 0;

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (_url, options = {}) => {
        fetchCalls += 1;
        const method = options.method ?? 'GET';
        return method === 'GET'
          ? { status: 404, ok: false }
          : { status: 200, ok: true };
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => Buffer.from(value),
      decryptString: () => {
        decryptCalls += 1;
        if (decryptCalls === 1) throw new Error('transient credential-store failure');
        return matchingKey.toString('base64');
      },
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'retry-test',
  accountId: '7'.repeat(64),
  protectedKey: Buffer.from('wrapped-key').toString('base64'),
  key: '',
  lastSyncedAt: 0,
  lastError: null,
  deviceId: 'retry-device',
  syncTabs: false,
}));

const sync = require('../../src/main/sync');
sync.setTabStateReady(true);

test('credential failures release the sync guard so later passes can retry', async () => {
  const unlockFailure = await sync.syncNow(['icons']);
  assert.equal(unlockFailure.ok, false);
  assert.match(unlockFailure.message, /unlock|decrypt|credential/i);

  const recovered = await sync.syncNow(['icons']);
  assert.equal(recovered.ok, true);
  assert.ok(fetchCalls > 0, 'the recovered pass reaches the Worker instead of silently no-oping');
});
