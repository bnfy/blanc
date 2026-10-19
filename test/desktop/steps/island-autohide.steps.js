const assert = require('node:assert/strict');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const { frontChromeWindow } = require('../support/tab-drag');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function autoHideState(world) {
  return world.call('islandAutoHideState');
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

async function turnOn(world, layout) {
  await world.call('setTabLayout', layout);
  await world.call('closeOverlay');
  await frontChromeWindow(world);
  // Somewhere well below the strip, so nothing holds it on.
  await restCursor(world, { x: 400, y: 400 });
  assert.equal(await world.call('setIslandAutoHide', true), true);
}

async function prepare(world, layout) {
  await turnOn(world, layout);
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
  const state = await waitForValue(() => autoHideState(this), (value) => !value?.sliding && value?.pageY === 0,
    'the page to reach the top edge after the tip', INTRO_WAIT_MS);
  assert.equal(state.introducing, false);
  assert.equal(state.activeBounds.y, 0);
});

Given('the Island auto-hides', async function () {
  await prepare(this, 'island');
});

Given('the Island auto-hides with vertical tabs', async function () {
  await prepare(this, 'vertical');
});

When('auto-hide is turned off', async function () {
  assert.equal(await this.call('setIslandAutoHide', false), false);
});

Then('the page starts at the top of the window', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.pageY === 0, 'the page to reach the top edge');
  assert.equal(state.enabled, true);
  assert.equal(state.activeBounds.y, 0);
});

Then('the page starts at the top of the window beside the rail', async function () {
  const state = await waitForAutoHide(this, (value) => !value?.sliding && value?.pageY === 0, 'the page to reach the top edge');
  assert.equal(state.activeBounds.y, 0);
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
  assert.equal(state.pageY, 0);
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
  await waitForAutoHide(this, (value) => !value?.sliding && value?.stripHidden === true && value.pageY === 0,
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
  await this.call('setIslandAutoHide', false).catch(() => {});
  await this.call('setTabLayout', 'island').catch(() => {});
  await this.call('setTestCursorPoint', null).catch(() => {});
  await this.call('setCursorSamplingUnavailable', false).catch(() => {});
});
