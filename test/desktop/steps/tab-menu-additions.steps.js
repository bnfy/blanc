'use strict';

// F2-9..11: New Tab Below, Close Tabs Below and Mute Site (spec
// docs/superpowers/specs/2026-10-17-tab-menu-additions-design.md).
const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');

const tabNamed = (state, name) => state.tabs.find((tab) => tab.title === name || tab.url.endsWith(`/site/${name}`)) ?? null;

async function waitForTab(world, name) {
  const state = await world.waitForState((s) => !!tabNamed(s, name));
  return tabNamed(state, name);
}

When('I choose New Tab Below on the first {string} tab', async function (group) {
  this.belowSource = ctx.groupMembers[group][0];
  this.tabsBeforeBelow = (await this.state()).tabs.map((tab) => tab.id);
  assert.ok(await this.call('newTabBelow', this.belowSource));
});

Then('a new tab is selected directly below the first {string} tab, in {string}', async function (_group, groupName) {
  const state = await this.waitForState((s) => s.tabs.some((tab) => !this.tabsBeforeBelow.includes(tab.id)));
  const created = state.tabs.find((tab) => !this.tabsBeforeBelow.includes(tab.id));
  const group = state.groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase());
  assert.equal(created.groupId, group.id);
  assert.equal(state.tabOrder.indexOf(created.id), state.tabOrder.indexOf(this.belowSource) + 1);
  assert.equal(state.activeTabId, created.id);
});

When('I choose Close Tabs Below on the tab on {string}', async function (name) {
  const keep = await waitForTab(this, name);
  this.keptTabId = keep.id;
  await this.call('closeTabsBeside', keep.id, 'below');
});

Then('the tabs on {string} and {string} are closed and {string} is selected', async function (a, b, kept) {
  const state = await this.waitForState((s) => !tabNamed(s, a) && !tabNamed(s, b));
  assert.equal(state.activeTabId, tabNamed(state, kept).id);
});

Then('the tabs on {string} and {string} are open again', async function (a, b) {
  await this.waitForState((s) => !!tabNamed(s, a) && !!tabNamed(s, b));
});

When('I choose Mute Site on the tab on {string}', async function (name) {
  const tab = await waitForTab(this, name);
  assert.equal(await this.call('toggleSiteMute', tab.id), true);
});

When('I open a tab on {string}', async function (name) {
  await this.call('openTab', this.fixtureUrl(name));
  await waitForTab(this, name);
});

Then('the tabs on {string} and {string} are muted', async function (a, b) {
  await this.waitForState((s) => [a, b].every((name) => tabNamed(s, name)?.muted === true && tabNamed(s, name)?.audioMuted === true));
});

Then('the tab on {string} is muted', async function (name) {
  await this.waitForState((s) => tabNamed(s, name)?.muted === true && tabNamed(s, name)?.audioMuted === true);
});

Then('the tab on {string} is not muted', async function (name) {
  const state = await this.waitForState((s) => !!tabNamed(s, name));
  assert.equal(tabNamed(state, name).muted, false);
});
