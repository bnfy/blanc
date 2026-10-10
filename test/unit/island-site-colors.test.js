const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

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

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}

// Write any pending debounced save now, synchronously, then remove the
// directory. Waiting a fixed 300 ms let the 250 ms save start on its own and
// race the removal (ENOTEMPTY on a slow Windows runner).
function removeUserData(dir) {
  for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
  fs.rmSync(dir, { recursive: true, force: true });
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('Match site colors defaults on, accepts only booleans, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-site-colors-'));
  t.after(() => removeUserData(userData));
  const settings = loadSettings(userData);

  assert.equal(settings.getSettings().islandSiteColors, true);
  assert.equal(settings.setSettings({ islandSiteColors: false }).islandSiteColors, false);
  assert.equal(settings.setSettings({ islandSiteColors: 'true' }).islandSiteColors, false);
  assert.equal(settings.setSettings({ islandSiteColors: 1 }).islandSiteColors, false);
  assert.equal(settings.setSettings({ islandSiteColors: true }).islandSiteColors, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'islandSiteColors'),
    false
  );
});

test('a malformed stored value falls back to on', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-site-colors-'));
  t.after(() => removeUserData(userData));
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ islandSiteColors: 'off' }));
  assert.equal(loadSettings(userData).getSettings().islandSiteColors, true);
});

const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const serializeSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('serializeTabs could be lifted from main.js', () => {
  assert.ok(serializeSource, 'serializeTabs not found in main.js — update this test with it');
});

const { connectionFor, committedUrlOf, shieldChipState } = require('../../src/main/shield-model');

function runSerializeTabs(tab, islandSiteColors) {
  const sandbox = {
    blockingProviders: null,
    settings: { getSettings: () => ({ adblockEnabled: true, adblockExceptions: [], islandSiteColors }) },
    rt: () => ({ tabOrder: [tab.id] }),
    tabs: new Map([[tab.id, tab]]),
    isHostnameExcepted: () => false,
    shieldChipState, connectionFor, committedUrlOf,
    mainI18n: { t: require('../support/english-t').englishT },
    buildSiteInfo: () => ({ state: 'secure' }),
    liveContents: () => null,
    certificateObserver: { get: () => null },
  };
  vm.runInNewContext(`${serializeSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn()[0];
}

const TINTED = {
  id: 'tinted', url: 'https://example.com/', isLoading: false, blockedCount: 0,
  asleep: false, view: null, pageBg: '#ff8800', themeColor: '#112233',
};

test('site colors reach the strip only while Match site colors is on', () => {
  const on = runSerializeTabs({ ...TINTED }, true);
  assert.equal(on.pageBg, '#ff8800');
  assert.equal(on.themeColor, '#112233');
  const off = runSerializeTabs({ ...TINTED }, false);
  assert.equal(off.pageBg, null);
  assert.equal(off.themeColor, null);
});

test('main stops sampling and re-projects every window when the setting changes', () => {
  const target = mainSource.match(/function activePageTintTarget\(runtime\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(target, 'activePageTintTarget not found in main.js');
  assert.match(target, /if \(!settings\.getSettings\(\)\.islandSiteColors\) return null/);
  assert.match(mainSource, /s\.islandSiteColors !== lastIslandSiteColors[\s\S]{0,400}forEachWindowRuntime/);
});

test('Settings offers the toggle and removes it where unsupported', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/settings.html'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'src/renderer/pages/settings.js'), 'utf8');
  assert.match(html, /id="islandSiteColorsSetting"[\s\S]*?<input id="islandSiteColors" type="checkbox"/);
  assert.match(page, /if \(supports\('islandSiteColors'\)\)/);
  assert.match(page, /getElementById\('islandSiteColorsSetting'\)\?\.remove\(\)/);
});
