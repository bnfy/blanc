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

const { runSlashCommand } = require('../support/overlay');

async function archivedSheetRows(world) {
  return world.call('historySheetArchivedRows');
}

When('I open the Archive with the archive command', async function () {
  await runSlashCommand(this, '/archive');
  const rows = await waitForRows(this, (r) => r && r.view === 'archived');
  this.archivedSheet = rows;
});

async function waitForRows(world, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    last = await archivedSheetRows(world);
    if (predicate(last)) return last;
    if (Date.now() > deadline) throw new Error(`History sheet never matched; last: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

Then('the History sheet lists the archived tab', async function () {
  const sheet = await waitForRows(this, (r) => r?.rows.length === 1);
  assert.equal(sheet.rows[0].title, 'archive-plain');
});

When('I restore it from the History sheet', async function () {
  assert.equal(await this.call('historySheetClick', '.archived-restore'), true);
});

When('I clear the Archive from the History sheet', async function () {
  assert.equal(await this.call('historySheetClick', '#clearArchive'), true);
});

Then('it opens as the last tab and leaves the Archive', async function () {
  const state = await this.waitForState((s) =>
    s.tabs.some((t) => t.loadedUrl.includes('/site/archive-plain') || t.url.includes('/site/archive-plain')));
  const restored = state.tabs.find((t) => t.url.includes('/site/archive-plain'));
  assert.equal(state.tabOrder.at(-1), restored.id);
  assert.equal(restored.groupId, null);
  assert.deepEqual(await this.call('archiveEntries'), []);
});

When('I switch to that tab while the archive sweep is checking it', async function () {
  await this.call('setArchiveGraceUntil', 0);
  await this.call('activateCandidateDuringArchiveProbe', this.archiveCandidateId);
  this.archiveResult = await this.call('runArchiveSweep');
});

Then('that tab is the active tab', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.archiveCandidateId);
});

When('two archive sweeps start at the same time', async function () {
  await this.call('setArchiveGraceUntil', 0);
  this.archiveResults = await this.call('runArchiveSweepsConcurrently');
});

Then('one sweep reports it was busy', function () {
  assert.deepEqual(this.archiveResults.map((r) => r.skippedReason).sort(), ['busy', null]);
});

Then('that tab is listed in the Archive once', async function () {
  const entries = await this.call('archiveEntries');
  assert.equal(entries.length, 1);
  assert.equal((await this.state()).tabs.some((t) => t.id === this.archiveCandidateId), false);
});

Given('a private tab is active', async function () {
  this.privateTabId = await this.call('openTab', this.fixtureUrl('archive-private'), { private: true });
  await this.waitForState((state) => state.activeTabId === this.privateTabId);
});

Then('the restored tab is a normal tab', async function () {
  assert.equal(this.restoredFirst, true);
  const state = await this.waitForState((s) => s.tabs.some((t) => t.url.includes('/site/archive-plain')));
  const restored = state.tabs.find((t) => t.url.includes('/site/archive-plain'));
  assert.equal(restored.private, false);
});

Given('a loose background tab not viewed for 13 hours in a Space I then set aside', async function () {
  this.archiveCandidateId = await openLoadedTab(this, 'archive-space');
  const saved = await this.call('workspaceAction', 'save', 'Archive home');
  assert.equal(saved.ok, true, JSON.stringify(saved));
  this.archiveSpaceId = saved.workspace.id;
  const away = await this.call('workspaceAction', 'create', 'Archive away');
  assert.equal(away.ok, true, JSON.stringify(away));
  // Set aside, the tab lives on in a resident runtime with its old clock.
  assert.equal(await this.call('setTabViewedSince', this.archiveCandidateId, 13 * HOUR), true);
});

When('the archive sweep runs in every window', async function () {
  await this.call('setArchiveGraceUntil', 0);
  this.archiveResults = await this.call('runArchiveSweepInEveryWindow');
});

When('I go back to that Space and the archive sweep runs in every window', async function () {
  // A Space switch is refused while a page in the window is still loading.
  await this.waitForState((state) => state.tabs.every((t) => !t.isLoading));
  const back = await this.call('workspaceAction', 'open', this.archiveSpaceId);
  assert.equal(back.ok, true, JSON.stringify(back));
  await this.waitForState((state) => state.tabs.some((t) => t.id === this.archiveCandidateId));
  await this.call('setArchiveGraceUntil', 0);
  this.archiveResults = await this.call('runArchiveSweepInEveryWindow');
});
