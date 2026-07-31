'use strict';

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

When('I close a Personal tab and open a named local profile window', async function () {
  // Earlier scenarios can intentionally leave a secondary Personal window
  // alive. This contract exercises the permanent primary workspace's recovery
  // stack, so bind the setup to it rather than whichever window happened to
  // hold native focus after the previous scenario.
  assert.equal(await this.call('focusWindow', 'primary'), true);
  this.personalRecoveryUrl = this.fixtureUrl('personal-recovery');
  const personalTab = await this.call('openTab', this.personalRecoveryUrl);
  await this.call('closeTab', personalTab);

  this.recoveryProfileId = await this.call('openProfileWindow', 'Recovery');
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.some((runtime) => runtime.profileId === this.recoveryProfileId),
    'the Recovery profile window to attach',
  );
  const recoveryWindow = (await this.call('windowRuntimes')).find(
    (runtime) => runtime.profileId === this.recoveryProfileId
  );
  assert.equal(await this.call('focusWindow', recoveryWindow.id), true);
  // A global recently-closed stack would incorrectly resurrect the Personal
  // URL here. The new profile has an independent empty recovery stack.
  await this.call('reopenClosed');

  this.recoveryUrl = this.fixtureUrl('recovery-profile-tab');
  this.recoveryTabId = await this.call('openTab', this.recoveryUrl);
  await this.call('groupActiveByName', 'recovery');
  const grouped = await this.call('state');
  assert.equal(
    grouped.tabs.find((tab) => tab.id === this.recoveryTabId)?.groupId,
    grouped.groups.find((group) => group.name === 'recovery')?.id,
    `grouping failed before close: ${JSON.stringify(grouped)}`,
  );
  await this.call('toggleGroup', grouped.groups.find((g) => g.name === 'recovery').id);
  await this.call('pinTab', this.recoveryTabId);
  await this.call('muteTab', this.recoveryTabId);
  await this.call('closeTab', this.recoveryTabId);
  await this.call('reopenClosed');
});

Then('closed-tab recovery stays in that profile and restores its tab state', async function () {
  const profileState = await waitForValue(
    () => this.call('state'),
    (state) => state.tabs.some((tab) => tab.url === this.recoveryUrl),
    'the Recovery tab to be restored in its own window',
  );
  assert.equal(
    profileState.tabs.some((tab) => tab.url === this.personalRecoveryUrl),
    false,
    'Personal’s closed tab must not appear in Recovery',
  );
  const restored = profileState.tabs.find((tab) => tab.url === this.recoveryUrl);
  assert.equal(restored.pinned, true);
  assert.equal(restored.muted, true);
  const group = profileState.groups.find((candidate) => candidate.id === restored.groupId);
  assert.equal(group?.id, restored.groupId);
  assert.equal(group?.name, 'recovery');
  assert.equal(typeof group?.collapsed, 'boolean');

  const profileWindow = (await this.call('windowRuntimes')).find(
    (runtime) => runtime.profileId === this.recoveryProfileId
  );
  assert.equal(await this.call('closeWindow', profileWindow.id), true);
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => !runtimes.some((runtime) => runtime.id === profileWindow.id),
    'the temporary Recovery profile window to close',
  );
  assert.equal(await this.call('focusWindow', 'primary'), true);
  await this.call('reopenClosed');
  const personalState = await waitForValue(
    () => this.call('state'),
    (state) => state.tabs.some((tab) => tab.url === this.personalRecoveryUrl),
    'Personal’s own closed tab to remain recoverable',
  );
  assert.ok(personalState.tabs.some((tab) => tab.url === this.personalRecoveryUrl));
});
