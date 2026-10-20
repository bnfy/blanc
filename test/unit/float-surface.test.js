'use strict';

// The floating Island's views (auto-hide, float style) load the strip's own
// document on its own host. Each shows one element of a full-size replica of
// the strip, offset so it sits where the strip draws it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME_FLOAT_URL, chromeResourcePath } = require('../../src/main/chrome-protocol');

const ROOT = path.join(__dirname, '..', '..');
const renderer = path.join(ROOT, 'src/renderer');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the float host serves exactly the strip document', () => {
  assert.equal(CHROME_FLOAT_URL, 'blanc-chrome://float/');
  assert.equal(chromeResourcePath(CHROME_FLOAT_URL), path.join(renderer, 'index.html'));
  for (const file of ['renderer.js', 'vertical-tabs.js', 'tab-drag.js', 'tab-sections.js', 'space-identity.js', 'styles.css']) {
    assert.equal(chromeResourcePath(`blanc-chrome://float/${file}`), path.join(renderer, file));
  }
  assert.equal(chromeResourcePath('blanc-chrome://float/overlay.js'), null);
  assert.equal(chromeResourcePath('blanc-chrome://float/?role=pill'), null);
});

test('the float document gets the chrome bridge', () => {
  assert.match(read('src/main/preload.js'), /TRUSTED_CHROME_DOCUMENTS = new Set\(\[[^\]]*'blanc-chrome:\/\/float\/'/);
  const contract = JSON.parse(read('browser-api/contract.json'));
  assert.ok(contract.surfaces.includes('blanc-chrome://float/'));
  const events = new Map(contract.members.filter((m) => m.kind === 'event').map((m) => [m.name, m]));
  assert.equal(events.get('onFloatFrame')?.channel, 'chrome:float-frame');
  assert.equal(events.get('onFloatFrame')?.payload, 'FloatFrame');
  assert.equal(events.get('onFloatShown')?.channel, 'chrome:float-shown');
  assert.equal(events.get('onFloatShown')?.payload, 'boolean');
  assert.deepEqual(Object.keys(contract.types.FloatFrame.fields).sort(), ['height', 'role', 'stageWidth', 'width', 'x', 'y']);
});

test('the renderer becomes a float surface on the float host and reports nothing', () => {
  const js = read('src/renderer/renderer.js');
  assert.match(js, /const floatSurface = window\.location\.hostname === 'float';/);
  assert.match(js, /if \(floatSurface\) document\.documentElement\.dataset\.surface = 'float';/);
  // The strip underneath stays the one geometry authority.
  assert.match(js, /const reportLayout = \(\) => \{\s+if \(floatSurface\) return;/);
  assert.match(js, /const reportIslandRect = \(\) => \{\s+if \(floatSurface\) return;/);
  // The page's tint belongs to the strip; a floating element keeps its theme.
  assert.match(js, /function applyStripTint\(tab\) \{\s+if \(floatSurface\) return;/);
});

test('the float surface takes its frame from main and slides in after two frames', () => {
  const js = read('src/renderer/renderer.js');
  const block = js.slice(js.indexOf('if (floatSurface) {'), js.indexOf('// end float surface'));
  assert.ok(block.length > 0, 'one float-surface block');
  assert.match(block, /onFloatFrame\(\(\{ role, x, y, width, height, stageWidth \}\) => \{/);
  assert.match(block, /dataset\.floatRole = role;/);
  for (const name of ['--float-x', '--float-y', '--float-height', '--float-stage-width']) {
    assert.ok(block.includes(`'${name}'`), name);
  }
  assert.match(block, /onFloatShown\(\(shown\) => \{/);
  assert.match(block, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{[\s\S]*?classList\.add\('float-shown'\)/);
  assert.match(block, /classList\.remove\('float-shown'\)/);
});

test('the float surface shows one element, slides the whole view height and drops the rest', () => {
  const css = read('src/renderer/styles.css');
  assert.match(css, /html\[data-surface="float"\],\s*html\[data-surface="float"\] body \{ background: transparent; \}/);
  for (const id of ['verticalTabsRail', 'glanceDivider', 'glanceHeader', 'dragBand']) {
    assert.match(css, new RegExp(`html\\[data-surface="float"\\] #${id}[,\\s{]`), id);
  }
  assert.match(css, /html\[data-surface="float"\] #chrome \{[^}]*left: calc\(-1 \* var\(--float-x\)\);[^}]*top: calc\(-1 \* var\(--float-y\)\);[^}]*width: var\(--float-stage-width\);/);
  // The view starts at the window's top edge: moving the stage up by the
  // view's whole height takes the element, its margin and its shadow above it.
  assert.match(css, /html\[data-surface="float"\] #chrome \{[^}]*transform: translateY\(calc\(-1 \* var\(--float-height\)\)\);/);
  assert.match(css, /html\[data-surface="float"\]\.float-shown #chrome \{[^}]*transform: none;/);
  assert.match(css, /html\[data-surface="float"\] #strip \{[^}]*-webkit-app-region: no-drag;/);
  assert.match(css, /html\[data-surface="float"\]\[data-float-role="pill"\] #islandPill/);
  assert.match(css, /html\[data-surface="float"\]\[data-float-role="controls"\] #windowControls/);
  assert.match(css, /html\[data-surface="float"\]\[data-float-role="menu"\] #mainMenuButton/);
  assert.match(css, /html\[data-surface="float"\] #islandPill \{[^}]*box-shadow: var\(--shadow-island-float\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-surface="float"\] #chrome \{ transition: none; \}/);
});
