'use strict';

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

test('auto-hide defaults off, accepts only booleans and never syncs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-autohide-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().islandAutoHide, false);
  assert.equal(settings.setSettings({ islandAutoHide: true }).islandAutoHide, true);
  assert.equal(settings.setSettings({ islandAutoHide: 'no' }).islandAutoHide, true);
  assert.equal(settings.setSettings({ islandAutoHide: false }).islandAutoHide, false);
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'islandAutoHide'), false);
});

test('Settings places auto-hide after hover-open and guards support', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  assert.match(html, /id="islandHoverOpenSetting"[\s\S]*?<\/label>\s*<\/div>\s*<div class="setting" id="islandAutoHideSetting"/);
  assert.match(html, /id="islandAutoHide"[^>]*aria-describedby="islandAutoHideHint"/);
  assert.match(page, /if \(supports\('islandAutoHide'\)\)/);
  assert.match(page, /getElementById\('islandAutoHideSetting'\)\?\.remove\(\)/);
});
