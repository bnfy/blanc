'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let userData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};

const modules = ['site-zoom', 'settings', 'store'].map((name) => require.resolve(`../../src/main/${name}`));
function fresh(t, files = {}) {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-site-zoom-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(userData, name)), { recursive: true });
    fs.writeFileSync(path.join(userData, name), text);
  }
  for (const id of modules) delete require.cache[id];
  return require('../../src/main/site-zoom');
}

test.after(() => {
  for (const id of modules) delete require.cache[id];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const { withLocalProfile } = require('../../src/main/local-profile-context');
const NAMED = 'profile_059ec97d-0dd0-469c-96af-b4edb5813d0a';

test('a site can be saved, removed and cleared', (t) => {
  const siteZoom = fresh(t);
  assert.deepEqual(siteZoom.sites(), {});
  siteZoom.setSite('example.com', 75);
  siteZoom.setSite('other.com', 110);
  assert.deepEqual(siteZoom.sites(), { 'example.com': 75, 'other.com': 110 });
  siteZoom.removeSite('example.com');
  assert.deepEqual(siteZoom.sites(), { 'other.com': 110 });
  siteZoom.clearSites();
  assert.deepEqual(siteZoom.sites(), {});
});

test('sites() hands out a copy', (t) => {
  const siteZoom = fresh(t);
  siteZoom.setSite('example.com', 75);
  siteZoom.sites()['example.com'] = 500;
  assert.equal(siteZoom.sites()['example.com'], 75);
});

test('an invalid write is refused', (t) => {
  const siteZoom = fresh(t);
  for (const [key, percent] of [['a.com', 24], ['a.com', 501], ['a.com', 75.5], ['a.com', '75'], ['', 75], [null, 75], ['x'.repeat(300), 75], ['__proto__', 75]]) {
    siteZoom.setSite(key, percent);
  }
  assert.deepEqual(siteZoom.sites(), {});
});

test('profiles keep separate sites', (t) => {
  const siteZoom = fresh(t);
  siteZoom.setSite('example.com', 75);
  withLocalProfile(NAMED, () => {
    assert.deepEqual(siteZoom.sites(), {});
    siteZoom.setSite('example.com', 150);
  });
  assert.equal(siteZoom.sites()['example.com'], 75);
  assert.equal(withLocalProfile(NAMED, () => siteZoom.sites()['example.com']), 150);
});

test('a file with bad entries keeps only the good ones', (t) => {
  const siteZoom = fresh(t, { 'site-zoom.json': JSON.stringify({
    version: 1, sites: { 'good.com': 90, 'high.com': 900, 'text.com': 'x', [`${'y'.repeat(300)}.com`]: 90 },
  }) });
  assert.deepEqual(siteZoom.sites(), { 'good.com': 90 });
});

test('a corrupt or wrongly shaped file reads as empty', (t) => {
  assert.deepEqual(fresh(t, { 'site-zoom.json': '{nope' }).sites(), {});
  assert.deepEqual(fresh(t, { 'site-zoom.json': JSON.stringify({ sites: [1, 2] }) }).sites(), {});
});

test('legacy zoom moves across once and never overwrites a saved site', (t) => {
  const siteZoom = fresh(t);
  siteZoom.setSite('kept.com', 200);
  let reads = 0;
  const preferences = JSON.stringify({ partition: { per_host_zoom_levels: { 1: {
    'kept.com': 1, 'moved.com': 1, newtab: 1,
  } } } });
  const read = () => { reads++; return preferences; };
  siteZoom.migrate(read, ['newtab']);
  siteZoom.migrate(read, ['newtab']);
  assert.equal(reads, 1);
  assert.deepEqual(siteZoom.sites(), { 'kept.com': 200, 'moved.com': 120, 'blanc://newtab': 120 });
});

test('migration runs per profile', (t) => {
  const siteZoom = fresh(t);
  siteZoom.migrate(() => null, []);
  withLocalProfile(NAMED, () => {
    siteZoom.migrate(() => JSON.stringify({ partition: { per_host_zoom_levels: { 1: { 'a.com': 1 } } } }), []);
    assert.deepEqual(siteZoom.sites(), { 'a.com': 120 });
  });
  assert.deepEqual(siteZoom.sites(), {});
});

test('an unreadable Preferences file moves nothing and does not throw', (t) => {
  const siteZoom = fresh(t);
  siteZoom.migrate(() => { throw new Error('EACCES'); }, []);
  assert.deepEqual(siteZoom.sites(), {});
  const other = fresh(t);
  other.migrate(() => '{nope', []);
  assert.deepEqual(other.sites(), {});
});

test('pageZoom is a device setting limited to the listed options', (t) => {
  fresh(t);
  const settings = require('../../src/main/settings');
  assert.equal(settings.getSettings().pageZoom, 100);
  assert.equal(settings.setSettings({ pageZoom: 75 }).pageZoom, 75);
  for (const value of [33, 250, '75', null]) assert.equal(settings.setSettings({ pageZoom: value }).pageZoom, 75);
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/settings.js'), 'utf8');
  assert.doesNotMatch(source.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /pageZoom/);
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../settings-schema/schema.json'), 'utf8'));
  assert.ok(schema.internalDefaults.includes('pageZoom'));
});

test('a stored pageZoom off the list reads as 100', (t) => {
  fresh(t, { 'settings.json': JSON.stringify({ onboardingVersion: 1, pageZoom: 33 }) });
  assert.equal(require('../../src/main/settings').getSettings().pageZoom, 100);
});
