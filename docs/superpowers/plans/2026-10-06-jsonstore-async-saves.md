# Async Routine JSON-Store Saves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Routine `JsonStore` saves and Named Workspace autosave write and flush to disk off Blanc's main thread, while explicit and quit-time saves stay synchronous with today's results.

**Architecture:** `src/main/store.js` gains per-entry change and write sequence counters, an asynchronous routine save (`fs.promises` + `FileHandle.sync()`, commit by a synchronous sequence-checked `renameSync`), `dirty` / `updateAndCommit()` / `commitPending()`, a profile-deletion tombstone with an awaitable discard, and a guarded stale-temp sweep. `src/main/workspaces.js` flushes unchanged-but-dirty data on synchronous checkpoints and runs its timer path as one epoch-guarded asynchronous drain per profile.

**Tech Stack:** Electron 44.5.1 main process (CommonJS), Node 22 `fs.promises`, `node:test` with a real temp `userData` and the Electron stub pattern.

**Spec:** `docs/superpowers/specs/2026-10-06-jsonstore-async-saves-design.md` (approved 2026-10-06, revision 4). Read it first.

## Global Constraints

- **Routine saves only become async:** the debounce/5 s-cap saves behind `update()`, and the Named Workspace timer path. `flush()`, `updateAndFlush()`, a directly called `saveCapture()`, the synchronous `flushPending()` (quit, test hook) and the store's quit `flushPending()` stay synchronous with today's return values.
- **Both write paths:** owner-only temp file (`0o600`), flushed to disk, atomic rename.
- **Temp names:** `<file>.<pid>.<writeSeq>.tmp`.
- **Commit rule:** a write commits only if `writeSeq > committedWriteSeq`, decided and renamed in one synchronous step on main.
- **Cleanup order:** every async write closes its `FileHandle` in a `finally` before removing its temp file, and its `inFlight` promise settles only after that.
- **Deleted profiles:** the profile is tombstoned for the launch; later access gets an inert entry (in-memory only; `flush()` / `updateAndFlush()` → `false`; `updateAndCommit()` / `commitPending()` → `false`). `discardProfileStoreEntries()` returns a promise that settles after in-flight writes settle.
- **Stale-temp sweep:**
  - only `<name>.json.<digits>.tmp` and `<name>.json.<digits>.<digits>.tmp` in the entry's own directory;
  - only after `enableTempSweep()` (called only when the single-instance lock is held, never in acceptance test mode);
  - skips this process's pid; best effort; never promotes a temp file.
- **Docs:** `CLAUDE.md` and `AGENTS.md` are mirrored verbatim.
- **Branch:** from `origin/main`. Run `/verify` and `/simplify` before each commit that changes non-test code. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gates before PR:** `npm run lint`, `npm run test:unit`, `npm run browser-api:check`, `npm run substrate:check`, `npm run test:acceptance:desktop`, `npm run test:ublock:desktop`, `npm run test:shield-provider:desktop`.
- **Merge:** only when every check run on the exact head SHA has completed success or skipped, including all four `desktop (...)` jobs, **and** the owner has confirmed the packaged candidate on the affected machines (the repository's affected-machine confirmation rule; hosted checks are not physical-machine confirmation). Never auto-merge.

---

### Task 1: Sequence counters, async routine save, quit flush

**Files:**
- Modify: `src/main/store.js` (entry creation in `#entry()` `:62`, `update()`, `#scheduleSave()`, `#flush()`, `flushPending()`)
- Test: `test/unit/json-store-async-saves.test.js` (new)

**Interfaces:**
- Produces:
  - entry fields `changeSeq`, `committedChangeSeq`, `writeSeq`, `committedWriteSeq`, `inFlight`, `rewrite`, `discarded`, `inert`, `waiters`;
  - private `#routine(entry)`;
  - `JsonStore.prototype.settled()` → `Promise<void>`, resolving when the active entry has no routine write in flight. Test-support only; documented as such.

- [ ] **Step 1: Write the test harness and failing tests**

```js
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/json-store-async-saves.test.js`
Expected: FAIL. `s.settled` is not a function, the saves are synchronous (so `syncEntered` never resolves and the held tests time out), and the BigInt test throws from the save timer.

- [ ] **Step 3: Implement in `src/main/store.js`**

Entry creation in `#entry()`:

```js
      entry = {
        file, data: this.#load(file), saveTimer: null, pendingSince: null,
        // Routine saves run off main; one shared write sequence decides which
        // write may replace the file (spec 2026-10-06-jsonstore-async-saves).
        changeSeq: 0, committedChangeSeq: 0, writeSeq: 0, committedWriteSeq: 0,
        inFlight: null, rewrite: false, discarded: false, inert: false, waiters: [],
      };
```

`update(fn)`:

```js
  update(fn) {
    const entry = this.#entry();
    fn(entry.data);
    if (entry.inert) return;
    entry.changeSeq++;
    this.#scheduleSave(entry);
  }
```

`#scheduleSave`: route both triggers to `#routine`:

```js
  #scheduleSave(entry) {
    entry.pendingSince ??= Date.now();
    if (Date.now() - entry.pendingSince >= MAX_SAVE_DELAY_MS) return this.#routine(entry);
    clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => this.#routine(entry), SAVE_DELAY_MS);
  }
```

New `#routine(entry)` and helpers:

```js
  #dirtyEntry(entry) { return entry.changeSeq > entry.committedChangeSeq; }

  #settleWaiters(entry, failedUpTo = -1) {
    entry.waiters = entry.waiters.filter(waiter => {
      if (entry.committedChangeSeq >= waiter.target) { waiter.resolve(true); return false; }
      if (entry.discarded || waiter.target <= failedUpTo) { waiter.resolve(false); return false; }
      return true;
    });
  }

  #routine(entry) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
    entry.pendingSince = null;
    if (entry.discarded) return; // inert entries are created discarded
    if (entry.inFlight) { entry.rewrite = true; return; }
    if (!this.#dirtyEntry(entry)) { this.#settleWaiters(entry); return; }
    const changeSeq = entry.changeSeq;
    let json;
    try {
      json = JSON.stringify(entry.data, null, 2);
    } catch (err) {
      // Nothing was written: stay dirty (quit or a later save retries), fail
      // the waiters this write covered, and never throw out of the timer.
      if (!this.quietErrors) console.warn(`[store] could not serialize ${entry.file}:`, err.message);
      this.#settleWaiters(entry, changeSeq);
      return;
    }
    const writeSeq = ++entry.writeSeq;
    const temp = `${entry.file}.${process.pid}.${writeSeq}.tmp`;
    let ok = false;
    const run = async () => {
      let handle = null;
      try {
        await fs.promises.mkdir(path.dirname(entry.file), { recursive: true });
        if (entry.discarded) return;
        handle = await fs.promises.open(temp, 'w', 0o600);
        await handle.writeFile(json, 'utf8');
        await handle.chmod(0o600);
        await handle.sync();
        await handle.close(); handle = null;
        // Commit in one synchronous step: nothing else runs on main between
        // this check and the rename, so an older write cannot land last.
        if (entry.discarded || writeSeq <= entry.committedWriteSeq) return;
        fs.renameSync(temp, entry.file);
        entry.committedWriteSeq = writeSeq;
        entry.committedChangeSeq = Math.max(entry.committedChangeSeq, changeSeq);
        ok = true;
      } catch (err) {
        if (!this.quietErrors) console.warn(`[store] could not write ${entry.file}:`, err.message);
      } finally {
        if (handle) { try { await handle.close(); } catch { /* best effort */ } }
        if (!ok) { try { await fs.promises.rm(temp, { force: true }); } catch { /* best effort */ } }
      }
    };
    entry.inFlight = run().then(() => {
      entry.inFlight = null;
      this.#settleWaiters(entry, ok ? -1 : changeSeq);
      if (entry.rewrite && !entry.discarded) {
        entry.rewrite = false;
        if (this.#dirtyEntry(entry)) this.#routine(entry);
      }
    });
  }

  /** Test support: resolves when the active entry has no routine write in flight. */
  async settled() {
    const entry = this.#entry();
    while (entry.inFlight) await entry.inFlight;
  }
```

`#flush(entry)` (synchronous): keep the existing body, but:
- if `entry.inert` return `false`;
- take `const writeSeq = ++entry.writeSeq;` and use `const tempFile = \`${entry.file}.${process.pid}.${writeSeq}.tmp\`;`;
- capture `const changeSeq = entry.changeSeq;` before writing;
- after `fs.renameSync(tempFile, entry.file)`, set `entry.committedWriteSeq = writeSeq; entry.committedChangeSeq = Math.max(entry.committedChangeSeq, changeSeq); this.#settleWaiters(entry);` before `return true`.

`updateAndFlush(fn)`: inert → `return false` without applying. Otherwise also save and restore `changeSeq`:

```js
  updateAndFlush(fn) {
    const entry = this.#entry();
    if (entry.inert) return false;
    const previous = structuredClone(entry.data);
    const previousChangeSeq = entry.changeSeq;
    const pendingSince = entry.pendingSince;
    const hadPendingSave = !!entry.saveTimer;
    fn(entry.data);
    entry.changeSeq++;
    if (this.#flush(entry)) return true;
    entry.data = previous;
    entry.changeSeq = previousChangeSeq;
    if (hadPendingSave) { entry.pendingSince = pendingSince; this.#scheduleSave(entry); }
    return false;
  }
```

`flushPending()`: write every dirty entry, not only those with a timer:

```js
  flushPending() {
    for (const entry of this.entries.values()) {
      // A save timer is only armed after a change, so dirty covers it.
      if (this.#dirtyEntry(entry)) this.#flush(entry);
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/json-store-async-saves.test.js test/unit/json-store-profile-scope.test.js test/unit/workspaces-store.test.js test/unit/session-restore.test.js`
Expected: the new tests pass. `json-store-profile-scope` still passes, since its discard assertions change only in Task 3. Then `npm run test:unit`, `npm run lint`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/store.js test/unit/json-store-async-saves.test.js
git commit -m "Write routine JSON-store saves off the main thread with a sequence-checked commit"
```

---

### Task 2: `dirty`, `updateAndCommit()`, `commitPending()`

**Files:** Modify `src/main/store.js`; extend `test/unit/json-store-async-saves.test.js`.

**Interfaces:** Produces `get dirty()` → boolean; `updateAndCommit(fn)` → `Promise<boolean>`; `commitPending()` → `Promise<boolean>`.

- [ ] **Step 1: Failing tests** (append)

```js
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
```

- [ ] **Step 2: Run to verify failure** — Run: `node --test test/unit/json-store-async-saves.test.js`. Expected: FAIL, `updateAndCommit is not a function`.

- [ ] **Step 3: Implement**

```js
  /** Whether the active entry has changes not yet committed to disk. */
  get dirty() { return this.#dirtyEntry(this.#entry()); }

  #waitFor(entry, target) {
    return new Promise(resolve => { entry.waiters.push({ target, resolve }); this.#routine(entry); });
  }

  /** Apply a change and write it now, off the main thread (no rollback). */
  updateAndCommit(fn) {
    const entry = this.#entry();
    if (entry.inert) return Promise.resolve(false);
    fn(entry.data);
    entry.changeSeq++;
    return this.#waitFor(entry, entry.changeSeq);
  }

  /** Write already-applied changes now, off the main thread. */
  commitPending() {
    const entry = this.#entry();
    if (entry.inert) return Promise.resolve(false);
    if (!this.#dirtyEntry(entry)) return Promise.resolve(true);
    return this.#waitFor(entry, entry.changeSeq);
  }
```

- [ ] **Step 4: Run tests** — `node --test test/unit/json-store-async-saves.test.js`, `npm run test:unit`, `npm run lint`. Expected: pass.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/store.js test/unit/json-store-async-saves.test.js
git commit -m "Add dirty, updateAndCommit and commitPending to JsonStore"
```

---

### Task 3: Profile deletion tombstone and awaitable discard

**Files:**
- Modify: `src/main/store.js` (`#entry()`, `discardProfileStoreEntries()`)
- Modify: `src/main/main.js:8651` (await the discard)
- Test: extend `test/unit/json-store-async-saves.test.js`; update `test/unit/json-store-profile-scope.test.js:72,76`

**Interfaces:** `discardProfileStoreEntries(profileId)` → `Promise<boolean>`.

- [ ] **Step 1: Failing tests**

Append to `json-store-async-saves.test.js`:

```js
const { withLocalProfile } = require('../../src/main/local-profile-context');
test('profile deletion waits for in-flight writes, repeated discards wait too, and nothing recreates the folder', async () => {
  const id = 'profile_doomed';
  const dir = path.join(userData, 'profiles', id);
  const file = path.join(dir, 'doomed.json');
  const s = new JsonStore('doomed', { n: 0 }, { scope: 'profile' });
  await withLocalProfile(id, async () => { s.update(d => { d.n = 1; }); assert.equal(s.flush(), true); });
  await withHold(async hold => {
    await withLocalProfile(id, async () => { s.update(d => { d.n = 2; }); await hold.syncEntered; });
    let first = false, second = false;
    const discarding = store.discardProfileStoreEntries(id).then(value => { first = true; return value; });
    // Deletion recovery can run the discard again; it must wait for the same write.
    const again = store.discardProfileStoreEntries(id).then(value => { second = true; return value; });
    await withLocalProfile(id, async () => {
      s.update(d => { d.n = 3; });
      assert.equal(s.flush(), false, 'during the drain: inert');
      assert.equal(await s.updateAndCommit(d => { d.n = 4; }), false);
    });
    await tick(20); // a real wait, not microtasks: the held write cannot finish meanwhile
    assert.equal(first, false, 'waits for the held write');
    assert.equal(second, false, 'a repeated discard waits for the held write too');
    hold.release();
    assert.equal(await discarding, true);
    assert.equal(await again, true);
    assert.equal(hold.closed.length, 1, 'the held write closed its file before the discard settled');
    assert.deepEqual(temps(file), [], 'and removed its temp file');
    assert.equal(read(file).n, 1, 'the discarded write never committed');
  });
  fs.rmSync(dir, { recursive: true, force: true }); // the deletion flow removes the folder only after awaiting
  await withLocalProfile(id, async () => {
    s.update(d => { d.n = 5; }); assert.equal(s.flush(), false, 'after the drain: inert');
    await tick(300);
  });
  assert.equal(fs.existsSync(dir), false, 'the folder is never recreated');
});
```

In `json-store-profile-scope.test.js`, make that test `async` and change:

```js
  assert.equal(await discardProfileStoreEntries('profile_temp'), true);
  ...
  assert.equal(await discardProfileStoreEntries('default'), false);
```

- [ ] **Step 2: Run to verify failure** — Run: `node --test test/unit/json-store-async-saves.test.js test/unit/json-store-profile-scope.test.js`. Expected: FAIL (flush returns `true` during the drain; discard returns a boolean, not a promise, so neither call waits for the held write).

- [ ] **Step 3: Implement**

Module level:

```js
const tombstoned = new Set();
// profileId → the promise for that profile's in-flight writes, so a repeated
// or overlapping discard waits for the same writes instead of finding no
// entries and returning at once.
const profileDrains = new Map();
```

At the top of `#entry()`, after computing `profileId`:

```js
    if (this.scope === 'profile' && tombstoned.has(profileId)) {
      let inert = this.entries.get(profileId);
      if (!inert?.inert) {
        // A deleted profile: in-memory only, never loaded or written.
        inert = { file: this.#fileFor(profileId), data: structuredClone(this.defaults), saveTimer: null, pendingSince: null,
          changeSeq: 0, committedChangeSeq: 0, writeSeq: 0, committedWriteSeq: 0,
          inFlight: null, rewrite: false, discarded: true, inert: true, waiters: [] };
        this.entries.set(profileId, inert);
      }
      return inert;
    }
```

Replace `discardProfileStoreEntries`:

```js
async function discardProfileStoreEntries(profileId) {
  if (!validProfileId(profileId) || profileId === DEFAULT_PROFILE_ID) return false;
  tombstoned.add(profileId);
  const flights = profileDrains.has(profileId) ? [profileDrains.get(profileId)] : [];
  for (const store of instances) {
    if (store.scope !== 'profile') continue;
    const entry = store.entries.get(profileId);
    if (!entry || entry.inert) continue;
    entry.discarded = true;
    clearTimeout(entry.saveTimer); entry.saveTimer = null;
    for (const waiter of entry.waiters) waiter.resolve(false);
    entry.waiters = [];
    if (entry.inFlight) flights.push(entry.inFlight);
    store.entries.delete(profileId);
  }
  const drain = Promise.allSettled(flights).then(() => {
    if (profileDrains.get(profileId) === drain) profileDrains.delete(profileId);
  });
  profileDrains.set(profileId, drain);
  await drain;
  return true;
}
```

`src/main/main.js` deletion block (`:8648–8652`):

```js
  try {
    discardProfileDownloads(profileId);
    namedWorkspaces.disposeProfile(profileId);
    // Wait for in-flight routine saves to close their files first: an open
    // temp file would make the recursive delete fail on Windows.
    await discardProfileStoreEntries(profileId);
    fs.rmSync(namedProfileDataDirectory(profileId), { recursive: true, force: true });
  } catch (error) {
```

- [ ] **Step 4: Run tests** — the two files above, then `npm run test:unit`, `npm run lint`, `npm run browser-api:check`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/store.js src/main/main.js test/unit/json-store-async-saves.test.js test/unit/json-store-profile-scope.test.js
git commit -m "Tombstone deleted profiles' stores and await their in-flight saves"
```

---

### Task 4: Stale temp sweep

**Files:**
- Modify: `src/main/store.js` (`#load()`, new `enableTempSweep()` export)
- Modify: `src/main/main.js:1354-1357` (enable after the lock is held)
- Test: extend `test/unit/json-store-async-saves.test.js`

**Interfaces:** `enableTempSweep()` → void.

- [ ] **Step 1: Failing test**

```js
test('the first load sweeps only this store\'s exact orphan temps and never promotes one', () => {
  store.enableTempSweep();
  const file = path.join(userData, 'sweep.json');
  const keep = ['other.json.123.tmp', 'sweep.json.bak', `sweep.json.${process.pid}.9.tmp`, 'sweep.json.12a.tmp', 'sweep.json.12.tmp.keep'];
  const remove = ['sweep.json.123.tmp', 'sweep.json.123.45.tmp'];
  for (const name of [...keep, ...remove]) fs.writeFileSync(path.join(userData, name), JSON.stringify({ n: 99 }));
  const s = new JsonStore('sweep', { n: 0 });
  assert.equal(s.data.n, 0, 'an orphan is never promoted, even with no committed file');
  for (const name of remove) assert.equal(fs.existsSync(path.join(userData, name)), false, name);
  for (const name of keep) assert.equal(fs.existsSync(path.join(userData, name)), true, name);
  assert.equal(fs.existsSync(file), false);
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL, `enableTempSweep is not a function`.

- [ ] **Step 3: Implement**

```js
let tempSweepEnabled = false;
/** Called once Blanc holds the single-instance lock (never in acceptance mode). */
function enableTempSweep() { tempSweepEnabled = true; }
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

At the start of `#load(file)`:

```js
    if (tempSweepEnabled) {
      // Best effort: only this store's exact orphan temps; never this process's.
      try {
        const base = path.basename(file);
        const pattern = new RegExp(`^${escapeRegExp(base)}\\.(\\d+)(?:\\.\\d+)?\\.tmp$`);
        for (const name of fs.readdirSync(path.dirname(file))) {
          const match = pattern.exec(name);
          if (!match || Number(match[1]) === process.pid) continue;
          try { fs.unlinkSync(path.join(path.dirname(file), name)); } catch { /* best effort */ }
        }
      } catch { /* the directory may not exist yet */ }
    }
```

Export `enableTempSweep`. In `main.js`, inside the `else` branch that follows the single-instance lock check (before `diagnostics.start()`):

```js
  // Blanc holds the user-data lock now, so no other instance owns orphan temps.
  if (!acceptanceTestMode) enableTempSweep();
```

(and import `enableTempSweep` alongside `JsonStore` at `main.js:169`).

- [ ] **Step 4: Run tests** — `node --test test/unit/json-store-async-saves.test.js`, `npm run test:unit`, `npm run lint`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/store.js src/main/main.js test/unit/json-store-async-saves.test.js
git commit -m "Sweep this store's orphan temp files on first load once Blanc holds the lock"
```

---

### Task 5: Named Workspace autosave

**Files:**
- Modify: `src/main/workspaces.js` (`state()`, `write()` `:66`, `scheduleRetry()` `:95`, new `drain()`, `disposeProfile()` `:140`)
- Test: extend `test/unit/workspaces-store.test.js`

**Interfaces:**
- Consumes: Task 2 `store.dirty`, `store.updateAndCommit()`, `store.commitPending()`.
- Produces: repository method `drained()` → `Promise<void>` (test support) — resolves when the active profile has no drain running.

- [ ] **Step 1: Failing tests** (append to `workspaces-store.test.js`; copy `controlNextSync()` and `withHold()` from Task 1, and add `tick` and `until`)

```js
const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the condition');
    await tick(10);
  }
}
const urlsOnDisk = (file, id) => JSON.parse(fs.readFileSync(file, 'utf8')).workspaces.find((w) => w.id === id).urls;

test('a synchronous checkpoint of an unchanged but unsaved capture flushes it', async () => {
  await withLocalProfile('profile_dirty_sync', async () => {
    const { workspace } = workspaces.create({ name: 'D', capture: CAPTURE() });
    const file = path.join(userData, 'profiles', 'profile_dirty_sync', 'workspaces.json');
    await withHold(async hold => {
      workspaces.queueCapture(workspace.id, CAPTURE(['https://new.test/']));
      await hold.syncEntered; // the drain applied the capture; its write is held
      const result = workspaces.saveCapture(workspace.id, CAPTURE(['https://new.test/']));
      assert.equal(result.ok, true); assert.equal(workspaces.status(), 'saved');
      assert.deepEqual(urlsOnDisk(file, workspace.id), ['https://new.test/']);
      hold.release(); await workspaces.drained();
    });
  });
});

test('if that synchronous flush fails, the checkpoint reports storage-failed and the retry persists it', async () => {
  await withLocalProfile('profile_dirty_fail', async () => {
    const { workspace } = workspaces.create({ name: 'F', capture: CAPTURE() });
    const file = path.join(userData, 'profiles', 'profile_dirty_fail', 'workspaces.json');
    await withHold(async hold => {
      workspaces.queueCapture(workspace.id, CAPTURE(['https://new.test/']));
      await hold.syncEntered;
      hold.fail(new Error('EIO'));
      await until(() => workspaces.status() === 'storage-failed'); // the drain failed and armed a retry
      const original = fs.fsyncSync; fs.fsyncSync = () => { throw Object.assign(new Error('EIO'), { code: 'EIO' }); };
      try { assert.equal(workspaces.saveCapture(workspace.id, CAPTURE(['https://new.test/'])).error, 'storage-failed'); }
      finally { fs.fsyncSync = original; }
      assert.equal(workspaces.status(), 'storage-failed');
    });
    await until(() => workspaces.status() === 'saved'); // the retry commits unchanged-but-dirty data
    assert.deepEqual(urlsOnDisk(file, workspace.id), ['https://new.test/']);
  });
});

test('a superseded drain cannot overwrite a newer checkpoint or arm a retry', async () => {
  await withLocalProfile('profile_obsolete', async () => {
    const { workspace } = workspaces.create({ name: 'O', capture: CAPTURE() });
    const file = path.join(userData, 'profiles', 'profile_obsolete', 'workspaces.json');
    await withHold(async hold => {
      workspaces.queueCapture(workspace.id, CAPTURE(['https://older.test/']));
      await hold.syncEntered;
      assert.equal(workspaces.saveCapture(workspace.id, CAPTURE(['https://latest.test/'])).ok, true);
      hold.fail(new Error('EIO')); await workspaces.drained();
    });
    assert.deepEqual(urlsOnDisk(file, workspace.id), ['https://latest.test/']);
    assert.equal(workspaces.status(), 'saved');
    assert.equal(workspaces.timerArmed(), false);
  });
});

test('a checkpoint of one workspace never strands another workspace\'s queued capture', async () => {
  await withLocalProfile('profile_strand', async () => {
    const a = workspaces.create({ name: 'A', capture: CAPTURE() }).workspace;
    const b = workspaces.create({ name: 'B', capture: CAPTURE() }).workspace;
    const file = path.join(userData, 'profiles', 'profile_strand', 'workspaces.json');
    await withHold(async hold => {
      workspaces.queueCapture(a.id, CAPTURE(['https://a-new.test/']));
      workspaces.queueCapture(b.id, CAPTURE(['https://b-new.test/']));
      await hold.syncEntered; // the drain is writing A; B is still queued
      assert.equal(workspaces.saveCapture(a.id, CAPTURE(['https://a-new.test/'])).ok, true); // supersedes the drain
      hold.release();
    });
    await until(() => urlsOnDisk(file, b.id)[0] === 'https://b-new.test/'); // a fresh pass writes B
    await workspaces.drained();
    assert.equal(workspaces.status(), 'saved');
    assert.equal(workspaces.timerArmed(), false);
  });
});

test('an empty drain pass leaves autosave working', async () => {
  await withLocalProfile('profile_empty_pass', async () => {
    const { workspace } = workspaces.create({ name: 'E', capture: CAPTURE() });
    const file = path.join(userData, 'profiles', 'profile_empty_pass', 'workspaces.json');
    workspaces.queueCapture(workspace.id, CAPTURE(['https://one.test/']));
    // A checkpoint empties the queue, but the timer stays armed: its pass finds nothing.
    assert.equal(workspaces.saveCapture(workspace.id, CAPTURE(['https://one.test/'])).ok, true);
    await until(() => !workspaces.timerArmed()); await workspaces.drained();
    workspaces.queueCapture(workspace.id, CAPTURE(['https://two.test/']));
    await until(() => urlsOnDisk(file, workspace.id)[0] === 'https://two.test/');
    await workspaces.drained();
    assert.equal(workspaces.status(), 'saved');
  });
});

test('disposing a profile during a drain schedules no timer and sends no status', async () => {
  await withLocalProfile('profile_disposed', async () => {
    const { workspace } = workspaces.create({ name: 'X', capture: CAPTURE() });
    await withHold(async hold => {
      workspaces.queueCapture(workspace.id, CAPTURE(['https://x.test/']));
      await hold.syncEntered;
      const running = workspaces.drained();
      // Observe the real effects, not timerArmed(): disposal removes the state
      // from the map, so that would read false whatever the drain did.
      const scheduled = []; let notices = 0;
      const realSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...rest) => { scheduled.push(ms); return realSetTimeout(fn, ms, ...rest); };
      workspaces.setStatusObserver(() => { notices++; });
      try {
        workspaces.disposeProfile('profile_disposed');
        hold.fail(new Error('EIO')); await running;
      } finally {
        globalThis.setTimeout = realSetTimeout;
        workspaces.setStatusObserver(null);
      }
      assert.deepEqual(scheduled, [], 'no retry timer was scheduled');
      assert.equal(notices, 0, 'no status notification was sent');
    });
  });
});

test('one drain per profile, and a capture queued during it is written by that drain', async () => {
  await withLocalProfile('profile_follow', async () => {
    const { workspace } = workspaces.create({ name: 'Q', capture: CAPTURE() });
    const file = path.join(userData, 'profiles', 'profile_follow', 'workspaces.json');
    const original = fs.promises.open; let opens = 0, maxOpen = 0, open = 0;
    await withHold(async hold => {
      workspaces.queueCapture(workspace.id, CAPTURE(['https://one.test/']));
      await hold.syncEntered;
      const held = fs.promises.open; // the hold's one-shot hook was already consumed
      fs.promises.open = async (...args) => { opens++; maxOpen = Math.max(maxOpen, ++open); try { return await held(...args); } finally { open--; } };
      try {
        workspaces.queueCapture(workspace.id, CAPTURE(['https://two.test/']));
        await until(() => !workspaces.timerArmed()); // its timer fired while the first drain is held
        assert.equal(opens, 0, 'the timer started no second drain');
        hold.release(); await workspaces.drained();
      } finally { fs.promises.open = original; }
    });
    assert.deepEqual(urlsOnDisk(file, workspace.id), ['https://two.test/']);
    assert.equal(opens, 1, 'the running drain wrote the newer capture once');
    assert.equal(maxOpen, 1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `node --test test/unit/workspaces-store.test.js`. Expected: the new tests FAIL. The checkpoint reports `saved` while the disk is old, and `drained` / `timerArmed` are not functions. After Step 3, check the positive controls once by hand: dropping the re-arm in `settle` makes the stranding test time out, and assigning `s.draining` after starting the pass (the earlier draft) makes the empty-pass test time out.

- [ ] **Step 3: Implement in `src/main/workspaces.js`**

`state()`: `const current = { status: 'saved', pending: new Map(), timer: null, attempts: 0, epoch: 0, draining: null, disposed: false };`

`write(result)`: replace the persistence line:

```js
    // "Unchanged in memory" is not "saved": the async drain may have applied
    // this capture without it reaching disk yet.
    const persisted = result.unchanged
      ? (!store.dirty || store.flush())
      : store.updateAndFlush((data) => Object.assign(data, result.file));
    s.epoch++; // any synchronous attempt supersedes an in-flight drain
    if (!persisted) {
      s.status = 'storage-failed'; onStatus();
      return { ok: false, error: 'storage-failed' };
    }
```

`scheduleRetry(s)`: refuse disposed profiles and run the drain:

```js
  function scheduleRetry(s) {
    if (s.timer || s.disposed || unavailable(s)) return;
    const profileId = activeLocalProfileId();
    const delay = Math.min(30000, 250 * 2 ** Math.min(s.attempts++, 7));
    s.timer = setTimeout(() => withLocalProfile(profileId, () => { drain(s); }), delay);
    s.timer.unref?.();
  }
```

New `drain(s)` and `drainPass(s)`:

```js
  // The timer path: one asynchronous drain per profile. The promise is
  // installed before the pass starts, so even a pass that never awaits clears
  // it afterwards instead of leaving a settled promise that blocks every later
  // drain. A timer that fires during a drain starts nothing: the running pass
  // rereads `pending` until it is empty.
  function drain(s) {
    s.timer = null;
    if (s.disposed || unavailable(s)) return Promise.resolve();
    if (s.draining) return s.draining;
    let finish;
    const current = new Promise((resolve) => { finish = resolve; });
    s.draining = current;
    const settle = () => {
      if (s.draining === current) s.draining = null;
      // A superseded or failed pass can leave captures queued with no timer
      // (a checkpoint of one workspace while another waits): arm a fresh pass,
      // which runs under the new epoch. scheduleRetry refuses disposed and
      // unavailable profiles and an already armed timer.
      if (s.pending.size) scheduleRetry(s);
      finish();
    };
    drainPass(s).then(settle, (error) => {
      console.warn('[workspaces] autosave failed:', error?.message);
      settle();
    });
    return current;
  }

  // A completion acts only while it still owns the state: the same epoch, and
  // the profile not disposed. An obsolete pass changes no status.
  async function drainPass(s) {
    const epoch = s.epoch;
    const owns = () => !s.disposed && s.epoch === epoch;
    while (owns() && s.pending.size) {
      const [id, capture] = s.pending.entries().next().value;
      const result = model.updateCapture(store.data, id, capture, clock());
      if (!result.workspace) { s.pending.delete(id); continue; }
      const ok = result.unchanged
        ? await store.commitPending()
        : await store.updateAndCommit((data) => Object.assign(data, result.file));
      if (!owns()) return;
      if (!ok) { s.status = 'storage-failed'; onStatus(); return; } // settle arms the backoff retry
      if (s.pending.get(id) === capture) s.pending.delete(id);
    }
    if (owns()) { s.status = 'saved'; s.attempts = 0; onStatus(); }
  }
```

`disposeProfile(profileId)`:

```js
    disposeProfile(profileId) {
      const s = profiles.get(profileId);
      if (s) { s.disposed = true; s.epoch++; clearTimeout(s.timer); s.timer = null; }
      profiles.delete(profileId);
    },
```

Test-support methods on the repository object:

```js
    /** Test support: resolves when the active profile has no drain running. */
    drained() { return state().draining ?? Promise.resolve(); },
    /** Test support: whether a retry timer is armed for a profile. */
    timerArmed(profileId = activeLocalProfileId()) { return !!profiles.get(profileId)?.timer; },
```

Disposed states are removed from the map, which is why the disposal test observes `setTimeout` and the status observer instead of `timerArmed()`. The drain holds the disposed object, so it sees `disposed`.

- [ ] **Step 4: Run tests** — `node --test test/unit/workspaces-store.test.js test/unit/json-store-async-saves.test.js`; existing workspace tests must still pass, including the two at `:172` and `:192`, which use the synchronous `flushPending()`. Then `npm run test:unit`, `npm run lint`, `npm run browser-api:check`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/workspaces.js test/unit/workspaces-store.test.js
git commit -m "Run Named Workspace autosave as one epoch-guarded async drain per profile"
```

---

### Task 6: Measurements, docs and PR

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md` ("Persistence" paragraph)
- Modify: `docs/superpowers/specs/2026-10-06-jsonstore-async-saves-design.md` (status)
- Diagnostics (not merged): `claude/diag-ubo-decision-timeout`, rebased onto this branch

- [ ] **Step 1: Desktop suites locally**

Run `npm run test:acceptance:desktop`, `npm run test:ublock:desktop`, `npm run test:shield-provider:desktop`. Expected: pass. If popup steps flake, compare against untouched `main` before blaming this change.

- [ ] **Step 2: Docs**

In both `CLAUDE.md` and `AGENTS.md`, in the "Persistence" paragraph, replace `JSON in \`userData\`, loaded synchronously once and normally saved on a 250ms debounce. Writes use an owner-only temporary file, fsync, and atomic replacement;` with:

```text
JSON in `userData`, loaded synchronously once and normally saved on a 250ms debounce. Routine debounced saves and Named Workspace autosave write and flush off the main thread (`fs.promises`, a per-file sequence check before the atomic rename); explicit `flush()`/`updateAndFlush()` and quit-time saves stay synchronous. Both paths use an owner-only temporary file, flush to disk, and atomic replacement;
```

Check the two files still match in that paragraph: `diff <(grep -o 'Routine debounced saves[^;]*;' CLAUDE.md) <(grep -o 'Routine debounced saves[^;]*;' AGENTS.md)`.

- [ ] **Step 3: Commit, push, open PR**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "Record async routine saves in the persistence notes"
git push -u origin <branch>
```

Open the PR, then set the spec status to `approved 2026-10-06 (revision 4) — implemented in <PR link>`, commit and push.

- [ ] **Step 4: Measurements before merge**

Rebase `claude/diag-ubo-decision-timeout` onto this branch and run its stall-triggered profiling with an active Named Workspace in the scenario, on Windows and the other three platforms. Also add a temporary timing log around `JSON.stringify`, `renameSync`, and the queued + in-flight duration of routine saves.

Record in the PR:
- main-process stalls before and after;
- that `#flush`/`fsyncSync` no longer appear in routine-save stalls;
- the measured stringify/rename costs;
- the measured added crash window.

Explain any remaining stall.

- [ ] **Step 5: Affected-machine confirmation**

Build private packaged candidates from the PR branch: `npm run dist:dir` on this Mac, and a signed Windows installer with `gh workflow run release-windows-linux.yml --ref <branch> -f mode=validation -f platform=windows` (a three-day Actions artifact). Ask the owner to confirm, on this Mac and on the Windows VM's normal install, with their real profile:
- settings, Favorites and history changes survive a quit and relaunch;
- a Named Workspace's tab changes are autosaved and survive a quit and relaunch;
- deleting a named profile removes its folder;
- no new freezes while browsing.

Record the confirmation, or a written waiver with the missing evidence and risk, in the PR. This candidate does not touch the updater, so a direct install is enough here; it is not evidence for an updater handoff.

- [ ] **Step 6: Merge** only when every check run on the exact head SHA passed or was skipped, including all four `desktop (...)` jobs, **and** Step 5's owner confirmation is recorded. Re-check `autoMergeRequest` after any `update-branch`.

---

## Self-review notes

- **Spec coverage:**
  - entry state, routine save, `dirty`/`commitPending`, explicit saves, `updateAndFlush` failure and quit → Tasks 1–2;
  - deletion guard → Task 3;
  - stale temp files → Task 4;
  - Named Workspace autosave (unchanged-but-dirty, ownership, one drain, epoch, disposal, no stranded captures) → Task 5;
  - measurements, docs and affected-machine confirmation → Task 6;
  - invariants 1–11 → tests in Tasks 1–5.
- **Names used across tasks:** `#routine`, `#dirtyEntry`, `#settleWaiters`, `#waitFor`, `settled()`, `dirty`, `updateAndCommit`, `commitPending`, `discardProfileStoreEntries` (async), `profileDrains`, `enableTempSweep`, `tombstoned`, `drain`, `drainPass`, `drained()`, `timerArmed()`, `epoch`, `draining`, `disposed`; test helpers `controlNextSync()` (`syncEntered`, `release`, `fail`, `done`, `closed`), `withHold()`, `until()`.
- **Review fixes (2026-10-06, plan review 1):** the drain installs its promise before its pass runs (an empty pass used to block autosave permanently); a superseded or failed pass re-arms when captures remain queued (a checkpoint of one workspace used to strand another's capture); repeated discards share one per-profile promise; serialization failures are caught inside the routine save; tests wait on `syncEntered` instead of delays, always restore hooks and release held writes, and observe real timer scheduling and status notifications after disposal.
- **Test-only surface:** `JsonStore.settled()`, `workspaces.drained()` and `workspaces.timerArmed()` are test-support methods. They are safe in production (read-only waits) and are documented as test support.
