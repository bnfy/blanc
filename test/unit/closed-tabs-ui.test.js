'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('closed-tab recovery tiers remain internal implementation detail', () => {
  const overlay = read('src/renderer/overlay.js');
  const policy = read('src/main/closed-tabs.js');
  assert.doesNotMatch(overlay, /textContent\s*=\s*['"]held['"]/);
  assert.doesNotMatch(overlay, /entry\.tier/);
  assert.doesNotMatch(policy, /tier:\s*e\.view/);
});

test('closed-tab rows can forget one entry or clear the undo list', () => {
  const overlay = read('src/renderer/overlay.js');
  const preload = read('src/main/preload.js');
  const main = read('src/main/main.js');
  assert.match(overlay, /browserAPI\.forgetClosedEntry\(entry\.id\)/);
  assert.match(overlay, /browserAPI\.clearClosedEntries\(\)/);
  assert.match(preload, /tabs:forget-closed-entry/);
  assert.match(preload, /tabs:clear-closed/);
  assert.match(main, /chromeHandle\('tabs:forget-closed-entry'/);
  assert.match(main, /chromeHandle\('tabs:clear-closed'/);
  assert.match(main, /if \(entry\.view\) downgradeHeldEntry\(entry\)/);
});

test('every closed entry gets a bounded undo lifetime', () => {
  const main = read('src/main/main.js');
  assert.match(
    main,
    /entry\.expiryTimer = setTimeout[\s\S]*forgetClosedEntry\(entry\.id\)[\s\S]*CLOSED_ENTRY_TTL_MS/
  );
});
