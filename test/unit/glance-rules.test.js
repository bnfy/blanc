'use strict';

// Floating Glance rules (spec 2026-10-20-floating-glance-design.md): a tab
// switch ends the Glance, Open as tab replaces Make main's swap, Escape
// closes it only from the card's chrome, Keep as split opens at 50/50, and a
// closing card stops taking input at once.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const main = read('src/main/main.js');
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} not found`);
  return source.slice(from, to);
};

test('switching to any other tab, the Glance tab included, ends the Glance first', () => {
  const activate = between(main, 'function setActiveTab(', 'cancelAddressBarFocusReclaim();');
  assert.doesNotMatch(activate, /promotingGlance/);
  assert.match(activate, /if \(rt\(\)\.glanceTabId\) closeGlance\(\{ focusContent: false \}\);/);
});

test('Open as tab ends the Glance and makes its page the current tab', () => {
  const open = between(main, 'function openGlanceAsTab() {', '\n}\n');
  assert.match(open, /closeGlance\(\{ focusContent: false \}\);[\s\S]*setActiveTab\(id, \{ focusContent: true \}\)/);
  assert.doesNotMatch(main, /function promoteGlance\(/);
  const preload = read('src/main/preload.js');
  assert.match(preload, /openGlanceAsTab: \(\) => ipcRenderer\.invoke\('tabs:open-glance-as-tab'\)/);
  assert.doesNotMatch(preload, /promoteGlance/);
});

test('Escape closes the Glance only from the card chrome, never from a page', () => {
  const ensure = between(main, 'function ensureGlanceCardView(', '\n}\n');
  assert.match(ensure, /contents\.on\('before-input-event'[\s\S]*input\.key !== 'Escape'[\s\S]*closeGlance\(\)/);
  assert.doesNotMatch(read('src/main/tab-view.js'), /closeGlance/);
});

test('Keep as split opens a fresh 50/50 split with the main page first', () => {
  const keep = between(main, 'function keepGlanceAsSplit() {', '\n}\n');
  assert.match(keep, /const ratio = 0\.5;/);
  assert.match(keep, /createSplitFromTabs\(mainId, \[referenceId\]/);
});

test('a closing card is hidden before anything else runs', () => {
  const close = between(main, 'function closeGlance(', '\n}\n');
  const hide = close.indexOf('liveGlanceCardView()?.setVisible(false);');
  assert.ok(hide > 0 && hide < close.indexOf('detachTabView('), 'the card hides before the page detaches');
  assert.ok(hide < close.indexOf('resizeActiveView();'));
});

test('a fill message for the Glance page sits at the bottom of the card', () => {
  const bounds = between(main, 'function fillStatusViewBounds() {', '\n}\n');
  assert.match(bounds, /rt\(\)\.fillStatusTabId === rt\(\)\.glanceTabId/);
  assert.match(bounds, /glanceCardGeometry\(\)\?\.page/);
  assert.match(main, /attach: \(target\) => withWindowRuntime\(target\.runtime, \(\) => attachFillStatusView\(target\.tabId\)\)/);
});

test('the card fades in, never scales, and has no exit animation', () => {
  const css = read('src/renderer/styles.css');
  const block = css.slice(css.indexOf('/* ---- Floating Glance card (blanc-chrome://glance/)'));
  assert.match(block, /html\[data-surface="glance"\] \.glance-card \{[^}]*transition: opacity 140ms ease, display 140ms allow-discrete;/);
  assert.match(block, /@starting-style \{\s+html\[data-surface="glance"\] \.glance-card:not\(\[hidden\]\) \{ opacity: 0; \}\s+\}/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\s+html\[data-surface="glance"\] \.glance-card \{ transition: none; \}/);
  assert.doesNotMatch(block, /\.glance-card[^{]*\{[^}]*scale/);
});

test('the card header buttons get tooltips, placed in window coordinates', () => {
  const show = between(main, "chromeOn('chrome:tooltip-show'", '\n  });\n');
  assert.match(show, /liveGlanceCardView\(\)/);
  assert.match(show, /const offset = cardView && event\.sender === cardView\.webContents \? cardView\.getBounds\(\) : null;/);
  const hide = between(main, "chromeOn('chrome:tooltip-hide'", '\n  });\n');
  assert.match(hide, /liveGlanceCardView\(\)\?\.webContents/);
});

test('closing the Change picker hands keyboard focus back to the card', () => {
  assert.match(main, /if \(restoreTrigger === 'glance-change'\) liveGlanceCardView\(\)\?\.webContents\.focus\(\);\s+else if \(restoreTrigger\) islandSurfaceContents\(\)\.focus\(\);/);
});

test('the strip document loads the card drag module', () => {
  assert.match(read('src/renderer/index.html'), /<script src="glance-card-drag\.js"><\/script>/);
  assert.match(read('src/main/chrome-protocol.js'), /\['\/glance-card-drag\.js', 'glance-card-drag\.js'\]/);
});
