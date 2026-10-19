const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');

// F52 — Tab Archive. The sweep, the close and the restore are the real
// main-process paths; the hooks only set the setting, backdate a tab's
// last-viewed clock and move the grace window, as Quiet Tabs' steps do.

const HOUR = 60 * 60 * 1000;

async function openLoadedTab(world, name) {
  const previous = (await world.state()).activeTabId;
  const id = await world.call('openTab', world.fixtureUrl(name));
  await world.waitForState((state) => {
    const tab = state.tabs.find((candidate) => candidate.id === id);
    return tab && !tab.loading && tab.loadedUrl.includes(`/site/${encodeURIComponent(name)}`);
  });
  // A background tab: the active tab is never archived.
  if (previous) {
    await world.call('activateTab', previous);
    await world.waitForState((state) => state.activeTabId === previous);
  }
  return id;
}

async function archiveTab(world, id) {
  await world.call('setTabArchive', '12h');
  await world.call('setTabViewedSince', id, 13 * HOUR);
  await world.call('setArchiveGraceUntil', 0);
  const result = await world.call('runArchiveSweep');
  assert.deepEqual(result.archived, [id]);
}

Given('tab archiving is set to 12 hours', async function () {
  await this.call('setTabArchive', '12h');
});

Given('a loose background tab not viewed for 13 hours', async function () {
  this.archiveCandidateId = await openLoadedTab(this, 'archive-loose');
  await this.call('setTabViewedSince', this.archiveCandidateId, 13 * HOUR);
});

Given('a pinned tab and a grouped tab not viewed for 13 hours', async function () {
  this.archivePinnedId = await openLoadedTab(this, 'archive-pinned');
  await this.call('pinTab', this.archivePinnedId);
  this.archiveGroupedId = await openLoadedTab(this, 'archive-grouped');
  await this.call('groupTabByName', this.archiveGroupedId, 'Reading');
  await this.waitForState((state) =>
    state.tabs.find((t) => t.id === this.archivePinnedId)?.pinned
    && state.tabs.find((t) => t.id === this.archiveGroupedId)?.groupId);
  await this.call('setTabViewedSince', this.archivePinnedId, 13 * HOUR);
  await this.call('setTabViewedSince', this.archiveGroupedId, 13 * HOUR);
});

Given('a loose background tab with a typed form value not viewed for 13 hours', async function () {
  this.archiveCandidateId = await openLoadedTab(this, 'archive-draft');
  await this.call('executeTab', this.archiveCandidateId,
    `document.getElementById('acceptance-draft').value='unsaved'; true`);
  await this.call('setTabViewedSince', this.archiveCandidateId, 13 * HOUR);
});

Given('an archived tab that I had renamed', async function () {
  this.archiveCandidateId = await openLoadedTab(this, 'archive-renamed');
  await this.call('renameTab', this.archiveCandidateId, 'Kept for later');
  await this.waitForState((state) =>
    state.tabs.find((t) => t.id === this.archiveCandidateId)?.customTitle === 'Kept for later');
  await archiveTab(this, this.archiveCandidateId);
});

Given('an archived tab', async function () {
  this.archiveCandidateId = await openLoadedTab(this, 'archive-plain');
  await archiveTab(this, this.archiveCandidateId);
  assert.equal((await this.call('archiveEntries')).length, 1);
});

When('the archive sweep runs after the grace period', async function () {
  await this.call('setArchiveGraceUntil', 0);
  this.archiveResult = await this.call('runArchiveSweep');
});

When('the archive sweep runs inside the grace period', async function () {
  await this.call('setArchiveGraceUntil', Date.now() + HOUR);
  this.archiveResult = await this.call('runArchiveSweep');
  assert.equal(this.archiveResult.skippedReason, 'grace');
});

When('I restore it from the Archive', async function () {
  const [entry] = await this.call('archiveEntries');
  this.archiveEntryId = entry.id;
  this.restoredFirst = await this.call('restoreArchived', entry.id);
});

Then('that tab is closed and listed in the Archive', async function () {
  const state = await this.state();
  assert.equal(state.tabs.some((t) => t.id === this.archiveCandidateId), false);
  const entries = await this.call('archiveEntries');
  assert.equal(entries.length, 1);
  assert.match(entries[0].url, /\/site\/archive-loose/);
  assert.equal(entries[0].title, 'archive-loose');
});

Then('both tabs are still open and the Archive is empty', async function () {
  const state = await this.state();
  assert.ok(state.tabs.some((t) => t.id === this.archivePinnedId));
  assert.ok(state.tabs.some((t) => t.id === this.archiveGroupedId));
  assert.deepEqual(await this.call('archiveEntries'), []);
});

Then('that tab is still open and the Archive is empty', async function () {
  const state = await this.state();
  assert.ok(state.tabs.some((t) => t.id === this.archiveCandidateId));
  assert.deepEqual(await this.call('archiveEntries'), []);
});

Then('it opens as the last tab with its custom name and leaves the Archive', async function () {
  assert.equal(this.restoredFirst, true);
  const state = await this.waitForState((s) => s.tabs.some((t) => t.customTitle === 'Kept for later'));
  const restored = state.tabs.find((t) => t.customTitle === 'Kept for later');
  assert.equal(state.tabOrder.at(-1), restored.id);
  assert.equal(state.activeTabId, restored.id);
  assert.equal(restored.groupId, null);
  assert.deepEqual(await this.call('archiveEntries'), []);
  this.restoredTabCount = state.tabs.length;
});

Then('restoring the same entry again opens nothing', async function () {
  assert.equal(await this.call('restoreArchived', this.archiveEntryId), false);
  assert.equal((await this.state()).tabs.length, this.restoredTabCount);
});

Then('the Archive is empty', async function () {
  assert.deepEqual(await this.call('archiveEntries'), []);
});

When('the computer wakes from sleep and the archive sweep runs', async function () {
  await this.call('setArchiveGraceUntil', 0);
  await this.call('emitPowerResume');
  this.archiveResult = await this.call('runArchiveSweep');
  assert.equal(this.archiveResult.skippedReason, 'grace');
});
