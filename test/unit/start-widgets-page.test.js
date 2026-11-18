'use strict';

// The Start Page's widget code (newtab.js), from the branch review: the
// columns' inset is the resolved token, group chips share the tiles' room, a
// press that moves nothing saves nothing, and only a failed shortcut write
// re-reads. The layouts themselves are measured by newtab-layouts.feature
// (F35-17) and test/desktop/start-widgets-smoke.mjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const js = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/newtab.js'), 'utf8');
const body = (name) => js.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';

test('the columns\' inset is laid out, not parsed from a clamp()', () => {
  const rows = body('layoutShortcutRows');
  assert.doesNotMatch(rows, /getPropertyValue\('--start-edge'\)/);
  assert.match(rows, /const edge = resolvedStartEdge\(\);/);
  assert.match(body('resolvedStartEdge'), /width:var\(--start-edge\)/);
});

test('tab-group chips wrap in the room the tiles have beside the columns', () => {
  assert.match(body('layoutShortcutRows'), /groups\.style\.maxWidth = stacked \|\| room === Infinity \? '' : /);
});

test('a grip press that moves nothing saves and announces nothing', () => {
  const grip = body('bindGrip');
  assert.match(grip, /from: \{ left: railOrder\(cardRails\.left\), right: railOrder\(cardRails\.right\) \}/);
  assert.match(grip, /if \(same\(from\.left, railOrder\(cardRails\.left\)\) && same\(from\.right, railOrder\(cardRails\.right\)\)\) \{ refreshRails\(\); return; \}/);
});

test('a resize-edge click changes nothing, and a double-click fits the column', () => {
  const edge = body('addResizeEdge');
  assert.match(edge, /if \(samples\.every\(\(sample\) => Math\.abs\(sample\.y - startY\) < 3\)\) \{/);
  assert.match(edge, /addEventListener\('dblclick', \(\) => \{ cardSpring\.get\(card\)\?\.cancel\(\); saveCardSize\(card, 0\); \}\)/);
});

test('only a failed shortcut write re-reads the widgets', () => {
  const step = body('stepShortcuts');
  assert.doesNotMatch(step, /finally/);
  assert.match(step, /catch \{[\s\S]*?refreshWidgets\(\);\s*\}/);
});

// Customize (owner, 2026-11-18): sized to its content, never over the clock
// or the line under it at any point, and scrolling inside when it needs more.
test('Customize is capped to the room under the clock, with no floor', () => {
  const fit = body('fitCustomizeBelowClock');
  assert.doesNotMatch(fit, /Math\.max\(260/);
  assert.match(fit, /popover\.style\.maxHeight = `\$\{Math\.max\(0, Math\.floor\(room\)\)\}px`;/);
});

test('Customize is fitted again whenever the page moves while it is open', () => {
  assert.match(js, /const customizeFitObserver = new ResizeObserver\(\(\) => requestAnimationFrame\(\(\) => \{\s*if \(document\.getElementById\('customizePopover'\)\?\.matches\(':popover-open'\)\) fitCustomizeBelowClock\(\);/);
  for (const target of ['layoutBillboard', 'bbWidgets', 'customizeCols']) {
    assert.match(js, new RegExp(`customizeFitObserver\\.observe\\(document\\.getElementById\\('${target}'\\)\\)`));
  }
});

test('an inner panel scrolls, with fades where there is more', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages.css'), 'utf8');
  // Flex only while open: on the base class it would beat the browser's
  // display: none for a closed popover.
  assert.match(css, /\.start-customize-popover \{ width: max-content; overflow: hidden; \}/);
  assert.match(css, /\.start-customize-popover:popover-open \{ display: flex; flex-direction: column; \}/);
  const cols = css.match(/\.customize-cols \{([^}]*)\}/)?.[1] ?? '';
  assert.match(cols, /overflow-y: auto;/);
  assert.match(cols, /min-height: 0;/);
  assert.match(css, /\.customize-cols\[data-fade-end="true"\]/);
  assert.match(body('customizeFade'), /cols\.dataset\.fadeEnd = String\(/);
  assert.match(body('fitCustomizeBelowClock'), /requestAnimationFrame\(customizeFade\);/);
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/newtab.html'), 'utf8');
  assert.match(html, /<div id="customizeCols" class="customize-cols">/);
});
