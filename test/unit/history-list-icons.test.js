'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-history-list-icons-'));
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

// Production-accepted inert 32×32 PNG from the desktop fixture set.
const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAABr0lEQVR4nLTWsUrDQBgH8O/7cmpr1aFj8Rmq+BSiaAdBqnZQfAlx8EnsIO1UcKhDfQkdbJd20EFBUKgFO0TTXM7vEhDR1ia55JZLLnC/u/93kBPKb57nSSkPj4+a9UZn5iQ3IhcUAYJxEzw7+k0IUT2vZmwcXvaXREG6nwrQXEBeu+5QPxASePC6feG0OpZYVK4EYwN5B9wpTyFpA7WJ/VLNbrUTMWivsm+POA1dBiJiTZHKNyvZjaJ0hygsHlAQv1kPnd5j935zp8TrRAVs6AkRsuWie/vi9J5IZEDHGHMfVnf2dLXjzd0McuUVfWq45okatOBYy1bho9V+K9VB11uHpQ39Ecyz4vPuOdLhetrpGIQ6F+TTkpKhp/CTTcugoEvPoO+nlAz6+ZKGQb/eEzfo71CyBo0dTdCgCeOJGROBpIz/gESMKYC5MR0wNEIBJkZYILYRAYhnRANiGJGBsMZVJbvOxnscIJSBmG8ezJfW8BnOIG7zz4niHDgNzoSTCWrKRnCTg6hFnr4Pxf94DGYPrtVGwBhjqwaOhOAuisY7GGNc3w12GzCS4C+fjS8AAAD///R8eLkAAAAGSURBVAMAqMIc5gOIAroAAAAASUVORK5CYII=';

test.after(() => {
  delete require.cache[require.resolve('../../src/main/history')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

test('history entries carry the cached icon of their site, and only that', () => {
  history.clearHistory();
  history.addVisit('https://github.com/bnfy/blanc', 'Blanc');
  history.addVisit('https://example.com/', 'Example');
  assert.equal(history.cacheSiteIcon('https://github.com/', icon), true);
  const byUrl = Object.fromEntries(history.listHistory().map((entry) => [entry.url, entry.favicon]));
  assert.equal(byUrl['https://github.com/bnfy/blanc'], icon);
  assert.equal(byUrl['https://example.com/'], null);
});
