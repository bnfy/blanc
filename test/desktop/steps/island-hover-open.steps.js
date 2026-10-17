const assert = require('node:assert/strict');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const { frontChromeWindow } = require('../support/tab-drag');
const ctx = require('../support/context');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const center = (rect, dx = 0, dy = 0) => ({
  x: Math.round(rect.x + rect.width / 2 + dx),
  y: Math.round(rect.y + rect.height / 2 + dy),
});

async function sendMove(world, point, expectedInside) {
  assert.equal(await world.call('sendChromeMouseInput', {
    type: 'mouseMove', x: point.x, y: point.y,
  }), true, 'chrome mouse input was not sent');
  return waitForValue(
    () => world.call('islandHoverState'),
    (state) => state?.inside === expectedInside,
    `Island hover state to report inside=${expectedInside}`,
  );
}

async function prepare(world, { enabled, layout = 'island' }) {
  await world.call('setTabLayout', layout);
  await world.call('setIslandHoverOpen', enabled);
  await world.call('closeOverlay');
  await world.call('resetOverlayShowCount');
  await frontChromeWindow(world);
  const rect = await waitForValue(
    () => world.call('islandRect'),
    (value) => value && value.width > 0 && value.height > 0,
    'the resting Island rectangle',
  );
  await sendMove(world, center(rect, 0, rect.height + 100), false);
  world.hoverIslandRect = rect;
  return rect;
}

async function enter(world, offsetX = 0) {
  const state = await sendMove(world, center(world.hoverIslandRect, offsetX), true);
  return state;
}

async function assertClosed(world) {
  assert.equal(await world.call('overlayMode'), null);
}

Given('Island hover-open is off', async function () {
  await prepare(this, { enabled: false });
});

Given('Island hover-open is on', async function () {
  await prepare(this, { enabled: true });
});

Given('Island hover-open is on with vertical tabs', async function () {
  await prepare(this, { enabled: true, layout: 'vertical' });
});

When('I rest the pointer over the Island for {int} milliseconds', async function (ms) {
  await enter(this);
  await sleep(ms);
});

When('I rest the pointer over the Island for less than 300 milliseconds', async function () {
  const state = await enter(this);
  assert.equal(state.dwelling, true, 'entering the Island did not start the dwell');
  await sleep(200);
});

When('I keep the pointer there through the 300 millisecond dwell', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel',
    'the hover dwell to open the panel');
});

When('I cross the Island in 150 milliseconds', async function () {
  await enter(this);
  await sleep(150);
  await sendMove(this, center(this.hoverIslandRect, 0, this.hoverIslandRect.height + 100), false);
});

When('I move within the Island every 50 milliseconds', async function () {
  const started = Date.now();
  const deadline = started + 600;
  await enter(this, -Math.min(10, this.hoverIslandRect.width / 4));
  let move = 0;
  while (Date.now() < deadline) {
    await sleep(50);
    if (await this.call('overlayMode') === 'panel') {
      this.hoverOpenedDuringMotion = Date.now() - started < 600;
      return;
    }
    const offsets = [-10, -5, 0, 5, 10, 5, 0, -5];
    await sendMove(this, center(this.hoverIslandRect, offsets[move++ % offsets.length]), true);
  }
  this.hoverOpenedDuringMotion = false;
});

When('I rest the pointer 100 pixels below the Island for 400 milliseconds', async function () {
  await sendMove(this, center(this.hoverIslandRect, 0, this.hoverIslandRect.height / 2 + 100), false);
  await sleep(400);
});

Given('the Island panel opened normally with the pointer outside it', async function () {
  await this.call('openPanel');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel',
    'the ordinary panel open');
  const outside = center(this.hoverIslandRect, 0, this.hoverIslandRect.height + 100);
  await sendMove(this, outside, false);
  assert.deepEqual(await this.call('islandHoverState'), {
    inside: false,
    armed: true,
    dwelling: false,
  });
});

Given('the test cursor is resting over the Island', async function () {
  const point = center(this.hoverIslandRect);
  const bounds = await this.call('windowContentBounds');
  assert.ok(bounds, 'the main window has no content bounds');
  assert.equal(await this.call('setTestCursorPoint', {
    x: bounds.x + point.x,
    y: bounds.y + point.y,
  }), true);
});

When('I dismiss the panel without moving the pointer', async function () {
  await this.call('closeOverlay');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode == null,
    'the Island panel to dismiss');
});

When('I leave and re-enter the Island', async function () {
  const outside = center(this.hoverIslandRect, 0, this.hoverIslandRect.height + 100);
  const inside = center(this.hoverIslandRect);
  await sendMove(this, outside, false);
  await sendMove(this, inside, true);
});

When('I send another move inside the Island', async function () {
  await sendMove(this, center(this.hoverIslandRect, 5), true);
});

When('I open the Island normally during its hover dwell', async function () {
  await enter(this);
  await sleep(150);
  await this.call('openPanel');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel',
    'the ordinary panel open');
  await sleep(250);
});

Given('the shield popover is open for hover testing', async function () {
  await this.call('clickPillShield');
  await waitForValue(() => this.call('shieldPopoverState'), (state) => state?.visible,
    'the shield popover to open');
});

When('I rest the pointer over the Island through its dwell', async function () {
  await enter(this);
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel',
    'hover-open with vertical tabs');
});

When('I turn Island hover-open off halfway through its dwell', async function () {
  await enter(this);
  await sleep(150);
  await this.call('setIslandHoverOpen', false);
});

When('a site requests geolocation', async function () {
  const url = this.fixtureUrl('permission');
  this.hoverPermissionTabId = await this.call('openTab', url, {});
  await this.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === this.hoverPermissionTabId);
    return tab && !tab.loading && tab.loadedUrl === url;
  });
  const page = await waitForValue(
    () => Promise.resolve(ctx.app.windows().find((candidate) => !candidate.isClosed() && candidate.url() === url)),
    Boolean,
    'the geolocation fixture page',
  );
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition(() => {}, () => {});
  });
});

Then('the Blanc permission prompt for geolocation is shown', async function () {
  this.hoverPermissionPrompt = await waitForValue(
    () => Promise.resolve(ctx.app.windows().find((candidate) =>
      !candidate.isClosed() && candidate.url() === 'blanc-chrome://permission/')),
    Boolean,
    'the Blanc permission prompt',
  );
  await this.hoverPermissionPrompt.locator('#permBlockBtn').waitFor({ state: 'visible' });
});

Then('the Island panel stays closed', async function () {
  await assertClosed(this);
});

Then('the Island panel stays closed after {int} milliseconds', async function (ms) {
  await sleep(ms);
  await assertClosed(this);
});

Then('the Island panel opens from hover', async function () {
  const mode = await waitForValue(() => this.call('overlayMode'), (value) => value === 'panel',
    'the hover dwell to open the Island panel');
  assert.equal(mode, 'panel');
});

Then('the Island panel opened during continuous motion', async function () {
  assert.equal(this.hoverOpenedDuringMotion, true,
    'the panel did not open while pointer moves were still arriving');
  assert.equal(await this.call('overlayMode'), 'panel');
});

Then('the resting pointer is disarmed inside the Island', async function () {
  assert.deepEqual(await this.call('islandHoverState'), {
    inside: true,
    armed: false,
    dwelling: false,
  });
});

Then('exactly one Island panel is open', async function () {
  assert.equal(await this.call('overlayMode'), 'panel');
  assert.equal(await this.call('overlayShowCount'), 1);
  assert.equal((await this.call('islandHoverState')).dwelling, false);
});

Then('the shield popover remains open without the Island panel', async function () {
  assert.equal((await this.call('shieldPopoverState'))?.visible, true);
  assert.equal(await this.call('overlayMode'), 'shield');
  assert.equal(await this.call('overlayShowCount'), 1, 'hover tried to replace the shield popover');
});

Then('the permission prompt remains open without the Island panel', async function () {
  assert.equal(await this.call('overlayMode'), null);
  assert.equal(await this.hoverPermissionPrompt.locator('#permBlockBtn').isVisible(), true);
});

After({ tags: '@island-hover' }, async function () {
  await this.call('setTestCursorPoint', null).catch(() => {});
  const block = this.hoverPermissionPrompt?.locator('#permBlockBtn');
  if (block && await block.isVisible().catch(() => false)) await block.click();
});
