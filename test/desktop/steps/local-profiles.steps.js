'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');
const { waitForValue } = require('../support/poll');

async function waitForSettings(world) {
  return waitForValue(
    () => world.call('utilitySurface'),
    (surface) => surface?.visible && surface.ready && surface.url === 'blanc://settings/',
    'Personal profile settings sheet'
  );
}

Given('Personal profile settings are open', async function () {
  await this.call('openSettings');
  await waitForSettings(this);
  await waitForValue(
    () => this.call('settingsProfileRows'),
    (rows) => rows.some((row) => row.id === 'default' && row.title === 'Personal'),
    'Personal row in profile settings'
  );
});

When('I create a local profile named {string} from Settings', async function (name) {
  assert.equal(await this.call('settingsCreateProfile', name), true);
  const profiles = await waitForValue(
    () => this.call('profiles'),
    (profiles) => profiles.find((profile) => profile.name === name),
    `${name} profile registry entry`
  );
  this.namedProfile = profiles.find((profile) => profile.name === name);
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.find((runtime) => runtime.profileId === this.namedProfile.id),
    `${name} profile window`
  );
  this.namedRuntime = runtimes.find((runtime) => runtime.profileId === this.namedProfile.id);
});

Then('the Work profile owns a separate window', async function () {
  assert.ok(this.namedProfile?.id && this.namedProfile.id !== 'default');
  assert.equal(this.namedRuntime.profileName, 'Work');
  await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.some((runtime) =>
      runtime.id === this.namedRuntime.id && runtime.title === 'Work — Blanc'),
    'Work profile window title'
  );
  assert.equal(this.namedRuntime.attached, true);
  assert.equal(this.namedRuntime.tabOrder.length, 1);
  const personal = (await this.call('windowRuntimes')).find((runtime) => runtime.id === 'primary');
  assert.equal(personal.profileId, 'default');
  assert.equal(personal.tabOrder.some((id) => this.namedRuntime.tabOrder.includes(id)), false);
});

When('I save distinct Favorites in Personal and Work', async function () {
  this.personalFavorite = this.fixtureUrl('personal-favorite');
  this.workFavorite = this.fixtureUrl('work-favorite');
  assert.equal(await this.call(
    'saveProfileFavorite', 'primary', this.personalFavorite, 'Personal favorite'
  ), true);
  assert.equal(await this.call(
    'saveProfileFavorite', this.namedRuntime.id, this.workFavorite, 'Work favorite'
  ), true);
});

Then('each profile sees only its own Favorites', async function () {
  assert.deepEqual(await this.call('profileBookmarkUrls', 'primary'), [this.personalFavorite]);
  assert.deepEqual(await this.call('profileBookmarkUrls', this.namedRuntime.id), [this.workFavorite]);
});

When('I open normal and private tabs in Work', async function () {
  this.workNormalTab = await this.call(
    'openTabInWindow', this.namedRuntime.id, this.fixtureUrl('work-normal'), {}
  );
  this.workPrivateTab = await this.call(
    'openTabInWindow', this.namedRuntime.id, 'blanc://newtab/?private=1', { private: true }
  );
});

Then('both Work sessions are isolated from Personal', async function () {
  const normal = await waitForValue(
    () => this.call('profileTabSession', this.workNormalTab),
    Boolean,
    'Work normal session snapshot'
  );
  const privateTab = await waitForValue(
    () => this.call('profileTabSession', this.workPrivateTab),
    Boolean,
    'Work private session snapshot'
  );
  assert.deepEqual(
    {
      profileId: normal.profileId,
      private: normal.private,
      matches: normal.matchesProfileSession,
      persistent: normal.persistent,
      isolated: normal.isolatedFromPersonal,
    },
    {
      profileId: this.namedProfile.id,
      private: false,
      matches: true,
      persistent: true,
      isolated: true,
    }
  );
  assert.deepEqual(
    {
      profileId: privateTab.profileId,
      private: privateTab.private,
      matches: privateTab.matchesProfileSession,
      persistent: privateTab.persistent,
      isolated: privateTab.isolatedFromPersonal,
    },
    {
      profileId: this.namedProfile.id,
      private: true,
      matches: true,
      persistent: false,
      isolated: true,
    }
  );
});

Given('a local profile named {string} and Personal profile settings', async function (name) {
  const created = await this.call('createProfileWindow', name);
  assert.equal(created.ok, true, created.message);
  this.namedProfile = created.profile;
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.find((runtime) => runtime.id === created.runtimeId),
    `${name} profile window`
  );
  this.namedRuntime = runtimes.find((runtime) => runtime.id === created.runtimeId);
  await this.call('openSettings');
  await waitForSettings(this);
  await waitForValue(
    () => this.call('settingsProfileRows'),
    (rows) => rows.some((row) => row.id === created.profile.id && row.title === name),
    `${name} row in profile settings`
  );
});

When('I rename the Work profile to {string} from Settings', async function (name) {
  assert.equal(await this.call('settingsRenameProfile', this.namedProfile.id, name), true);
  this.renamedProfileName = name;
});

Then('its registry entry and window title say {string}', async function (name) {
  const profiles = await waitForValue(
    () => this.call('profiles'),
    (profiles) => profiles.find((candidate) =>
      candidate.id === this.namedProfile.id && candidate.name === name),
    'renamed profile registry entry'
  );
  const profile = profiles.find((candidate) => candidate.id === this.namedProfile.id);
  assert.equal(profile.name, name);
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (runtimes) => runtimes.find((candidate) =>
      candidate.id === this.namedRuntime.id && candidate.title === `${name} — Blanc`),
    'renamed profile window title'
  );
  const runtime = runtimes.find((candidate) => candidate.id === this.namedRuntime.id);
  assert.equal(runtime.profileName, name);
});

When('I try to delete Studio with the wrong confirmation', async function () {
  assert.equal(await this.call(
    'settingsDeleteProfile', this.namedProfile.id, 'not the profile name'
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 100));
});

Then('the Studio profile remains intact', async function () {
  assert.ok((await this.call('profiles')).some((profile) => profile.id === this.namedProfile.id));
  assert.ok((await this.call('windowRuntimes')).some((runtime) => runtime.id === this.namedRuntime.id));
});

When('I confirm deletion of Studio from Settings', async function () {
  assert.equal(await this.call(
    'settingsDeleteProfile', this.namedProfile.id, this.renamedProfileName
  ), true);
});

Then('its windows, registry entry, and saved workspaces are removed', async function () {
  await waitForValue(
    () => this.call('profiles'),
    (profiles) => !profiles.some((profile) => profile.id === this.namedProfile.id),
    'deleted profile to leave registry'
  );
  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (rows) => !rows.some((runtime) => runtime.profileId === this.namedProfile.id),
    'deleted profile windows to close'
  );
  assert.ok(runtimes.some((runtime) => runtime.profileId === 'default' && runtime.attached));
  const session = await waitForValue(
    () => this.call('persistedSessionData'),
    (value) => Array.isArray(value?.windows) &&
      !value.windows.some((entry) => entry.profileId === this.namedProfile.id),
    'deleted profile workspaces to leave session.json'
  );
  assert.ok(session.windows.some((entry) => entry.profileId === 'default'));
});

Given('a saved Work profile workspace', async function () {
  const created = await this.call('createProfileWindow', 'Work');
  assert.equal(created.ok, true, created.message);
  this.namedProfile = created.profile;
  this.namedRuntimeId = created.runtimeId;
  this.namedRestoreUrl = this.fixtureUrl('work-profile-restore');
  await this.call('openTabInWindow', created.runtimeId, this.namedRestoreUrl, {});
  await waitForValue(
    () => this.call('persistedSessionData'),
    (session) => session.windows?.some((entry) =>
      entry.id === created.runtimeId &&
      entry.profileId === created.profile.id &&
      entry.urls.includes(this.namedRestoreUrl)),
    'named profile workspace to persist'
  );
});

When('I relaunch Blanc with local profiles', async function () {
  await ctx.relaunch();
});

Then('Personal and Work restore with their original profile identities', async function () {
  const profiles = await waitForValue(
    () => this.call('profiles'),
    (rows) => rows.some((profile) =>
      profile.id === this.namedProfile.id && profile.name === 'Work'),
    'Work profile registry after relaunch'
  );
  assert.ok(profiles.some((profile) => profile.id === this.namedProfile.id));

  const runtimes = await waitForValue(
    () => this.call('windowRuntimes'),
    (rows) => rows.some((runtime) =>
      runtime.id === this.namedRuntimeId &&
      runtime.profileId === this.namedProfile.id &&
      runtime.tabs.some((tab) => tab.url === this.namedRestoreUrl)),
    'Work profile workspace after relaunch'
  );
  const personal = runtimes.find((runtime) => runtime.id === 'primary');
  const work = runtimes.find((runtime) => runtime.id === this.namedRuntimeId);
  assert.equal(personal.profileId, 'default');
  assert.equal(work.profileId, this.namedProfile.id);
  assert.equal(work.profileName, 'Work');

  const restoredTab = work.tabs.find((tab) => tab.url === this.namedRestoreUrl);
  const session = await waitForValue(
    () => this.call('profileTabSession', restoredTab.id),
    Boolean,
    'restored Work tab session'
  );
  assert.equal(session.matchesProfileSession, true);
  assert.equal(session.isolatedFromPersonal, true);
  assert.equal(session.persistent, true);
});
