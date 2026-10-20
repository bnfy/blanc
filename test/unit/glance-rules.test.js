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
