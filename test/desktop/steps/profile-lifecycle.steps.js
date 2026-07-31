'use strict';

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

When('I rename a named local profile', async function () {
  this.lifecycleProfileId = await this.call('openProfileWindow', 'Lifecycle');
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (items) => items.filter((runtime) => runtime.profileId === this.lifecycleProfileId && runtime.attached).length === 1,
    'the lifecycle profile window to attach',
  );
  this.lifecycleWorkspaceIds = runtimes
    .filter((runtime) => runtime.profileId === this.lifecycleProfileId)
    .map((runtime) => runtime.id);
  assert.equal(await this.call('focusWindow', this.lifecycleWorkspaceIds[0]), true);

  const result = await this.call('renameProfile', this.lifecycleProfileId, 'Studio');
  assert.equal(result.ok, true, result.message);
  await waitForValue(
    () => this.call('islandProfileLabel'),
    (label) => label === 'Studio ·',
    'the renamed profile label in the Island',
  );
  await waitForValue(
    () => this.call('nativeMenuLabels'),
    (labels) => labels.includes('Manage Profiles…') && labels.includes('Studio') && !labels.includes('Lifecycle'),
    'the renamed native profile menu entry',
  );
  await this.call('openSettings');
  const settingsProfiles = await waitForValue(
    () => this.call('readSettingsProfilesDom'),
    (state) => state?.nav === 'Profiles' && state.createLabel === 'Create profile window' &&
      state.names.includes('Personal') && state.names.includes('Studio') &&
      state.actions.includes('Rename') && state.actions.includes('Delete'),
    'the trusted Settings profile lifecycle controls',
  );
  assert.ok(settingsProfiles.names.includes('Studio'));
});

When('I confirm deletion of that named local profile', async function () {
  const rejected = await this.call('deleteProfile', this.lifecycleProfileId, 'wrong name');
  assert.equal(rejected.ok, false, 'deletion requires the exact visible profile name');
  assert.ok((await this.call('localProfiles')).some((profile) => profile.id === this.lifecycleProfileId));

  const result = await this.call('deleteProfile', this.lifecycleProfileId, 'Studio');
  assert.equal(result.ok, true, result.message);
});

Then('the named local profile and its workspaces are gone', async function () {
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => !runtimes.some((runtime) => runtime.profileId === this.lifecycleProfileId),
    'the deleted profile windows to close',
  );
  await waitForValue(
    () => this.call('localProfiles'),
    (profiles) => !profiles.some((profile) => profile.id === this.lifecycleProfileId)
      && profiles.some((profile) => profile.id === 'default' && profile.name === 'Personal'),
    'the deleted profile identity to be removed while Personal remains',
  );
  const persisted = await this.call('persistedWorkspaceIds');
  for (const id of this.lifecycleWorkspaceIds) {
    assert.ok(!persisted.includes(id), 'a deleted profile workspace cannot be restored later');
  }
});
