'use strict';

// Floating Glance: the remembered card frame is device-local, written only by
// setGlanceFrame(), and a bad stored value loads as "none".
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

function fresh(t, stored) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-glance-frame-'));
  if (stored !== undefined) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(stored));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  return settings;
}

const frame = { x: 0.1, y: 0.05, width: 0.7, height: 0.9 };

test('there is no remembered Glance frame by default', (t) => {
  assert.equal(fresh(t).getSettings().glanceFrame, null);
});

test('setGlanceFrame stores a frame and clears it with null', (t) => {
  const settings = fresh(t);
  assert.equal(settings.setGlanceFrame(frame), true);
  assert.deepEqual(settings.getSettings().glanceFrame, frame);
  assert.equal(settings.setGlanceFrame(null), true);
  assert.equal(settings.getSettings().glanceFrame, null);
});

test('setGlanceFrame refuses anything but four fractions between 0 and 1', (t) => {
  const settings = fresh(t);
  settings.setGlanceFrame(frame);
  for (const bad of [{ ...frame, x: Number.NaN }, { ...frame, x: -1 }, { ...frame, width: 2 }, 'big', { x: 0.1 }]) {
    assert.equal(settings.setGlanceFrame(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual(settings.getSettings().glanceFrame, frame);
});

test('a corrupt stored frame loads as none', (t) => {
  assert.equal(fresh(t, { glanceFrame: { x: 'a' } }).getSettings().glanceFrame, null);
});

test('the generic settings write cannot set the frame, and it never syncs', (t) => {
  const settings = fresh(t);
  settings.setSettings({ glanceFrame: frame });
  assert.equal(settings.getSettings().glanceFrame, null);
  settings.setGlanceFrame(frame);
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'glanceFrame'), false);
});
