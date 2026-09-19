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

test('the start-page layout defaults to billboard, validates its enum, and syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-layout-'));
  t.after(async () => {
    // JsonStore writes on a 250 ms debounce; let it finish before removing
    // the isolated directory so a passing test does not emit an ENOENT warning.
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);

  assert.deepEqual(settings.NEWTAB_LAYOUTS, ['ledger', 'billboard', 'shelf', 'tally', 'mahjong']);
  assert.equal(settings.getSettings().newtabLayout, 'billboard');

  const newtabHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/newtab.html'), 'utf8');
  const newtabScript = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/newtab.js'), 'utf8');
  assert.match(newtabHtml, /<body class="ledger-body" data-layout="billboard">/);
  assert.match(newtabScript, /layout:\s*'billboard'/);
  assert.match(newtabScript, /layout:\s*data\.layout \?\? 'billboard'/);
  assert.doesNotMatch(newtabHtml, /<body[^>]*data-layout="mahjong"/);

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

test('a local layout choice outranks a future-dated preference already observed from sync', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-newtab-layout-clock-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);
  const remoteTimestamp = Date.now() + 60_000;
  const remote = {
    values: { newtabLayout: 'mahjong' },
    meta: { newtabLayout: remoteTimestamp },
  };

  settings.mergeFromSync(remote);
  assert.equal(settings.getSettings().newtabLayout, 'mahjong');

  settings.setSettings({ newtabLayout: 'shelf' });
  const local = settings.exportForSync();
  assert.equal(local.values.newtabLayout, 'shelf');
  assert.ok(local.meta.newtabLayout > remoteTimestamp);

  // Pulling the unchanged remote document again must not undo the choice.
  settings.mergeFromSync(remote);
  assert.equal(settings.getSettings().newtabLayout, 'shelf');
});

test('concurrent equal-clock layout choices converge deterministically', (t) => {
  const deviceADir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-layout-device-a-'));
  const deviceBDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-layout-device-b-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(deviceADir, { recursive: true, force: true });
    fs.rmSync(deviceBDir, { recursive: true, force: true });
  });
  const baseTimestamp = Date.now() + 60_000;
  const base = JSON.stringify({
    onboardingVersion: 1,
    presentationDefaultsResetVersion: 1,
    newtabLayout: 'mahjong',
    _syncMeta: { newtabLayout: baseTimestamp },
    _syncTieBreakers: { newtabLayout: 'base-write' },
  });
  fs.writeFileSync(path.join(deviceADir, 'settings.json'), base);
  fs.writeFileSync(path.join(deviceBDir, 'settings.json'), base);

  const deviceA = loadSettings(deviceADir);
  deviceA.setSettings({ newtabLayout: 'shelf' });
  const deviceAPayload = deviceA.exportForSync();

  const deviceB = loadSettings(deviceBDir);
  deviceB.setSettings({ newtabLayout: 'billboard' });
  const deviceBPayload = deviceB.exportForSync();

  assert.equal(deviceAPayload.meta.newtabLayout, baseTimestamp + 1);
  assert.equal(deviceBPayload.meta.newtabLayout, baseTimestamp + 1);
  assert.notEqual(
    deviceAPayload.tieBreakers.newtabLayout,
    deviceBPayload.tieBreakers.newtabLayout,
  );

  deviceA.mergeFromSync(deviceBPayload);
  deviceB.mergeFromSync(deviceAPayload);

  assert.deepEqual(deviceA.exportForSync(), deviceB.exportForSync());
  assert.equal(deviceA.getSettings().newtabLayout, deviceB.getSettings().newtabLayout);
});

test('unsafe remote timestamps are ignored and never re-exported', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-layout-invalid-clock-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
    onboardingVersion: 1,
    presentationDefaultsResetVersion: 1,
    newtabLayout: 'billboard',
    _syncMeta: { newtabLayout: Number.MAX_SAFE_INTEGER },
  }));
  const settings = loadSettings(userData);
  const invalidRemotes = [
    1e100,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER - 1,
    '999999999999999999999',
  ];

  for (const timestamp of invalidRemotes) {
    settings.mergeFromSync({
      values: { newtabLayout: 'mahjong' },
      meta: { newtabLayout: timestamp },
      tieBreakers: { newtabLayout: 'remote-write' },
    });
    assert.equal(settings.getSettings().newtabLayout, 'billboard');
  }
  assert.equal(settings.exportForSync().meta.newtabLayout, undefined);

  settings.setSettings({ newtabLayout: 'shelf' });
  const local = settings.exportForSync();
  assert.equal(local.values.newtabLayout, 'shelf');
  assert.ok(Number.isSafeInteger(local.meta.newtabLayout));

  settings.mergeFromSync({
    values: { newtabLayout: 'mahjong' },
    meta: { newtabLayout: 1e100 },
    tieBreakers: { newtabLayout: 'remote-write' },
  });
  assert.equal(settings.getSettings().newtabLayout, 'shelf');
});

const settingsSchema = require('../../settings-schema/schema.json');

test('the layout enum reaches the schema and both generated mobile artifacts', () => {
  assert.deepEqual(settingsSchema.newtabLayouts, ['ledger', 'billboard', 'shelf', 'tally', 'mahjong']);
  assert.equal(settingsSchema.defaults.newtabLayout, 'billboard');
  assert.equal(settingsSchema.internalDefaults.includes('newtabLayout'), false);
  assert.ok(settingsSchema.settings.some((s) => s.key === 'newtabLayout'));

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  const swift = generated('BlancSettings.swift');
  const kotlin = generated('BlancSettings.kt');

  assert.match(
    swift,
    /public enum BlancNewtabLayout: String, CaseIterable \{ case ledger, billboard, shelf, tally, mahjong \}/
  );
  assert.match(swift, /public static let newtabLayout: BlancNewtabLayout = \.billboard/);
  assert.match(
    kotlin,
    /enum class BlancNewtabLayout\(val id: String\) \{ LEDGER\("ledger"\), BILLBOARD\("billboard"\), SHELF\("shelf"\), TALLY\("tally"\), MAHJONG\("mahjong"\) \}/
  );
  assert.match(kotlin, /val newtabLayout = BlancNewtabLayout\.BILLBOARD/);
});

test('Settings offers every supported start-page layout', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'),
    'utf8'
  );

  for (const layout of settingsSchema.newtabLayouts) {
    assert.match(
      html,
      new RegExp(`<option value="${layout}">${layout}</option>`),
      `missing Settings option for ${layout}`
    );
  }
});

test('privacy choices re-save after first run completes (tour replay)', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-privacy-resave-'));
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const settings = loadSettings(userData);

  // First run: invalid choices are rejected before anything persists.
  assert.equal(
    settings.completeFirstRunPrivacyChoices({ searchSuggestions: 'yes' }).completed,
    false
  );
  const first = settings.completeFirstRunPrivacyChoices({
    searchSuggestions: true,
    usagePing: true,
  });
  assert.equal(first.completed, true);
  assert.equal(settings.isFirstRunComplete(), true);

  // A welcome-tour replay edits the SAME choices; the write must land even
  // though first run is already complete — and still validate its inputs.
  assert.equal(
    settings.completeFirstRunPrivacyChoices({ searchSuggestions: false }).completed,
    false
  );
  const replay = settings.completeFirstRunPrivacyChoices({
    searchSuggestions: false,
    usagePing: false,
  });
  assert.equal(replay.completed, true);
  assert.equal(settings.getSettings().searchSuggestions, false);
  assert.equal(settings.getSettings().usagePing, false);
  assert.equal(settings.isFirstRunComplete(), true);
});
