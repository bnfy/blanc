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
      dom.freeTileCount >= 2 &&
      dom.tileHeight >= 59 &&
      dom.boardFrameHeight >= 535,
    'the embedded mahjong frame to render a playable, full-size 144-tile deal'
  );
  const game = await this.call('readMahjongEmbedDom');
  assert.ok(game.boardCenterDeltaX <= 1, `board x center drifted ${game.boardCenterDeltaX}px`);
  assert.ok(game.dockLeft >= game.boardFrameLeft - 1, 'control rail should begin inside the board frame');
  assert.ok(game.dockRight <= game.boardFrameRight + 1, 'control rail should end inside the board frame');
  assert.ok(game.dockTop >= game.boardFrameTop - 1, 'control rail should begin inside the board frame');
  assert.ok(game.dockBottom <= game.boardFrameBottom + 1, 'control rail should end inside the board frame');
  assert.ok(
    Math.abs(game.dockButtonWidth - game.dockButtonHeight) <= 0.5,
    `dock control must be circular (${game.dockButtonWidth}px × ${game.dockButtonHeight}px)`
  );
  assert.ok(game.dockButtonWidth >= 63.5, `dock control is too small (${game.dockButtonWidth}px)`);
  assert.ok(game.dockButtonGap >= 15.5, `dock controls are too close (${game.dockButtonGap}px)`);
  const completion = await this.call('readMahjongCompletionGeometry');
  assert.ok(completion, 'completion geometry should be measurable');
  assert.ok(completion.centerDeltaX <= 1, `completion x center drifted ${completion.centerDeltaX}px`);
  assert.ok(completion.centerDeltaY <= 1, `completion y center drifted ${completion.centerDeltaY}px`);
  assert.ok(completion.card.left >= completion.wrap.left - 1);
  assert.ok(completion.card.top >= completion.wrap.top - 1);
  assert.ok(completion.card.right <= completion.wrap.right + 1);
  assert.ok(completion.card.bottom <= completion.wrap.bottom + 1);
  assert.ok(
    completion.scrollHeight <= completion.clientHeight + 1,
    `completion card unexpectedly scrolls (${completion.scrollHeight}px > ${completion.clientHeight}px)`
  );
});

When('I make a move in embedded Mahjong', async function () {
  assert.equal(await this.call('clickMahjongFreeTile'), true);
  const dom = await waitForValue(
    () => this.call('readMahjongEmbedDom'),
    (value) => typeof value?.timer === 'string',
    'embedded Mahjong to start its timer'
  );
  assert.equal(typeof dom.timer, 'string');
});

Then('the hidden embedded Mahjong timer stays paused', async function () {
  const before = await this.call('readMahjongEmbedDom');
  await new Promise((resolve) => setTimeout(resolve, 1_250));
  const after = await this.call('readMahjongEmbedDom');
  assert.equal(after?.timer, before?.timer);
});
