'use strict';
// Existing group names get a capital first letter once (spec
// 2026-10-16-island-lower-section-design.md §9.2).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const groupNameCase = require('../../src/main/group-name-case');
const { loadFile, EMPTY_FILE } = require('../../src/main/workspaces-model');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}
function tempProfile(t, settingsJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-group-recase-'));
  t.after(() => {
    for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  if (settingsJson) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settingsJson));
  return dir;
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('an existing profile owes the pass once; marking it settles it for good', (t) => {
  const dir = tempProfile(t, { onboardingVersion: 1, presentationDefaultsResetVersion: 1 });
  let settings = loadSettings(dir);
  assert.equal(settings.groupNamesRecaseDue(), true);
  settings.markGroupNamesRecased();
  assert.equal(settings.groupNamesRecaseDue(), false);
  settings.flushSettings();
  settings = loadSettings(dir);
  assert.equal(settings.groupNamesRecaseDue(), false, 'the stamp survives a relaunch');
});

test('a fresh profile never runs the pass', (t) => {
  const settings = loadSettings(tempProfile(t));
  assert.equal(settings.groupNamesRecaseDue(), false);
});

test('the stamp is device-local and never reaches the Settings page', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(source, /groupNamesRecasedVersion,/);
  const settingsSource = fs.readFileSync(path.join(__dirname, '../../src/main/settings.js'), 'utf8');
  const synced = settingsSource.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1];
  assert.doesNotMatch(synced, /groupNamesRecasedVersion/);
});

const group = (id, name) => ({ id, name, collapsed: false });
const space = (id, groups) => ({
  id, name: id, profileId: 'default', createdAt: 1, updatedAt: 1, revision: 0,
  urls: [], activeIndex: 0, groups, groupIds: [], pinned: [], meta: [],
});

test('a Spaces file without the stamp is recased and stamped', () => {
  const { status, file } = loadFile({
    version: 2,
    workspaces: [space('ws_1', [group('g1', 'projects')])],
    deleted: [{ workspace: space('ws_2', [group('g2', 'reading')]), deletedAt: 5, index: 1 }],
  });
  assert.equal(status, 'supported');
  assert.equal(file.groupNamesRecased, 1);
  assert.equal(file.workspaces[0].groups[0].name, 'Projects');
  assert.equal(file.deleted[0].workspace.groups[0].name, 'Reading');
});

test('a stamped Spaces file is never recased again', () => {
  const { file } = loadFile({
    version: 2, groupNamesRecased: 1,
    workspaces: [space('ws_1', [group('g1', 'iOS'), group('g2', 'later lowercase')])],
    deleted: [],
  });
  assert.deepEqual(file.workspaces[0].groups.map((g) => g.name), ['iOS', 'later lowercase']);
  assert.equal(EMPTY_FILE().groupNamesRecased, 1, 'a new file starts stamped');
});

// main.js cannot be required under node --test; lift the shipped function.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const recaseSource = mainSource.match(/function recaseSavedGroupNamesOnce\(\) \{[\s\S]*?\n\}/)?.[0];

test('startup recases session.json once, mirror and windows alike', () => {
  assert.ok(recaseSource, 'recaseSavedGroupNamesOnce not found in main.js — update this test with it');
  const data = {
    version: 2,
    windows: [{ id: 'primary', groups: [group('g', 'projects')] }],
    groups: [group('g', 'projects')], urls: [], activeIndex: 0, groupIds: [], pinned: [],
  };
  let due = true;
  const sandbox = {
    settings: { groupNamesRecaseDue: () => due, markGroupNamesRecased: () => { due = false; } },
    ensureSessionStore: () => ({ data, updateAndFlush(fn) { fn(this.data); return true; } }),
    recaseSessionData: groupNameCase.recaseSessionData,
  };
  vm.runInNewContext(`${recaseSource}\nthis.run = recaseSavedGroupNamesOnce;`, sandbox);
  sandbox.run();
  assert.equal(data.windows[0].groups[0].name, 'Projects');
  assert.equal(data.groups[0].name, 'Projects');
  assert.equal(due, false);
  data.windows[0].groups[0].name = 'iOS';
  sandbox.run();
  assert.equal(data.windows[0].groups[0].name, 'iOS', 'a second launch changes nothing');
});
