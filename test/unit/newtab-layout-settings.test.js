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

test('the start-page layout defaults to ledger, validates its enum, and syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-layout-'));
  t.after(async () => {
    // JsonStore writes on a 250 ms debounce; let it finish before removing
    // the isolated directory so a passing test does not emit an ENOENT warning.
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);

  assert.deepEqual(settings.NEWTAB_LAYOUTS, ['ledger', 'billboard', 'shelf', 'tally']);
  assert.equal(settings.getSettings().newtabLayout, 'ledger');

  assert.equal(settings.setSettings({ newtabLayout: 'billboard' }).newtabLayout, 'billboard');
  assert.equal(settings.setSettings({ newtabLayout: 'tally' }).newtabLayout, 'tally');
  // Anything outside the enum leaves the stored choice alone.
  assert.equal(settings.setSettings({ newtabLayout: 'marquee' }).newtabLayout, 'tally');
  assert.equal(settings.setSettings({ newtabLayout: 42 }).newtabLayout, 'tally');
  assert.equal(settings.setSettings({ newtabLayout: null }).newtabLayout, 'tally');

  // Unlike the device-local tab presentation settings, the start-page layout
  // is a preference in the same class as the theme: it travels with you.
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'newtabLayout'),
    true
  );
});

const settingsSchema = require('../../settings-schema/schema.json');

test('the layout enum reaches the schema and both generated mobile artifacts', () => {
  assert.deepEqual(settingsSchema.newtabLayouts, ['ledger', 'billboard', 'shelf', 'tally']);
  assert.equal(settingsSchema.defaults.newtabLayout, 'ledger');
  assert.equal(settingsSchema.internalDefaults.includes('newtabLayout'), false);
  assert.ok(settingsSchema.settings.some((s) => s.key === 'newtabLayout'));

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  const swift = generated('BlancSettings.swift');
  const kotlin = generated('BlancSettings.kt');

  assert.match(
    swift,
    /public enum BlancNewtabLayout: String, CaseIterable \{ case ledger, billboard, shelf, tally \}/
  );
  assert.match(swift, /public static let newtabLayout: BlancNewtabLayout = \.ledger/);
  assert.match(
    kotlin,
    /enum class BlancNewtabLayout\(val id: String\) \{ LEDGER\("ledger"\), BILLBOARD\("billboard"\), SHELF\("shelf"\), TALLY\("tally"\) \}/
  );
  assert.match(kotlin, /val newtabLayout = BlancNewtabLayout\.LEDGER/);
});
