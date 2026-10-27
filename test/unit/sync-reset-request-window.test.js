'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');

// resetRequestWindowForTest() exists for the acceptance harness: a scenario
// whose own requests cross the 10-per-60 s window would otherwise wait out the
// rest of the window. It empties the persisted request log and frees the
// window, and nothing else. The Electron stub mirrors sync-preflight.test.js.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-reset-window-'));
let nextResponse = { status: 404, ok: false };

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: { fetch: async () => nextResponse },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => Buffer.from(value),
      decryptString: (buffer) => buffer.toString(),
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

const jsonStores = trackJsonStores();
const clock = require('./support/sync-device').virtualClock();
test.mock.method(Date, 'now', clock.now);
const scheduler = require('../../src/main/sync-scheduler');
const queue = require('../../src/main/sync-request-queue');
const createScheduler = scheduler.createScheduler;
const createRequestQueue = queue.createRequestQueue;
test.mock.method(scheduler, 'createScheduler', (options) => createScheduler({ ...options, now: clock.now, monotonic: clock.monotonic }));
test.mock.method(queue, 'createRequestQueue', (options) => createRequestQueue({ ...options, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer }));
const sync = require('../../src/main/sync');

/** Let a sync operation settle, advancing virtual time through its waits. */
async function drive(promise) {
  let done = false;
  const pending = promise.finally(() => { done = true; });
  for (let n = 0; n < 200 && !done; n++) {
    await new Promise((resolve) => setImmediate(resolve));
    const delay = clock.nextDelay();
    if (Number.isFinite(delay)) await clock.advance(delay);
  }
  assert.equal(done, true, 'the operation must settle');
  return pending;
}

const ticks = async (count = 20) => {
  for (let n = 0; n < count; n++) await new Promise((resolve) => setImmediate(resolve));
};

test.after(async () => {
  // The store tracker waits on wall time, which this test holds still.
  await clock.advance(120_000);
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('resetRequestWindowForTest empties the persisted request log and frees the window', async () => {
  nextResponse = { status: 404, ok: false };
  // The stub answers 404 to everything, so the first sync reports a rejection;
  // the account is enabled either way, which is all the window needs.
  const enabled = await drive(sync.enable({ handle: 'reset-window-test', passphrase: 'a passphrase long enough to pass' }));
  assert.equal(enabled.status?.enabled, true, JSON.stringify(enabled));

  // Exhaust the window without letting virtual time pass. Calls are spaced so
  // each is its own request (a call while one is queued joins it); the queue
  // then sleeps until the window frees, and the last calls wait on it.
  const waiting = [];
  for (let n = 0; n < 14; n++) {
    waiting.push(sync.syncNow(['bookmarks']).catch((error) => error));
    await ticks(10);
  }
  assert.ok(sync.sharedStatus().windowFreesAt > Date.now(), 'the window must be exhausted first');

  const resetAt = Date.now();
  await sync.resetRequestWindowForTest();

  // The request that was waiting runs the moment the window opens, so the
  // persisted log holds at most that one request, and nothing from before.
  const stored = JSON.parse(fs.readFileSync(path.join(tmp, 'shared-spaces.json'), 'utf8'));
  assert.ok(stored.requestLog.length <= 1, JSON.stringify(stored.requestLog));
  assert.ok(stored.requestLog.every((at) => at >= resetAt));
  assert.equal(stored.backoffUntil, null);
  assert.ok(sync.sharedStatus().windowFreesAt <= Date.now());
  // The request that was waiting on the window now runs, so every caller
  // settles without virtual time moving.
  await ticks();
  await Promise.all(waiting);
  assert.equal(sync.sharedStatus().waiting, 0);
});
