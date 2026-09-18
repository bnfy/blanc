'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('the moving-in checklist is incomplete and not hidden', async function () {
  assert.deepEqual(await this.call('resetMigrationChecklist'), {
    dismissed: false,
    syncComplete: false,
    tabsComplete: false,
  });
});

Then('the moving-in checklist shows {string}', async function (progress) {
  await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (dom) => dom?.count === 1 && dom.visible === true && dom.progress === progress,
    `the moving-in checklist to show ${progress}`,
  );
});

When('I hide the moving-in checklist', async function () {
  assert.equal(await this.call('clickMigrationChecklist', 'hide'), true);
});

When('I choose Set up Sync from the moving-in checklist', async function () {
  assert.equal(await this.call('clickMigrationChecklist', 'sync'), true);
});

When('I mark Sync complete in the moving-in checklist', async function () {
  assert.equal(await this.call('setMigrationChecklistProgress', true, false), true);
});

When('I complete both moving-in tasks', async function () {
  assert.equal(await this.call('setMigrationChecklistProgress', true, true), true);
});

Then('the Sync task stays checked at {string}', async function (progress) {
  await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (dom) => dom?.visible === true && dom.progress === progress && dom.syncComplete === true,
    `the Sync task to stay checked at ${progress}`,
  );
});

Then('the moving-in checklist briefly confirms completion', async function () {
  await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (dom) => dom?.visible === true && dom.progress === '2/2' && dom.title === 'all moved in',
    'the moving-in checklist to confirm 2/2',
  );
});

Then('the moving-in checklist retires', async function () {
  await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (dom) => dom?.visible === false,
    'the moving-in checklist to retire',
  );
});

Then('the moving-in checklist remains hidden', async function () {
  await waitForValue(
    () => this.call('migrationChecklistSettings'),
    (state) => state?.dismissed === true,
    'the checklist dismissal to persist',
  );
  await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (dom) => dom?.visible === false,
    'the moving-in checklist to stay hidden',
  );
});

Then('the moving-in checklist appears in every informational layout and not Mahjong', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('clickNewtabLayoutSwitcher', layout), true);
    await waitForValue(
      () => this.call('readMigrationChecklistDom'),
      (dom) => dom?.layout === layout && dom.visible === true,
      `the moving-in checklist in ${layout}`,
    );
  }
  assert.equal(await this.call('clickNewtabLayoutSwitcher', 'mahjong'), true);
  await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (dom) => dom?.layout === 'mahjong' && dom.visible === false,
    'the moving-in checklist to stay out of Mahjong',
  );
});

Then('the Billboard moving-in checklist stays above its recent sites', async function () {
  const dom = await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (value) => value?.layout === 'billboard' && value.visible === true &&
      value.shellBounds?.height > 0 && value.billboardSitesBounds?.height > 0,
    'the Billboard checklist and recent-site row to render',
  );
  assert.ok(
    dom.shellBounds.bottom < dom.billboardSitesBounds.top,
    `checklist ${JSON.stringify(dom.shellBounds)} overlaps recent sites ${JSON.stringify(dom.billboardSitesBounds)}`,
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
