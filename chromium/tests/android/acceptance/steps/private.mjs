// F4 private tabs on Android.
import {Given, When, Then} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {sleep} from '../support/device.mjs';
import {START_PAGE, host} from '../support/scenario.mjs';

// The Island's raised color, read inside its top edge: white in light mode, #1F1F1F when private.
function pillColor(device) {
  const b = device.find({id: 'blanc_island_pill'});
  return device.pixel(Math.round((b.left + b.right) / 2), b.top + 4);
}

async function openPrivate(world) {
  world.normalPill = pillColor(world.device);
  world.device.menu('New Private Tab');
  await world.device.waitFor(() => world.device.grid().tabs.some(t => t.private && t.selected), 'a private tab');
}

Given('I open a private tab', async function () {
  // A normal visit first: the history page must show it, or "not in history" proves nothing.
  await this.open('public');
  await openPrivate(this);
});

Given('the active tab is private', async function () { await openPrivate(this); });

When('I visit {string} in the private tab', async function (name) {
  this.device.runInPalette(name);
  await this.device.waitForUrl(this.url(name));
});

Then('{string} is not in history', async function (name) {
  // Blanc's History page, in the normal tab.
  this.device.openGrid();
  this.device.tap(this.device.card(host('public')));
  this.device.runInPalette('blanc://history');
  let text = '';
  await this.device.waitFor(async () => (text = (await this.device.page('document.body.innerText')) || '').includes(host('public')),
    'the History page to list the normal visit');
  assert.ok(!text.includes(host(name)), `${name} is in history`);
});

When('I close the private tab', function () {
  this.device.openGrid();
  const privateTab = this.device.grid().tabs.find(t => t.private);
  assert.ok(privateTab, 'no private tab');
  this.device.tap(this.device.card(privateTab.title));
  this.device.runInPalette('/close');
});

Then('no tab open on {string} is restored', async function (name) {
  sleep(2);
  assert.ok(!this.device.grid().tabs.some(t => t.title === host(name)), `a tab on ${name} came back`);
  assert.ok(!(await this.device.targets()).some(t => t.url.includes(host(name))), `a page on ${name} is open`);
});

Then('the island uses the private theme', function () {
  const now = pillColor(this.device);
  assert.ok(this.normalPill.every(c => c > 200), `the normal Island isn't light: ${this.normalPill}`);
  assert.ok(now.every(c => c < 64), `the private Island isn't dark: ${now}`);
});

Then('the island shows a {string} chip', function (_chip) {
  assert.ok(this.device.has({id: 'blanc_island_private'}), 'no private chip');
});

When('I activate the {string} chip', function (_chip) { this.device.tap({id: 'blanc_island_private'}); });

Then('the private tab closes', async function () {
  await this.device.waitFor(() => !this.device.grid().tabs.some(t => t.private), 'the private tab to close');
});

When('a link in the page opens a new tab', async function () {
  this.device.runInPalette(this.url('link', '/link'));
  await this.device.waitForUrl(this.url('link', '/link'));
  // Let the palette's keyboard finish closing, so the tap reaches the page.
  sleep(2);
  const {width, height} = this.device.screenSize();
  this.device.tapAt({left: width / 2, right: width / 2, top: height * 0.4, bottom: height * 0.4}, 3);
  await this.device.waitForUrl(this.url('child'));
});

Then('the new tab is private', function () {
  const state = this.device.grid();
  const active = state.tabs.find(t => t.selected);
  assert.equal(active?.title, host('child'));
  assert.ok(active.private, 'the child tab is not private');
  assert.equal(state.tabs.filter(t => t.private).length, 2, 'the link did not open a new tab');
});

Then("the private tab's start page loads in the non-persistent session", async function () {
  // Chromium's private tabs live in its off-the-record profile, which the grid shows apart.
  await this.device.waitFor(async () => START_PAGE.test((await this.device.visibleUrl()) || ''), 'the Start Page');
  assert.ok(this.device.grid().tabs.find(t => t.selected)?.private, 'the Start Page is not in a private tab');
});
