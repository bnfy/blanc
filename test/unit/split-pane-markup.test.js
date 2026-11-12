'use strict';

// Split View (F53, spec D9) pane cards, dividers and corner tabs: the cards
// are decorative, the divider is a named separator, geometry rides CSS custom
// properties (no inline left/top/width/height), no markup goes through
// innerHTML, and the corner tab document is static.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
const cornerHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/split-tab.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const block = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} not found`);
  return source.slice(from, to);
};
const split = block(renderer, '// ---- Split View (F53, spec D9): pane cards and dividers', '// The reference header reuses');

test('cards are decorative; the divider is a named separator', () => {
  assert.match(split, /el\.className = 'split-pane-frame';\n\s*el\.dataset\.tabId = tabId;\n\s*el\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(split, /setAttribute\('aria-label', blancI18n\.t\('split\.dividerLabel'\)\)/);
  assert.match(split, /setAttribute\('role', 'separator'\)/);
  assert.doesNotMatch(split, /split-pane-header/, 'no pane header bands any more');
});

test('geometry rides CSS custom properties, never inline box properties', () => {
  assert.doesNotMatch(split, /style\.(left|top|width|height)\s*=/);
  assert.match(split, /style\.setProperty\('--split-x'/);
  assert.match(css, /left: var\(--split-x, 0\);/);
});

test('the pane block writes no markup through innerHTML', () => {
  assert.doesNotMatch(split, /innerHTML/);
});

test('the corner tab is static markup; main writes its text as text', () => {
  assert.doesNotMatch(cornerHtml, /<script/i);
  for (const id of ['tab', 'icon', 'globe', 'site', 'close']) assert.match(cornerHtml, new RegExp(`id="${id}"`));
  const paint = block(main, 'async function paintSplitCorner', '\n}\n');
  assert.match(paint, /site\.textContent = m\.site;/);
  assert.doesNotMatch(paint, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(paint, /JSON\.stringify\(model\)/, 'the model reaches the view as plain data');
});

test('a corner tab view never takes a preload, and its labels come from the catalog', () => {
  const ensure = block(main, 'function ensureSplitCornerView', '\n}\n');
  assert.doesNotMatch(ensure, /preload/);
  assert.match(ensure, /partition: CHROME_PARTITION/);
  assert.match(ensure, /lockPrivilegedNavigation\(view\.webContents, CHROME_SPLIT_TAB_URL\)/);
  const model = block(main, 'function splitCornerModel', '\n}\n');
  assert.match(model, /mainI18n\.t\('split\.cornerLabel'/);
  assert.match(model, /mainI18n\.t\('tabMenu\.removeFromSplit'\)/);
});

test('the chrome document has the pane container and the Glance header offers Keep as split', () => {
  assert.match(html, /<div id="splitPanes" class="split-panes no-drag" hidden><\/div>/);
  assert.match(html, /id="glanceKeepSplit"[^>]*data-i18n-aria-label="split\.keepAsSplit"/);
});

test('the corner tab border runs straight from each fillet into the tab', () => {
  // Under the fillets the tab's own border closed each curve into an extra
  // corner: the fillets paint above it, and the tab's top and left borders sit
  // on the fillets' last ring row and column.
  assert.match(css, /\.split-tab \{\s+position: absolute;\s+left: calc\(var\(--split-pane-radius\) - 1px\);\s+top: calc\(var\(--split-pane-radius\) - 1px\);/);
  assert.match(css, /\.split-tab-fillet \{\s+position: absolute;\s+z-index: 1;/);
});
