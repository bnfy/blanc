'use strict';
// Group names keep their case; Rename Group… and Ungroup from a group's
// header (spec 2026-10-16-island-lower-section §9).
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const { overlayPage } = require('../support/overlay');
const ctx = require('../support/context');

Given('the tab on {string} is in a group named {string}', async function (tab, group) {
  await this.call('groupTabByName', ctx.tabByName[tab], group);
  await this.waitForState((s) => s.groups.some((g) => g.name.toLowerCase() === group.toLowerCase()));
});

When('I choose Rename Group… for {string}', async function (name) {
  assert.equal(await this.call('beginRenameGroupByName', name), true, `a group named ${name}`);
  await waitForValue(() => this.call('overlayRendererMode'), (m) => m === 'panel', 'the command bar to open');
});

When('I ungroup {string} from its header', async function (name) {
  assert.equal(await this.call('ungroupGroupByName', name), true, `a group named ${name}`);
});

Then('the panel says the field renames the group', async function () {
  const page = await overlayPage();
  await page.locator('#islandList .name-prompt').filter({ hasText: 'Rename group' }).waitFor({ state: 'visible' });
});

Then('the panel says a group named {string} already exists', async function (name) {
  const page = await overlayPage();
  await page.locator('#islandList .name-prompt').filter({ hasText: `A group named “${name}” already exists` }).waitFor({ state: 'visible' });
  assert.equal(await this.call('overlayRendererMode'), 'panel', 'the prompt stays open');
});

Then('a group is named exactly {string}', async function (name) {
  await this.waitForState((s) => s.groups.some((g) => g.name === name));
});

Then('the tabs on {string} and {string} are ungrouped', async function (a, b) {
  await this.waitForState((s) => [a, b].every((name) => s.tabs.find((t) => t.id === ctx.tabByName[name])?.groupId == null));
});
