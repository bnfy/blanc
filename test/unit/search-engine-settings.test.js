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
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
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

function freshProfile(t, name, stored) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-search-${name}-`));
  t.after(() => {
    for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  if (stored) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboardingVersion: 1, ...stored }));
  return loadSettings(dir);
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const SEARX = 'https://searx.example.org/search?q=%s';
const settingsSchema = require('../../settings-schema/schema.json');

test('Kagi and Custom join the engine list in order, matching the schema', (t) => {
  const settings = freshProfile(t, 'list');
  const ids = ['duckduckgo', 'google', 'bing', 'brave', 'kagi', 'custom'];
  assert.deepEqual(Object.keys(settings.SEARCH_ENGINES), ids);
  assert.deepEqual(settingsSchema.searchEngines.map(({ id }) => id), ids);
  assert.equal(settingsSchema.defaults.searchEngineTemplate, '');
  assert.equal(settings.getSettings().searchEngineTemplate, '');

  settings.setSettings({ searchEngine: 'kagi' });
  assert.deepEqual(
    { id: settings.currentSearchEngine().id, label: settings.currentSearchEngine().label },
    { id: 'kagi', label: 'Kagi' },
  );
  assert.equal(settings.searchUrlFor('rust lifetimes'), 'https://kagi.com/search?q=rust%20lifetimes');
});

test('engine ids that name Object properties are refused', (t) => {
  const settings = freshProfile(t, 'proto');
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(settings.setSettings({ searchEngine: id }).searchEngine, 'duckduckgo', id);
  }
  assert.match(settings.searchUrlFor('q'), /^https:\/\/duckduckgo\.com\//);
});

test('Custom needs a valid address and searches with it', (t) => {
  const settings = freshProfile(t, 'custom');
  assert.equal(settings.setSettings({ searchEngine: 'custom' }).searchEngine, 'duckduckgo');
  assert.equal(
    settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'http://searx.example.org/?q=%s' }).searchEngine,
    'duckduckgo',
  );

  const saved = settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: `  ${SEARX}\n` });
  assert.equal(saved.searchEngine, 'custom');
  assert.equal(saved.searchEngineTemplate, SEARX, 'stored trimmed so the Settings read-back matches');
  assert.equal(settings.searchUrlFor('how tall is everest'), 'https://searx.example.org/search?q=how%20tall%20is%20everest');
  assert.equal(settings.currentSearchEngine().label, 'searx.example.org');
});

test('a bad edit keeps the previous address, and switching away keeps it for later', (t) => {
  const settings = freshProfile(t, 'edit');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });

  assert.equal(settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'https://%s.example/' }).searchEngineTemplate, SEARX);
  assert.equal(settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: '' }).searchEngineTemplate, SEARX);
  assert.equal(settings.getSettings().searchEngine, 'custom');

  const google = settings.setSettings({ searchEngine: 'google' });
  assert.equal(google.searchEngine, 'google');
  assert.equal(google.searchEngineTemplate, SEARX);
  assert.equal(settings.setSettings({ searchEngine: 'custom' }).searchEngine, 'custom');
});

test('a refused address refuses the engine change with it, and stamps nothing', (t) => {
  const settings = freshProfile(t, 'refused-pair');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  settings.setSettings({ searchEngine: 'google' });
  const googleClock = settings.exportForSync().meta.searchEngine;

  // Google is selected and an older valid address is still stored: Custom
  // with a refused address must keep Google, not switch to the old address.
  const refused = settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'https://x.example/?q={searchTerms}' });
  assert.equal(refused.searchEngine, 'google');
  assert.equal(refused.searchEngineTemplate, SEARX);
  assert.equal(settings.exportForSync().meta.searchEngine, googleClock);

  // A refused edit while Custom is selected doesn't re-stamp the engine either.
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const customClock = settings.exportForSync().meta.searchEngine;
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'https://%s.example/' });
  assert.equal(settings.exportForSync().meta.searchEngine, customClock);

  // Other keys in a refused search write still apply.
  assert.equal(settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: 'nope', theme: 'dark' }).theme, 'dark');
});

test('a stored Custom without a valid address, or an unknown id, reads as DuckDuckGo', (t) => {
  const handEdited = freshProfile(t, 'read-custom', {
    searchEngine: 'custom',
    searchEngineTemplate: 'http://searx.example.org/?q=%s',
  });
  assert.equal(handEdited.getSettings().searchEngine, 'duckduckgo');
  assert.equal(handEdited.currentSearchEngine().id, 'duckduckgo');

  const unknown = freshProfile(t, 'read-unknown', { searchEngine: 'altavista' });
  assert.equal(unknown.getSettings().searchEngine, 'duckduckgo');
  assert.match(unknown.searchUrlFor('q'), /^https:\/\/duckduckgo\.com\//);
});

test('the address syncs with the engine choice', (t) => {
  const deviceA = freshProfile(t, 'sync-a');
  deviceA.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const payload = deviceA.exportForSync();
  assert.equal(payload.values.searchEngineTemplate, SEARX);
  assert.ok(payload.meta.searchEngineTemplate > 0);
  assert.ok(payload.meta.searchEngine > 0);

  const deviceB = freshProfile(t, 'sync-b');
  deviceB.mergeFromSync(payload);
  assert.equal(deviceB.getSettings().searchEngine, 'custom');
  assert.equal(deviceB.searchUrlFor('q'), 'https://searx.example.org/search?q=q');
});

test('changing only the engine does not re-stamp the synced address', (t) => {
  const settings = freshProfile(t, 'stamp');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const before = settings.exportForSync().meta.searchEngineTemplate;
  assert.ok(before > 0, 'the address is a synced key');
  settings.setSettings({ searchEngine: 'brave' });
  assert.equal(settings.exportForSync().meta.searchEngineTemplate, before);
});

test('mixed-version sync never breaks search', (t) => {
  const settings = freshProfile(t, 'mixed');
  settings.setSettings({ searchEngine: 'custom', searchEngineTemplate: SEARX });
  const later = Date.now() + 60_000;

  // An older Blanc uploads without the address key: the local address survives.
  settings.mergeFromSync({ values: { searchEngine: 'custom' }, meta: { searchEngine: later } });
  assert.equal(settings.getSettings().searchEngineTemplate, SEARX);
  assert.equal(settings.getSettings().searchEngine, 'custom');

  // Custom arrives with an address this device refuses: reads as DuckDuckGo.
  const other = freshProfile(t, 'mixed-refused');
  other.mergeFromSync({
    values: { searchEngine: 'custom', searchEngineTemplate: 'http://searx.example.org/?q=%s' },
    meta: { searchEngine: later, searchEngineTemplate: later },
  });
  assert.equal(other.getSettings().searchEngine, 'duckduckgo');
  assert.match(other.searchUrlFor('q'), /^https:\/\/duckduckgo\.com\//);
});
