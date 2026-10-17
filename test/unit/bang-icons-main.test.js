'use strict';

// How main.js wires site icons into the ⌘L panel's bang rows: read from
// source, as the wiring sits inside main.js. Design:
// docs/superpowers/specs/2026-10-17-bang-icons-in-app-design.md.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '../..');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const testHook = fs.readFileSync(path.join(ROOT, 'src/main/test-hook.js'), 'utf8');

const fn = (name) => {
  const source = main.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`))?.[0];
  assert.ok(source, `${name} not found in main.js`);
  return source;
};

test('chrome:bang-icons is a trusted chrome invoke answered by bangIconsFor', () => {
  assert.match(main, /chromeHandle\('chrome:bang-icons', \(_event, hosts\) => bangIconsFor\(hosts\)\)/);
});

test('bangIconsFor decides private from main\'s tab model and writes nothing then', () => {
  const body = fn('bangIconsFor');
  assert.match(body, /tabs\.get\(rt\(\)\.activeTabId\)\?\.private === true/);
  assert.match(body, /settings\.isFirstRunComplete\(\)/);
  assert.match(body, /if \(!privateActive\) bangIcons\.touch\(/);
  assert.match(body, /\.slice\(0, MAX_BANG_ICON_HOSTS\)/);
});

test('icons saved from visits come first and never come from private tabs', () => {
  const body = fn('visitIconLookup');
  assert.match(body, /history\.siteIconsByKey\(\)/);
  assert.match(body, /bookmarks\.listBookmarks\(\)/);
  assert.match(body, /if \(tab\.profileId !== profileId \|\| tab\.private \|\| !tab\.favicon\) continue;/);
});

test('one ask builds the visit-icon index once, not once per host', () => {
  const body = fn('bangIconsFor');
  assert.equal(body.match(/visitIconLookup\(\)/g)?.length, 1);
  const loop = body.slice(body.indexOf('for (const host of wanted)'));
  assert.doesNotMatch(loop, /visitIconLookup\(\)|history\.|bookmarks\./);
});

test('every recent-bangs clear also clears bang icons', () => {
  assert.equal(main.match(/settings\.clearRecentBangs\(\)/g).length, 1);
  const body = fn('clearRecentBangsAndIcons');
  assert.match(body, /settings\.clearRecentBangs\(\);\s*bangIcons\.clear\(\);/);
  // The test hook's reset goes through the same path, so overlays drop the
  // icons they hold between scenarios too.
  assert.match(testHook, /clearRecentBangsAndIcons\(\);\s*bangIcons\.resetForTest\(\);/);
  assert.doesNotMatch(testHook, /settings\.clearRecentBangs\(\)/);
});

test('the bang icon store is device scope and never synced or reported', () => {
  assert.match(main, /new JsonStore\('bang-icons', \{ records: \[\] \}\)/);
  for (const file of ['src/main/sync.js', 'src/main/telemetry.js', 'src/main/tabicons.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), /bang-icons|bangIcons/, file);
  }
});

test('only overlay views receive bang icon changes', () => {
  assert.match(main, /overlayView\.webContents\.send\('bang-icons:changed', \{ host, icon \}\)/);
  assert.doesNotMatch(main, /window\.webContents\.send\('bang-icons:changed'/);
});

test('acceptance test mode never reaches the network for bang icons', () => {
  assert.match(main, /if \(acceptanceTestMode\) bangIcons\.setFetcherForTest\(async \(\) => null\);/);
});

test('clearing history withdraws every icon the overlays were given', () => {
  assert.match(fn('bangIconsFor'), /for \(const answer of answers\) bangIconHostsShown\.add\(answer\.host\);/);
  const body = fn('clearRecentBangsAndIcons');
  assert.match(body, /for \(const host of bangIconHostsShown\) broadcastBangIcon\(host, null\);/);
  assert.match(body, /bangIconHostsShown\.clear\(\);/);
});
