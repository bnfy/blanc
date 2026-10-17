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
  const styles = read('src/renderer/styles.css');
  const preload = read('src/main/preload.js');
  const main = read('src/main/main.js');
  assert.match(overlay, /browserAPI\.forgetClosedEntry\(entry\.id\)/);
  assert.match(overlay, /browserAPI\.clearClosedEntries\(\)/);
  assert.match(preload, /tabs:forget-closed-entry/);
  assert.match(preload, /tabs:clear-closed/);
  assert.match(main, /chromeHandle\('tabs:forget-closed-entry'/);
  assert.match(main, /chromeHandle\('tabs:clear-closed'/);
  assert.match(main, /if \(entry\.view\) downgradeHeldEntry\(entry\)/);
  assert.match(
    styles,
    /\.closed-clear\s*\{[^}]*font-family:\s*var\(--font-text\)/,
    'the recently-closed clear action uses the UI copy face with the rest of the section',
  );
});

test('every closed entry gets a bounded undo lifetime', () => {
  const main = read('src/main/main.js');
  assert.match(
    main,
    /entry\.expiryTimer = setTimeout[\s\S]*forgetClosedEntry\(entry\.id\)[\s\S]*CLOSED_ENTRY_TTL_MS/
  );
});

test('Recently closed is a band among the groups, not furniture at the bottom', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.doesNotMatch(overlay, /state\.closed \?\? \[\]\)\.slice\(-4\)/, 'the four-entry cap is gone');
  assert.match(overlay, /function closedBand\(/);
  assert.match(overlay, /band\.dataset\.dragSection = 'closed'/);
  const header = overlay.match(/function closedHeaderRow\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(header, /dataset\.dragHeader = ''/);
  assert.match(header, /tabIndex = 0/);
  assert.match(header, /'aria-expanded'/);
  const row = overlay.match(/function closedRow\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(row, /tabIndex = 0/);
  assert.match(row, /closed-row in-group/);
});

test('Recently closed starts folded on every fresh open', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.match(overlay, /if \(!reshow\) \{[\s\S]{0,1500}closedSectionOpen = false;/);
});

test('moving the band goes through moveClosedSection; the island keyboard sees it', () => {
  const overlay = read('src/renderer/overlay.js');
  const move = overlay.match(/async function islandMove\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(move, /moveClosedSection\(intent\.beforeGroupId\)/);
  assert.match(overlay, /keyboardGroupMove\(state, header\.dataset\.groupId, direction, \{ withClosed: true \}\)/);
});

test('the clear action is sentence case, not forced lowercase', () => {
  const styles = read('src/renderer/styles.css');
  const rule = styles.match(/^\.closed-clear \{[^}]*\}/m)?.[0] ?? '';
  assert.ok(rule, 'the .closed-clear rule exists');
  assert.doesNotMatch(rule, /text-transform/);
  assert.doesNotMatch(rule, /letter-spacing/);
});
