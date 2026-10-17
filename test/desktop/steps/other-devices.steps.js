'use strict';
// The ⌘L panel's Other devices drawer (spec 2026-10-16-island-lower-section
// §6): a footer toggle opening the synced devices between the tab list and
// the footer.
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue, openOverlaySurface } = require('../support/poll');
const { overlayPage } = require('../support/overlay');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Open the panel; opening refreshes devices from the real (disabled) sync
 * cache, so the fixture is sent once that refresh has settled. */
async function openPanel(world) {
  await openOverlaySurface(world, 'openPanel', 'panel');
  await waitForValue(() => world.call('overlayRendererMode'), (mode) => mode === 'panel', 'panel renderer');
  await sleep(150);
  if (world.remoteDevicesWanted) await world.call('injectRemoteDevices');
  else await world.call('clearRemoteDevices');
  return overlayPage();
}

Given('another device is sharing its tabs', function () {
  this.remoteDevicesWanted = true;
});

Given('no other device is sharing its tabs', function () {
  this.remoteDevicesWanted = false;
});

When('I open the Island panel for other devices', async function () {
  this.islandPage = await openPanel(this);
});

When('I close and reopen the Island panel', async function () {
  await this.call('closeOverlay');
  this.islandPage = await openPanel(this);
});

When('I toggle Other devices', async function () {
  const button = this.islandPage.locator('#footerDevices');
  await button.waitFor({ state: 'visible' });
  await button.click();
});

When('I type {string} into the Island address field', async function (text) {
  assert.equal(await this.call('editAddressInput', text), true);
});

When('I clear the Island address field', async function () {
  assert.equal(await this.call('editAddressInput', '', 'deleteContentBackward'), true);
});

Then('the Other devices button shows {int}', async function (count) {
  const button = this.islandPage.locator('#footerDevices');
  await button.waitFor({ state: 'visible' });
  assert.equal((await button.locator('.footer-kbd').textContent()).trim(), String(count));
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
});

Then('the tab list shows no device rows', async function () {
  assert.equal(await this.islandPage.locator('#islandList [data-device-id]').count(), 0);
});

Then('the Other devices drawer lists {string} between the tab list and the footer', async function (name) {
  const page = this.islandPage;
  const drawer = page.locator('#islandDrawer');
  await drawer.waitFor({ state: 'visible' });
  await drawer.locator('.island-ghead[data-device-id]').filter({ hasText: name }).waitFor({ state: 'visible' });
  const order = await page.evaluate(() => {
    const top = (id) => document.getElementById(id).getBoundingClientRect().top;
    return { list: top('islandList'), drawer: top('islandDrawer'), footer: top('islandFooter') };
  });
  assert.ok(order.list < order.drawer && order.drawer < order.footer, JSON.stringify(order));
  assert.equal(await page.locator('#footerDevices').getAttribute('aria-expanded'), 'true');
});

Then('the Other devices drawer is closed', async function () {
  await waitForValue(() => this.islandPage.locator('#islandDrawer').isVisible(), (visible) => visible === false,
    'the Other devices drawer to be closed');
});

Then('there is no Other devices button', async function () {
  await sleep(300);
  assert.equal(await this.islandPage.locator('#footerDevices').isVisible(), false);
});
