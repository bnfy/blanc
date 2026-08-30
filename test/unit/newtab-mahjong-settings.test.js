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

test('newtabMahjong defaults off, validates as boolean, and syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-mahjong-'));
  t.after(async () => {
    // JsonStore writes on a 250 ms debounce; let it finish before removing
    // the isolated directory so a passing test does not emit an ENOENT warning.
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);

  assert.equal(settings.getSettings().newtabMahjong, false);

  assert.equal(settings.setSettings({ newtabMahjong: true }).newtabMahjong, true);
  // Non-boolean writes leave the stored choice alone.
  assert.equal(settings.setSettings({ newtabMahjong: 'yes' }).newtabMahjong, true);
  assert.equal(settings.setSettings({ newtabMahjong: 1 }).newtabMahjong, true);
  assert.equal(settings.setSettings({ newtabMahjong: null }).newtabMahjong, true);
  assert.equal(settings.setSettings({ newtabMahjong: false }).newtabMahjong, false);

  // Synced: present in the export, and a newer remote write flips the value
  // (local is false here, so adopting true proves real adoption).
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'newtabMahjong'),
    true
  );
  settings.mergeFromSync({
    values: { newtabMahjong: true },
    meta: { newtabMahjong: Date.now() + 60_000 },
  });
  assert.equal(settings.getSettings().newtabMahjong, true);
  // A tampered remote value routes through sanitize() and is dropped.
  settings.mergeFromSync({
    values: { newtabMahjong: 'evil' },
    meta: { newtabMahjong: Date.now() + 120_000 },
  });
  assert.equal(settings.getSettings().newtabMahjong, true);
});

test('a corrupted stored newtabMahjong reads back as the default', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-mahjong-corrupt-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify({ newtabMahjong: 'always' })
  );
  const settings = loadSettings(userData);
  assert.equal(settings.getSettings().newtabMahjong, false);
});

const settingsSchema = require('../../settings-schema/schema.json');

test('newtabMahjong reaches the schema and both generated mobile artifacts', () => {
  assert.equal(settingsSchema.defaults.newtabMahjong, false);
  assert.equal(settingsSchema.internalDefaults.includes('newtabMahjong'), false);
  assert.ok(settingsSchema.settings.some((s) => s.key === 'newtabMahjong'));

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  assert.match(generated('BlancSettings.swift'), /public static let newtabMahjong: Bool = false/);
  assert.match(generated('BlancSettings.kt'), /const val newtabMahjong = false/);
});
