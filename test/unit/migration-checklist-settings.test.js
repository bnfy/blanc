'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsSchema = require('../../settings-schema/schema.json');
const KEYS = ['migrationChecklistDismissed', 'syncMigrationCompleted', 'tabImportCompleted'];

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('checklist state defaults false, validates, persists, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-migration-checklist-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));

  let settings = loadSettings(userData);
  for (const key of KEYS) {
    assert.equal(settings.getSettings()[key], false, `${key} defaults false`);
    assert.equal(settingsSchema.internalDefaults.includes(key), true, `${key} is an internal default`);
    settings.setSettings({ [key]: 'yes' });
    assert.equal(settings.getSettings()[key], false, `${key} rejects non-booleans`);
    settings.setSettings({ [key]: true });
    assert.equal(settings.getSettings()[key], true, `${key} persists`);
    assert.equal(Object.hasOwn(settings.exportForSync().values, key), false, `${key} is not synced`);
    assert.equal(Object.hasOwn(settings.getSettings()._syncMeta, key), false, `${key} gets no sync clock`);
  }

  const file = path.join(userData, 'settings.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of KEYS) data[key] = 'true';
  fs.writeFileSync(file, JSON.stringify(data));
  settings = loadSettings(userData);
  for (const key of KEYS) assert.equal(settings.getSettings()[key], false, `${key} coerces corrupt data`);
});
