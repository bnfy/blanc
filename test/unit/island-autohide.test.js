'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  REVEAL_EDGE_PX, HIDE_SLACK_PX, pointHoldsIsland, islandPinned, stripHidden,
} = require('../../src/main/island-autohide');
const { calculateChromeLayout } = require('../../src/main/chrome-layout');

const ROOT = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const window = { chromeHeight: 68, width: 1280, height: 800 };

test('only the top edge reveals a hidden Island', () => {
  const hidden = { ...window, revealed: false };
  assert.equal(pointHoldsIsland({ x: 600, y: 0 }, hidden), true);
  assert.equal(pointHoldsIsland({ x: 600, y: REVEAL_EDGE_PX }, hidden), true);
  assert.equal(pointHoldsIsland({ x: 600, y: REVEAL_EDGE_PX + 1 }, hidden), false);
  assert.equal(pointHoldsIsland({ x: 600, y: 40 }, hidden), false);
});

test('a revealed Island stays while the pointer is on or just below the strip', () => {
  const revealed = { ...window, revealed: true };
  assert.equal(pointHoldsIsland({ x: 600, y: 40 }, revealed), true);
  assert.equal(pointHoldsIsland({ x: 600, y: 68 + HIDE_SLACK_PX - 1 }, revealed), true);
  assert.equal(pointHoldsIsland({ x: 600, y: 68 + HIDE_SLACK_PX }, revealed), false);
});

test('a pointer outside the window never holds the Island', () => {
  const revealed = { ...window, revealed: true };
  assert.equal(pointHoldsIsland({ x: 600, y: -2 }, revealed), false);
  assert.equal(pointHoldsIsland({ x: -1, y: 2 }, revealed), false);
  assert.equal(pointHoldsIsland({ x: 1281, y: 2 }, revealed), false);
  assert.equal(pointHoldsIsland(null, revealed), false);
  assert.equal(pointHoldsIsland({ x: Number.NaN, y: 0 }, revealed), false);
});

test('Island surfaces pin it and the strip is hidden only when nothing holds it', () => {
  assert.equal(islandPinned({}), false);
  assert.equal(islandPinned({ overlayMode: 'find' }), true);
  assert.equal(islandPinned({ glanceOpen: true }), true);
  assert.equal(islandPinned({ popupOpen: true }), true);
  assert.equal(islandPinned({ introducing: true }), true);
  assert.equal(stripHidden({ autoHide: false, revealed: false, pinned: false }), false);
  assert.equal(stripHidden({ autoHide: true, revealed: false, pinned: false }), true);
  assert.equal(stripHidden({ autoHide: true, revealed: true, pinned: false }), false);
  assert.equal(stripHidden({ autoHide: true, revealed: false, pinned: true }), false);
});

test('a hidden strip gives the page the whole window height in both layouts', () => {
  for (const tabLayout of ['island', 'vertical']) {
    const layout = calculateChromeLayout({ width: 1280, height: 800, chromeHeight: 0, tabLayout });
    assert.equal(layout.pageBounds.y, 0);
    assert.equal(layout.pageBounds.height, 800);
    assert.deepEqual(layout.utilityBounds, layout.pageBounds);
  }
});

test('main lays out every child view through the auto-hide strip height', () => {
  assert.match(main, /chromeHeight: islandStripHidden\(\) \? 0 : rt\(\)\.chromeHeight,/);
  const show = main.slice(main.indexOf('function showOverlay('), main.indexOf('function hideOverlay('));
  assert.ok(show.indexOf('revealIsland();') < show.indexOf('overlayView.setBounds'),
    'the strip is revealed before overlay bounds are computed');
  assert.match(main, /revealIslandAtPoint\(rt\(\), point\);/);
  assert.match(main, /applyIslandAutoHide\(s\.islandAutoHide === true\);/);
});

test('the hide check is bound to its window, re-samples the cursor and stops on close', () => {
  const check = main.slice(
    main.indexOf('function scheduleIslandAutoHideCheck(runtime)'),
    main.indexOf('function revealIsland(')
  );
  assert.match(check, /setTimeout\(bindWindowRuntime\(runtime, \(\) => \{/);
  assert.match(check, /islandHeldAt\(runtime, sampledWindowCursor\(runtime\)\)/);
  assert.match(main, /'closed', bindWindowRuntime\(runtime, \(\) => \{\s+clearIslandHoverTimer\(runtime\);\s+clearIslandAutoHideTimer\(runtime\);/);
});

test('hover-open never fires on a hidden pill and macOS hides its traffic lights with it', () => {
  assert.match(main, /islandHoverCapable === true && !islandStripHidden\(runtime\)/);
  assert.match(main, /const visible = tabLayout === 'vertical' \|\| !islandStripHidden\(runtime\);/);
  assert.match(main, /setWindowButtonVisibility\(visible\)/);
});

test('View menu toggle and shortcut', () => {
  assert.match(main, /label: t\('menu\.autoHideIsland'\),\s+type: 'checkbox',\s+checked: islandAutoHide,\s+accelerator: 'CmdOrCtrl\+Alt\+B'/);
  assert.match(main, /installIslandAutoHideShortcut\(webContents, owner\);/);
});

test('turning auto-hide on shows the way back in the window it was turned on in', () => {
  const apply = main.slice(main.indexOf('function applyIslandAutoHide(next)'), main.indexOf('function setIslandAutoHide('));
  assert.match(apply, /const target = focusedRuntime;/);
  assert.match(apply, /if \(islandAutoHide && target\?\.window/);
  assert.match(apply, /showIslandAutoHideIntro\(target\)/);
  assert.match(main, /introducing: !!runtime\.islandAutoHideIntroTimer,/);
  assert.match(main, /mainI18n\.t\('island\.autoHide\.intro'/);
  // An ordinary pill tooltip reusing the view must not keep the wrapping style.
  assert.match(main, /getElementById\('tip'\)\.classList\.remove\('intro'\)/);
});
