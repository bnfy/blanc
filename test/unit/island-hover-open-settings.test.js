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

test('hover-open defaults off, accepts booleans and never syncs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-hover-open-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().islandHoverOpen, false);
  assert.equal(settings.setSettings({ islandHoverOpen: true }).islandHoverOpen, true);
  assert.equal(settings.setSettings({ islandHoverOpen: 'yes' }).islandHoverOpen, true);
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'islandHoverOpen'), false);
});

test('Settings places hover-open directly after Tab layout and guards support', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  assert.match(html, /id="tabLayoutSetting"[\s\S]*?<\/div>\s*<div class="setting" id="islandHoverOpenSetting"/);
  assert.match(html, /id="islandHoverOpen"[^>]*aria-describedby="islandHoverOpenHint"/);
  assert.match(page, /if \(supports\('islandHoverOpen'\)\)/);
  assert.match(page, /getElementById\('islandHoverOpenSetting'\)\?\.remove\(\)/);
});
