const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: {
      getPath: () => activeUserData,
      on: () => {},
    },
  },
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

test('the quiet-tabs delay defaults to 1h, validates its enum, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-sleep-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const settings = loadSettings(userData);

  assert.deepEqual(settings.TAB_SLEEP_DELAYS, ['off', '30m', '1h', '6h']);
  assert.equal(settings.getSettings().tabSleep, '1h');

  assert.equal(settings.setSettings({ tabSleep: 'off' }).tabSleep, 'off');
  assert.equal(settings.setSettings({ tabSleep: '6h' }).tabSleep, '6h');
  assert.equal(settings.setSettings({ tabSleep: '12h' }).tabSleep, '6h');
  assert.equal(settings.setSettings({ tabSleep: 3600000 }).tabSleep, '6h');
  assert.equal(settings.setSettings({ tabSleep: null }).tabSleep, '6h');

  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'tabSleep'),
    false
  );
});
