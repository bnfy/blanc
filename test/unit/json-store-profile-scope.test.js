const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

// JsonStore is deliberately exercised through its Electron-shaped boundary so
// this stays a real filesystem compatibility test, not an implementation mock.
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
const { JsonStore } = require('../../src/main/store');
const { withLocalProfile, setFocusedLocalProfile } = require('../../src/main/local-profile-context');

test.after(() => {
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

test('profile stores retain default files and isolate named-profile records', () => {
  setFocusedLocalProfile('default');
  const store = new JsonStore('history', { entries: [] }, { scope: 'profile' });

  store.update((data) => data.entries.push('default-entry'));
  assert.equal(store.flush(), true);
  assert.equal(store.file, path.join(userData, 'history.json'));

  withLocalProfile('work', () => {
    store.update((data) => data.entries.push('work-entry'));
    assert.equal(store.flush(), true);
    assert.equal(store.file, path.join(userData, 'profiles', 'work', 'history.json'));
    assert.deepEqual(store.data.entries, ['work-entry']);
  });

  assert.deepEqual(store.data.entries, ['default-entry']);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(userData, 'history.json'), 'utf8')).entries,
    ['default-entry']
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(userData, 'profiles', 'work', 'history.json'), 'utf8')).entries,
    ['work-entry']
  );
});
