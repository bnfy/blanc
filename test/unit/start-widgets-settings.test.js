'use strict';

// The Start Page's widget choice is device-local (`newtabWidgets`), written
// only by setNewtabWidgets(), and filled once from the synced old layout.
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

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-start-widgets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Real profiles carry the presentation reset stamp; without it the load path
// resets newtabLayout to Billboard before the widget migration reads it.
// Reading the constant touches no store (ensureStore is lazy).
const RESET_STAMP = loadSettings(os.tmpdir()).PRESENTATION_DEFAULTS_RESET_VERSION;

function open(dir, stored) {
  if (stored !== undefined && stored.presentationDefaultsResetVersion === undefined) {
    stored = { ...stored, presentationDefaultsResetVersion: RESET_STAMP };
  }
  if (stored !== undefined) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(stored));
  return loadSettings(dir);
}

const readFile = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));

test('a new profile starts with no widgets and six shortcuts', (t) => {
  const settings = open(tempDir(t));
  const widgets = settings.getNewtabWidgets();
  assert.equal(widgets.favorites, false);
  assert.equal(widgets.devices, false);
  assert.equal(widgets.shortcutCount, 6);
  settings.flushSettings();
});

test('a Ledger profile gets Favorites and Other devices, once, and the layout stays', (t) => {
  const dir = tempDir(t);
  let settings = open(dir, { onboardingVersion: 1, newtabLayout: 'ledger' });
  assert.equal(settings.getNewtabWidgets().favorites, true);
  assert.equal(settings.getNewtabWidgets().devices, true);
  assert.equal(settings.getSettings().newtabLayout, 'ledger');
  settings.flushSettings();
  assert.equal(readFile(dir).newtabWidgets.v, 1, 'the migration is written to disk');

  // A later sync changing the old layout does not rerun the migration.
  const stored = readFile(dir);
  stored.newtabLayout = 'billboard';
  settings = open(dir, stored);
  assert.equal(settings.getNewtabWidgets().devices, true);
  settings.flushSettings();
});

test('Shelf turns into Favorites and twelve shortcuts, Tally into Favorites', (t) => {
  let settings = open(tempDir(t), { onboardingVersion: 1, newtabLayout: 'shelf' });
  assert.equal(settings.getNewtabWidgets().favorites, true);
  assert.equal(settings.getNewtabWidgets().shortcutCount, 12);
  settings.flushSettings();
  settings = open(tempDir(t), { onboardingVersion: 1, newtabLayout: 'tally' });
  assert.equal(settings.getNewtabWidgets().favorites, true);
  assert.equal(settings.getNewtabWidgets().devices, false);
  settings.flushSettings();
});

test('a damaged saved value loads cleaned, and other settings survive', (t) => {
  const settings = open(tempDir(t), {
    onboardingVersion: 1, newtabLayout: 'tally', theme: 'dark',
    newtabWidgets: { favorites: 'yes', devices: true, chart: true, shortcutCount: 99, sizes: { devices: 999 } },
  });
  const widgets = settings.getNewtabWidgets();
  assert.equal(widgets.favorites, false, 'a saved value is not migrated again');
  assert.equal(widgets.devices, true);
  assert.equal(widgets.shortcutCount, 6);
  assert.deepEqual(widgets.sizes, {});
  assert.equal('chart' in widgets, false);
  assert.equal(settings.getSettings().theme, 'dark');
  assert.equal(settings.getSettings().newtabLayout, 'tally');
  settings.flushSettings();
});

test('setNewtabWidgets saves a cleaned value and tells listeners', (t) => {
  const dir = tempDir(t);
  const settings = open(dir);
  let heard = 0;
  settings.onSettingsChanged(() => { heard += 1; });
  const saved = settings.setNewtabWidgets({ favorites: true, shortcutCount: 9, panels: ['x'] });
  assert.equal(saved.favorites, true);
  assert.equal(saved.shortcutCount, 9);
  assert.equal('panels' in saved, false);
  assert.equal(heard, 1);
  assert.deepEqual(settings.getNewtabWidgets(), saved);
  settings.flushSettings();
  assert.equal(readFile(dir).newtabWidgets.shortcutCount, 9);
});

test('setSettings cannot write the widgets, and they never sync', (t) => {
  const settings = open(tempDir(t));
  settings.setSettings({ newtabWidgets: { favorites: true } });
  assert.equal(settings.getNewtabWidgets().favorites, false);
  settings.setNewtabWidgets({ favorites: true });
  assert.equal('newtabWidgets' in settings.exportForSync().values, false);
  settings.flushSettings();
});

test('the value handed out cannot change the stored one', (t) => {
  const settings = open(tempDir(t));
  const widgets = settings.getNewtabWidgets();
  widgets.favorites = true;
  widgets.place.left.length = 0;
  assert.equal(settings.getNewtabWidgets().favorites, false);
  assert.deepEqual(settings.getNewtabWidgets().place.left, ['favorites', 'devices']);
  settings.flushSettings();
});
