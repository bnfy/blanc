'use strict';

// F62 Default page zoom: src/main/tab-zoom.js and its wiring.

const assert = require('node:assert/strict');
const { Given, When, Then, After } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

const HOST = '127.0.0.1';
const zoomUrl = (world) => world.fixtureUrl('zoom');
const otherUrl = (world) => world.insecureFixtureUrl('zoom');

async function loaded(world, id, url) {
  await waitForValue(() => world.call('tabUrl', id), (value) => value === url, `tab on ${url}`);
  return id;
}
async function open(world, name, url, options) {
  const id = await world.call('openTab', url, options);
  world.zoomTabs = { ...world.zoomTabs, [name]: id };
  return loaded(world, id, url);
}
function tabOf(world, name) {
  const id = name === 'new tab' ? ctx.lastNewTabId : world.zoomTabs?.[name];
  assert.ok(id, `no ${name}`);
  return id;
}
async function zoom(world, name, command) {
  const id = tabOf(world, name);
  await world.call('activateTab', id);
  assert.equal(await world.call('pressBrowserCommand', id, command), true);
}

After({ tags: '@F62' }, async function () {
  await this.call('setPageZoom', 100);
  await this.call('clearSiteZoom');
  if (this.zoomProfile) await this.call('closeWindowRuntime', this.zoomProfile.runtimeId);
});

Given('the default page zoom is {int}%', async function (percent) {
  await this.call('setPageZoom', percent);
});

When('I open the zoom page', async function () { await open(this, 'zoom page', zoomUrl(this)); });
Given('the zoom page is open', async function () { await open(this, 'zoom page', zoomUrl(this)); });
Given('the other zoom page is open', async function () { await open(this, 'other zoom page', otherUrl(this)); });
Given("a second tab is open on the zoom page's site", async function () {
  await open(this, 'second tab', this.fixtureUrl('zoom-two'));
});
Given("a private tab is open on the zoom page's site", async function () {
  await open(this, 'private tab', this.fixtureUrl('zoom-two'), { private: true });
});
Given("a Work profile tab is open on the zoom page's site", async function () {
  const created = await this.call('createProfileWindow', `Zoom Work ${Date.now()}`);
  assert.equal(created.ok, true);
  const url = zoomUrl(this);
  const id = await this.call('openTabInWindow', created.runtimeId, url);
  this.zoomTabs = { ...this.zoomTabs, 'Work profile tab': id };
  await loaded(this, id, url);
  this.zoomProfile = created;
});

Then(/^the (zoom page|other zoom page|second tab|private tab|Work profile tab|child tab|new tab) is at (\d+)%$/, async function (name, percent) {
  const id = tabOf(this, name);
  await waitForValue(() => this.call('zoomPercent', id), (value) => value === Number(percent), `${name} at ${percent}%`);
});

When('the zoom page opens a child tab', async function () {
  const before = new Set((await this.call('state')).tabs.map((tab) => tab.id));
  await this.call('workspacePageScript', tabOf(this, 'zoom page'), `window.open('/site/zoom-child', '_blank'); 1`);
  const state = await waitForValue(() => this.call('state'),
    (value) => value.tabs.some((tab) => !before.has(tab.id)), 'the child tab');
  this.zoomTabs['child tab'] = state.tabs.find((tab) => !before.has(tab.id)).id;
});

When(/^I zoom in on the (zoom page|other zoom page|second tab|private tab)$/, async function (name) {
  await zoom(this, name, 'zoom-in');
});
When('I zoom in on the Work profile tab', async function () {
  const { runtimeId } = this.zoomProfile;
  await this.call('activateTabInWindow', runtimeId, tabOf(this, 'Work profile tab'));
  await this.call('zoomInWindow', runtimeId);
});
When('I zoom in on the zoom page three times', async function () {
  for (let i = 0; i < 3; i++) await zoom(this, 'zoom page', 'zoom-in');
});
When('I reset the zoom on the zoom page', async function () { await zoom(this, 'zoom page', 'zoom-reset'); });

When('the zoom page navigates on its own host', async function () {
  const url = this.fixtureUrl('zoom-next');
  await this.call('navigateTab', tabOf(this, 'zoom page'), url);
  await loaded(this, tabOf(this, 'zoom page'), url);
});
Then('the zoom page is drawn at {int}%', async function (percent) {
  const id = tabOf(this, 'zoom page');
  await waitForValue(() => this.call('drawnZoomPercent', id),
    (value) => Math.abs(value - percent) <= 1, `the zoom page drawn at ${percent}%`);
});

When('the zoom page shows a PDF and then a web page', async function () {
  const id = tabOf(this, 'zoom page');
  await this.call('navigateTab', id, `${ctx.fixturesBase}/zoom.pdf`);
  await waitForValue(() => this.call('zoomMode', id), (mode) => mode === 'manual', 'the PDF viewer');
  await this.call('navigateTab', id, zoomUrl(this));
  await loaded(this, id, zoomUrl(this));
});

When('the zoom page crashes and loads again', async function () {
  const id = tabOf(this, 'zoom page');
  await this.call('activateTab', id);
  await waitForValue(() => this.call('drawnZoomPercent', id), (value) => Math.abs(value - 75) <= 1, 'zoomed before the crash');
  assert.ok(await this.call('crashTabRenderer', id));
  // Navigating before the crash page lands would lose to it.
  await waitForValue(() => this.call('tabUrl', id), (value) => value?.startsWith('blanc://error'), 'the crash page');
  await this.call('navigateTab', id, this.fixtureUrl('zoom-after-crash'));
  await loaded(this, id, this.fixtureUrl('zoom-after-crash'));
});

When('I relaunch Blanc and open the zoom page', async function () {
  await ctx.relaunch();
  await open(this, 'zoom page', zoomUrl(this));
});

When('the zoom page goes quiet', async function () {
  assert.equal(await this.call('sleepTab', tabOf(this, 'zoom page')), true);
});
When('the zoom page wakes', async function () {
  assert.equal(await this.call('wakeTab', tabOf(this, 'zoom page')), true);
});

When('I choose {int}% for Default page zoom in Settings', async function (percent) {
  await this.call('openSettings');
  await waitForValue(() => this.call('settingsChoosePageZoom', percent), Boolean, 'the Default page zoom menu');
  await waitForValue(() => this.call('pageZoom'), (value) => value === percent, 'the saved default');
  await this.call('closeUtilitySurface');
});
Then("Settings lists the zoom page's site at {int}%", async function (percent) {
  await this.call('openSettings');
  const rows = await waitForValue(() => this.call('settingsSiteZoomRows'), (value) => value.length > 0, 'saved sites');
  const row = rows.find(({ name }) => name === HOST);
  assert.ok(row, JSON.stringify(rows));
  assert.match(row.detail, new RegExp(`^${percent}\\s?%$`));
});
When("I remove the zoom page's site in Settings", async function () {
  assert.equal(await this.call('settingsRemoveSiteZoom', HOST), true);
  await waitForValue(() => this.call('siteZoomSites'), (sites) => !sites[HOST], 'the site removed');
  await this.call('closeUtilitySurface');
});
Then("Settings in the Work window lists only the Work profile's site", async function () {
  const id = this.zoomProfile.runtimeId;
  await this.call('openSettingsInWindow', id);
  const rows = await waitForValue(() => this.call('settingsSiteZoomRowsInWindow', id),
    (value) => value?.length > 0, 'the Work sites');
  assert.deepEqual(rows, [HOST]);
  await this.call('closeUtilitySurfaceInWindow', id);
});
Then('no site zoom is saved', async function () {
  assert.deepEqual(await this.call('siteZoomSites'), {});
});

Then("Chromium's preferences hold no zoom for the zoom page's site", async function () {
  assert.equal((await this.call('chromiumZoomHosts')).includes(HOST), false);
});
