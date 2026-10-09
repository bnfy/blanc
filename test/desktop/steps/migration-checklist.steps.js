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
  const current = await this.call('migrationChecklistSettings');
  assert.equal(await this.call('setMigrationChecklistProgress', true, current.tabsComplete), true);
});

When('I mark tab migration complete in the moving-in checklist', async function () {
  const current = await this.call('migrationChecklistSettings');
  assert.equal(await this.call('setMigrationChecklistProgress', current.syncComplete, true), true);
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
    (dom) => dom?.visible === true && dom.progress === '2/2' && dom.label === 'All moved in',
    'the moving-in checklist pill to confirm 2/2',
  );
  const dom = await this.call('readMigrationChecklistDom');
  assert.equal(dom.open, false, 'completion never opens the popover on its own');
});

Then('the moving-in completion waits behind Settings', async function () {
  await new Promise((resolve) => setTimeout(resolve, 1700));
  const surface = await this.call('utilitySurface');
  assert.equal(surface?.visible, true, 'Settings should still cover the start page');
  const dom = await this.call('readMigrationChecklistDom');
  assert.equal(dom?.visible, true, 'the confirmation must not retire while covered');
  assert.equal(dom?.progress, '2/2');
  assert.equal(dom?.title, 'all moved in');
});

When('I close the Settings sheet', async function () {
  assert.equal(await this.call('closeUtilitySurface'), true);
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

Then('the moving-in checklist appears in all four start-page layouts', async function () {
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    assert.equal(await this.call('clickNewtabLayoutSwitcher', layout), true);
    await waitForValue(
      () => this.call('readMigrationChecklistDom'),
      (dom) => dom?.layout === layout && dom.visible === true,
      `the moving-in checklist in ${layout}`,
    );
  }
});

const inside = (inner, outer) => inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 &&
  inner.left >= outer.left - 1 && inner.right <= outer.right + 1;

Then('the moving-in checklist pill sits in the footer just before Customize', async function () {
  const dom = await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (value) => value?.visible === true && value.shellBounds?.height > 0 && value.customizeBounds?.height > 0,
    'the checklist pill and Customize to render',
  );
  assert.equal(dom.pillFollowedByCustomize, true);
  assert.equal(dom.label, 'Finish setup');
  assert.ok(dom.hideBounds && inside(dom.hideBounds, dom.shellBounds), 'the pill ends in its close button');
  assert.ok(dom.hideBounds.left >= dom.shellBounds.right - dom.hideBounds.width - 4, 'the close button sits at the pill\'s right end');
  assert.equal(dom.open, false);
  assert.ok(inside(dom.shellBounds, dom.footerBounds),
    `pill ${JSON.stringify(dom.shellBounds)} outside footer ${JSON.stringify(dom.footerBounds)}`);
  assert.ok(dom.shellBounds.right <= dom.customizeBounds.left, 'the pill sits left of Customize');
  assert.ok(Math.abs((dom.shellBounds.top + dom.shellBounds.bottom) - (dom.customizeBounds.top + dom.customizeBounds.bottom)) <= 2,
    'the pill and Customize share a centre line');
});

When('I open the moving-in checklist', async function () {
  assert.equal(await this.call('clickMigrationChecklist', 'compact'), true);
});

Then('the moving-in checklist popover opens above its pill', async function () {
  const dom = await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (value) => value?.open === true && value.expanded === true && value.popoverBounds?.height > 0,
    'the moving-in checklist popover to open',
  );
  assert.equal(dom.title, 'ready to move in?');
  assert.ok(dom.popoverBounds.bottom <= dom.shellBounds.top, 'the popover opens upward from the pill');
  assert.ok(dom.popoverBounds.top >= 0, 'the popover stays on screen');
});

Then('the moving-in checklist popover closes and its pill has focus', async function () {
  const dom = await waitForValue(
    () => this.call('readMigrationChecklistDom'),
    (value) => value?.open === false && value.expanded === false,
    'the moving-in checklist popover to close',
  );
  assert.equal(dom.focusedId, 'migrationChecklistCompact');
});

// `url` is the exact string main passed to showUtilityPage, fragment included.
Then('the Settings sheet is at the {string} section', async function (section) {
  await waitForValue(
    () => this.call('utilitySurface'),
    (surf) => surf?.visible === true && surf.ready === true && surf.url === `blanc://settings/#group-${section}`,
    `the Settings sheet at #group-${section}`,
  );
});
