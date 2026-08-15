'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('a different closed page in each of two Blanc windows', async function () {
  this.recoveryPrimaryUrl = this.fixtureUrl('primary-closed');
  this.recoverySecondaryUrl = this.fixtureUrl('secondary-closed');
  const primaryTabId = await this.call('openTab', this.recoveryPrimaryUrl);
  this.recoverySecondaryRuntimeId = await this.call('openNewWindow');
  const secondaryTabId = await this.call(
    'openTabInWindow', this.recoverySecondaryRuntimeId, this.recoverySecondaryUrl
  );
  assert.equal(await this.call('closeTabInWindow', 'primary', primaryTabId), true);
  assert.equal(await this.call(
    'closeTabInWindow', this.recoverySecondaryRuntimeId, secondaryTabId
  ), true);
});

When('I reopen the last closed tab in the secondary window', async function () {
  this.reopenedSecondaryId = await this.call(
    'reopenClosedInWindow', this.recoverySecondaryRuntimeId
  );
});

Then('the secondary window restores only its own closed page', async function () {
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (rows) => rows.find((runtime) => runtime.id === this.recoverySecondaryRuntimeId)
      ?.tabs.some((tab) => tab.url === this.recoverySecondaryUrl),
    'secondary closed page to reopen'
  );
  const primary = runtimes.find((runtime) => runtime.id === 'primary');
  const secondary = runtimes.find((runtime) => runtime.id === this.recoverySecondaryRuntimeId);
  assert.ok(secondary.tabs.some((tab) => tab.url === this.recoverySecondaryUrl));
  assert.equal(secondary.tabs.some((tab) => tab.url === this.recoveryPrimaryUrl), false);
  assert.equal(primary.tabs.some((tab) => tab.url === this.recoveryPrimaryUrl), false);
});

When('I reopen the last closed tab in the primary window', async function () {
  this.reopenedPrimaryId = await this.call('reopenClosedInWindow', 'primary');
});

Then('the primary window restores its own closed page', async function () {
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (rows) => rows.find((runtime) => runtime.id === 'primary')
      ?.tabs.some((tab) => tab.url === this.recoveryPrimaryUrl),
    'primary closed page to reopen'
  );
  const primary = runtimes.find((runtime) => runtime.id === 'primary');
  assert.ok(primary.tabs.some((tab) => tab.url === this.recoveryPrimaryUrl));
  assert.equal(primary.tabs.some((tab) => tab.url === this.recoverySecondaryUrl), false);
});
