'use strict';
// Send to device (F55, M7b addendum): the inbox in the ⌘L Other devices
// drawer and on the Ledger start page, and /send. The test hook stands an
// in-memory sends store in for sync's (injectSends).
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue, openOverlaySurface } = require('../support/poll');
const { overlayPage } = require('../support/overlay');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PHONE = 'acceptance-phone';
const SENT_URL = 'https://sent.example/needle';

function sends(world) {
  world.sends ??= { targets: [], inbox: [], sendStatus: 'sent' };
  return world.sends;
}
const applySends = (world) => world.call('injectSends', sends(world));

Given('{string} sent the page {string} here', async function (device, title) {
  const s = sends(this);
  s.targets = [{ id: PHONE, name: device, platform: 'ios' }];
  s.inbox = [{ id: 'sent-1', url: SENT_URL, title, sentAt: Date.now() - 5 * 60_000, fromName: device }];
  await applySends(this);
});

Given('{string} can receive pages', async function (device) {
  sends(this).targets = [{ id: PHONE, name: device, platform: 'ios' }];
  await applySends(this);
});

Given('no other device can receive pages', async function () {
  sends(this).targets = [];
  await applySends(this);
});

Given('the sync server can\'t take sent pages yet', async function () {
  sends(this).sendStatus = 'unavailable';
  await applySends(this);
});

Given('a web page is open', async function () {
  this.sentFromTabId = await this.call('openTab', this.fixtureUrl('send-source'), {});
  await this.waitForState((state) => state.activeTabId === this.sentFromTabId);
});

Given('a private web page is open', async function () {
  this.sentFromTabId = await this.call('openTab', this.fixtureUrl('send-private'), { private: true });
  await this.waitForState((state) => state.activeTabId === this.sentFromTabId);
});

async function openPanel(world) {
  await openOverlaySurface(world, 'openPanel', 'panel');
  await waitForValue(() => world.call('overlayRendererMode'), (mode) => mode === 'panel', 'panel renderer');
  // Opening reads the injected sends; only remote tabs come from the real
  // (disabled) sync cache, which has none.
  await sleep(150);
  await world.call('clearRemoteDevices');
  return overlayPage();
}

When('I open the Island panel for sent pages', async function () {
  this.islandPage = await openPanel(this);
});

Then('the drawer lists {string} from {string} first', async function (title, device) {
  const drawer = this.islandPage.locator('#islandDrawer');
  await drawer.waitFor({ state: 'visible' });
  const first = drawer.locator('.island-ghead, .island-row').first();
  assert.equal((await first.locator('.ghead-name').textContent()).trim(), 'Sent to this device');
  const row = drawer.locator('.sent-row').filter({ hasText: title });
  await row.waitFor({ state: 'visible' });
  assert.match(await row.locator('.row-sub').textContent(), new RegExp(`^From ${device} · `));
});

When('I open the sent page {string}', async function (title) {
  await this.islandPage.locator('#islandDrawer .sent-row').filter({ hasText: title }).click();
});

When('I dismiss the sent page {string}', async function (title) {
  const row = this.islandPage.locator('#islandDrawer .sent-row').filter({ hasText: title });
  await row.hover();
  await row.locator('.sent-dismiss').click();
});

Then('a tab is open on the sent page\'s address', async function () {
  await this.waitForState((state) => state.tabs.some((tab) => tab.url === SENT_URL && !tab.private &&
    tab.id === state.activeTabId));
});

Then('no tab is open on the sent page\'s address', async function () {
  await sleep(300);
  const state = await this.state();
  assert.equal(state.tabs.some((tab) => tab.url === SENT_URL), false);
});

Then('no page is waiting from another device', async function () {
  // Opening a page closed the panel; its rows only re-render while it shows.
  if (await this.call('overlayRendererMode') !== 'panel') this.islandPage = await openPanel(this);
  const page = await overlayPage();
  await waitForValue(() => page.evaluate(() => document.querySelectorAll('#islandDrawer .sent-row').length),
    (count) => count === 0, 'the sent page to leave the drawer');
  await waitForValue(() => page.locator('#footerDevices').isVisible(), (visible) => visible === false,
    'the Other devices button to go with it');
});

When('I run {string} in the Island panel', async function (text) {
  this.islandPage = await openPanel(this);
  assert.equal(await this.call('editAddressInput', text), true);
  assert.equal(await this.call('pressAddressKey', 'Enter'), true);
});

When('I type {string} into the Island command bar', async function (text) {
  this.islandPage = await openPanel(this);
  assert.equal(await this.call('editAddressInput', text), true);
});

Then('the commands list has no {string}', async function (command) {
  await this.islandPage.locator('#islandList .row-cmd').first().waitFor({ state: 'visible' });
  const commands = await this.islandPage.locator('#islandList .row-cmd').allTextContents();
  assert.equal(commands.includes(command), false, commands.join(', '));
});

Then('the page was sent to {string}', async function (device) {
  const sent = await waitForValue(() => this.call('sentRequests'), (list) => list.length === 1, 'one send');
  assert.equal(sent[0].to, PHONE, device);
  assert.equal(sent[0].url, this.fixtureUrl('send-source'));
});

Then('the Island panel says {string}', async function (text) {
  await this.islandPage.locator('#islandList .command-notice').filter({ hasText: text }).waitFor({ state: 'visible' });
});

When('I open a new start page', async function () {
  const id = await this.call('newTab');
  await this.waitForState((state) => state.activeTabId === id &&
    state.tabs.find((tab) => tab.id === id)?.loadedUrl?.startsWith('blanc://newtab/'));
  // The page asked for its data while loading; push the injected inbox again.
  await applySends(this);
});

Then('the start page lists the sent page {string} from {string}', async function (title, device) {
  await waitForValue(() => this.call('sentStartPageRows'),
    (rows) => rows.some((row) => row.visible && row.title === title && row.from.startsWith(`From ${device} · `)),
    `${title} from ${device} on the start page`);
});

When('I dismiss {string} on the start page', async function (title) {
  assert.equal(await this.call('clickSentStartPageRow', title, 'dismiss'), true);
});

Then('the start page lists no sent page', async function () {
  await waitForValue(() => this.call('sentStartPageRows'), (rows) => rows.length === 0, 'no sent page on the start page');
});
