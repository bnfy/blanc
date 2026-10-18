'use strict';

// F3-27..31: tab group colors and the group menu (spec
// docs/superpowers/specs/2026-10-17-tab-group-colors-design.md).
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { PRESETS } = require('../../../src/renderer/space-identity');
const { waitForValue } = require('../support/poll');
const { chromePage, surfaceFor, headerFor } = require('../support/tab-drag');
const { overlayPage } = require('../support/overlay');

const hexOf = (name) => {
  const preset = PRESETS.find((candidate) => candidate.id === name);
  assert.ok(preset, `unknown preset ${name}`);
  return preset.hex;
};

async function groupNamed(world, name) {
  const state = await world.state();
  return state.groups.find((group) => group.name.toLowerCase() === String(name).toLowerCase()) ?? null;
}

async function openGroupMenu(world, name, surface) {
  const group = await groupNamed(world, name);
  assert.ok(group, `group ${name}`);
  world.groupMenuSurface = surface;
  if (surface === 'rail') {
    const { list } = await surfaceFor(world, 'rail');
    const row = list.locator(`.vertical-tabs-group[data-group-id="${group.id}"] .vertical-tabs-group-row`);
    await row.hover();
    await row.locator('.vertical-tabs-group-more').click();
    await waitForValue(() => world.call('overlayRendererMode'), (mode) => mode === 'group-menu', 'the group-menu overlay');
  } else {
    const { list } = await surfaceFor(world, 'island');
    const header = headerFor(list, group.id);
    await header.hover();
    await header.locator('.ghead-more').click();
  }
  const page = await overlayPage();
  await page.locator('#groupMenu:not([hidden])').waitFor();
  world.groupMenuPage = page;
  return page;
}

Given('the group {string} is colored {string}', async function (name, color) {
  assert.equal(await this.call('setGroupColorByName', name, hexOf(color)), true);
});

When('I open the group menu for {string} in the {word}', async function (name, surface) {
  await openGroupMenu(this, name, surface);
});

When('I choose the color {string} in the group menu', async function (color) {
  await this.groupMenuPage.locator(`#groupMenu .ws-swatch[data-color="${hexOf(color)}"]`).click();
});

When('I choose No color in the group menu', async function () {
  await this.groupMenuPage.locator('#groupMenu .ws-swatch.none').click();
});

When('I choose {string} in the group menu for {string}', async function (label, name) {
  const page = await openGroupMenu(this, name, 'island');
  this.tabsBeforeGroupAction = (await this.state()).tabs.map((tab) => tab.id);
  await page.locator('#groupMenu .group-menu-action', { hasText: label }).click();
});

Then('the group {string} has the color {string}', async function (name, color) {
  await waitForValue(() => groupNamed(this, name), (group) => group?.color === hexOf(color), `${name} colored ${color}`);
});

Then('the group {string} has no color', async function (name) {
  await waitForValue(() => groupNamed(this, name), (group) => group && group.color === null, `${name} uncolored`);
});

async function blockFor(world, name, surface) {
  const group = await groupNamed(world, name);
  if (surface === 'rail') {
    const page = await chromePage();
    return page.locator(`.vertical-tabs-group[data-group-id="${group.id}"]`);
  }
  const page = await overlayPage();
  return page.locator(`#islandList .island-group-band[data-group-id="${group.id}"]`);
}

Then('the {string} block in the {word} is tinted {string}', async function (name, surface, color) {
  const block = await blockFor(this, name, surface);
  await waitForValue(
    () => block.evaluate((el) => [el.classList.contains('group-colored'), el.style.getPropertyValue('--group-color')]),
    ([colored, value]) => colored && value === hexOf(color),
    `${name} block tinted ${color}`
  );
  const background = await block.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(background, 'rgba(0, 0, 0, 0)', 'the tint is drawn');
});

Then('the {string} block in the {word} is not tinted', async function (name, surface) {
  const block = await blockFor(this, name, surface);
  await waitForValue(() => block.evaluate((el) => el.classList.contains('group-colored')), (colored) => colored === false,
    `${name} block untinted`);
});

Then('the Island\'s dots are {string}', async function (color) {
  const page = await chromePage();
  await waitForValue(
    () => page.locator('#pillDots .island-dot.dot-group-colored').evaluateAll(
      (dots) => dots.map((dot) => dot.style.getPropertyValue('--group-color'))),
    (values) => values.length > 0 && values.every((value) => value === hexOf(color)),
    `the Island's dots in ${color}`
  );
});

Then('the group {string} holds {int} tabs with the new tab last and selected', async function (name, count) {
  const state = await this.waitForState((s) => {
    const group = s.groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
    return group && s.tabs.filter((tab) => tab.groupId === group.id).length === count;
  });
  const group = state.groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
  const members = state.tabOrder.filter((id) => state.tabs.find((tab) => tab.id === id)?.groupId === group.id);
  const created = members.at(-1);
  assert.ok(!this.tabsBeforeGroupAction.includes(created), 'the last member is the new tab');
  assert.equal(state.activeTabId, created);
});

Then('a new window holds the group {string} with {int} tabs and the color {string}', async function (name, count, color) {
  const runtimes = await waitForValue(() => this.call('windowRuntimes'), (all) => all.length >= 2, 'a second window');
  const moved = runtimes.find((runtime) => runtime.groups.some((group) => group.name.toLowerCase() === name.toLowerCase()));
  assert.ok(moved, 'a window with the group');
  assert.notEqual(moved.id, runtimes[0].id, 'it is the new window');
  const group = moved.groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
  assert.equal(group.color, hexOf(color));
  assert.equal(moved.tabs.length, count);
});

Then('the first window no longer has the group {string}', async function (name) {
  const runtimes = await this.call('windowRuntimes');
  assert.equal(runtimes[0].groups.some((group) => group.name.toLowerCase() === name.toLowerCase()), false);
  assert.ok(runtimes[0].tabs.length >= 1, 'the first window keeps its other tabs');
});
