'use strict';

// #1591: "Ask where to save each file" is a device-local switch, off by
// default for every profile, and main hands it and the Downloads folder to
// downloads.js. Loads settings.js with a stubbed electron, like
// bangs-settings.test.js.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

function freshProfile(t, name, stored) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-ask-save-${name}-`));
  if (stored) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboardingVersion: 1, ...stored }));
  activeUserData = dir;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  t.after(() => {
    settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return settings;
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('a new profile saves without asking', (t) => {
  assert.equal(freshProfile(t, 'new').getSettings().askWhereToSave, false);
});

test('an existing profile also saves without asking after the update', (t) => {
  assert.equal(freshProfile(t, 'existing', { theme: 'dark' }).getSettings().askWhereToSave, false);
});

test('a stored non-boolean reads as off', (t) => {
  assert.equal(freshProfile(t, 'bad', { askWhereToSave: 'yes' }).getSettings().askWhereToSave, false);
});

test('the switch saves only a boolean', (t) => {
  const settings = freshProfile(t, 'set');
  settings.setSettings({ askWhereToSave: true });
  assert.equal(settings.getSettings().askWhereToSave, true);
  settings.setSettings({ askWhereToSave: 'no' });
  assert.equal(settings.getSettings().askWhereToSave, true);
});

test('the setting is device-local', () => {
  const settings = read('src/main/settings.js');
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /askWhereToSave/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('askWhereToSave'));
});

test('main gives downloads the setting and the Downloads folder', () => {
  assert.match(read('src/main/main.js'), /setDownloadSavePolicy\(\{[\s\S]{0,200}askWhereToSave[\s\S]{0,200}getPath\('downloads'\)/);
});

test('Settings shows the switch with its hint', () => {
  assert.match(read('src/renderer/pages/settings.html'), /<input id="askWhereToSave" type="checkbox"[^>]*aria-describedby="askWhereToSaveHint"/);
  const page = read('src/renderer/pages/settings.js');
  assert.match(page, /askWhereToSave\.checked = settings\.askWhereToSave === true;/);
  assert.match(page, /window\.bowserPages\.settings\.set\(\{ askWhereToSave: askWhereToSave\.checked \}\)/);
});

test('Save Image As asks for its download', () => {
  assert.match(read('src/main/context-menu.js'), /requestSaveDialog\(params\.srcURL\);\s*wc\.downloadURL\(params\.srcURL\)/);
});

test('macOS explains why Blanc saves into Downloads', () => {
  const info = JSON.parse(read('package.json')).build.mac.extendInfo;
  assert.match(info.NSDownloadsFolderUsageDescription, /Downloads folder/);
});

test('downloads apply this platform\'s path limit wherever Blanc picks a name', () => {
  const source = read('src/main/downloads.js');
  const calls = source.match(/chooseDownloadPath\(\{[\s\S]*?\}\)/g) ?? [];
  assert.equal(calls.length, 2);
  for (const call of calls) assert.match(call, /maxPathLength: maxDownloadPathLength\(process\.platform\)/);
});

test('every tab is watched for the click that lets one download skip Save As', () => {
  const tabView = read('src/main/tab-view.js');
  assert.match(tabView, /const \{ trackDownloadGestures \} = require\('\.\/downloads'\);/);
  assert.match(tabView, /function wireTabView\([\s\S]{0,1500}trackDownloadGestures\(wc\);/);
});
