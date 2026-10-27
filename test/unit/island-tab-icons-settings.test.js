'use strict';
// #1175: an option to draw each direct tab on the Island as its site icon.

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

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('site icons default off, accept only booleans and never sync', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-icons-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().islandTabIcons, false);
  assert.equal(settings.setSettings({ islandTabIcons: true }).islandTabIcons, true);
  assert.equal(settings.setSettings({ islandTabIcons: 'no' }).islandTabIcons, true, 'a non-boolean is ignored');
  assert.equal(settings.setSettings({ islandTabIcons: false }).islandTabIcons, false);
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'islandTabIcons'), false);
});

test('Settings offers the switch after Match site colors and guards support', () => {
  const html = read('src/renderer/pages/settings.html');
  const page = read('src/renderer/pages/settings.js');
  assert.match(html, /id="islandSiteColorsSetting"[\s\S]*?<\/label>\s*<\/div>\s*<div class="setting" id="islandTabIconsSetting"/);
  assert.match(html, /id="islandTabIcons"[^>]*aria-describedby="islandTabIconsHint"/);
  // The switch sits inside its own row, right after the row's label.
  assert.match(html, /<div class="setting" id="islandTabIconsSetting">\s*<div class="label">(?:(?!<div class="setting")[\s\S])*?<\/div>\s*<label class="toggle"><input id="islandTabIcons" /);
  assert.equal(html.match(/id="islandTabIcons"/g).length, 1);
  assert.match(page, /if \(supports\('islandTabIcons'\)\)/);
  assert.match(page, /getElementById\('islandTabIconsSetting'\)\?\.remove\(\)/);
});

test('main sends the setting with every tabs payload and rebroadcasts a change', () => {
  const main = read('src/main/main.js');
  assert.equal(main.match(/verticalTabsTextSize,\n\s+islandTabIcons,/g)?.length, 2, 'both tabs payloads carry it');
  assert.match(main, /if \(\(s\.islandTabIcons === true\) !== islandTabIcons\) \{\s*islandTabIcons = s\.islandTabIcons === true;\s*forEachWindowRuntime\(\(\) => broadcastTabs\(\)/);
});

test('the strip draws icons at rest, refits on a change and keeps every state', () => {
  const renderer = read('src/renderer/renderer.js');
  const styles = read('src/renderer/styles.css');
  assert.match(renderer, /setFavicon\(icon, t, state\.islandTabIcons === true \? 'dot-icon favicon' : 'dot-peek favicon'\)/);
  assert.match(renderer, /pillDots\.classList\.toggle\('icons', state\.islandTabIcons === true\)/);
  assert.match(renderer, /icons: state\.islandTabIcons === true,/, 'the dot signature redraws on a change');
  assert.match(renderer, /\/\/ Site icons are wider than dots, so switching starts a fresh fit\.\n\s+state\.islandTabIcons === true,/);
  for (const state of ['active', 'pinned', 'private', 'dot-group-colored']) {
    assert.match(styles, new RegExp(`#pillDots\\.icons \\.island-dot\\.${state}\\b`), `${state} keeps a mark in icon mode`);
  }
});
