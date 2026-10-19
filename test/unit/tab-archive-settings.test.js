const assert = require('node:assert/strict');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');
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

test('tab archiving defaults to off, validates its enum, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-archive-'));
  t.after(() => removeUserData(userData));
  const settings = loadSettings(userData);

  assert.deepEqual(settings.TAB_ARCHIVE_DELAYS, ['off', '12h', '1d', '7d', '30d']);
  assert.equal(settings.getSettings().tabArchive, 'off');

  assert.equal(settings.setSettings({ tabArchive: '7d' }).tabArchive, '7d');
  assert.equal(settings.setSettings({ tabArchive: '30d' }).tabArchive, '30d');
  assert.equal(settings.setSettings({ tabArchive: '1h' }).tabArchive, '30d');
  assert.equal(settings.setSettings({ tabArchive: 86400000 }).tabArchive, '30d');
  assert.equal(settings.setSettings({ tabArchive: null }).tabArchive, '30d');

  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'tabArchive'),
    false
  );
});

test('a stored unknown archive delay reads back as off', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-archive-'));
  t.after(() => removeUserData(userData));
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ tabArchive: 'forever' }));
  const settings = loadSettings(userData);
  assert.equal(settings.getSettings().tabArchive, 'off');
});

const settingsSchema = require('../../settings-schema/schema.json');

test('every archive delay id has a policy duration', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-archive-'));
  t.after(() => removeUserData(userData));
  const settings = loadSettings(userData);
  const { TAB_ARCHIVE_DELAY_MS } = require('../../src/main/tab-archive');
  assert.deepEqual(Object.keys(TAB_ARCHIVE_DELAY_MS), settings.TAB_ARCHIVE_DELAYS);
});

// F52 is desktop-only (parity matrix: N/A on mobile), so the key is an
// allowlisted desktop default, not a mobile-parity setting.
test('the archive setting is a desktop-only default, not a mobile-parity setting', () => {
  assert.ok(settingsSchema.internalDefaults.includes('tabArchive'));
  assert.equal(settingsSchema.settings.some((s) => s.key === 'tabArchive'), false);
  assert.equal('tabArchiveDelays' in settingsSchema, false);
});

test('the Settings row sits under Quiet inactive tabs and exposes exactly the enum', () => {
  const html = withoutInterfaceKeys(fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8'));
  const page = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');

  assert.ok(html.indexOf('id="tabArchiveSetting"') > html.indexOf('id="tabSleepSetting"'));
  const block = html.match(/<div class="setting" id="tabArchiveSetting">[\s\S]*?<\/select>/)?.[0];
  assert.ok(block, 'no #tabArchiveSetting row in settings.html');
  assert.match(block, /<span>Archive inactive tabs<\/span>/);
  assert.match(block, /keeps them in your Archive for 30 days\. Pinned tabs and tab groups are never archived\./);

  const values = [...block.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['off', '12h', '1d', '7d', '30d']);
  const labels = [...block.matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Off', 'After 12 hours', 'After 1 day', 'After 7 days', 'After 30 days']);

  assert.match(page, /if \(supports\('tabArchive'\)\)/);
  assert.match(page, /getElementById\('tabArchiveSetting'\)\?\.remove\(\)/);
});
