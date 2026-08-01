'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

async function prepareRecoveryTabs(world, count) {
  const initial = await world.state();
  world.recoveryUrls = [];
  for (let index = 0; index < count; index += 1) {
    const url = world.fixtureUrl(`crash-recovery-${index + 1}`);
    world.recoveryUrls.push(url);
    await world.call('openTab', url);
  }
  for (const id of initial.tabOrder) await world.call('closeTab', id);

  await waitForValue(
    () => world.call('persistedWorkspace'),
    (workspace) => world.recoveryUrls.every((url) =>
      workspace.windows.some((windowState) => windowState.urls.includes(url))),
    'the recoverable tabs to reach the session workspace',
  );
  assert.equal(await world.call('flushSession'), true, 'the crash fixture must be durable');
}

Given('I have two persisted tabs for crash recovery', async function () {
  await prepareRecoveryTabs(this, 2);
});

Given('I have one persisted tab for crash recovery', async function () {
  await prepareRecoveryTabs(this, 1);
});

Given('I have persisted Personal and named-profile tabs for crash recovery', async function () {
  const initial = await this.state();
  this.personalRecoveryUrl = this.fixtureUrl('crash-recovery-personal');
  this.namedRecoveryUrl = this.fixtureUrl('crash-recovery-named');
  this.privateRecoveryUrl = this.fixtureUrl('crash-recovery-private');
  this.recoveryUrls = [this.personalRecoveryUrl, this.namedRecoveryUrl];

  await this.call('openTab', this.personalRecoveryUrl);
  for (const id of initial.tabOrder) await this.call('closeTab', id);

  this.recoveryProfileId = await this.call('openProfileWindow', 'Recovery profile');
  const profileRuntimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (items) => items.some((runtime) =>
      runtime.profileId === this.recoveryProfileId && runtime.attached),
    'the named recovery profile window',
  );
  const namedRuntime = profileRuntimes.find(
    (runtime) => runtime.profileId === this.recoveryProfileId
  );
  assert.equal(await this.call('focusWindow', namedRuntime.id), true);
  await this.call('openTab', this.namedRecoveryUrl);
  await this.call('openTab', this.privateRecoveryUrl, { private: true });
  for (const id of namedRuntime.tabOrder) await this.call('closeTab', id);

  await waitForValue(
    () => this.call('persistedWorkspace'),
    (workspace) => this.recoveryUrls.every((url) =>
      workspace.windows.some((windowState) => windowState.urls.includes(url))) &&
      workspace.windows.every((windowState) => !windowState.urls.includes(this.privateRecoveryUrl)),
    'the profile-separated recoverable workspace',
  );
  assert.equal(await this.call('flushSession'), true, 'the profile recovery fixture must be durable');
});

When('Blanc exits unexpectedly and relaunches', async function () {
  assert.equal(typeof ctx.crashRelaunch, 'function');
  await ctx.crashRelaunch();
});

Then('Blanc holds saved navigation behind the recovery choice', async function () {
  const recovery = await waitForValue(
    () => this.call('readStartRecoveryDom'),
    (value) => value?.hidden === false &&
      value.title === 'Pick up where you left off?' &&
      value.restoreLabel === 'Restore tabs' &&
      value.freshLabel === 'Start fresh' &&
      this.recoveryUrls.every((url) => !value.message.includes(url)),
    'the local session recovery choice',
  );
  assert.match(
    recovery.message,
    new RegExp(`^${this.recoveryUrls.length} tabs?(?: across \\d+ windows?)? (?:are|is) ready`)
  );
  assert.match(recovery.message, /Private tabs were never saved\./);

  const runtimes = await this.call('windowRuntimes');
  assert.equal(runtimes.length, 1, 'saved windows must not open before the choice');
  assert.equal(runtimes[0].tabs.length, 1, 'only the safe recovery new tab may exist');
  assert.match(runtimes[0].tabs[0].url, /^blanc:\/\/newtab/);
  for (const url of this.recoveryUrls) {
    assert.equal(runtimes[0].tabs.some((tab) => tab.url === url), false);
  }
});

When('I choose to restore the saved session', async function () {
  assert.equal(await this.call('clickSessionRecovery', 'restore'), true);
});

Then('the saved crash-recovery tabs reopen', async function () {
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (items) => this.recoveryUrls.every((url) =>
      items.some((runtime) => runtime.tabs.some((tab) => tab.url === url))) &&
      items.flatMap((runtime) => runtime.tabs).length === this.recoveryUrls.length,
    'the saved session tabs to reopen',
  );
  assert.equal(runtimes.flatMap((runtime) => runtime.tabs).length, this.recoveryUrls.length);
});

When('I choose to start fresh after the crash', async function () {
  assert.equal(await this.call('clickSessionRecovery', 'fresh'), true);
});

Then('the saved crash-recovery tabs stay discarded', async function () {
  const workspace = await waitForValue(
    () => this.call('persistedWorkspace'),
    (value) => value.windows.length === 1 &&
      value.windows[0].id === 'primary' &&
      value.windows[0].urls.length === 1 &&
      value.windows[0].urls[0].startsWith('blanc://newtab'),
    'the fresh primary workspace to replace the crashed session',
  );
  const serialized = JSON.stringify(workspace);
  for (const url of this.recoveryUrls) assert.equal(serialized.includes(url), false);

  const state = await this.state();
  assert.equal(state.tabs.length, 1);
  assert.match(state.tabs[0].url, /^blanc:\/\/newtab/);
});

Then('crash recovery preserves profile isolation and omits the private tab', async function () {
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (items) => items.length === 2 &&
      items.some((runtime) => runtime.profileId === 'default' &&
        runtime.tabs.some((tab) => tab.url === this.personalRecoveryUrl)) &&
      items.some((runtime) => runtime.profileId === this.recoveryProfileId &&
        runtime.tabs.some((tab) => tab.url === this.namedRecoveryUrl)),
    'both profile-partitioned workspaces to recover',
  );
  const named = runtimes.find((runtime) => runtime.profileId === this.recoveryProfileId);
  assert.equal(await this.call('focusWindow', named.id), true);
  const state = await this.state();
  const namedTab = state.tabs.find((tab) => tab.url === this.namedRecoveryUrl);
  assert.equal(namedTab.sessionProfileId, this.recoveryProfileId);
  assert.equal(namedTab.matchesProfileSession, true);
  assert.equal(namedTab.sessionIsolatedFromDefault, true);
  assert.equal(
    runtimes.some((runtime) => runtime.tabs.some((tab) => tab.url === this.privateRecoveryUrl)),
    false,
  );
});
