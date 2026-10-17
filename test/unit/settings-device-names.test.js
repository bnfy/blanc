'use strict';
// Device names sync as one settings key with a clock per entry (spec
// 2026-10-16-island-lower-section-design.md §7.2).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
function freshProfile(t, name, stored = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-device-names-${name}-`));
  t.after(() => {
    for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboardingVersion: 1, ...stored }));
  const settings = loadSettings(dir);
  // The store binds to the userData path on first use; bind it now, before
  // another profile repoints the mocked path.
  settings.getSettings();
  return settings;
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const NEO = '2f1c9a52-6a1e-4b8e-9d0a-1d2c3b4a5f60';
const MINI = '7c0d4e1b-1b2a-4c3d-8e9f-0a1b2c3d4e5f';

test('setDeviceName stamps the entry and the key, and the export carries both', (t) => {
  const settings = freshProfile(t, 'stamp');
  settings.setDeviceName(NEO, '  Work laptop ', 1000);
  const names = settings.getDeviceNames();
  assert.equal(names[NEO].name, 'Work laptop');
  assert.equal(names[NEO].at, 1000);
  assert.ok(names[NEO].tie.length > 0, 'a tie-breaker is minted');
  const payload = settings.exportForSync();
  assert.deepEqual(payload.values.deviceNames, names);
  assert.ok(payload.meta.deviceNames > 0);
});

test('an unchanged name or an invalid id writes nothing', (t) => {
  const settings = freshProfile(t, 'unchanged');
  let fired = 0;
  settings.onSettingsChanged(() => { fired++; });
  settings.setDeviceName(NEO, 'Work laptop', 1000);
  settings.setDeviceName(NEO, ' Work laptop', 2000);
  settings.setDeviceName('not an id!', 'Nope', 3000);
  settings.setDeviceName(MINI, '', 4000);
  assert.equal(settings.getDeviceNames()[NEO].at, 1000);
  assert.deepEqual(Object.keys(settings.getDeviceNames()), [NEO]);
  assert.equal(fired, 1);
});

test('a later local rename advances past a clock seen from another Mac', (t) => {
  const settings = freshProfile(t, 'clock');
  settings.mergeFromSync({
    values: { deviceNames: { [NEO]: { name: 'From the future', at: 5000, tie: 'b' } } },
    meta: { deviceNames: 5000 },
  });
  settings.setDeviceName(NEO, 'Mine', 1000);
  assert.equal(settings.getDeviceNames()[NEO].name, 'Mine');
  assert.ok(settings.getDeviceNames()[NEO].at > 5000);
});

test('the Settings page cannot write device names', (t) => {
  const settings = freshProfile(t, 'page-write');
  settings.setSettings({ deviceNames: { [NEO]: { name: 'Injected', at: 99, tie: '' } } });
  assert.deepEqual(settings.getDeviceNames(), {});
  assert.equal(settings.exportForSync().values.deviceNames, undefined, 'an empty map is not exported');
});

test('two Macs renaming two devices keep both renames', (t) => {
  const macA = freshProfile(t, 'mac-a');
  const macB = freshProfile(t, 'mac-b');
  macA.setDeviceName(NEO, 'Work laptop', 1000);
  macB.setDeviceName(MINI, 'Studio', 1001);
  const fromA = macA.exportForSync();
  const fromB = macB.exportForSync();
  macA.mergeFromSync(fromB);
  macB.mergeFromSync(fromA);
  for (const mac of [macA, macB]) {
    const names = mac.getDeviceNames();
    assert.equal(names[NEO].name, 'Work laptop');
    assert.equal(names[MINI].name, 'Studio');
  }
  assert.deepEqual(macA.getDeviceNames(), macB.getDeviceNames());
  assert.equal(macA.exportForSync().meta.deviceNames, 1001, 'the key clock is the larger of both');
});

test('a clear on one Mac clears the name on the other', (t) => {
  const macA = freshProfile(t, 'clear-a');
  const macB = freshProfile(t, 'clear-b');
  macA.setDeviceName(NEO, 'Work laptop', 1000);
  macB.mergeFromSync(macA.exportForSync());
  macB.setDeviceName(NEO, '', 2000);
  macA.mergeFromSync(macB.exportForSync());
  assert.equal(macA.getDeviceNames()[NEO].name, '');
});

test('a merge that changes the map tells listeners; one that does not stays quiet', (t) => {
  const macA = freshProfile(t, 'notify-a');
  const macB = freshProfile(t, 'notify-b');
  macA.setDeviceName(NEO, 'Work laptop', 1000);
  let fired = 0;
  macB.onSettingsChanged(() => { fired++; });
  macB.mergeFromSync(macA.exportForSync());
  assert.equal(fired, 1);
  macB.mergeFromSync(macA.exportForSync());
  assert.equal(fired, 1);
});

test('a remote without the key keeps the local map and asks for an upload', (t) => {
  const settings = freshProfile(t, 'old-remote');
  settings.setDeviceName(NEO, 'Work laptop', 1000);
  const older = settings.exportForSync();
  delete older.values.deviceNames;
  delete older.meta.deviceNames;
  settings.mergeFromSync(older);
  assert.equal(settings.getDeviceNames()[NEO].name, 'Work laptop');
  const exported = settings.exportForSync();
  assert.equal(settings.syncPayloadEquals(exported, older), false, 'the next PUT restores the names');
  assert.equal(settings.syncPayloadEquals(exported, JSON.parse(JSON.stringify(exported))), true);
});

test('syncPayloadEquals ignores key order but not values', (t) => {
  const settings = freshProfile(t, 'equals');
  settings.setSettings({ theme: 'dark' });
  const exported = settings.exportForSync();
  const reordered = {
    tieBreakers: exported.tieBreakers,
    meta: exported.meta,
    values: Object.fromEntries(Object.entries(exported.values).reverse()),
  };
  assert.equal(settings.syncPayloadEquals(exported, reordered), true);
  assert.equal(settings.syncPayloadEquals(exported, { ...reordered, values: { ...reordered.values, theme: 'light' } }), false);
  assert.equal(settings.syncPayloadEquals(exported, null), false);
});

test('device names stay out of the Settings page and the mobile schema', () => {
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pages.match(/const clientSettings = \(\) => \{[\s\S]*?\n {2}\};/)[0], /\n\s+deviceNames,\n/);
  const schema = require('../../settings-schema/schema.json');
  assert.ok(schema.internalDefaults.includes('deviceNames'));
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/settings.js'), 'utf8');
  assert.match(source.match(/const SYNCED_KEYS = \[[^\]]*\];/)[0], /'deviceNames'/);
  assert.match(source, /^ {2}deviceNames: \{\},$/m);
});

test('the sync engine skips the settings PUT on a true no-op', () => {
  const sync = fs.readFileSync(path.join(__dirname, '../../src/main/sync.js'), 'utf8');
  assert.match(sync, /name: 'settings', export: settings\.exportForSync, merge: settings\.mergeFromSync, equals: settings\.syncPayloadEquals/);
});

// One sync pass as sync.js runs it: pull and merge, export, and PUT unless
// the remote already equals what this device would upload.
function syncPass(mac, server) {
  if (server.blob) mac.mergeFromSync(server.blob);
  const exported = mac.exportForSync();
  if (server.blob && mac.syncPayloadEquals(exported, server.blob)) return false;
  server.blob = JSON.parse(JSON.stringify(exported));
  return true;
}

test('two Macs that agree stop uploading, even with an old unclocked setting', (t) => {
  // theme saved before sync stamped settings: no clock, so no peer adopts it.
  const macA = freshProfile(t, 'round-a', { theme: 'dark' });
  const macB = freshProfile(t, 'round-b');
  macA.setSettings({ adblockExceptions: ['example.com'] });
  macA.setDeviceName(NEO, 'Work laptop', 1000);
  macB.setSettings({ newtabDynamicWallpaper: true });
  macB.setDeviceName(MINI, 'Studio', 1001);
  const server = { blob: null };
  for (let round = 0; round < 2; round++) { syncPass(macA, server); syncPass(macB, server); }
  assert.equal(syncPass(macA, server), false, 'Mac A has nothing to upload');
  assert.equal(syncPass(macB, server), false, 'Mac B has nothing to upload');
  for (const mac of [macA, macB]) {
    assert.deepEqual(mac.getSettings().adblockExceptions, ['example.com']);
    assert.equal(mac.getSettings().newtabDynamicWallpaper, true);
    assert.deepEqual(Object.keys(mac.getDeviceNames()).sort(), [NEO, MINI].sort());
  }
});

test('a remote with the same names and a later key clock adopts the clock quietly', (t) => {
  const mac = freshProfile(t, 'clock-only');
  mac.setDeviceName(NEO, 'Work laptop', 1000);
  const names = mac.getDeviceNames();
  let fired = 0;
  mac.onSettingsChanged(() => { fired++; });
  mac.mergeFromSync({ values: { deviceNames: names }, meta: { deviceNames: 9000 } });
  assert.equal(mac.exportForSync().meta.deviceNames, 9000);
  assert.equal(fired, 0);
});
