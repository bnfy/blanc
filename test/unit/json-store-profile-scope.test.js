'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-profile-store-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};

delete require.cache[require.resolve('../../src/main/store')];
const { JsonStore, discardProfileStoreEntries } = require('../../src/main/store');
const {
  withLocalProfile,
  setFocusedLocalProfile,
} = require('../../src/main/local-profile-context');

after(() => {
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

test('profile stores retain Personal root files and isolate named records', () => {
  setFocusedLocalProfile('default');
  const store = new JsonStore('history', { entries: [] }, { scope: 'profile' });
  store.update((data) => data.entries.push('personal'));
  assert.equal(store.flush(), true);
  assert.equal(store.file, path.join(userData, 'history.json'));

  withLocalProfile('profile_work', () => {
    store.update((data) => data.entries.push('work'));
    assert.equal(store.flush(), true);
    assert.equal(
      store.file,
      path.join(userData, 'profiles', 'profile_work', 'history.json')
    );
    assert.deepEqual(store.data.entries, ['work']);
  });

  assert.deepEqual(store.data.entries, ['personal']);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(userData, 'history.json'), 'utf8')).entries,
    ['personal']
  );
});

test('device stores ignore profile context and critical failures roll memory back', () => {
  const device = new JsonStore('settings', { theme: 'system' });
  withLocalProfile('profile_work', () => {
    device.update((data) => { data.theme = 'dark'; });
    assert.equal(device.flush(), true);
  });
  assert.equal(device.file, path.join(userData, 'settings.json'));
  assert.equal(device.data.theme, 'dark');
});

test('discarding a profile drops cached entries before directory removal', () => {
  const store = new JsonStore('downloads', { items: [] }, { scope: 'profile' });
  withLocalProfile('profile_temp', () => {
    store.update((data) => data.items.push('pending'));
  });
  assert.equal(discardProfileStoreEntries('profile_temp'), true);
  withLocalProfile('profile_temp', () => {
    assert.deepEqual(store.data.items, []);
  });
  assert.equal(discardProfileStoreEntries('default'), false);
});
