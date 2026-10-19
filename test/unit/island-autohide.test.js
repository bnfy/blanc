'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  REVEAL_EDGE_PX, HIDE_SLACK_PX, REACH_ABOVE_PX, pointHoldsIsland, islandPinned, stripHidden, reachAboveWindow,
  easeOutCubic, slidingBounds, SLIDE_IN_MS, SLIDE_OUT_MS,
  REVEAL_DWELL_BAND_PX, REVEAL_DWELL_MS, REVEAL_DWELL_DRIFT_PX, revealDwellStep,
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
  // macOS standard placement (18pt), set on first layout and after each show.
  assert.match(main, /if \(visible\) runtime\.window\.setWindowButtonPosition\(MAC_WINDOW_BUTTON_POSITION\);/);
  assert.match(main, /MAC_WINDOW_BUTTON_POSITION = Object\.freeze\(\{ x: 19, y: 19 \}\)/);
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

test('a short band above a floating window also reveals it, for overshoot', () => {
  const hidden = { ...window, revealed: false, reachAbove: REACH_ABOVE_PX };
  assert.equal(pointHoldsIsland({ x: 600, y: -1 }, hidden), true);
  assert.equal(pointHoldsIsland({ x: 600, y: -REACH_ABOVE_PX }, hidden), true);
  assert.equal(pointHoldsIsland({ x: 600, y: -REACH_ABOVE_PX - 1 }, hidden), false);
  assert.equal(pointHoldsIsland({ x: -1, y: -4 }, hidden), false, 'only directly above the window');
});

test('a window against the top of the work area reaches to the top of the screen', () => {
  // Floating: the window's top sits below the work area's top.
  assert.equal(reachAboveWindow({ contentTop: 300, workAreaTop: 25, displayTop: 0 }), REACH_ABOVE_PX);
  // Under the macOS menu bar: the whole bar above the window counts.
  assert.equal(reachAboveWindow({ contentTop: 25, workAreaTop: 25, displayTop: 0 }), 25);
  // Windows/Linux maximized, or macOS full screen: nothing above the window.
  assert.equal(reachAboveWindow({ contentTop: 0, workAreaTop: 0, displayTop: 0 }), 0);
  assert.equal(reachAboveWindow({ contentTop: Number.NaN, workAreaTop: 0, displayTop: 0 }), 0);
});

test('a hidden strip in the focused window samples the cursor rather than waiting for page moves', () => {
  const watch = main.slice(main.indexOf('function watchIslandReveal(runtime)'), main.indexOf('/** Move the strip in or out'));
  assert.match(watch, /runtime\.window\.isFocused\(\)/);
  assert.match(watch, /const point = sampledWindowCursor\(runtime\);/);
  assert.match(watch, /islandHeldAt\(runtime, point\)/);
  assert.match(watch, /setTimeout\(bindWindowRuntime\(runtime, \(\) => \{/);
  assert.match(main, /'blur', bindWindowRuntime\(runtime, \(\) => \{\s+stopIslandRevealWatch\(runtime\);/);
  assert.match(main, /focusedRuntime = runtime;\s+if \(!runtime\.islandRevealed\) watchIslandReveal\(runtime\);/);
  assert.match(main, /reachAbove: islandAutoHideModule\.reachAboveWindow\(/);
});

test('the slide eases out and stays within its range', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5, 'more than halfway by the midpoint');
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(2), 1);
  assert.equal(easeOutCubic(Number.NaN), 1);
  assert.ok(SLIDE_IN_MS > 0 && SLIDE_IN_MS <= 250 && SLIDE_OUT_MS > 0 && SLIDE_OUT_MS <= 250);
});

test('mid-slide the page view moves without changing height', () => {
  // Revealing: final bounds sit below a 68px strip; the slide starts at the top.
  const revealed = { x: 0, y: 68, width: 1280, height: 732 };
  for (const animatedTop of [0, 20, 50, 68]) {
    const frame = slidingBounds(revealed, { stripTop: 68, animatedTop });
    assert.equal(frame.y, animatedTop);
    assert.equal(frame.height, 800, 'full height for the whole reveal');
  }
  // Hiding: final bounds fill the window; the slide starts 68px down.
  const hidden = { x: 0, y: 0, width: 1280, height: 800 };
  for (const animatedTop of [68, 30, 0]) {
    const frame = slidingBounds(hidden, { stripTop: 0, animatedTop });
    assert.equal(frame.y, animatedTop);
    assert.equal(frame.height, 800);
  }
  // A vertical-rail pane keeps its x and width.
  const rail = slidingBounds({ x: 248, y: 68, width: 1032, height: 732 }, { stripTop: 68, animatedTop: 10 });
  assert.deepEqual(rail, { x: 248, y: 10, width: 1032, height: 800 });
});

test('main slides rather than snaps, honors Reduce Motion, and turning on never jumps', () => {
  const slide = main.slice(main.indexOf('function slideIsland('), main.indexOf('function setIslandRevealed('));
  assert.match(slide, /prefersReducedMotion\(\)/);
  assert.match(slide, /bindWindowRuntime\(runtime, \(\) => \{/);
  assert.match(main, /fromTop = runtime\.islandSlide \? runtime\.islandSlide\.top : pageTopFor\(runtime\)/);
  assert.match(main, /islandAutoHideModule\.slidingBounds\(bounds, \{ stripTop: layout\.pageBounds\.y, animatedTop: slide\.top \}\)/);
  assert.match(main, /runtime\.islandRevealed = islandAutoHide && runtime === target;/);
});

test('resting near the top reveals the Island after a short dwell', () => {
  const win = { width: 1200, height: 800 };
  const at = (x, y) => ({ x, y });
  const y = REVEAL_EDGE_PX + 10;
  assert.ok(y < REVEAL_DWELL_BAND_PX);
  let step = revealDwellStep(null, at(400, y), 1000, win);
  assert.equal(step.reveal, false);
  assert.ok(step.dwell, 'a rest starts in the band');
  step = revealDwellStep(step.dwell, at(402, y + 1), 1000 + REVEAL_DWELL_MS - 1, win);
  assert.equal(step.reveal, false, 'not before the dwell');
  step = revealDwellStep(step.dwell, at(401, y), 1000 + REVEAL_DWELL_MS, win);
  assert.equal(step.reveal, true, 'a small tremor still counts as resting');
});

test('sweeping along the top does not count as resting', () => {
  const win = { width: 1200, height: 800 };
  const y = 30;
  let step = revealDwellStep(null, { x: 100, y }, 0, win);
  for (let t = 120, x = 100; t <= 1200; t += 120) {
    x += REVEAL_DWELL_DRIFT_PX + 1;
    step = revealDwellStep(step.dwell, { x, y }, t, win);
    assert.equal(step.reveal, false, `moved at ${t}ms`);
  }
});

test('the dwell band sits below the instant edge and inside the window', () => {
  const win = { width: 1200, height: 800 };
  for (const point of [
    { x: 400, y: REVEAL_DWELL_BAND_PX + 1 },
    { x: 400, y: REVEAL_EDGE_PX },
    { x: 400, y: -4 },
    { x: -1, y: 30 },
    { x: 1201, y: 30 },
    { x: Number.NaN, y: 30 },
    null,
  ]) {
    const step = revealDwellStep({ anchor: { x: 400, y: 30 }, since: 0 }, point, 10000, win);
    assert.deepEqual(step, { dwell: null, reveal: false }, JSON.stringify(point));
  }
  assert.ok(REVEAL_DWELL_BAND_PX >= 36 && REVEAL_DWELL_BAND_PX <= 48);
  assert.ok(REVEAL_DWELL_MS >= 200 && REVEAL_DWELL_MS <= 400);
});

test('main feeds the sampled cursor to the dwell and resets it on reveal', () => {
  assert.match(main, /const dwell = islandAutoHideModule\.revealDwellStep\(runtime\.islandRevealDwell, point, Date\.now\(\), runtime\.window\.getContentBounds\(\)\);/);
  assert.match(main, /if \(islandHeldAt\(runtime, point\) \|\| dwell\.reveal\) \{/);
  assert.match(main, /runtime\.islandRevealDwell = null;/);
});

test('without a global pointer position (native Wayland) the last move a view saw stands in', () => {
  assert.match(main, /function linuxWaylandOzone\(\) \{/);
  assert.match(main, /function cursorSamplingUnavailable\(\) \{\s+if \(acceptanceTestMode && testCursorSamplingUnavailable\) return true;\s+return process\.platform === 'linux' && linuxWaylandOzone\(\);/);
  const sample = main.slice(main.indexOf('function sampledWindowCursor(runtime)'), main.indexOf('function islandHeldAt('));
  assert.match(sample, /if \(!testPoint && cursorSamplingUnavailable\(\)\) return runtime\.lastPointer \?\? null;/);
  const watch = main.slice(main.indexOf('function watchCursorFor('), main.indexOf('const INTRO_TIP_MAX_WIDTH'));
  assert.match(watch, /rt\(\)\.lastPointer = point;/);
  // The display-share portal choice uses the same Wayland test.
  assert.match(main, /portalSelection: process\.platform === 'linux' && linuxWaylandOzone\(\),/);
});

test('an auto-hidden pill cannot be hovered, so resting where it will appear does not disarm hover-open', () => {
  assert.match(main, /type: 'move', inside: !islandStripHidden\(runtime\) && pointInRect\(point, runtime\.islandHoverRect\),/);
});
