'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsSchema = require('../../settings-schema/schema.json');

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

test('syncNudgeDismissed defaults false, validates, persists, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-nudge-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));

  let settings = loadSettings(userData);
  assert.equal(settings.getSettings().syncNudgeDismissed, false);
  assert.equal(settingsSchema.internalDefaults.includes('syncNudgeDismissed'), true);

  settings.setSettings({ syncNudgeDismissed: 'yes' });
  assert.equal(settings.getSettings().syncNudgeDismissed, false, 'non-boolean writes are ignored');

  settings.setSettings({ syncNudgeDismissed: true });
  assert.equal(settings.getSettings().syncNudgeDismissed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'syncNudgeDismissed'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.getSettings()._syncMeta, 'syncNudgeDismissed'), false);

  // A hand-edited file reads back as the default, never as a truthy string.
  const file = path.join(userData, 'settings.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.syncNudgeDismissed = 'true';
  fs.writeFileSync(file, JSON.stringify(data));
  settings = loadSettings(userData);
  assert.equal(settings.getSettings().syncNudgeDismissed, false);
});
