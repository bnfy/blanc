'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = { id: electronId, filename: electronId, loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } } };

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}
function tempUserData(t, initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ui-language-'));
  if (initial) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(initial));
  t.after(() => {
    for (const entry of loaded) if (entry.userData === dir) entry.settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron; else delete require.cache[electronId];
});

test('uiLanguage defaults to system and never syncs', (t) => {
  const settings = loadSettings(tempUserData(t));
  assert.equal(settings.getSettings().uiLanguage, 'system');
  assert.equal('uiLanguage' in settings.exportForSync().values, false);
});

test('generic setSettings cannot change uiLanguage', (t) => {
  const settings = loadSettings(tempUserData(t));
  settings.setSettings({ uiLanguage: 'de', theme: 'dark' });
  assert.equal(settings.getSettings().uiLanguage, 'system');
  assert.equal(settings.getSettings().theme, 'dark');
});

test('setUiLanguage accepts system and selectable codes only, and persists immediately', (t) => {
  const dir = tempUserData(t);
  const settings = loadSettings(dir);
  assert.equal(settings.setUiLanguage('de', ['en']), false);
  assert.equal(settings.setUiLanguage('xx-<script>', ['en']), false);
  assert.equal(settings.setUiLanguage('de', ['en', 'de']), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).uiLanguage, 'de');
  assert.equal(settings.setUiLanguage('system', ['en']), true);
  assert.equal(settings.getSettings().uiLanguage, 'system');
});

test('a stored hidden language survives load; a malformed value reads as system', (t) => {
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 'fr' })).getSettings().uiLanguage, 'fr');
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 'en-XA' })).getSettings().uiLanguage, 'en-XA');
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 'DE!!' })).getSettings().uiLanguage, 'system');
  assert.equal(loadSettings(tempUserData(t, { uiLanguage: 42 })).getSettings().uiLanguage, 'system');
});

test('a failed flush restores the previous value and reports false', (t) => {
  const settings = loadSettings(tempUserData(t));
  const store = require('../../src/main/store');
  const original = store.JsonStore.prototype.flush;
  store.JsonStore.prototype.flush = () => false;
  t.after(() => { store.JsonStore.prototype.flush = original; });
  assert.equal(settings.setUiLanguage('de', ['en', 'de']), false);
  assert.equal(settings.getSettings().uiLanguage, 'system');
});
