'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackJsonStores } = require('./support/track-json-stores');

// settleRequestsForTest() exists for the acceptance harness (F57-24/25, which
// time a peer's new Space arriving). Turning Spaces on schedules a full pass a
// second later, and that pass spends the 10-per-60 s window; resetting the
// window before it ran left a device that a focus change could then leave
// without the request for the fetch a change check asks for. Settling runs the
// pending pass now, frees the window until nothing waits or runs, and frees it
// once more. The Electron stub mirrors sync-reset-request-window.test.js.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-settle-requests-'));
const fetched = [];
const gets = [];
// Called on every request: a pass's own changes schedule the next pass.
let onFetch = () => {};

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: { fetch: async (url, init) => { fetched.push(String(url)); if (!init?.method || init.method === 'GET') gets.push(String(url)); onFetch(); return { status: 404, ok: false, headers: new Map(), text: async () => '' }; } },
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

const real = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

test.after(async () => {
  await clock.advance(120_000);
  await jsonStores.settle();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('settleRequestsForTest runs the pass the setup scheduled and leaves the window free', async () => {
  const enabled = await drive(sync.enable({ handle: 'settle-requests-test', passphrase: 'a passphrase long enough to pass' }));
  assert.equal(enabled.status?.enabled, true, JSON.stringify(enabled));
  // Turning Spaces on schedules a full pass a second ahead (schedule(1000)).
  assert.equal(sync.setSyncSpaces(true).error, undefined);

  const before = fetched.length;
  const settled = await sync.settleRequestsForTest();
  assert.equal(settled, true, 'the pass finished and nothing is left waiting');
  assert.ok(fetched.length > before, 'the scheduled pass ran inside the call, not a second later');
  const status = sync.sharedStatus();
  assert.equal(status.waiting, 0);
  assert.equal(status.running, 0);
  assert.ok(status.windowFreesAt <= Date.now(), 'the window is free');
  const stored = JSON.parse(fs.readFileSync(path.join(tmp, 'shared-spaces.json'), 'utf8'));
  assert.deepEqual(stored.requestLog, [], 'the persisted request log is empty');

  // The timer that pass came from must not run it a second time. schedule()
  // uses the real clock (only Date.now and the queue's timers are virtual), so
  // wait past its one second for real.
  const after = fetched.length;
  await real(1500);
  assert.equal(fetched.length, after, 'no second full pass follows');
});

test('settleRequestsForTest drops the pass that the first pass\'s own changes schedule', async () => {
  const sharedSpaces = require('../../src/main/shared-spaces');
  // The listeners that schedule a pass on a local change are registered by
  // init(), which also schedules the launch pass (two seconds out). A change
  // to the shared Spaces state schedules a pass too (four seconds out); make
  // the launch pass cause one, once, as a real pass does.
  sync.init();
  let changes = 0;
  onFetch = () => { if (changes++ === 0) sharedSpaces.setIndex({ v: 1, spaces: {} }, sync.sharedContext()); };
  const bookmarkGets = () => gets.filter((url) => /\/bookmarks$/.test(url)).length;
  try {
    const before = bookmarkGets();
    assert.equal(await sync.settleRequestsForTest(), true, 'nothing is left queued');
    assert.ok(changes > 0, 'the launch pass ran and changed the Spaces state');
    // Every full pass reads the bookmarks store once. Two passes in a row would
    // take the account past the Worker's 30 GETs a minute, so only one runs.
    assert.equal(bookmarkGets() - before, 1, 'one full pass ran inside the call');
  } finally {
    onFetch = () => {};
  }
  // The dropped pass was scheduled four seconds out on the real clock.
  const after = fetched.length;
  await real(4600);
  assert.equal(fetched.length, after, 'the pass the first one scheduled does not run later');
  // And nothing is left that a second settle would have to run.
  assert.equal(await sync.settleRequestsForTest(), true);
  assert.equal(fetched.length, after, 'a second settle finds nothing pending');
});

// Runs after the two tests above, which leave sync enabled with nothing pending.
test('settleRequestsForTest with nothing scheduled only frees the window', async () => {
  const before = fetched.length;
  assert.equal(await sync.settleRequestsForTest(), true);
  assert.equal(fetched.length, before);
});
