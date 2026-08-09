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
  t.after(async () => {
    // JsonStore writes on a 250 ms debounce; let it finish before removing
    // the isolated directory so a passing test does not emit an ENOENT warning.
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
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

const settingsSchema = require('../../settings-schema/schema.json');

test('the delay enum reaches the schema and both generated mobile artifacts', () => {
  assert.deepEqual(settingsSchema.tabSleepDelays, ['off', '30m', '1h', '6h']);
  assert.equal(settingsSchema.defaults.tabSleep, '1h');
  assert.equal(settingsSchema.internalDefaults.includes('tabSleep'), false);
  assert.ok(settingsSchema.settings.some((s) => s.key === 'tabSleep'));

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  const swift = generated('BlancSettings.swift');
  const kotlin = generated('BlancSettings.kt');

  assert.match(
    swift,
    /public enum BlancTabSleepDelay: String, CaseIterable \{ case off, m30 = "30m", h1 = "1h", h6 = "6h" \}/
  );
  assert.match(swift, /public static let tabSleep: BlancTabSleepDelay = \.h1/);
  assert.match(
    kotlin,
    /enum class BlancTabSleepDelay\(val id: String\) \{ OFF\("off"\), M30\("30m"\), H1\("1h"\), H6\("6h"\) \}/
  );
  assert.match(kotlin, /val tabSleep = BlancTabSleepDelay\.H1/);
});

test('the Settings row exposes exactly the delay enum and removes itself when unsupported', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
  const page = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');

  const block = html.match(/<div class="setting" id="tabSleepSetting">[\s\S]*?<\/select>/)?.[0];
  assert.ok(block, 'no #tabSleepSetting row in settings.html');
  assert.match(block, /<span>Quiet inactive tabs<\/span>/);
  assert.match(block, /reloads them when you come back to them\./);
  assert.doesNotMatch(block, /resume/i);
  assert.doesNotMatch(block, /asleep/i);

  const values = [...block.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['off', '30m', '1h', '6h']);
  const labels = [...block.matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Off', 'After 30 minutes', 'After 1 hour', 'After 6 hours']);

  assert.match(page, /if \(supports\('tabSleep'\)\)/);
  assert.match(page, /getElementById\('tabSleepSetting'\)\?\.remove\(\)/);
});
