'use strict';

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

When('I open a named local profile window', async function () {
  this.localProfileId = await this.call('openProfileWindow', 'Work');
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.some((runtime) => runtime.profileId === this.localProfileId),
    'the named local-profile window to attach',
  );
  const profileWindow = (await this.call('windowRuntimes')).find(
    (runtime) => runtime.profileId === this.localProfileId
  );
  assert.equal(await this.call('focusWindow', profileWindow.id), true);
  this.normalProfileTabId = await this.call('openTab', this.fixtureUrl('local-profile-normal'));
  this.privateProfileTabId = await this.call(
    'openTab', this.fixtureUrl('local-profile-private'), { private: true }
  );
  await waitForValue(
    () => this.call('islandProfileLabel'),
    (label) => label === 'Work ·',
    'the visible named-profile Island label',
  );
});

Then('the named profile uses isolated normal and private browser sessions', async function () {
  const menuLabels = await waitForValue(
    () => this.call('nativeMenuLabels'),
    (labels) => labels.includes('Profiles') && labels.includes('New Profile Window') && labels.includes('Work'),
    'the profile menu entries',
  );
  assert.ok(menuLabels.includes('Profiles'));
  const state = await waitForValue(
    () => this.call('state'),
    (current) => current.tabs.some((tab) => tab.id === this.normalProfileTabId)
      && current.tabs.some((tab) => tab.id === this.privateProfileTabId),
    'normal and private profile tabs to be created',
  );
  const normal = state.tabs.find((tab) => tab.id === this.normalProfileTabId);
  const privateTab = state.tabs.find((tab) => tab.id === this.privateProfileTabId);

  assert.equal(normal.sessionProfileId, this.localProfileId);
  assert.equal(normal.sessionKind, 'normal');
  assert.equal(normal.sessionPersistent, true);
  assert.equal(normal.matchesProfileSession, true);
  assert.equal(normal.sessionIsolatedFromDefault, true);

  assert.equal(privateTab.sessionProfileId, this.localProfileId);
  assert.equal(privateTab.sessionKind, 'private');
  assert.equal(privateTab.sessionPersistent, false);
  assert.equal(privateTab.matchesProfileSession, true);
  assert.equal(privateTab.sessionIsolatedFromDefault, true);

  const runtime = (await this.call('windowRuntimes')).find(
    (item) => item.profileId === this.localProfileId
  );
  assert.ok(runtime, 'the named profile window remains identifiable by profile id');
  assert.equal(await this.call('closeWindow', runtime.id), true);
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.length === 1 && runtimes[0].id === 'primary',
    'the named profile smoke window to close',
  );
});
