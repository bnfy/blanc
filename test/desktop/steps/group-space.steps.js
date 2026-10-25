'use strict';

// F41-75..79: Move Group to Space ▸ in the group menu (decision D8 of
// docs/superpowers/specs/2026-10-24-move-to-space-follow-ups-design.md).
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { PRESETS } = require('../../../src/renderer/space-identity');
const { overlayPage } = require('../support/overlay');
const { waitForValue } = require('../support/poll');

const hexOf = (name) => PRESETS.find((preset) => preset.id === name).hex;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

async function spaceId(world, name) {
  const data = await world.call('workspaceAction', 'list');
  const space = data.items.find((w) => w.name === name);
  assert.ok(space, `space ${name}`);
  return space.id;
}

async function residentNamed(world, name) {
  return waitForValue(async () => (await world.call('residentSpaces')).find((s) => s.name === name),
    (space) => !!space, `space ${name} set aside`);
}

Given('the first two selection pages are in the group {string} colored {string}', async function (name, color) {
  for (const id of this.selectionPages.slice(0, 2)) await this.call('groupTabByName', id, name);
  assert.equal(await this.call('setGroupColorByName', name, hexOf(color)), true);
  await this.waitForState((st) => st.groups.some((g) => g.name === name && g.color === hexOf(color)));
});

Given('space {string} has a page in the group {string}', async function (space, group) {
  const id = await spaceId(this, space);
  const home = (await this.call('workspaceAction', 'list')).items.find((w) => w.active)?.id;
  assert.equal((await this.call('workspaceAction', 'open', id))?.ok, true);
  this.spacePageId = await this.call('openTab', this.fixtureUrl('workspace-draft'));
  await this.call('groupTabByName', this.spacePageId, group);
  await this.waitForState((st) => st.tabs.every((t) => !t.isLoading && !t.asleep));
  assert.equal((await this.call('workspaceAction', 'open', home))?.ok, true);
  await this.waitForState((st) => !st.tabOrder.includes(this.spacePageId));
});

When('I move the group {string} to space {string}', async function (name, space) {
  this.groupMoveResult = await this.call('moveGroupToSpaceByName', name, await spaceId(this, space));
});

When('I create a new space for the group {string} named {string}', async function (group, space) {
  assert.equal(await this.call('beginNewSpaceForGroupByName', group), true);
  const page = await overlayPage();
  await page.waitForSelector('#workspaceEditor', { state: 'visible' });
  assert.match(await page.locator('#workspaceEditor').innerText(), new RegExp(group));
  await page.fill('#workspaceName', space);
  await page.locator('#workspaceEditor button[type="submit"]').click();
  await this.waitForState((st) => !this.selectionPages.slice(0, 2).some((id) => st.tabOrder.includes(id)));
});

Then('space {string} has the group {string} colored {string} holding the first two selection pages last, in order', async function (space, group, color) {
  if (this.groupMoveResult) assert.equal(this.groupMoveResult.ok, true, JSON.stringify(this.groupMoveResult));
  const resident = await residentNamed(this, space);
  const record = resident.groups.find((g) => g.name === group);
  assert.ok(record, JSON.stringify(resident.groups));
  assert.equal(record.color, hexOf(color));
  const last = resident.tabs.slice(-2);
  assert.deepEqual(last.map((t) => t.id), this.selectionPages.slice(0, 2));
  assert.ok(last.every((t) => t.groupId === record.id && t.live), JSON.stringify(last));
});

Then('this window has no group {string} and still has the third selection page', async function (name) {
  const st = await this.waitForState((s) => !s.groups.some((g) => sameName(g.name, name)));
  assert.ok(st.tabOrder.includes(this.selectionPages[2]));
});

Then('{string}\'s saved record has the group {string} colored {string} holding the first two selection pages', async function (space, group, color) {
  const saved = await this.call('workspaceAction', 'saved-groups', await spaceId(this, space));
  const record = saved.groups.find((g) => g.name === group);
  assert.ok(record, JSON.stringify(saved.groups));
  assert.equal(record.color, hexOf(color));
  const members = saved.urls.filter((_url, i) => saved.groupIds[i] === record.id);
  assert.deepEqual(members, ['selection-one', 'selection-two'].map((name) => this.fixtureUrl(name)));
});

Then('space {string} has one group {string}, holding its own page and then the first two selection pages', async function (space, group) {
  assert.equal(this.groupMoveResult?.ok, true, JSON.stringify(this.groupMoveResult));
  const resident = await residentNamed(this, space);
  const matches = resident.groups.filter((g) => sameName(g.name, group));
  assert.equal(matches.length, 1, JSON.stringify(resident.groups));
  assert.equal(matches[0].name, group, 'the space keeps its own group');
  const members = resident.tabs.filter((t) => t.groupId === matches[0].id).map((t) => t.id);
  assert.deepEqual(members, [this.spacePageId, ...this.selectionPages.slice(0, 2)]);
});

Then('the group move reports that nothing moved', async function () {
  assert.equal(this.groupMoveResult?.ok, false, JSON.stringify(this.groupMoveResult));
  assert.equal(this.groupMoveResult.movedCount, 0, JSON.stringify(this.groupMoveResult));
});

Then('this window\'s group {string} still holds the first two selection pages, colored {string}', async function (name, color) {
  const st = await this.waitForState((s) => s.groups.some((g) => g.name === name));
  const group = st.groups.find((g) => g.name === name);
  assert.equal(group.color, hexOf(color));
  assert.deepEqual(st.tabOrder.filter((id) => st.tabs.find((t) => t.id === id)?.groupId === group.id), this.selectionPages.slice(0, 2));
});

When('I press Escape in the group menu', async function () {
  await this.groupMenuPage.keyboard.press('Escape');
  await this.groupMenuPage.locator('#groupMenu').waitFor({ state: 'hidden' });
});

When('this window is saved as the space {string}', async function (name) {
  assert.equal((await this.call('workspaceAction', 'save', name))?.ok, true);
});

Then('the group menu has no {string}', async function (label) {
  assert.equal(await this.groupMenuPage.locator('#groupMenu .group-menu-action', { hasText: label }).count(), 0);
});

Then('the group menu has {string}', async function (label) {
  await this.groupMenuPage.locator('#groupMenu .group-menu-action', { hasText: label }).waitFor();
});
