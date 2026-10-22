'use strict';

// Floating Glance: the card's chrome is the strip document again on its own
// host, in a window-owned view just below the Glance page's view. The page
// view sits inside the card, below the header.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME_GLANCE_URL, chromeResourcePath } = require('../../src/main/chrome-protocol');
const { glanceLayoutPayload } = require('../../src/main/glance-focus');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const main = read('src/main/main.js');
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} not found`);
  return source.slice(from, to);
};

test('the glance host serves exactly the strip document', () => {
  assert.equal(CHROME_GLANCE_URL, 'blanc-chrome://glance/');
  assert.equal(chromeResourcePath(CHROME_GLANCE_URL), path.join(ROOT, 'src/renderer/index.html'));
  assert.equal(chromeResourcePath('blanc-chrome://glance/renderer.js'), path.join(ROOT, 'src/renderer/renderer.js'));
  assert.equal(chromeResourcePath('blanc-chrome://glance/overlay.js'), null);
});

test('the glance document gets the chrome bridge', () => {
  assert.match(read('src/main/preload.js'), /TRUSTED_CHROME_DOCUMENTS = new Set\(\[[^\]]*'blanc-chrome:\/\/glance\/'/);
  assert.ok(JSON.parse(read('browser-api/contract.json')).surfaces.includes('blanc-chrome://glance/'));
  assert.match(between(main, 'function isTrustedChromeSender(', 'function chromeHandle('), /liveGlanceCardView\(rt\(\)\)[\s\S]*?url: CHROME_GLANCE_URL/);
});

test('the card view is window-owned for life and hides instead of leaving', () => {
  const ensure = between(main, 'function ensureGlanceCardView(', '\n}\n');
  assert.match(ensure, /lockPrivilegedNavigation\(contents, CHROME_GLANCE_URL\)/);
  assert.match(ensure, /view\.setVisible\(false\)/);
  assert.match(ensure, /contents\.loadURL\(CHROME_GLANCE_URL\)/);
  assert.match(main, /destroyGlanceCardView\(runtime\);/);
});

test('every strip broadcast also reaches the card', () => {
  assert.match(between(main, 'function stripSurfaces(runtime) {', 'function restackAboveIslandFloat('), /liveGlanceCardView\(runtime\)\?\.webContents\.send\(channel, \.\.\.args\)/);
});

test('the main page keeps the whole page area; the Glance page sits inside the card', () => {
  const resize = between(main, 'function resizeActiveView() {', 'syncSplitCornerTabs(split, place);');
  assert.match(resize, /tab\.view\.setBounds\(place\(layout\.pageBounds\)\)/);
  // The card is fixed to the window: only the main page slides with the Island.
  assert.match(resize, /glanceTab\.view\.setBounds\(card\.page\)/);
  assert.match(resize, /cardView\.setBounds\(card\.chrome\)/);
});

test('the card sits just above the main page and below the Glance page', () => {
  const restack = between(main, 'function restackAboveTabViews() {', '\n}\n');
  assert.match(restack, /restackGlanceCard\(\);[\s\S]*addChildView\(sheet\.view\)/);
  const card = between(main, 'function restackGlanceCard(', '\n}\n');
  assert.match(card, /addChildView\(cardView\);\s+rt\(\)\.window\.contentView\.addChildView\(glanceTab\.view\);/);
});

test('the layout payload carries the card, the focused pane and the card generation', () => {
  const card = { chrome: { x: 0, y: 0, width: 1, height: 1 }, header: { x: 0, y: 0, width: 1, height: 1 }, page: { x: 0, y: 0, width: 1, height: 1 } };
  assert.deepEqual(glanceLayoutPayload(card, 'glance', 3), { card, focusedPane: 'glance', generation: 3 });
  assert.deepEqual(glanceLayoutPayload(card, 'main', 0).focusedPane, 'main');
  assert.equal(glanceLayoutPayload(null, 'main', 0), null);
});

test('the renderer becomes the glance surface on its host and reports no geometry', () => {
  const js = read('src/renderer/renderer.js');
  assert.match(js, /const glanceSurface = window\.location\.hostname === 'glance';/);
  assert.match(js, /if \(glanceSurface\) document\.documentElement\.dataset\.surface = 'glance';/);
  assert.match(js, /const copySurface = floatSurface \|\| glanceSurface;/);
  assert.doesNotMatch(js, /if \(floatSurface\) return;/);
});
