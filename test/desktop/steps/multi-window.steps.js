'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

When('I open a new Blanc window', async function () {
  const before = await this.call('windowRuntimes');
  this.primaryRuntimeBefore = before.find((runtime) => runtime.id === 'primary');
  this.secondaryRuntimeId = await this.call('openNewWindow');
  this.secondaryRuntimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.length === 2 && runtimes.some((runtime) => runtime.id === this.secondaryRuntimeId),
    'secondary window runtime to attach'
  );
});

Then('both windows have independent tab workspaces', function () {
  const primary = this.secondaryRuntimes.find((runtime) => runtime.id === 'primary');
  const secondary = this.secondaryRuntimes.find((runtime) => runtime.id === this.secondaryRuntimeId);
  assert.ok(primary?.attached && secondary?.attached);
  assert.deepEqual(primary.tabOrder, this.primaryRuntimeBefore.tabOrder,
    'creating a native window must not add a tab to the primary workspace');
  assert.equal(secondary.tabOrder.length, 1);
  assert.equal(secondary.activeTabId, secondary.tabOrder[0]);
  assert.equal(primary.tabOrder.some((id) => secondary.tabOrder.includes(id)), false);
});

When('I open a page in the secondary window', async function () {
  this.primaryOrderBeforeSecondaryNavigation = (
    await this.call('windowRuntimes')
  ).find((runtime) => runtime.id === 'primary').tabOrder;
  this.secondaryPageUrl = this.fixtureUrl('secondary-window');
  this.secondaryPageTabId = await this.call(
    'openTabInWindow', this.secondaryRuntimeId, this.secondaryPageUrl
  );
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.find((runtime) => runtime.id === this.secondaryRuntimeId)
      ?.tabs.some((tab) => tab.id === this.secondaryPageTabId && tab.url === this.secondaryPageUrl),
    'secondary workspace page'
  );
});

Then('the primary window workspace is unchanged', async function () {
  const primary = (await this.call('windowRuntimes')).find((runtime) => runtime.id === 'primary');
  assert.deepEqual(primary.tabOrder, this.primaryOrderBeforeSecondaryNavigation);
  assert.equal(primary.tabs.some((tab) => tab.id === this.secondaryPageTabId), false);
});

When('I close the secondary Blanc window', async function () {
  assert.equal(await this.call('closeWindowRuntime', this.secondaryRuntimeId), true);
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => !runtimes.some((runtime) => runtime.id === this.secondaryRuntimeId),
    'secondary runtime to be discarded'
  );
});

Then('its workspace is removed from the session', async function () {
  const session = await waitForValue(
    () => this.call('persistedSessionData'),
    (value) => Array.isArray(value?.windows),
    'multi-window session envelope after window close'
  );
  assert.equal(session.windows.some((entry) => entry.id === this.secondaryRuntimeId), false);
  assert.equal(session.windows.some((entry) => entry.id === 'primary'), true);
});

Given('a secondary window with its own page', async function () {
  const before = await this.call('windowRuntimes');
  this.primaryUrlsBeforeRelaunch = before.find((runtime) => runtime.id === 'primary').tabs.map((tab) => tab.url);
  this.secondaryRuntimeId = await this.call('openNewWindow');
  this.secondaryPageUrl = this.fixtureUrl('secondary-restore');
  await this.call('openTabInWindow', this.secondaryRuntimeId, this.secondaryPageUrl);
  await waitForValue(
    () => this.call('persistedSessionData'),
    (session) => session.windows?.some((entry) =>
      entry.id === this.secondaryRuntimeId && entry.urls.includes(this.secondaryPageUrl)),
    'secondary workspace to persist'
  );
});

When('I relaunch Blanc with multiple windows', async function () {
  await ctx.relaunch();
});

Then('both independent window workspaces are restored', async function () {
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (rows) => rows.length === 2 && rows.every((runtime) => runtime.attached) &&
      rows.find((runtime) => runtime.id === this.secondaryRuntimeId)
        ?.tabs.some((tab) => tab.url === this.secondaryPageUrl),
    'both native windows to restore'
  );
  const primary = runtimes.find((runtime) => runtime.id === 'primary');
  const secondary = runtimes.find((runtime) => runtime.id === this.secondaryRuntimeId);
  assert.deepEqual(primary.tabs.map((tab) => tab.url), this.primaryUrlsBeforeRelaunch);
  assert.ok(secondary.tabs.some((tab) => tab.url === this.secondaryPageUrl),
    `secondary page missing after restore: ${JSON.stringify(runtimes)}`);
  assert.equal(primary.tabOrder.some((id) => secondary.tabOrder.includes(id)), false);
});
