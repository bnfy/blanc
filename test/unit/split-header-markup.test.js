'use strict';

// Split View (F53) pane headers and dividers: every control has an
// accessible name from the catalog, geometry rides CSS custom properties
// (no inline left/top/width/height), and messages never go through innerHTML.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
const block = (start, end) => {
  const from = renderer.indexOf(start);
  const to = renderer.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} not found in renderer.js`);
  return renderer.slice(from, to);
};
const split = block('// ---- Split View (F53): pane headers and dividers', '// The reference header reuses');

test('every pane header button is named from the catalog', () => {
  for (const key of ['pill.back', 'pill.reload', 'split.headerMenu', 'tabMenu.removeFromSplit']) {
    assert.match(split, new RegExp(`'${key.replace('.', '\\.')}'`), `${key} labels a header control`);
  }
  assert.match(split, /setAttribute\('aria-label', blancI18n\.t\(labelKey\)\)/);
  assert.match(split, /blancI18n\.t\('split\.paneLabel'/);
  assert.match(split, /setAttribute\('aria-label', blancI18n\.t\('split\.dividerLabel'\)\)/);
  assert.match(split, /setAttribute\('role', 'separator'\)/);
});

test('geometry rides CSS custom properties, never inline box properties', () => {
  assert.doesNotMatch(split, /style\.(left|top|width|height)\s*=/);
  assert.match(split, /style\.setProperty\('--split-x'/);
  assert.match(css, /left: var\(--split-x, 0\);/);
});

test('innerHTML only ever carries a fixed glyph, never a message', () => {
  for (const line of split.split('\n').filter((l) => l.includes('innerHTML'))) {
    assert.match(line, /innerHTML = (icon|PILL_ICONS\[mode\]);/, line.trim());
  }
});

test('the chrome document has the pane container and the Glance header offers Keep as split', () => {
  assert.match(html, /<div id="splitPanes" class="split-panes no-drag" hidden><\/div>/);
  assert.match(html, /id="glanceKeepSplit"[^>]*data-i18n-aria-label="split\.keepAsSplit"/);
});
