'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// A pair link's fragment is a live pairing code (design 2026-10-28 §7.3):
// history keeps the page, never the code.

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-history-pair-link-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};

delete require.cache[require.resolve('../../src/main/store')];
delete require.cache[require.resolve('../../src/main/history')];
const history = require('../../src/main/history');

test.after(() => {
  delete require.cache[require.resolve('../../src/main/history')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

test('addVisit records a pair link without its fragment', () => {
  history.addVisit('https://blanc.day/pair#K7MR4PX2', 'Pair with Blanc');
  const urls = history.listHistory().map((entry) => entry.url);
  assert.ok(urls.includes('https://blanc.day/pair'));
  assert.ok(!urls.some((url) => url.includes('K7MR4PX2')));
});

test('addVisit keeps other fragments', () => {
  history.addVisit('https://example.com/a#b', 'A');
  assert.equal(history.listHistory()[0].url, 'https://example.com/a#b');
});
