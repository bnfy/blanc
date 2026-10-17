'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { After, Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

const pathnameFor = (world, name) => new URL(world.fixtureUrl(name)).pathname;

async function openLoaded(world, name, options = {}) {
  const url = options.url ?? world.fixtureUrl(name);
  const id = await world.call('openTab', url, options.tabOptions);
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.isLoading && tab.url === url;
  });
  return { id, url };
}

async function navigateLoaded(world, id, name) {
  const url = world.fixtureUrl(name);
  await world.call('navigateTab', id, url);
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.isLoading && tab.url === url;
  });
  return url;
}

async function pinAt(world, name, options = {}) {
  const opened = await openLoaded(world, name, options);
  await world.call('pinTab', opened.id);
  assert.equal(await world.call('pinnedHome', opened.id), opened.url);
  world.pinnedTabId = opened.id;
  world.pinnedHomeUrl = opened.url;
  return opened;
}

async function restoredPinned(world, name) {
  const pathname = pathnameFor(world, name);
  const state = await world.waitForState((snapshot) => snapshot.tabs.some((tab) =>
    tab.pinned && new URL(tab.url).pathname === pathname));
  const tab = state.tabs.find((candidate) => candidate.pinned && new URL(candidate.url).pathname === pathname);
  world.pinnedTabId = tab.id;
  return tab;
}

Given('a pinned tab whose home is {string}', async function (name) {
  await pinAt(this, name);
});

Given('a pinned tab whose slow home is {string}', async function (name) {
  await pinAt(this, name, { url: `${this.fixtureUrl(name)}?hold=slow` });
});

Given('that pinned tab has gone to {string}', async function (name) {
  await navigateLoaded(this, this.pinnedTabId, name);
});

Given('a pinned background tab on {string}', async function (name) {
  await pinAt(this, name);
  await openLoaded(this, 'pinned-foreground');
});

Given('a pinned local HTML file', async function () {
  this.pinnedLocalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pinned-home-file-'));
  const file = path.join(this.pinnedLocalDir, 'home.html');
  fs.writeFileSync(file, '<!doctype html><title>Pinned local home</title><h1>Pinned local home</h1>');
  const url = pathToFileURL(fs.realpathSync(file)).href;
  const id = await this.call('openTab', url, { allowLocalFile: true });
  await this.waitForState((state) => state.tabs.some((tab) => tab.id === id && !tab.isLoading && tab.url === url));
  await this.call('pinTab', id);
  assert.equal(await this.call('pinnedHome', id), url);
  this.pinnedTabId = id;
  this.pinnedHomeUrl = url;
});

After({ tags: '@F48-7' }, function () {
  if (this.pinnedLocalDir) fs.rmSync(this.pinnedLocalDir, { recursive: true, force: true });
});

When('that pinned tab goes to {string}', async function (name) {
  await navigateLoaded(this, this.pinnedTabId, name);
});

When('I switch away from and back to the pinned tab', async function () {
  const other = await openLoaded(this, 'pinned-switch-away');
  await this.call('activateTab', this.pinnedTabId);
  await this.waitForState((state) => state.activeTabId === this.pinnedTabId);
  this.switchAwayId = other.id;
});

When('I go Back in the pinned tab', async function () {
  await this.call('goBack', this.pinnedTabId);
});

When('I unpin and re-pin that tab', async function () {
  await this.call('pinTab', this.pinnedTabId);
  assert.equal(await this.call('pinnedHome', this.pinnedTabId), null);
  await this.call('pinTab', this.pinnedTabId);
});

When('I make the current page its pinned home', async function () {
  assert.equal(await this.call('setPinnedHome', this.pinnedTabId), true);
});

When('I return it to its pinned home', async function () {
  assert.equal(await this.call('returnPinnedHome', this.pinnedTabId), true);
});

When('I quiet that pinned tab', async function () {
  // Pinned tabs are protected from automatic quieting. The acceptance hook
  // creates the same restored, viewless record so pinning that record can
  // prove the home metadata survives the quiet representation.
  const home = this.pinnedHomeUrl;
  const quietId = await this.call('createQuietTab', home, 'pinned-quiet');
  await this.call('pinTab', quietId);
  this.pinnedTabId = quietId;
  assert.equal((await this.call('sleepState', quietId)).asleep, true);
});

When('I pin a private tab on {string}', async function (name) {
  const opened = await openLoaded(this, name, { tabOptions: { private: true } });
  await this.call('pinTab', opened.id);
  this.privatePinnedUrl = opened.url;
  this.privatePinnedId = opened.id;
});

When('I clear browsing history', async function () {
  await this.call('clearHistory');
});

Then('the pinned tab is still on {string}', async function (name) {
  const expected = this.fixtureUrl(name);
  const state = await this.state();
  assert.equal(state.tabs.find((tab) => tab.id === this.pinnedTabId)?.url, expected);
});

Then('the pinned tab reaches its home {string}', async function (name) {
  const expected = this.fixtureUrl(name);
  await this.waitForState((state) => state.tabs.some((tab) => tab.id === this.pinnedTabId && tab.url === expected));
});

Then('the restored pinned tab starts loading {string} with the saved title {string}', async function (home, savedTitle) {
  const pathname = pathnameFor(this, home);
  const state = await this.waitForState((snapshot) => snapshot.tabs.some((tab) =>
    tab.pinned && new URL(tab.url).pathname === pathname));
  const tab = state.tabs.find((candidate) => candidate.pinned && new URL(candidate.url).pathname === pathname);
  assert.equal(tab.title, savedTitle);
  assert.equal(tab.isLoading, true, 'the slow home should still be loading on first observation');
  assert.equal(await this.call('pinnedHome', tab.id), this.pinnedHomeUrl);
  this.pinnedTabId = tab.id;
});

Then('its pinned home is {string}', async function (name) {
  assert.equal(await this.call('pinnedHome', this.pinnedTabId), this.fixtureUrl(name));
});

Then('the restored pinned tab is on {string}', async function (name) {
  const tab = await restoredPinned(this, name);
  assert.equal(await this.call('pinnedHome', tab.id), this.fixtureUrl(name));
});

Then('the pinned tab is on {string}', async function (name) {
  const expected = this.fixtureUrl(name);
  await this.waitForState((state) => state.tabs.some((tab) => tab.id === this.pinnedTabId && tab.url === expected));
});

Then('session.json contains neither the private page nor its pinned home', async function () {
  assert.equal(await this.call('pinnedHome', this.privatePinnedId), this.privatePinnedUrl);
  await waitForValue(
    () => this.call('persistedSessionData'),
    (data) => JSON.stringify(data).includes(this.pinnedHomeUrl),
    'the public pinned tab to reach session.json',
  );
  const serialized = JSON.stringify(await this.call('persistedSessionData'));
  assert.equal(serialized.includes(this.privatePinnedUrl), false);
});

Then('duplicate, reopen, move-window, and Space copies retain its pinned home', async function () {
  const home = this.pinnedHomeUrl;
  const original = this.pinnedTabId;
  const before = new Set((await this.state()).tabs.map((tab) => tab.id));
  await this.call('activateTab', original);
  await this.call('duplicateActive');
  const duplicateState = await this.waitForState((state) => state.tabs.length > before.size);
  const duplicate = duplicateState.tabs.find((tab) => !before.has(tab.id));
  assert.equal(await this.call('pinnedHome', duplicate.id), home);

  await this.call('closeTab', duplicate.id);
  await this.call('reopenClosed');
  const reopenedState = await this.waitForState((state) => state.tabs.some((tab) =>
    !before.has(tab.id) && tab.id !== duplicate.id));
  const reopened = reopenedState.tabs.find((tab) => !before.has(tab.id) && tab.id !== duplicate.id);
  assert.equal(await this.call('pinnedHome', reopened.id), home);

  await this.waitForState((state) => state.tabs.every((tab) => !tab.isLoading && !tab.asleep));
  const space = await this.call('workspaceAction', 'save', 'Pinned home acceptance');
  assert.equal(space.ok, true, JSON.stringify(space));
  const blank = await this.call('workspaceAction', 'create', 'Blank acceptance');
  assert.equal(blank.ok, true, JSON.stringify(blank));
  await this.waitForState((state) => state.tabs.every((tab) => !tab.isLoading && !tab.asleep));
  assert.equal((await this.call('workspaceAction', 'open', space.workspace.id)).ok, true);
  const reopenedSpace = await this.waitForState((state) => state.tabs.find((tab) => tab.pinned && tab.url === this.fixtureUrl('pinned-b')));
  const spaceTab = reopenedSpace.tabs.find((tab) => tab.pinned && tab.url === this.fixtureUrl('pinned-b'));
  assert.equal(await this.call('pinnedHome', spaceTab.id), home);

  const movedWindow = await this.call('moveTabToNewWindow', spaceTab.id);
  assert.ok(movedWindow, 'Move to New Window should return the destination window');
  assert.equal(await this.call('pinnedHome', spaceTab.id), home);
});

Then('Return to Pinned Home follows the local-file access policy', async function () {
  const current = this.fixtureUrl('pinned-web-page');
  assert.equal(await this.call('returnPinnedHome', this.pinnedTabId), false);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const state = await this.state();
  assert.equal(state.tabs.find((tab) => tab.id === this.pinnedTabId)?.url, current);
  assert.equal(await this.call('pinnedHome', this.pinnedTabId), this.pinnedHomeUrl);
});
