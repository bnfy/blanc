'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Regression coverage for the handoff between an in-flight pass and the one
// coalesced behind it. The follow-up must begin only after the outer guard is
// released, and the first caller must not resolve before that pass finishes.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-coalescing-'));
const key = Buffer.alloc(32, 11);
let releaseFirstGet;
let announceFirstGet;
const firstGetStarted = new Promise((resolve) => { announceFirstGet = resolve; });
const firstGetGate = new Promise((resolve) => { releaseFirstGet = resolve; });
let getCalls = 0;
let putCalls = 0;
let stored = null;

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (_url, options = {}) => {
        if ((options.method ?? 'GET') === 'GET') {
          getCalls += 1;
          if (getCalls === 1) {
            announceFirstGet();
            await firstGetGate;
          }
          if (!stored) return { status: 404, ok: false };
          return {
            status: 200,
            ok: true,
            json: async () => ({
              version: 'server-v1',
              blob: stored.blob,
            }),
          };
        }
        putCalls += 1;
        stored = JSON.parse(options.body);
        return { status: 200, ok: true };
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

fs.writeFileSync(path.join(tmp, 'sync.json'), JSON.stringify({
  enabled: true,
  handle: 'coalescing-test',
  accountId: 'b'.repeat(64),
  protectedKey: Buffer.from('wrapped-key').toString('base64'),
  key: '',
  lastSyncedAt: 0,
  lastError: null,
  deviceId: 'coalescing-device',
  syncTabs: false,
}));

const sync = require('../../src/main/sync');
sync.setTabStateReady(true);

test('an in-flight trigger runs one follow-up pass after releasing the guard', async () => {
  const first = sync.syncNow(['session']);
  await firstGetStarted;

  const coalesced = await sync.syncNow(['session']);
  assert.deepEqual(coalesced, { ok: true });
  assert.equal(getCalls, 1, 'the second trigger is coalesced while the pass is active');

  releaseFirstGet();
  assert.deepEqual(await first, { ok: true });
  assert.equal(getCalls, 2, 'the queued follow-up performs its own pull');
  assert.equal(putCalls, 1, 'the follow-up recognizes the first pass as current');
});
