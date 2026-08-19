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
  // appears shortly after the write rather than synchronously. Waiting proves
  // the write actually reaches disk at the right path — Personal keeps the
  // shipped root file, named profiles nest under profiles/<id>/ exactly where
  // Favorites and history already live.
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(fs.existsSync(path.join(userData, 'workspaces.json')), 'Personal at the userData root');
  assert.ok(
    fs.existsSync(path.join(userData, 'profiles', 'profile_work', 'workspaces.json')),
    'named profile nested under profiles/<id>/',
  );

  const personal = JSON.parse(fs.readFileSync(path.join(userData, 'workspaces.json'), 'utf8'));
  const named = JSON.parse(fs.readFileSync(path.join(userData, 'profiles', 'profile_work', 'workspaces.json'), 'utf8'));
  assert.ok(personal.workspaces.every((w) => w.profileId === 'default'));
  assert.ok(named.workspaces.every((w) => w.profileId === 'profile_work'));
});

test('a hand-edited file is repaired on access: junk dropped, foreign profile dropped', () => {
  const file = path.join(userData, 'profiles', 'profile_repair', 'workspaces.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    version: 99,
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
