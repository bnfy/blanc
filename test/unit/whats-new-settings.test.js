'use strict';

// The What's New page state (src/main/whats-new.js) is device-local settings:
// whatsNewPageVersion (a version string) and whatsNewTabRelease (major.minor).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId, filename: electronId, loaded: true,
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

test('What\'s New page state defaults empty, keeps valid values and never syncs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-whats-new-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().whatsNewPageVersion, '');
  assert.equal(settings.getSettings().whatsNewTabRelease, '');
  assert.equal(settings.setSettings({ whatsNewTabRelease: '1.39' }).whatsNewTabRelease, '1.39');
  assert.equal(settings.setSettings({ whatsNewTabRelease: '1.39.0' }).whatsNewTabRelease, '1.39', 'a full version is refused');
  assert.equal(settings.setSettings({ whatsNewPageVersion: '1.39.1' }).whatsNewPageVersion, '1.39.1');
  assert.equal(settings.setSettings({ whatsNewPageVersion: 'abc' }).whatsNewPageVersion, '1.39.1');
  const values = settings.exportForSync().values;
  assert.equal(Object.hasOwn(values, 'whatsNewPageVersion'), false);
  assert.equal(Object.hasOwn(values, 'whatsNewTabRelease'), false);
});

test('corrupt stored values load as empty', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-whats-new-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ whatsNewTabRelease: '1.x', whatsNewPageVersion: 'abc' }));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().whatsNewTabRelease, '');
  assert.equal(settings.getSettings().whatsNewPageVersion, '');
});
