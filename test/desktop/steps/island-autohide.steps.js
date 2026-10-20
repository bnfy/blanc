const assert = require('node:assert/strict');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const { frontChromeWindow } = require('../support/tab-drag');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function autoHideState(world) {
  return world.call('islandAutoHideState');
}

/** Where a covered page starts: 0, except the one strip row Linux keeps
 * uncovered so Chromium keeps laying the strip out (coveredStripHeight). */
const coveredTop = (state) => state?.coveredStripPx ?? 0;

async function assertPageAtCoveredTop(world) {
  const state = await autoHideState(world);
  assert.equal(state.activeBounds.y, coveredTop(state));
}

async function waitForAutoHide(world, predicate, label) {
  return waitForValue(() => autoHideState(world), predicate, label);
}

/** Park the hide check's cursor sample at a window point (content coords). */
async function restCursor(world, point) {
  const bounds = await world.call('windowContentBounds');
  assert.ok(bounds, 'the main window has no content bounds');
  assert.equal(await world.call('setTestCursorPoint', {
    x: bounds.x + point.x,
    y: bounds.y + point.y,
  }), true);
}

// Turning auto-hide on keeps the strip up for its how-to tip (INTRO_MS, 5 s).
const INTRO_WAIT_MS = 9000;

// F1-15…F1-27 describe the push style (v1.39.0); float scenarios pass 'float'.
async function turnOn(world, layout, style = 'push') {
  await world.call('setTabLayout', layout);
  assert.equal(await world.call('setIslandAutoHideStyle', style), style);
  await world.call('closeOverlay');
  await frontChromeWindow(world);
  // Somewhere well below the strip, so nothing holds it on.
  await restCursor(world, { x: 400, y: 400 });
  assert.equal(await world.call('setIslandAutoHide', true), true);
}

async function prepare(world, layout, style = 'push') {
  await turnOn(world, layout, style);
  await waitForValue(() => autoHideState(world), (state) => !state?.sliding && state?.stripHidden === true,
    'the strip to hide after its tip', INTRO_WAIT_MS);
}

When('I turn on auto-hide', async function () {
  await turnOn(this, 'island');
});

Then('the Island stays shown with a tip on bringing it back', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.introTipShown === true, 'the how-to tip');
  assert.equal(state.stripHidden, false);
  assert.ok(state.pageY > 0, 'the page still sits below the strip');
  assert.equal(state.activeBounds.y, state.pageY, 'the page view moved below the strip');
});

Then('then the page starts at the top of the window', async function () {
  const state = await waitForValue(() => autoHideState(this), (value) => !value?.sliding && value?.pageY === coveredTop(value),
    'the page to reach the top edge after the tip', INTRO_WAIT_MS);
  assert.equal(state.introducing, false);
  assert.equal(state.activeBounds.y, coveredTop(state));
});

Given('the Island auto-hides', async function () {
  await prepare(this, 'island');
});

Given('the Island auto-hides with vertical tabs', async function () {
  await prepare(this, 'vertical');
});

Given('the Island auto-hides and floats', async function () {
  await prepare(this, 'island', 'float');
});

When('auto-hide is turned off', async function () {
  assert.equal(await this.call('setIslandAutoHide', false), false);
});

Then('the page starts at the top of the window', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.pageY === coveredTop(value), 'the page to reach the top edge');
  assert.equal(state.enabled, true);
  assert.equal(state.activeBounds.y, coveredTop(state));
});

Then('the page starts at the top of the window beside the rail', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.pageY === coveredTop(value), 'the page to reach the top edge');
  assert.equal(state.activeBounds.y, coveredTop(state));
  assert.ok(state.activeBounds.x > 0, 'the vertical rail kept its column');
});

Then('the page starts below the Island', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.enabled === false && value.pageY > 0,
    'the page to move below the strip');
  assert.equal(state.stripHidden, false);
});

When('I point at the top edge of the window', async function () {
  const state = await this.call('state');
  await restCursor(this, { x: 400, y: 2 });
  assert.equal(await this.call('sendMouseInput', state.activeTabId, { type: 'mouseMove', x: 400, y: 2 }), true);
});

Then('the Island is shown above the page', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.stripHidden === false && value.pageY > 0,
    'the strip to be shown');
  assert.equal(state.enabled, true);
  assert.equal(state.activeBounds.y, state.pageY);
});

// Only the cursor sample moves: no input event reaches any view, as when the
// pointer overshoots the window or the platform keeps the band for itself.
When('the pointer rests at the top edge without the page seeing it move', async function () {
  await this.call('focusWindow');
  await restCursor(this, { x: 400, y: 2 });
});

// Below the instant edge the pointer must rest a moment (REVEAL_DWELL_MS) to
// reveal the Island; the hidden strip's cursor sampling sees it either way.
When('the pointer rests {int} pixels below the top edge', async function (y) {
  await this.call('focusWindow');
  await restCursor(this, { x: 400, y });
});

When('the pointer passes {int} pixels below the top edge for {int} milliseconds', async function (y, ms) {
  await this.call('focusWindow');
  await restCursor(this, { x: 400, y });
  await sleep(ms);
  await restCursor(this, { x: 400, y: 400 });
});

Then('the Island stays hidden after {int} milliseconds', async function (ms) {
  await sleep(ms);
  const state = await autoHideState(this);
  assert.equal(state.stripHidden, true);
  assert.equal(state.pageY, coveredTop(state));
});

// The rail keeps its column with auto-hide on, so its top is not a reveal
// band: only the page pane's is. The rail is 248 px wide by default.
When('the pointer rests at the top edge over the rail', async function () {
  await this.call('focusWindow');
  await restCursor(this, { x: 100, y: 2 });
});

When('the pointer rests {int} pixels down over the rail', async function (y) {
  await this.call('focusWindow');
  await restCursor(this, { x: 100, y });
});

When('the pointer rests at the top edge over the page pane', async function () {
  await this.call('focusWindow');
  await restCursor(this, { x: 400, y: 2 });
});

// A hidden pill cannot be hovered: the page's moves over where the address
// will appear must not count as entering it, or hover-open is disarmed by the
// time the rest band reveals the Island under the pointer.
When('the pointer rests on the page where the hidden address will appear', async function () {
  const rect = this.hoverIslandRect;
  assert.ok(rect, 'the hover-open steps recorded the address rectangle');
  const point = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  this.hiddenAddressPoint = point;
  await restCursor(this, point);
  const state = await this.call('state');
  assert.equal(await this.call('sendMouseInput', state.activeTabId, { type: 'mouseMove', ...point }), true);
});

Then('hover-open is still armed', async function () {
  const state = await this.call('islandHoverState');
  assert.equal(state?.armed, true, `a move over the hidden address disarmed hover-open: ${JSON.stringify(state)}`);
});

When('I move within the revealed address', async function () {
  const point = this.hiddenAddressPoint;
  // The reveal re-lays out the page, and Chromium then sends the page a move
  // at its last (now shifted) point, outside the address; with a test cursor
  // that move would cancel a dwell begun before it. A real pointer reports
  // where it is, so wait for that move to pass before entering.
  await sleep(400);
  assert.equal(await this.call('sendChromeMouseInput', { type: 'mouseMove', x: point.x + 3, y: point.y }), true);
});

// The strip's drag region hit-tests above the page view, so while hidden it
// must be off, or the page's top band drags the window.
Then('the strip has no window-drag region', async function () {
  await waitForValue(() => this.call('stripAppRegion'), (region) => region === 'no-drag', 'the hidden strip to drop its drag region');
});

Then('the strip drags the window again', async function () {
  await waitForValue(() => this.call('stripAppRegion'), (region) => region === 'drag', 'the revealed strip to drag the window');
});

// Native Wayland reads the global pointer as 0,0, so only the moves a Blanc
// view sees count: drop the test cursor and send real page input.
Given('the window has no global pointer position, as on native Wayland', async function () {
  assert.equal(await this.call('setTestCursorPoint', null), true);
  assert.equal(await this.call('setCursorSamplingUnavailable', true), true);
});

async function pageMove(world, y) {
  const state = await world.call('state');
  assert.equal(await world.call('sendMouseInput', state.activeTabId, { type: 'mouseMove', x: 400, y }), true);
}

When('the page sees the pointer at the top edge', async function () {
  await pageMove(this, 2);
});

When('the page sees the pointer well below the Island', async function () {
  await pageMove(this, 400);
});

When('I move the pointer well below the Island', async function () {
  await restCursor(this, { x: 400, y: 400 });
});

Then('the Island hides again', async function () {
  await waitForAutoHide(this, (value) => !value?.sliding && value?.stripHidden === true && value.pageY === coveredTop(value),
    'the strip to hide again');
});

Then('the Island stays shown while the palette is open', async function () {
  await restCursor(this, { x: 400, y: 400 });
  await sleep(1200);
  assert.equal(await this.call('overlayMode'), 'palette');
  const state = await autoHideState(this);
  assert.equal(state.stripHidden, false);
});

When('the palette closes with the pointer well below the Island', async function () {
  await restCursor(this, { x: 400, y: 400 });
  await this.call('closeOverlay');
});

After({ tags: '@island-autohide' }, async function () {
  if (this.floatOriginalSize) {
    await this.call('setWindowContentSize', this.floatOriginalSize.width, this.floatOriginalSize.height).catch(() => {});
    this.floatOriginalSize = null;
  }
  if (this.floatHeld) {
    await this.call('holdIslandInWindow', 'primary', false).catch(() => {});
    this.floatHeld = false;
  }
  await this.call('setIslandAutoHide', false).catch(() => {});
  await this.call('setIslandAutoHideStyle', 'float').catch(() => {});
  await this.call('setTabLayout', 'island').catch(() => {});
  await this.call('setTestCursorPoint', null).catch(() => {});
  await this.call('setCursorSamplingUnavailable', false).catch(() => {});
});

// The 6px band the strip document keeps at the top of the page pane while
// the page covers the strip: the window's only drag handle then.
Then('the thin top band drags the window', async function () {
  await waitForValue(() => this.call('dragBandAppRegion'), (region) => region === 'drag', 'the top band to drag the window');
});

// macOS: the traffic lights hide with a floating Island and come back with
// it, so they never sit over the page's top-left corner on their own.
Then('the window buttons are hidden with the Island', async function () {
  if (process.platform !== 'darwin') return;
  await waitForValue(() => autoHideState(this), (value) => value?.windowButtonsVisible === false, 'the traffic lights to hide');
});

Then('the window buttons are back with the Island', async function () {
  if (process.platform !== 'darwin') return;
  await waitForValue(() => autoHideState(this), (value) => value?.windowButtonsVisible === true, 'the traffic lights to return');
});

Then('the Island is revealed while the page stays at the top of the window', async function () {
  const state = await waitForAutoHide(this, (value) => value?.revealed === true && value?.stripHidden === false,
    'the floating Island to be revealed');
  assert.equal(state.floating, true);
  assert.equal(state.sliding, false, 'a floating Island never slides the page');
  assert.equal(state.pageY, coveredTop(state));
  assert.equal(state.activeBounds.y, coveredTop(state));
});

/* ---- Floating Island (float style) ---------------------------------------
 * The pill floats in its own transparent view over a page that never moves.
 * floatViewState reports the native view; floatEval reads its document. */

const FLOAT_SHADOW_PX = 20; // --shadow-island-float's reach below the pill

function floatState(world, role = 'pill') {
  return world.call('floatViewState', role);
}

/** The float view wraps the Island's rect with a little room on each side. */
function assertWraps(bounds, rect, label) {
  assert.ok(bounds && rect, `${label}: no bounds or rect`);
  assert.equal(bounds.y, 0, `${label}: the view starts at the window top`);
  const left = rect.x - bounds.x;
  const right = bounds.x + bounds.width - (rect.x + rect.width);
  const below = bounds.height - (rect.y + rect.height);
  for (const [side, gap] of [['left', left], ['right', right], ['below', below]]) {
    assert.ok(gap >= -1 && gap <= 30, `${label}: ${side} gap ${gap} (bounds ${JSON.stringify(bounds)}, rect ${JSON.stringify(rect)})`);
  }
}

async function pillBottomInView(world) {
  return world.call('floatEval', 'pill', `document.getElementById('islandPill').getBoundingClientRect().bottom`);
}

Then('the floating pill waits above the window edge', async function () {
  // The view hides once its element has slid out (SLIDE_OUT_MS).
  const state = await waitForValue(() => floatState(this), (value) => value?.attached === true && value.shown === false && value.visible === false,
    'the hidden floating pill view');
  assert.equal(state.attached, true);
  const bottom = await waitForValue(() => pillBottomInView(this), (value) => typeof value === 'number' && value + FLOAT_SHADOW_PX <= 0,
    'the hidden pill to sit wholly above the window edge');
  assert.ok(bottom + FLOAT_SHADOW_PX <= 0);
});

Then('the floating pill slides in over a page that stays still', async function () {
  for (let i = 0; i < 10; i += 1) {
    const state = await autoHideState(this);
    assert.equal(state.pageY, coveredTop(state), 'the page pane kept the top of the window');
    assert.equal(state.activeBounds?.y, coveredTop(state), 'the page view never moved');
    await sleep(30);
  }
  const pill = await waitForValue(() => floatState(this), (value) => value?.shown === true && value.visible === true,
    'the floating pill to show');
  assertWraps(pill.bounds, await this.call('islandRect'), 'pill');
  await waitForValue(() => this.call('floatEval', 'pill', `document.documentElement.classList.contains('float-shown')`),
    (value) => value === true, 'the pill to slide in');
  const bottom = await pillBottomInView(this);
  assert.ok(bottom > 0, 'the pill came down into the window');
  const state = await autoHideState(this);
  assert.equal(state.activeBounds.y, coveredTop(state));
});

Then('the floating pill slides away and stays attached', async function () {
  await waitForAutoHide(this, (value) => value?.revealed === false && value.stripHidden === true, 'the Island to hide');
  const state = await waitForValue(() => floatState(this), (value) => value?.shown === false && value.visible === false,
    'the pill view to hide after its slide');
  assert.equal(state.attached, true, 'the view stays window-owned (never removed and re-added)');
  const bottom = await pillBottomInView(this);
  assert.ok(bottom + FLOAT_SHADOW_PX <= 0, `the hidden pill peeks below the edge: ${bottom}`);
  await assertPageAtCoveredTop(this);
});

When('I open find', async function () {
  await this.call('openFind');
});

Then('the find bar sits under the floating pill over a page that stays still', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'find', 'find to open');
  const rect = await this.call('islandRect');
  const bounds = await this.call('overlayViewBounds');
  assert.ok(bounds.y >= rect.y + rect.height, `find (${bounds.y}) sits under the pill (${rect.y + rect.height})`);
  const state = await autoHideState(this);
  assert.equal(state.activeBounds.y, coveredTop(state));
  assert.equal((await floatState(this)).shown, true);
});

When('I open the shield menu', async function () {
  // Keep the Island up once find closes, as a pointer reaching for the
  // shield would, and click it on the floating pill.
  await restCursor(this, { x: 400, y: 2 });
  await this.call('closeOverlay');
  await waitForValue(() => floatState(this), (value) => value?.shown === true, 'the pill to stay shown');
  await this.call('floatEval', 'pill', `document.getElementById('pillShield').click()`);
});

Then('the shield menu hangs under the floating pill over a page that stays still', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'shield', 'the shield menu to open');
  const rect = await this.call('islandRect');
  const bounds = await this.call('overlayViewBounds');
  assert.ok(bounds.y >= rect.y + rect.height / 2, `the shield menu (${bounds.y}) hangs from the pill (${rect.y}+${rect.height})`);
  await assertPageAtCoveredTop(this);
  assert.equal((await floatState(this)).shown, true);
});

When('I rest the pointer on the floating address', async function () {
  const hover = await waitForValue(() => this.call('islandHoverRect'), Boolean, 'the address rectangle');
  const pill = await floatState(this);
  const point = { x: Math.round(hover.x + hover.width / 2), y: Math.round(hover.y + hover.height / 2) };
  await restCursor(this, point);
  // Into the float view, in its own coordinates, as a real pointer would be.
  assert.equal(await this.call('sendFloatMouseInput', 'pill',
    { type: 'mouseMove', x: point.x - pill.bounds.x, y: point.y - pill.bounds.y }), true);
});

When('I open a Glance beside the page', async function () {
  const state = await this.call('state');
  this.floatMainId = state.activeTabId;
  this.floatGlanceId = await this.call('openTab', this.fixtureUrl('autohide-page'));
  await this.call('activateTab', this.floatMainId, false);
  assert.equal(await this.call('setGlance', this.floatGlanceId), true);
});

Then('the page sits below the strip and no pill floats', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.floating === false && value.pageY > 0,
    'the page to sit below the strip');
  assert.equal(state.activeBounds.y, state.pageY);
  const pill = await floatState(this);
  assert.ok(!pill || pill.shown === false, 'no pill floats over the push layout');
});

When('I close the Glance', async function () {
  await this.call('closeGlance');
});

Then('the page returns to the top of the window and the pill hides', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.floating === true && value.pageY === coveredTop(value) && value.revealed === false,
    'the page to return to the top');
  assert.equal(state.activeBounds.y, coveredTop(state));
  await waitForValue(() => floatState(this), (value) => value?.shown === false, 'the pill to hide');
});

When('I open another tab', async function () {
  await this.call('openTab', this.fixtureUrl('autohide-page'));
});

Then('the floating pill follows the Island\'s place', async function () {
  await waitForValue(async () => {
    const [pill, rect] = await Promise.all([floatState(this), this.call('islandRect')]);
    try { assertWraps(pill?.bounds, rect, 'pill'); return true; } catch { return false; }
  }, (ok) => ok === true, 'the pill view to follow the Island');
  await assertPageAtCoveredTop(this);
});

Then('the floating pill stays above the pages', async function () {
  const pill = await waitForValue(() => floatState(this), (value) => value?.shown === true, 'the pill to show');
  assert.equal(pill.aboveTabsAndSheet, true, 'the pill is stacked above every page and the sheet');
});

When('I open Settings', async function () {
  await this.call('openTab', 'blanc://settings/');
  await waitForValue(() => this.call('utilitySurface'), (value) => !!value?.url || value?.visible === true, 'the Settings sheet');
});

When('I close Settings', async function () {
  await this.call('closeUtilitySurface');
});

When('I open a second window and close it', async function () {
  const runtimeId = await this.call('openNewWindow');
  const ids = await waitForValue(() => this.call('floatWebContentsIds', runtimeId), (value) => value?.length > 0,
    'the second window to make its floating views');
  this.closedFloatIds = ids;
  await this.call('closeWindowRuntime', runtimeId);
  await frontChromeWindow(this);
});

Then('the closed window\'s floating views are gone', async function () {
  for (const id of this.closedFloatIds) {
    await waitForValue(() => this.call('chromeSurfaceRegistered', id), (value) => value === false,
      `float surface ${id} to unregister`);
  }
});

When('I switch auto-hide to {word}', async function (style) {
  assert.equal(await this.call('setIslandAutoHideStyle', style), style);
});

Then('no floating views remain and the page sits below the strip', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.pageY > 0 && value?.stripHidden === false,
    'the page to sit below the strip');
  assert.equal(state.activeBounds.y, state.pageY);
  for (const role of ['pill', 'controls', 'menu']) {
    assert.equal(await floatState(this, role), null, `no ${role} float view`);
  }
});

When('I open a private tab', async function () {
  await this.call('openTab', this.fixtureUrl('autohide-page'), { private: true });
});

Then('the floating pill shows the private theme', async function () {
  await waitForValue(() => this.call('floatEval', 'pill', 'document.documentElement.dataset.theme || null'),
    (value) => value === 'private', 'the floating pill to take the private theme');
});

When('I point at the top edge of the window and switch auto-hide to push at once', async function () {
  const state = await this.call('state');
  await restCursor(this, { x: 400, y: 2 });
  assert.equal(await this.call('sendMouseInput', state.activeTabId, { type: 'mouseMove', x: 400, y: 2 }), true);
  assert.equal(await this.call('setIslandAutoHideStyle', 'push'), 'push');
});

When('I resize the window to {int} by {int}', async function (width, height) {
  if (!this.floatOriginalSize) {
    const bounds = await this.call('windowContentBounds');
    this.floatOriginalSize = { width: bounds.width, height: bounds.height };
  }
  await this.call('setWindowContentSize', width, height);
  await restCursor(this, { x: 400, y: 2 });
});

When('I set the appearance to {string}', async function (theme) {
  assert.equal(await this.call('setAppearance', theme), theme);
});

Then('the floating pill matches the strip\'s theme', async function () {
  const probe = `({ dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() })`;
  await waitForValue(async () => {
    const [strip, pill] = await Promise.all([this.call('chromeEval', probe), this.call('floatEval', 'pill', probe)]);
    return strip && pill && strip.dark === pill.dark && strip.bg === pill.bg ? strip : null;
  }, Boolean, 'the floating pill to match the strip\'s theme');
});

/* ---- Windows/Linux window buttons in float mode (@test-platform-linux) ----
 * The app runs with BLANC_TEST_PLATFORM=linux, so both main and the chrome
 * renderers act as on Linux: the strip draws its own controls and menu
 * button, and float mode copies them into their own views. */

async function floatControls(world) {
  return world.call('floatControlsState');
}

async function clickInFloatView(world, role, target) {
  const point = { x: Math.round(target.viewX + target.width / 2), y: Math.round(target.viewY + target.height / 2) };
  for (const type of ['mouseDown', 'mouseUp']) {
    assert.equal(await world.call('sendFloatMouseInput', role, { type, ...point, button: 'left', clickCount: 1 }), true);
  }
}

Then('the strip reports where its window buttons are', async function () {
  const rects = await waitForValue(() => this.call('chromeButtonRects'), (value) => value?.windowControlsRect && value?.menuButtonRect,
    'the strip to report its window controls and menu button');
  assert.ok(rects.windowControlsRect.width > 0 && rects.menuButtonRect.width > 0);
});

Then('the floating window controls wait above the window edge', async function () {
  await waitForValue(() => floatState(this, 'controls'), (value) => value?.attached === true && value.shown === false && value.visible === false,
    'the hidden window controls view');
  assert.equal((await autoHideState(this)).revealed, false);
});

Then('the floating window controls slide in with three working buttons', async function () {
  const view = await waitForValue(() => floatState(this, 'controls'), (value) => value?.shown === true && value.visible === true,
    'the floating window controls to show');
  const rects = await this.call('chromeButtonRects');
  assert.ok(view.bounds.x <= rects.windowControlsRect.x && view.bounds.x + view.bounds.width >= rects.windowControlsRect.x + rects.windowControlsRect.width,
    'the controls view holds the strip\'s controls');
  const state = await waitForValue(() => floatControls(this), (value) => value?.controls?.length === 3 && value.controls.every((b) => b.viewY > 0),
    'three visible window buttons in the controls view');
  const bounds = await this.call('windowContentBounds');
  for (const button of state.controls) {
    assert.ok(button.x >= 0 && button.x + button.width <= bounds.width && button.y >= 0, `button inside the window: ${JSON.stringify(button)}`);
  }
  assert.equal((await floatState(this, 'pill')).shown, true);
});

Then('the floating menu button waits above the window edge', async function () {
  await waitForValue(() => floatState(this, 'menu'), (value) => value?.attached === true && value.shown === false && value.visible === false,
    'the hidden menu button view');
  const state = await floatControls(this);
  // Its shadow reaches 8px (FLOAT_CHROME_PAD_PX) below it.
  assert.ok(state.menu && state.menu.viewY + state.menu.height + 8 <= 0, `the hidden menu button peeks below the edge: ${JSON.stringify(state.menu)}`);
});

Then('the floating menu button slides in with the pill', async function () {
  await waitForValue(() => floatState(this, 'menu'), (value) => value?.shown === true && value.visible === true, 'the menu button view');
  const state = await waitForValue(() => floatControls(this), (value) => value?.menu?.visible === true && value.menu.viewY > 0,
    'the menu button to slide in');
  const bounds = await this.call('windowContentBounds');
  assert.ok(state.menu.x >= 0 && state.menu.x + state.menu.width <= bounds.width);
  assert.equal((await floatState(this, 'pill')).shown, true);
});

When('I click maximise on the floating window controls', async function () {
  const state = await floatControls(this);
  await clickInFloatView(this, 'controls', state.controls[1]);
});

When('I click minimise on the floating window controls', async function () {
  const state = await floatControls(this);
  await clickInFloatView(this, 'controls', state.controls[0]);
});

Then('the window is maximised', async function () {
  await waitForValue(() => this.call('mainWindowState'), (value) => value?.maximized === true, 'the window to maximise');
});

Then('the window is not maximised', async function () {
  await waitForValue(() => this.call('mainWindowState'), (value) => value?.maximized === false, 'the window to unmaximise');
  // macOS animates the zoom back; a minimise asked for mid-animation is lost.
  await sleep(800);
});

Then('the window is minimised', async function () {
  await waitForValue(() => this.call('mainWindowState'), (value) => value?.minimized === true, 'the window to minimise');
  await this.call('restoreMainWindow');
  await frontChromeWindow(this);
});

When('I click the floating menu button', async function () {
  await restCursor(this, { x: 400, y: 2 });
  const view = await waitForValue(() => floatState(this, 'menu'), (value) => value?.shown === true, 'the menu button view');
  void view;
  const state = await waitForValue(() => floatControls(this), (value) => value?.menu?.viewY > 0, 'the menu button in place');
  await clickInFloatView(this, 'menu', state.menu);
});

Then('the main menu opens from the floating menu button', async function () {
  const requests = await waitForValue(() => this.call('mainMenuRequests'), (value) => value?.length > 0, 'a main menu request');
  const last = requests.at(-1);
  assert.equal(last.from, 'menu');
  const rects = await this.call('chromeButtonRects');
  // The popup point is the button's bottom-left, in window coordinates.
  assert.ok(Math.abs(last.point.x - rects.menuButtonRect.x) <= 2, JSON.stringify({ last, rects }));
  assert.ok(Math.abs(last.point.y - (rects.menuButtonRect.y + rects.menuButtonRect.height)) <= 2, JSON.stringify({ last, rects }));
});

// The pill as each document draws it: its place on the strip stage and which
// of its parts show. The floating copy must be the strip's pill exactly.
const PILL_PROBE = `(() => {
  const stage = document.getElementById('chrome').getBoundingClientRect();
  const pill = document.getElementById('islandPill');
  const r = pill.getBoundingClientRect();
  const parts = [...pill.querySelectorAll('[id]')].filter((el) => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().width > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }).map((el) => el.id).sort();
  return { x: r.left - stage.left, y: r.top - stage.top, width: r.width, height: r.height, parts, slim: pill.classList.contains('slim') };
})()`;

Then('the floating pill matches the strip\'s pill', async function () {
  let last = null;
  await waitForValue(async () => {
    const [strip, pill] = await Promise.all([this.call('chromeEval', PILL_PROBE), this.call('floatEval', 'pill', PILL_PROBE)]);
    last = { strip, pill };
    return strip && pill && Math.abs(strip.x - pill.x) <= 1 && Math.abs(strip.y - pill.y) <= 1
      && Math.abs(strip.width - pill.width) <= 1 && strip.slim === pill.slim
      && JSON.stringify(strip.parts) === JSON.stringify(pill.parts);
  }, Boolean, 'the floating pill to match the strip\'s pill').catch((error) => {
    throw new Error(`${error.message}: ${JSON.stringify(last)}`);
  });
});

When('I switch to vertical tabs', async function () {
  await this.call('setTabLayout', 'vertical');
});

// Acceptance-only hold (the drawing check's): reveals the Island without a
// focused window or a pointer, so the comparison needs neither.
When('the Island is held up in this window', async function () {
  assert.equal(await this.call('holdIslandInWindow', 'primary', true), true);
  this.floatHeld = true;
  await waitForValue(() => floatState(this), (value) => value?.shown === true, 'the held pill to show');
});
