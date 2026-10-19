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
  await waitForValue(() => autoHideState(world), (state) => state?.stripHidden === true,
    'the strip to hide after its tip', INTRO_WAIT_MS);
}

When('I turn on auto-hide', async function () {
  await turnOn(this, 'island');
});

Then('the Island stays shown with a tip on bringing it back', async function () {
  const state = await waitForAutoHide(this, (value) => value?.introTipShown === true, 'the how-to tip');
  assert.equal(state.stripHidden, false);
  assert.ok(state.pageY > 0, 'the page still sits below the strip');
  assert.equal(state.activeBounds.y, state.pageY, 'the page view moved below the strip');
});

Then('then the page starts at the top of the window', async function () {
  const state = await waitForValue(() => autoHideState(this), (value) => value?.pageY === 0,
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
  const state = await waitForAutoHide(this, (value) => value?.pageY === 0, 'the page to reach the top edge');
  assert.equal(state.enabled, true);
  assert.equal(state.activeBounds.y, 0);
});

Then('the page starts at the top of the window beside the rail', async function () {
  const state = await waitForAutoHide(this, (value) => value?.pageY === 0, 'the page to reach the top edge');
  assert.equal(state.activeBounds.y, 0);
  assert.ok(state.activeBounds.x > 0, 'the vertical rail kept its column');
});

Then('the page starts below the Island', async function () {
  const state = await waitForAutoHide(this, (value) => value?.enabled === false && value.pageY > 0,
    'the page to move below the strip');
  assert.equal(state.stripHidden, false);
});

When('I point at the top edge of the window', async function () {
  const state = await this.call('state');
  await restCursor(this, { x: 400, y: 2 });
  assert.equal(await this.call('sendMouseInput', state.activeTabId, { type: 'mouseMove', x: 400, y: 2 }), true);
});

Then('the Island is shown above the page', async function () {
  const state = await waitForAutoHide(this, (value) => value?.stripHidden === false && value.pageY > 0,
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

When('I move the pointer well below the Island', async function () {
  await restCursor(this, { x: 400, y: 400 });
});

Then('the Island hides again', async function () {
  await waitForAutoHide(this, (value) => value?.stripHidden === true && value.pageY === 0,
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
});
