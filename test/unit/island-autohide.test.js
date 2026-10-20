'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  REVEAL_EDGE_PX, HIDE_SLACK_PX, HIDE_CHECK_MS, FLOAT_HIDE_CHECK_MS, hideCheckDelay, REACH_ABOVE_PX, pointHoldsIsland, islandPinned, stripHidden, reachAboveWindow,
  easeOutCubic, slidingBounds, SLIDE_IN_MS, SLIDE_OUT_MS,
  REVEAL_DWELL_BAND_PX, REVEAL_DWELL_MS, REVEAL_DWELL_DRIFT_PX, revealDwellStep,
  AUTO_HIDE_STYLES, normalizeAutoHideStyle,
  DRAG_BAND_PX, FLOAT_SIDE_PX, FLOAT_BOTTOM_PX, FLOAT_CHROME_PAD_PX,
  floatingLayout, floatViewsWanted, floatViewsShown, floatViewBounds,
  COVERED_STRIP_ROW_PX, coveredStripHeight,
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
  // The page leaves the strip out while it is hidden, or while the Island
  // floats over the page; overlays still anchor under a shown Island.
  assert.match(main, /chromeHeight: stripCovered\(\) \? islandAutoHideModule\.coveredStripHeight\(process\.platform\) : rt\(\)\.chromeHeight,/);
  assert.match(main, /islandHeight: islandStripHidden\(\) \? 0 : rt\(\)\.chromeHeight,/);
  assert.match(main, /function stripCovered\(runtime = rt\(\)\) \{\s+return islandStripHidden\(runtime\) \|\| islandFloating\(runtime\);/);
  assert.match(main, /function islandFloating\(runtime = rt\(\)\) \{\s+return islandAutoHideModule\.floatingLayout\(\{\s+autoHide: islandAutoHide,\s+style: islandAutoHideStyle,\s+glanceOpen: !!runtime\.glanceTabId,/);
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
  assert.match(check, /const geometry = revealGeometry\(runtime\);/);
  assert.match(check, /islandHeldAt\(runtime, sampledWindowCursor\(runtime, geometry\), geometry\)/);
  assert.match(main, /'closed', bindWindowRuntime\(runtime, \(\) => \{\s+clearIslandHoverTimer\(runtime\);\s+clearIslandAutoHideTimer\(runtime\);/);
});

test('hover-open never fires on a hidden pill and macOS hides its traffic lights with it', () => {
  assert.match(main, /islandHoverCapable === true && !islandStripHidden\(runtime\)/);
  // Floating or pushed, the traffic lights come and go with the Island.
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
  assert.match(watch, /const geometry = revealGeometry\(runtime\);\s+const point = sampledWindowCursor\(runtime, geometry\);/);
  assert.match(watch, /islandHeldAt\(runtime, point, geometry\)/);
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

test('a floating Island reveals only from the top edge: resting on a site header never does', () => {
  // YouTube's 56px header holds its search box inside the dwell band.
  const win = { width: 1200, height: 800, floating: true };
  let step = revealDwellStep(null, { x: 400, y: 30 }, 0, win);
  assert.deepEqual(step, { dwell: null, reveal: false });
  step = revealDwellStep({ anchor: { x: 400, y: 30 }, since: 0 }, { x: 400, y: 30 }, 10000, win);
  assert.deepEqual(step, { dwell: null, reveal: false });
  assert.equal(pointHoldsIsland({ x: 600, y: REVEAL_EDGE_PX }, { ...window, ...win, revealed: false }), true);
});

test('a floating Island hides once the pointer leaves the strip, with no slack below it', () => {
  const floating = { ...window, revealed: true, floating: true };
  assert.equal(pointHoldsIsland({ x: 600, y: 67 }, floating), true);
  assert.equal(pointHoldsIsland({ x: 600, y: 68 }, floating), false);
  assert.equal(hideCheckDelay(true), FLOAT_HIDE_CHECK_MS);
  assert.equal(hideCheckDelay(false), HIDE_CHECK_MS);
  assert.ok(FLOAT_HIDE_CHECK_MS <= 150);
});

test('main tells the reveal and hide policy whether the Island floats', () => {
  const geometry = main.slice(main.indexOf('function revealGeometry('), main.indexOf('function sampledWindowCursor('));
  assert.match(geometry, /floating: islandFloating\(runtime\),/);
  assert.match(main, /floating: geometry\.floating,/);
  assert.match(main, /\}\), islandAutoHideModule\.hideCheckDelay\(islandFloating\(runtime\)\)\);/);
});

test('main feeds the sampled cursor to the dwell and resets it on reveal', () => {
  assert.match(main, /const dwell = islandAutoHideModule\.revealDwellStep\(runtime\.islandRevealDwell, point, Date\.now\(\), geometry\);/);
  assert.match(main, /if \(islandHeldAt\(runtime, point, geometry\) \|\| dwell\.reveal\) \{/);
  assert.match(main, /runtime\.islandRevealDwell = null;/);
});

test('without a global pointer position (native Wayland) the last move a view saw stands in', () => {
  assert.match(main, /function linuxWaylandOzone\(\) \{/);
  assert.match(main, /function cursorSamplingUnavailable\(\) \{\s+if \(acceptanceTestMode && testCursorSamplingUnavailable\) return true;\s+return process\.platform === 'linux' && linuxWaylandOzone\(\);/);
  const sample = main.slice(main.indexOf('function sampledWindowCursor(runtime'), main.indexOf('function islandHeldAt('));
  assert.match(sample, /if \(!testPoint && cursorSamplingUnavailable\(\)\) return runtime\.lastPointer \?\? null;/);
  const watch = main.slice(main.indexOf('function watchCursorFor('), main.indexOf('const INTRO_TIP_MAX_WIDTH'));
  assert.match(watch, /rt\(\)\.lastPointer = point;/);
  // The display-share portal choice uses the same Wayland test.
  assert.match(main, /portalSelection: process\.platform === 'linux' && linuxWaylandOzone\(\),/);
});

test('an auto-hidden pill cannot be hovered, so resting where it will appear does not disarm hover-open', () => {
  assert.match(main, /type: 'move', inside: !islandStripHidden\(runtime\) && pointInRect\(point, runtime\.islandHoverRect\),/);
});

test('the reveal bands start at the page pane, so the vertical rail is never reveal territory', () => {
  const base = { revealed: false, chromeHeight: 68, width: 1200, height: 800, left: 248 };
  assert.equal(pointHoldsIsland({ x: 100, y: 2 }, base), false, 'the rail column at the top edge');
  assert.equal(pointHoldsIsland({ x: 248, y: 2 }, base), true, 'the page pane starts at the rail edge');
  assert.equal(pointHoldsIsland({ x: 100, y: 30 }, { ...base, revealed: true }), false, 'the rail does not hold a revealed strip');
  assert.equal(pointHoldsIsland({ x: 100, y: 2 }, { ...base, left: 0 }), true, 'no rail, no exclusion');
  const win = { width: 1200, left: 248 };
  assert.deepEqual(revealDwellStep(null, { x: 100, y: 30 }, 0, win), { dwell: null, reveal: false }, 'no dwell starts over the rail');
  assert.ok(revealDwellStep(null, { x: 300, y: 30 }, 0, win).dwell, 'a dwell starts over the page pane');
  assert.deepEqual(revealDwellStep({ anchor: { x: 300, y: 30 }, since: 0 }, { x: 100, y: 30 }, 1000, win),
    { dwell: null, reveal: false }, 'drifting onto the rail ends the dwell');
});

test('reveal geometry is read once per tick and move, and a move below the edge reads none', () => {
  const geometry = main.slice(main.indexOf('function revealGeometry(runtime)'), main.indexOf('/** Window content coordinates of the cursor right now'));
  assert.match(geometry, /const content = runtime\.window\.getContentBounds\(\);/);
  assert.match(geometry, /left: withWindowRuntime\(runtime, \(\) => currentChromeLayout\(content\)\.pageBounds\.x\)/);
  assert.equal((geometry.match(/getContentBounds\(\)/g) || []).length, 1, 'one bounds read in revealGeometry');
  assert.match(main, /function currentChromeLayout\(content = rt\(\)\.window\.getContentBounds\(\)\) \{/);
  const atPoint = main.slice(main.indexOf('function revealIslandAtPoint(runtime, point)'), main.indexOf('/** macOS\'s standard traffic-light'));
  assert.match(atPoint, /if \(!point \|\| !\(point\.y <= islandAutoHideModule\.REVEAL_EDGE_PX\)\) return;/);
  assert.ok(atPoint.indexOf('REVEAL_EDGE_PX') < atPoint.indexOf('isFocused()'), 'the cheap rejection comes before any native call');
});

test('a closed window forgets what its strip was told (macOS Dock reopen gets a fresh document)', () => {
  assert.match(main, /runtime\.windowButtonsVisible = null;\s+runtime\.stripHiddenSent = null;\s+runtime\.lastPointer = null;/);
});

test('the auto-hide shortcut matches the physical key only on macOS, where Option changes the key value', () => {
  const shortcut = main.slice(main.indexOf('function installIslandAutoHideShortcut('), main.indexOf('// Windows/Linux only: macOS keeps its native menu key equivalent.'));
  assert.match(shortcut, /String\(input\.key\)\.toLowerCase\(\) === 'b'\s*\|\| \(process\.platform === 'darwin' && input\.code === 'KeyB'\)/);
  assert.doesNotMatch(shortcut, /input\.code !== 'KeyB'/);
});

test('normalizeAutoHideStyle keeps push and turns anything else into float', () => {
  assert.deepEqual(AUTO_HIDE_STYLES, ['float', 'push']);
  assert.equal(normalizeAutoHideStyle('push'), 'push');
  for (const value of ['float', undefined, null, 'PUSH', 1]) assert.equal(normalizeAutoHideStyle(value), 'float');
});

test('floating Island constants', () => {
  assert.equal(DRAG_BAND_PX, 6);
  assert.equal(FLOAT_SIDE_PX, 20);
  assert.equal(FLOAT_BOTTOM_PX, 24);
  assert.equal(FLOAT_CHROME_PAD_PX, 8);
});

test('floatingLayout: only auto-hide with float, and never while Glance is open', () => {
  assert.equal(floatingLayout({ autoHide: true, style: 'float', glanceOpen: false }), true);
  assert.equal(floatingLayout({ autoHide: true, style: 'float', glanceOpen: true }), false);
  assert.equal(floatingLayout({ autoHide: true, style: 'push', glanceOpen: false }), false);
  assert.equal(floatingLayout({ autoHide: false, style: 'float', glanceOpen: false }), false);
});

test('floatViewsWanted: the pill everywhere, controls and menu off macOS', () => {
  assert.deepEqual(floatViewsWanted({ autoHide: true, style: 'float', platform: 'darwin' }), { pill: true, controls: false, menu: false });
  assert.deepEqual(floatViewsWanted({ autoHide: true, style: 'float', platform: 'win32' }), { pill: true, controls: true, menu: true });
  assert.deepEqual(floatViewsWanted({ autoHide: true, style: 'push', platform: 'linux' }), { pill: false, controls: false, menu: false });
  assert.deepEqual(floatViewsWanted({ autoHide: false, style: 'float', platform: 'linux' }), { pill: false, controls: false, menu: false });
});

test('macOS traffic lights hide with a floating Island, as with push; the rail keeps them', () => {
  const sync = main.slice(main.indexOf('function syncWindowButtons('), main.indexOf('function syncStripHidden('));
  assert.match(sync, /const visible = tabLayout === 'vertical' \|\| !islandStripHidden\(runtime\);/);
  assert.doesNotMatch(sync, /islandFloating/);
});

test('floatViewsShown: the pill, window controls and menu button all follow the Island', () => {
  // Always-on controls sat over the corner where sites put their own buttons.
  assert.deepEqual(floatViewsShown({ floating: true, islandVisible: false, platform: 'linux' }), { pill: false, controls: false, menu: false });
  assert.deepEqual(floatViewsShown({ floating: true, islandVisible: true, platform: 'linux' }), { pill: true, controls: true, menu: true });
  assert.deepEqual(floatViewsShown({ floating: true, islandVisible: true, platform: 'darwin' }), { pill: true, controls: false, menu: false });
  assert.deepEqual(floatViewsShown({ floating: false, islandVisible: true, platform: 'linux' }), { pill: false, controls: false, menu: false });
});

test('floatViewBounds wraps the rect with shadow room, from the window top, clamped', () => {
  const win = { windowWidth: 1200, windowHeight: 800 };
  assert.deepEqual(floatViewBounds({ x: 400, y: 12, width: 360, height: 44 }, { ...win, side: 20, bottom: 24 }),
    { x: 380, y: 0, width: 400, height: 80 });
  assert.deepEqual(floatViewBounds({ x: 5, y: 8, width: 34, height: 30 }, { ...win, side: 8, bottom: 8 }),
    { x: 0, y: 0, width: 47, height: 46 });
  assert.deepEqual(floatViewBounds({ x: 1150, y: 8, width: 40, height: 30 }, { ...win, side: 20, bottom: 8 }),
    { x: 1130, y: 0, width: 70, height: 46 });
  assert.equal(floatViewBounds(null, { ...win, side: 20, bottom: 24 }), null);
  assert.equal(floatViewBounds({ x: 0, y: 0, width: 0, height: 44 }, { ...win, side: 20, bottom: 24 }), null);
  assert.equal(floatViewBounds({ x: NaN, y: 0, width: 10, height: 44 }, { ...win, side: 20, bottom: 24 }), null);
});

test('on Linux a covered strip keeps one row uncovered so Chromium keeps laying it out', () => {
  // Chromium on Linux treats the window document as occluded once a page view
  // covers it whole: it reports visibilityState 'hidden' and stops syncing
  // its size, so the island-rect and window-controls reports the float views
  // are placed from go stale after a resize (2026-10-20 VM check). One row
  // of the strip left showing keeps it visible. macOS and Windows keep a
  // fully covered document visible, so they give the page everything.
  assert.equal(COVERED_STRIP_ROW_PX, 1);
  assert.equal(coveredStripHeight('linux'), 1);
  assert.equal(coveredStripHeight('darwin'), 0);
  assert.equal(coveredStripHeight('win32'), 0);
  assert.equal(coveredStripHeight(undefined), 0);
  const layout = calculateChromeLayout({ width: 1280, height: 800, chromeHeight: coveredStripHeight('linux'), islandHeight: 0 });
  assert.equal(layout.pageBounds.y, 1);
  assert.equal(layout.pageBounds.height, 799);
  // The test hook tells the acceptance steps where a covered page starts.
  assert.match(main, /coveredStripPx: islandAutoHideModule\.coveredStripHeight\(process\.platform\),/);
});

test('the strip learns it is covered whenever the page covers it, hidden or floating', () => {
  const sync = main.slice(main.indexOf('function syncStripHidden('), main.indexOf('function endIslandAutoHideIntro('));
  assert.match(sync, /const hidden = stripCovered\(runtime\);/);
  assert.match(main, /function applyIslandAutoHideStyle\(next\) \{[\s\S]*?scheduleMenuRebuild\(\);/);
});

test('the strip document draws a 6px drag band while the page covers it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
  assert.match(html, /<div id="strip">\s*<div id="dragBand" aria-hidden="true"><\/div>/);
  assert.match(css, /#dragBand \{[^}]*display: none;[^}]*height: 6px;[^}]*-webkit-app-region: drag;/);
  assert.match(css, /#strip\.strip-hidden #dragBand \{ display: block; \}/);
  assert.match(css, /#strip\.drag-suspended #dragBand \{ -webkit-app-region: no-drag; \}/);
  assert.match(css, /:root\[data-tab-layout="vertical"\] #dragBand \{ left: var\(--vertical-tabs-w\); \}/);
  assert.match(renderer, /dragBand\.addEventListener\('dblclick', \(\) => window\.browserAPI\.maximizeWindow\(\)\)/);
});

test('a covered strip under a split paints nothing into the gaps between its panes', () => {
  // The panes are inset cards, so a page covering the strip still leaves the
  // strip showing around them: its tint and its own copy of the pill (the
  // floating views draw the revealed one).
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
  assert.match(css, /#strip\.strip-hidden\.split-open \{ background: transparent; \}/);
  assert.match(css, /#strip\.strip-hidden\.split-open :is\(#islandPill, #windowControls, #mainMenuButton\) \{ visibility: hidden; \}/);
});

test('every strip broadcast also reaches the floating Island views', () => {
  const helper = main.slice(main.indexOf('function stripSurfaces(runtime) {'), main.indexOf('function restackAboveIslandFloat('));
  assert.match(helper, /window\.webContents\.send\(channel, \.\.\.args\);/);
  assert.match(helper, /liveFloatRecord\(runtime, role\)\?\.view\.webContents\.send\(channel, \.\.\.args\)/);
  const outside = main.replace(helper, '');
  // Only the strip's own drag-region signal stays strip-only.
  assert.deepEqual([...outside.matchAll(/window\??\.webContents\??\.send\('([^']+)'/g)].map((m) => m[1]), ['chrome:strip-hidden']);
});

test('the floating Island views stay above pages and the sheet, and die with their window', () => {
  // One helper raises them after any tab view attaches: switching tabs,
  // opening Glance, and showing a split (F53-22).
  assert.equal(main.match(/if \(sheet\) rt\(\)\.window\.contentView\.addChildView\(sheet\.view\);\s+restackIslandFloatViews\(\); \/\/ above the pages and the sheet/g)?.length, 1);
  // The floating Glance card and page come first: tabs < card < Glance page < sheet.
  assert.match(main, /function restackAboveTabViews\(\) \{\s+restackGlanceCard\(\);\s+const sheet = rt\(\)\.utilitySheetUrl/);
  assert.equal(main.match(/^\s+restackAboveTabViews\(\);$/gm)?.length, 3);
  assert.match(main, /showOverlayView\(runtime\.window, sheet\.view\);\s+\/\/ The floating Island stays above the sheet, as the strip's Island does\.\s+restackIslandFloatViews\(runtime\);/);
  assert.match(main, /syncStripHidden\(\);\s+syncIslandFloat\(\);\s+\}/);
  assert.match(main, /runtime\.lastPointer = null;\s+destroyIslandFloatViews\(runtime\);/);
  // Never removed and re-added while alive: hidden by visibility only.
  const shown = main.slice(main.indexOf('function setIslandFloatShown('), main.indexOf('function syncIslandFloat('));
  assert.doesNotMatch(shown, /removeChildView|addChildView/);
  assert.match(shown, /record\.view\.setVisible\(false\)/);
});

test('float views are trusted chrome surfaces that never report geometry', () => {
  assert.match(main, /\.map\(\(record\) => \(\{ webContents: record\.view\.webContents, url: CHROME_FLOAT_URL \}\)\)/);
  assert.match(main, /chromeOn\('chrome:island-rect', \(event, rect\) => \{\s+\/\/ [^\n]*\n\s+if \(floatRoleOf\(rt\(\), event\.sender\)\) return;/);
  assert.match(main, /chromeOn\('chrome:layout', \(event, \{ height \}\) => \{\s+if \(floatRoleOf\(rt\(\), event\.sender\)\) return;/);
  assert.match(main, /const role = floatRoleOf\(rt\(\), event\.sender\);\s+if \(event\.sender !== rt\(\)\.window\?\.webContents && role !== 'menu'\) return false;/);
  // The faked platform (acceptance only) records the menu instead of showing it.
  assert.match(main, /const testPlatform = acceptanceTestMode && \['win32', 'linux'\]\.includes\(process\.env\.BLANC_TEST_PLATFORM\)/);
});
