'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-async-store-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: { app: { getPath: () => userData, on: () => {} } } };
delete require.cache[require.resolve('../../src/main/store')];
const store = require('../../src/main/store');
const { JsonStore } = store;
after(() => {
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron; else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

// Hold (or fail) FileHandle.sync() of the next async write. `syncEntered`
// resolves once that write has really reached sync(), so tests wait on the
// event instead of a guessed delay. Use it through `withHold`, which always
// restores the hook and releases the write, even when an assertion fails.
function controlNextSync() {
  const original = fs.promises.open;
  let release, fail, entered;
  const gate = new Promise((resolve, reject) => { release = resolve; fail = reject; });
  gate.catch(() => {}); // a failed gate that no write awaited is not an unhandled rejection
  const syncEntered = new Promise(resolve => { entered = resolve; });
  const closed = [];
  fs.promises.open = async (...args) => {
    fs.promises.open = original;
    const handle = await original(...args);
    const sync = handle.sync.bind(handle), close = handle.close.bind(handle);
    handle.sync = async () => { entered(); await gate; return sync(); };
    handle.close = async () => { closed.push(args[0]); return close(); };
    return handle;
  };
  return {
    syncEntered, closed,
    release: () => release(), fail: error => fail(error),
    done: () => { fs.promises.open = original; release(); },
  };
}
async function withHold(body) {
  const hold = controlNextSync();
  try { return await body(hold); } finally { hold.done(); }
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
const temps = file => fs.readdirSync(path.dirname(file)).filter(name => name.startsWith(path.basename(file) + '.') && name.endsWith('.tmp'));

test('a routine save does not block while its flush to disk is held', () => withHold(async hold => {
  const s = new JsonStore('routine', { n: 0 });
  s.update(d => { d.n = 1; });
  await hold.syncEntered; // the debounced write is now held in sync()
  assert.equal(fs.existsSync(s.file), false, 'nothing committed while held');
  hold.release(); await s.settled();
  assert.equal(read(s.file).n, 1);
  assert.deepEqual(temps(s.file), []);
}));

test('an older routine write never replaces a newer explicit flush', () => withHold(async hold => {
  const s = new JsonStore('ordering', { n: 0 });
  s.update(d => { d.n = 1; }); await hold.syncEntered;
  s.update(d => { d.n = 2; }); assert.equal(s.flush(), true);
  hold.release(); await s.settled();
  assert.equal(read(s.file).n, 2);
  assert.deepEqual(temps(s.file), [], 'the older temp file is removed');
}));

test('updates during a held write coalesce into one follow-up write', () => withHold(async hold => {
  const s = new JsonStore('coalesce', { n: 0 });
  s.update(d => { d.n = 1; }); await hold.syncEntered;
  const original = fs.renameSync; let renames = 0;
  fs.renameSync = (...args) => { renames++; return original(...args); };
  try {
    for (let i = 2; i <= 6; i++) { s.update(d => { d.n = i; }); await tick(60); }
    await tick(300); // the debounce fires while the first write is still held
    hold.release(); await s.settled(); // settled() also waits for the follow-up
    assert.equal(read(s.file).n, 6);
    assert.equal(renames, 2, 'the held write, then one follow-up');
  } finally { fs.renameSync = original; }
}));

test('a failed flush closes the handle first, keeps the entry dirty, and quit writes it', () => withHold(async hold => {
  const s = new JsonStore('failing', { n: 0 });
  s.update(d => { d.n = 1; }); await hold.syncEntered;
  hold.fail(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })); await s.settled();
  assert.equal(hold.closed.length, 1, 'handle closed');
  assert.deepEqual(temps(s.file), [], 'temp removed after close');
  assert.equal(fs.existsSync(s.file), false);
  s.flushPending(); // what before-quit runs
  assert.equal(read(s.file).n, 1);
}));

test('a value that cannot be serialized fails the routine save without throwing and stays dirty', async () => {
  const s = new JsonStore('unserializable', { n: 0 });
  s.update(d => { d.n = 1; d.bad = 1n; });
  await tick(300); // the debounced save runs; a throw would fail this test as uncaught
  assert.equal(fs.existsSync(s.file), false);
  delete s.data.bad; // no update(): only the still-dirty entry makes quit write it
  s.flushPending();
  assert.equal(read(s.file).n, 1);
});

test('quit writes the latest data while a routine write is in flight', () => withHold(async hold => {
  const s = new JsonStore('quitting', { n: 0 });
  s.update(d => { d.n = 1; }); await hold.syncEntered;
  s.update(d => { d.n = 2; });
  s.flushPending();
  assert.equal(read(s.file).n, 2);
  hold.release(); await s.settled();
  assert.equal(read(s.file).n, 2);
}));

test('a failed updateAndFlush during a held write never persists the rejected change', () => withHold(async hold => {
  const s = new JsonStore('rollback', { a: 0, b: 0 });
  s.update(d => { d.a = 1; }); await hold.syncEntered;
  const original = fs.fsyncSync;
  fs.fsyncSync = () => { throw Object.assign(new Error('EIO'), { code: 'EIO' }); };
  try { assert.equal(s.updateAndFlush(d => { d.b = 1; }), false); } finally { fs.fsyncSync = original; }
  assert.deepEqual({ ...s.data }, { a: 1, b: 0 });
  hold.release(); await s.settled();
  assert.deepEqual(read(s.file), { a: 1, b: 0 });
  s.flushPending();
  assert.deepEqual(read(s.file), { a: 1, b: 0 }, 'B never reaches disk');
}));

test('updateAndCommit resolves true on commit, including when a newer flush covers it', async () => {
  const s = new JsonStore('commit-ok', { n: 0 });
  assert.equal(await s.updateAndCommit(d => { d.n = 1; }), true);
  assert.equal(read(s.file).n, 1); assert.equal(s.dirty, false);
  await withHold(async hold => {
    const pending = s.updateAndCommit(d => { d.n = 2; });
    await hold.syncEntered;
    assert.equal(s.flush(), true);
    hold.release();
    assert.equal(await pending, true);
  });
});

test('updateAndCommit resolves false on failure and keeps the change dirty in memory', async () => {
  const s = new JsonStore('commit-fail', { n: 0 });
  await withHold(async hold => {
    const pending = s.updateAndCommit(d => { d.n = 1; });
    await hold.syncEntered; hold.fail(new Error('EIO'));
    assert.equal(await pending, false);
  });
  assert.equal(s.data.n, 1); assert.equal(s.dirty, true);
  assert.equal(await s.commitPending(), true);
  assert.equal(read(s.file).n, 1); assert.equal(s.dirty, false);
});

test('a serialization failure resolves updateAndCommit false and keeps the change dirty', async () => {
  const s = new JsonStore('unserializable-commit', { n: 0 });
  assert.equal(await s.updateAndCommit(d => { d.n = 1; d.bad = 1n; }), false);
  assert.equal(s.dirty, true);
  delete s.data.bad;
  assert.equal(await s.commitPending(), true);
  assert.equal(read(s.file).n, 1);
});

test('commitPending on a clean entry resolves true without writing', async () => {
  const s = new JsonStore('commit-clean', { n: 0 });
  assert.equal(await s.commitPending(), true);
  assert.equal(fs.existsSync(s.file), false);
});
