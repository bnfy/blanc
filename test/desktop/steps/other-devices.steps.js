'use strict';
// The ⌘L panel's Other devices drawer (spec 2026-10-16-island-lower-section
// §6): a footer toggle opening the synced devices between the tab list and
// the footer.
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue, openOverlaySurface } = require('../support/poll');
const { overlayPage } = require('../support/overlay');
const ctx = require('../support/context');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Open the panel; opening refreshes devices from the real (disabled) sync
 * cache, so the fixture is sent once that refresh has settled. */
async function openPanel(world) {
  await openOverlaySurface(world, 'openPanel', 'panel');
  await waitForValue(() => world.call('overlayRendererMode'), (mode) => mode === 'panel', 'panel renderer');
  await sleep(150);
  if (world.remoteDevicesWanted) await world.call('injectRemoteDevices', world.remoteDeviceCount ?? 1);
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
  // Matched by name, not by the drawer's own attributes, so the old
  // bottom-of-list device rows would fail it too.
  assert.equal(await this.islandPage.locator('#islandList .island-ghead').filter({ hasText: 'Press Mac' }).count(), 0);
});

When('I unfold {string} from the keyboard', async function (name) {
  const header = this.islandPage.locator('#islandDrawer .island-ghead[data-device-id]').filter({ hasText: name });
  await header.focus();
  await this.islandPage.keyboard.press('Enter');
  await header.and(this.islandPage.locator('[aria-expanded="true"]')).waitFor({ state: 'visible' });
});

Then('keyboard focus stays on the {string} header', async function (name) {
  await waitForValue(() => this.islandPage.evaluate(() => {
    const header = document.activeElement?.closest?.('#islandDrawer .island-ghead[data-device-id]');
    return header ? header.textContent : '';
  }), (text) => text.includes(name), `focus on the ${name} header`);
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

Given('ten tabs are open', async function () {
  for (let i = 1; i <= 10; i += 1) await this.call('openTab', this.fixtureUrl(`drawer-room-${i}`), {});
});

Given('eight other devices are sharing their tabs', function () {
  this.remoteDevicesWanted = true;
  this.remoteDeviceCount = 8;
});

Given('the window is 640 by 480 with the Island at 125%', async function () {
  await ctx.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/').setSize(640, 480);
  });
});

Then('the tab list keeps at least two rows and the footer stays in the window', async function () {
  const page = this.islandPage;
  await ctx.app.evaluate(({ webContents }) => {
    webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://overlay/').setZoomFactor(1.25);
  });
  await page.locator('#islandDrawer').waitFor({ state: 'visible' });
  const measure = () => page.evaluate(() => ({
    listHeight: document.getElementById('islandList').getBoundingClientRect().height,
    drawerHeight: document.getElementById('islandDrawer').getBoundingClientRect().height,
    footerBottom: document.getElementById('islandFooter').getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  try {
    // Zoom and layout settle asynchronously; judge the settled geometry.
    const settled = await waitForValue(measure, (m) => Math.abs(m.height - 480 / 1.25) <= 2, 'the 125% overlay to settle');
    assert.ok(settled.listHeight >= 64, `the tab list keeps two rows: ${JSON.stringify(settled)}`);
    assert.ok(settled.footerBottom <= settled.height + 1, `the footer stays in the window: ${JSON.stringify(settled)}`);
  } finally {
    await ctx.app.evaluate(({ BrowserWindow, webContents }) => {
      webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc-chrome://overlay/').setZoomFactor(1);
      BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/').setSize(1280, 800);
    });
  }
});

When('I choose Rename Device… for {string}', async function (name) {
  assert.equal(await this.call('beginRenameDeviceByName', name), true, `a device named ${name}`);
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m === 'panel', 'the command bar to open');
});

Then('the panel says the field renames the device', async function () {
  const page = await overlayPage();
  await page.locator('#islandList .name-prompt').filter({ hasText: 'Rename device' }).waitFor({ state: 'visible' });
});

When('I clear the command bar and press Enter', async function () {
  const page = await overlayPage();
  await page.press('#addressInput', 'Backspace');
  await page.press('#addressInput', 'Enter');
});

Then('the start page lists {string} from {string}', async function (title, device) {
  await waitForValue(() => this.call('remoteStartPageRows'),
    (rows) => rows.some((row) => row.title === title && row.host.endsWith(` · ${device}`)),
    `${title} from ${device} on the start page`);
});

Then('the Quick Switcher lists {string} from {string}', async function (title, device) {
  assert.equal(await this.call('editAddressInput', title), true);
  await waitForValue(() => this.call('addressResultRows'),
    (rows) => rows.some((row) => row.title === title && row.sub.endsWith(` · ${device}`)),
    `${title} from ${device} in the Quick Switcher`);
});
