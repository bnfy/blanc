'use strict';

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

When('I open a new browser window', async function () {
  this.secondaryWindowId = await this.call('openWindow');
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.length === 2 && runtimes.every((runtime) => runtime.attached),
    'the secondary browser window to attach',
  );
});

Then('the browser windows have independent tab workspaces', async function () {
  const runtimes = await this.call('windowRuntimes');
  const primary = runtimes.find((runtime) => runtime.id === 'primary');
  const secondary = runtimes.find((runtime) => runtime.id === this.secondaryWindowId);

  assert.ok(primary, 'the primary workspace must remain registered');
  assert.ok(secondary, 'the secondary workspace must be registered');
  assert.equal(primary.tabOrder.length, 1, 'the primary keeps its original tab');
  assert.equal(secondary.tabOrder.length, 1, 'the new window gets its own blank tab');
  assert.notEqual(primary.tabOrder[0], secondary.tabOrder[0], 'tabs cannot have two owners');
  assert.equal(primary.activeTabId, primary.tabOrder[0]);
  assert.equal(secondary.activeTabId, secondary.tabOrder[0]);
});

When('I close the secondary browser window', async function () {
  assert.equal(await this.call('closeWindow', this.secondaryWindowId), true);
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.length === 1 && runtimes[0].id === 'primary',
    'the secondary browser window to close',
  );
});

Then('the closed secondary workspace is not persisted', async function () {
  const workspaceIds = await this.call('persistedWorkspaceIds');
  assert.deepEqual(workspaceIds, ['primary']);
});

When('I open a tab in the secondary browser window', async function () {
  this.secondaryWindowUrl = this.fixtureUrl('secondary-window-workspace');
  const tabId = await this.call('openTab', this.secondaryWindowUrl);
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.find((runtime) => runtime.id === this.secondaryWindowId)
      ?.tabs.some((tab) => tab.id === tabId && tab.url === this.secondaryWindowUrl),
    'the secondary window tab to be recorded in its workspace',
  );
  await waitForValue(
    () => this.call('persistedWorkspaceIds'),
    (ids) => ids.includes('primary') && ids.includes(this.secondaryWindowId),
    'the secondary workspace to be written before relaunch',
  );
});

Then('the browser windows restore their independent workspaces', async function () {
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (items) => items.length === 2
      && items.every((item) => item.attached)
      && items.find((item) => item.id === this.secondaryWindowId)
        ?.tabs.some((tab) => tab.url === this.secondaryWindowUrl),
    'both browser workspaces and the secondary tab to restore',
  );
  const primary = runtimes.find((runtime) => runtime.id === 'primary');
  const secondary = runtimes.find((runtime) => runtime.id === this.secondaryWindowId);

  assert.ok(primary, 'the primary workspace must restore');
  assert.ok(secondary, 'the secondary workspace must restore with its stable id');
  assert.equal(primary.tabOrder.length, 1, 'the primary blank workspace remains separate');
  assert.equal(secondary.tabOrder.length, 2, 'the secondary restores its blank and navigated tabs');
  assert.equal(secondary.activeTabId, secondary.tabs.find(
    (tab) => tab.url === this.secondaryWindowUrl
  )?.id, 'the secondary restores the tab that was active before quit');
  assert.ok(
    secondary.tabs.some((tab) => tab.url === this.secondaryWindowUrl),
    `restored runtime snapshots: ${JSON.stringify(runtimes)}`,
  );
});
