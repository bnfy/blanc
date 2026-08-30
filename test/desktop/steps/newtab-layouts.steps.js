'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

async function openNewTab(world) {
  await world.call('newTab');
  await world.waitForState((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return active?.loadedUrl?.startsWith('blanc://newtab');
  });
}

Given('a profile whose start page layout is {string}', async function (layout) {
  assert.equal(await this.call('setNewtabLayout', layout), layout);
});

// "I open a new tab" itself is defined in runnable.steps.js; this Given
// additionally waits for the page to finish loading.
Given('a new tab is open', async function () {
  await openNewTab(this);
});

When('I choose the {string} start page layout from its footer', async function (layout) {
  assert.equal(await this.call('clickNewtabLayoutSwitcher', layout), true);
});

Then('the start page renders the {string} layout', async function (layout) {
  const expectedRoot = layout.charAt(0).toUpperCase() + layout.slice(1);
  await waitForValue(
    () => this.call('readNewtabLayoutDom'),
    (dom) =>
      dom?.layout === layout &&
      dom.active === layout &&
      dom.visible.length === 1 &&
      dom.visible[0] === expectedRoot,
    `start page to render the ${layout} layout exclusively`
  );
});

Then('the saved start page layout is {string}', async function (layout) {
  await waitForValue(
    () => this.call('newtabLayout'),
    (value) => value === layout,
    `newtabLayout setting to persist as ${layout}`
  );
});

Then('the embedded mahjong game is ready', async function () {
  await waitForValue(
    () => this.call('readMahjongEmbedDom'),
    (dom) =>
      dom?.url?.startsWith('blanc://mahjong/') &&
      dom.tileCount === 144 &&
      dom.freeTileCount >= 2,
    'the embedded mahjong frame to render a playable 144-tile deal'
  );
});
