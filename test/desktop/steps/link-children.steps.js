'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');

// F3-21: a link child (target=_blank) of a grouped tab opens ungrouped, in the
// place a plain new tab goes — the end of the tab order, among the loose tabs.

Given('a tab in a group named {string} with a link that opens a new tab', async function (name) {
  this.linkOpenerId = await this.call('openTab', `${this.fixtureUrl('link-opener')}?blanklink=link-child`);
  await this.call('groupTabByName', this.linkOpenerId, name);
  await this.waitForState((state) =>
    state.tabs.some((tab) => tab.id === this.linkOpenerId && tab.title === 'link-opener' && !tab.isLoading));
  this.tabIdsBeforeLink = new Set((await this.state()).tabs.map((tab) => tab.id));
});

When('I click that link in the grouped tab', async function () {
  assert.equal(await this.call('clickInTab', this.linkOpenerId, '#acceptance-blank'), true);
});

Then('the linked page opens in a new tab with no group', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.tabs.some((tab) => !this.tabIdsBeforeLink.has(tab.id) && tab.title === 'link-child'));
  const child = state.tabs.find((tab) => !this.tabIdsBeforeLink.has(tab.id));
  this.linkChildId = child.id;
  assert.equal(child.groupId ?? null, null, 'the link child should be ungrouped');
  assert.equal(child.pinned, false);
  assert.equal(child.private, false);
});

Then('that tab comes after the other ungrouped tabs', async function () {
  const state = await this.state();
  assert.equal(state.tabOrder.at(-1), this.linkChildId, 'a link child is placed last, like a plain new tab');
  const loose = state.tabOrder
    .map((id) => state.tabs.find((tab) => tab.id === id))
    .filter((tab) => tab && !tab.groupId && !tab.pinned);
  assert.ok(loose.length > 1, 'the window should already hold another ungrouped tab');
  assert.equal(loose.at(-1).id, this.linkChildId);
});

Then('the group {string} still holds only the opener', async function (name) {
  const state = await this.state();
  const group = state.groups.find((g) => g.name.toLowerCase() === String(name).toLowerCase());
  assert.ok(group, `group "${name}" should exist`);
  assert.deepEqual(state.tabs.filter((tab) => tab.groupId === group.id).map((tab) => tab.id), [this.linkOpenerId]);
});
