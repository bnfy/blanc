'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('sync is off and the sync offer has not been dismissed', async function () {
  assert.equal(await this.call('syncEnabled'), false);
  assert.equal(await this.call('resetSyncNudge'), false);
});

Then('the start page offers to set up sync', async function () {
  await waitForValue(
    () => this.call('readSyncNudgeDom'),
    (dom) => dom?.count === 2 && dom.visible === true,
    'the sync card to be visible',
  );
});

When('I choose Not now on the sync offer', async function () {
  assert.equal(await this.call('clickSyncNudge', 'dismiss'), true);
});

When('I choose Set up sync on the sync offer', async function () {
  assert.equal(await this.call('clickSyncNudge', 'setup'), true);
});

Then('the start page no longer offers sync', async function () {
  await waitForValue(() => this.call('syncNudgeDismissed'), (v) => v === true, 'the dismissal flag to persist');
  await waitForValue(
    () => this.call('readSyncNudgeDom'),
    (dom) => dom?.visible === false,
    'the sync card to be hidden',
  );
});

// `url` is the exact string main passed to showUtilityPage, fragment included.
Then('the Settings sheet is at the {string} section', async function (section) {
  await waitForValue(
    () => this.call('utilitySurface'),
    (surf) => surf?.visible === true && surf.ready === true && surf.url === `blanc://settings/#group-${section}`,
    `the Settings sheet at #group-${section}`,
  );
});
