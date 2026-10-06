'use strict';

// Exercises src/main/workspaces.js against a real temp userData directory,
// using the Electron stub pattern from json-store-profile-scope.test.js. The
// decisions live in workspaces-model (covered separately); what is proven here
// is the wiring the model cannot see: profile scoping, id minting, repair on
// access, and that a write actually lands on disk.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-workspaces-store-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};

delete require.cache[require.resolve('../../src/main/store')];
delete require.cache[require.resolve('../../src/main/workspaces')];
const workspaces = require('../../src/main/workspaces');
const {
  withLocalProfile,
  setFocusedLocalProfile,
} = require('../../src/main/local-profile-context');
const { validWorkspaceId } = require('../../src/main/session-workspace');

after(() => {
  delete require.cache[require.resolve('../../src/main/store')];
  delete require.cache[require.resolve('../../src/main/workspaces')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

const CAPTURE = (urls = ['https://a.test/']) => ({
  urls,
  activeIndex: 0,
  groups: [],
  groupIds: urls.map(() => null),
  pinned: urls.map(() => false),
  meta: urls.map((u) => ({ title: u, favicon: null })),
});

test('create mints a storable id, stamps the profile, and persists to disk', () => {
  setFocusedLocalProfile('default');
  const created = workspaces.create({ name: '  Deep  Work ', capture: CAPTURE() });
  assert.equal(created.ok, true);
  assert.equal(created.workspace.name, 'Deep Work');
  assert.equal(created.workspace.profileId, 'default');
  // The store mints the id (the model deliberately does not) and it must be
  // storable as a session.json binding pointer.
  assert.ok(validWorkspaceId(created.workspace.id), 'minted id must satisfy validWorkspaceId');

  assert.deepEqual(workspaces.list().map((w) => w.name), ['Deep Work']);
  assert.equal(workspaces.get(created.workspace.id).name, 'Deep Work');
  assert.equal(workspaces.get('nope'), null);
});

test('errors from the model surface as { ok:false, error } and write nothing', () => {
  setFocusedLocalProfile('default');
  const before = workspaces.list().length;
  assert.deepEqual(workspaces.create({ name: '   ', capture: CAPTURE() }), { ok: false, error: 'invalid-name' });
  assert.deepEqual(workspaces.create({ name: 'deep work', capture: CAPTURE() }), { ok: false, error: 'duplicate-name' });
  assert.deepEqual(workspaces.rename('nope', 'X'), { ok: false, error: 'not-found' });
  assert.deepEqual(workspaces.remove('nope'), { ok: false, error: 'not-found' });
  assert.deepEqual(workspaces.saveCapture('nope', CAPTURE()), { ok: false, error: 'not-found' });
  assert.equal(workspaces.list().length, before, 'a rejected call leaves the file untouched');
});

test('saveCapture replaces tab columns without disturbing identity', () => {
  setFocusedLocalProfile('default');
  const { workspace } = workspaces.create({ name: 'Autosaved', capture: CAPTURE() });
  assert.equal(workspaces.saveCapture(workspace.id, CAPTURE(['https://b.test/', 'https://c.test/'])).ok, true);
  const after = workspaces.get(workspace.id);
  assert.deepEqual(after.urls, ['https://b.test/', 'https://c.test/']);
  assert.equal(after.name, 'Autosaved');
  assert.equal(after.createdAt, workspace.createdAt);
});

test('rename and remove persist', () => {
  setFocusedLocalProfile('default');
  const { workspace } = workspaces.create({ name: 'Temp', capture: CAPTURE() });
  assert.equal(workspaces.rename(workspace.id, 'Renamed').ok, true);
  assert.equal(workspaces.get(workspace.id).name, 'Renamed');
  assert.equal(workspaces.remove(workspace.id).ok, true);
  assert.equal(workspaces.get(workspace.id), null);
});

test('each local profile gets its own file and cannot see the others', () => {
  setFocusedLocalProfile('default');
  const personalNames = workspaces.list().map((w) => w.name);
  assert.ok(personalNames.includes('Deep Work'));

  withLocalProfile('profile_work', () => {
    // A fresh profile starts empty even though Personal has records.
    assert.deepEqual(workspaces.list(), []);
    const created = workspaces.create({ name: 'Deep Work', capture: CAPTURE() });
    // The same name in another profile is fine — the duplicate rule is
    // per-profile, and these are different files entirely.
    assert.equal(created.ok, true);
    assert.deepEqual(workspaces.list().map((w) => w.name), ['Deep Work']);
    assert.equal(created.workspace.profileId, 'profile_work');
  });

  // Personal is unchanged by the named profile's write.
  setFocusedLocalProfile('default');
  assert.deepEqual(workspaces.list().map((w) => w.name), personalNames);
});

test('writes land at the profile-correct paths on disk', async () => {
  // JsonStore debounces (250ms, flushed for real on before-quit), so the file
  // appears shortly after the write rather than synchronously. Poll rather
  // than sleep a fixed span: a fixed delay is load-sensitive, while polling
  // waits exactly as long as needed and fails only if the write never lands.
  const personalFile = path.join(userData, 'workspaces.json');
  const namedFile = path.join(userData, 'profiles', 'profile_work', 'workspaces.json');
  const waitForFile = async (file) => {
    for (let i = 0; i < 200; i++) {
      if (fs.existsSync(file)) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  };
  assert.ok(await waitForFile(personalFile), 'Personal at the userData root');
  assert.ok(await waitForFile(namedFile), 'named profile nested under profiles/<id>/');

  const personal = JSON.parse(fs.readFileSync(personalFile, 'utf8'));
  const named = JSON.parse(fs.readFileSync(namedFile, 'utf8'));
  assert.ok(personal.workspaces.every((w) => w.profileId === 'default'));
  assert.ok(named.workspaces.every((w) => w.profileId === 'profile_work'));
});

test('a hand-edited file is repaired on access: junk dropped, foreign profile dropped', () => {
  const file = path.join(userData, 'profiles', 'profile_repair', 'workspaces.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    workspaces: [
      { id: 'keep_me', name: 'Kept', profileId: 'profile_repair', urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] },
      { id: 'no_name', name: '   ', profileId: 'profile_repair', urls: [] },
      { id: '__proto__', name: 'Hostile', profileId: 'profile_repair', urls: [] },
      { id: 'other_profile', name: 'Foreign', profileId: 'default', urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] },
    ],
  }));

  withLocalProfile('profile_repair', () => {
    // Only the valid, same-profile record survives. A profile-scoped file can
    // never legitimately hold another profile's records.
    assert.deepEqual(workspaces.list().map((w) => w.id), ['keep_me']);
  });
});

test('future files are byte-preserved across reads and all mutation attempts', () => {
  const file = path.join(userData, 'profiles', 'profile_future', 'workspaces.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = '{"version":99,"workspaces":[{"id":"future","name":"Future","profileId":"profile_future","urls":[],"newField":"keep"}],"extra":"keep"}';
  fs.writeFileSync(file, bytes);
  withLocalProfile('profile_future', () => {
    assert.deepEqual(workspaces.list(), []);
    for (const result of [workspaces.create({ name: 'x', capture: CAPTURE() }), workspaces.rename('future', 'y'), workspaces.remove('future'), workspaces.saveCapture('future', CAPTURE()), workspaces.restore('future'), workspaces.move('future', 'up'), workspaces.forget('future')]) assert.equal(result.error, 'future-format');
  });
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

test('critical fsync/rename failures roll back memory and disk; autosave retries and preserves empty captures', () => {
  withLocalProfile('profile_faults', () => {
    const created = workspaces.create({ name: 'Keep', capture: CAPTURE() }); assert.equal(created.ok, true);
    const id = created.workspace.id; const file = path.join(userData, 'profiles', 'profile_faults', 'workspaces.json');
    const before = fs.readFileSync(file, 'utf8');
    for (const [method, code] of [['fsyncSync', 'ENOSPC'], ['renameSync', 'EACCES']]) {
      const original = fs[method]; fs[method] = () => { throw Object.assign(Error(code), { code }); };
      try {
        for (const result of [workspaces.create({ name: 'Fail', capture: CAPTURE() }), workspaces.rename(id, 'Fail'), workspaces.remove(id), workspaces.saveCapture(id, CAPTURE([]))]) assert.equal(result.error, 'storage-failed');
        workspaces.queueCapture(id, CAPTURE([])); assert.equal(workspaces.flushPending().ok, false);
        assert.equal(workspaces.get(id).name, 'Keep'); assert.equal(fs.readFileSync(file, 'utf8'), before);
      } finally { fs[method] = original; }
    }
    assert.equal(workspaces.flushPending().ok, true);
    assert.deepEqual(workspaces.get(id).urls, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).workspaces[0].urls, []);
    assert.equal(workspaces.status(), 'saved');
  });
});

test('unchanged captures produce no write and queued older captures cannot overwrite a checkpoint', () => {
  withLocalProfile('profile_identical', () => {
    const { workspace } = workspaces.create({ name: 'Same', capture: CAPTURE() });
    const original = fs.renameSync; let writes = 0;
    fs.renameSync = (...args) => { writes++; return original(...args); };
    try {
      for (let i = 0; i < 15; i++) workspaces.queueCapture(workspace.id, CAPTURE());
      workspaces.flushPending(); assert.equal(writes, 0);
      workspaces.queueCapture(workspace.id, CAPTURE(['https://old.test/']));
      workspaces.saveCapture(workspace.id, CAPTURE(['https://latest.test/'])); workspaces.flushPending();
      assert.deepEqual(workspaces.get(workspace.id).urls, ['https://latest.test/']);
    } finally { fs.renameSync = original; }
  });
});

test('supported repair preserves exact original with owner-only permissions', () => {
  const file = path.join(userData, 'profiles', 'profile_original', 'workspaces.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); const bytes = '{"version":1,"workspaces":[],"legacy":"original"}'; fs.writeFileSync(file, bytes);
  withLocalProfile('profile_original', () => { assert.deepEqual(workspaces.list(), []); });
  const backup = fs.readdirSync(path.dirname(file)).find((name) => name.startsWith('workspaces.json.before-repair-'));
  assert.ok(backup); assert.equal(fs.readFileSync(path.join(path.dirname(file), backup), 'utf8'), bytes);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(path.dirname(file), backup)).mode & 0o777, 0o600);
});
test('a failed original backup blocks repair and all later writes', () => {
  const file = path.join(userData, 'profiles', 'profile_backup_failure', 'workspaces.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); const bytes = '{ broken JSON'; fs.writeFileSync(file, bytes);
  const original = fs.openSync;
  fs.openSync = (name, ...args) => { if (String(name).includes('.before-repair-')) throw Object.assign(Error('ENOSPC'), { code: 'ENOSPC' }); return original(name, ...args); };
  try {
    withLocalProfile('profile_backup_failure', () => {
      assert.deepEqual(workspaces.list(), []); assert.equal(workspaces.create({ name: 'No', capture: CAPTURE() }).error, 'repair-failed');
    });
  } finally { fs.openSync = original; }
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
test('delete and restore survive a new repository instance; a failed restore keeps recovery intact', () => {
  withLocalProfile('profile_recovery', () => {
    const made = workspaces.create({ name: 'Recover', capture: CAPTURE() }); assert.equal(workspaces.remove(made.workspace.id).ok, true);
    const restarted = workspaces.createRepository(); assert.equal(restarted.deleted().length, 1);
    const original = fs.renameSync; fs.renameSync = () => { throw Error('EACCES'); };
    try { assert.equal(restarted.restore(made.workspace.id).ok, false); assert.equal(restarted.deleted().length, 1); } finally { fs.renameSync = original; }
    assert.equal(restarted.restore(made.workspace.id).ok, true); assert.deepEqual(restarted.get(made.workspace.id).urls, CAPTURE().urls); assert.equal(restarted.deleted().length, 0);
    assert.equal(restarted.remove(made.workspace.id).ok, true); assert.equal(restarted.forget(made.workspace.id).ok, true); assert.equal(restarted.restore(made.workspace.id).error, 'not-found');
  });
});

// Hold (or fail) FileHandle.sync() of the next async write (copied from json-store-async-saves.test.js).
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
  // Workspace retry timers are unref'd: keep the event loop alive while a
  // test waits on a held write, or node:test cancels it as stalled.
  const keepAlive = setInterval(() => {}, 1000);
  try { return await body(hold); } finally { clearInterval(keepAlive); hold.done(); }
}

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
