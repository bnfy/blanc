'use strict';

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

test('surface style defaults to sunrise, accepts only sunrise|neutral and never syncs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-surface-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().surfaceStyle, 'sunrise');
  assert.equal(settings.setSettings({ surfaceStyle: 'neutral' }).surfaceStyle, 'neutral');
  assert.equal(settings.setSettings({ surfaceStyle: 'gold' }).surfaceStyle, 'neutral');
  assert.equal(settings.setSettings({ surfaceStyle: 'sunrise' }).surfaceStyle, 'sunrise');
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'surfaceStyle'), false);
});

test('a stored unknown surface style reads as sunrise', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-surface-bad-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ surfaceStyle: 7 }));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().surfaceStyle, 'sunrise');
});

test('neutral overrides carry no gold and are served after pages.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages-neutral.css'), 'utf8');
  assert.doesNotMatch(css, /#805d28|#d4ad66|128, 93, 40|212, 173, 102/i);
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pages, /surfaceStyle === 'neutral'[\s\S]*?pages-neutral\.css/);
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
  assert.match(html, /<select id="surfaceStyle"[^>]*>\s*<option value="sunrise"[\s\S]*?<option value="neutral"/);
});
