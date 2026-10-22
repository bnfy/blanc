'use strict';

// Settings → Island → Search priority results. Off (the default) keeps the
// Quick Switcher's strong local match on top; on, search rows lead typed
// results. blendedResults is executed, not pattern-matched, against both
// values so either ordering regressing fails here.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const overlay = fs.readFileSync(path.join(root, 'src/renderer/overlay.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/pages/settings.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/renderer/pages/settings.js'), 'utf8');

const blended = overlay.match(/function blendedResults\(query\) \{[\s\S]*?\n  \}/)?.[0];

function runBlended(searchPriorityResults) {
  const local = [
    { kind: 'history', url: 'https://a.test/', score: 2 },
    { kind: 'history', url: 'https://b.test/', score: 2 },
    { kind: 'tab', score: 1.2 },
  ];
  const search = [
    { kind: 'search', query: 'react', exact: true },
    { kind: 'search', query: 'react hooks' },
    { kind: 'search', query: 'react router' },
    { kind: 'search', query: 'react native' },
    { kind: 'search', query: 'react query' },
  ];
  const context = {
    STRONG_MATCH_SCORE: 2,
    searchPriorityResults,
    switcherResults: () => local,
    searchResults: () => search,
  };
  vm.createContext(context);
  vm.runInContext(`${blended}\nthis.result = blendedResults('react');`, context);
  // Copy out of the vm realm so deepStrictEqual compares plain arrays.
  return Array.from(context.result, (r) => r.kind);
}

test('blendedResults could be lifted from overlay.js', () => {
  assert.ok(blended, 'blendedResults not found');
});

test('off keeps a strong local match ahead of search', () => {
  assert.deepEqual(runBlended(false), ['history', 'history', 'tab', 'search', 'search', 'search']);
});

test('on puts search rows ahead of a strong local match', () => {
  assert.deepEqual(runBlended(true), ['search', 'search', 'search', 'search', 'history', 'history']);
});

test('the overlay takes the preference from every overlay:show', () => {
  assert.match(overlay, /onOverlayShow\(\(\{[^}]*searchPriorityResults: searchFirst[^}]*\}\) => \{\s*searchPriorityResults = searchFirst === true;/);
  const sends = main.match(/send\('overlay:show', \{[\s\S]*?\n\s*\}\);/g) || [];
  assert.equal(sends.length, 2);
  for (const send of sends) {
    assert.match(send, /searchPriorityResults: settings\.getSettings\(\)\.searchPriorityResults === true/);
  }
});

test('Settings shows the toggle in the Island card and guards support', () => {
  const island = html.match(/data-i18n="settings\.general\.cards\.island"[\s\S]*?settings\.general\.cards\.appearance/)?.[0] || '';
  assert.match(island, /<div class="setting" id="searchPriorityResultsSetting">/);
  assert.match(html, /id="searchPriorityResults"[^>]*aria-describedby="searchPriorityResultsHint"/);
  assert.match(page, /if \(supports\('searchPriorityResults'\)\)/);
  assert.match(page, /getElementById\('searchPriorityResultsSetting'\)\?\.remove\(\)/);
});

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

test('the setting defaults off, accepts only booleans and never syncs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-search-priority-'));
  const settings = loadSettings(dir);
  t.after(() => { settings.flushSettings(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(settings.getSettings().searchPriorityResults, false);
  assert.equal(settings.setSettings({ searchPriorityResults: true }).searchPriorityResults, true);
  assert.equal(settings.setSettings({ searchPriorityResults: 'no' }).searchPriorityResults, true);
  assert.equal(settings.setSettings({ searchPriorityResults: false }).searchPriorityResults, false);
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'searchPriorityResults'), false);
});
