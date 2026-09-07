import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';

const FALLBACK_TITLES = [
  'Atlas docs',
  'Atlas issues',
  'Atlas docs duplicate',
  'Hotels',
  'Flights',
  'Direct in session',
];

const FALLBACK_URLS = [
  'https://atlas-docs.example/guide',
  'https://atlas-issues.example/board',
  'https://atlas-docs.example/guide',
  'https://hotels.example/stay',
  'https://flights.example/search',
  'https://direct-in-reset.example/',
];

const MERGE_URLS = [
  'https://project-brief.example/',
  'https://project-board.example/',
];

const STRESS_URL_PREFIX = 'https://stress-';

async function waitFor(read, predicate, label, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await read();
    if (predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}; last: ${JSON.stringify(last)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function waitForTabImportSheet(world) {
  return waitFor(
    () => world.call('utilitySurface'),
    (surface) =>
      surface?.visible === true &&
      surface.ready === true &&
      surface.url === 'blanc://tab-import/',
    'Bring Your Tabs utility sheet',
  );
}

function importedSourceUrl(tab) {
  if (!tab?.url?.startsWith('blanc://error/')) return tab?.url ?? '';
  try { return new URL(tab.url).searchParams.get('url') ?? tab.url; } catch { return tab.url; }
}

function importedTabs(state, urls = FALLBACK_URLS) {
  const wanted = new Set(urls);
  return state.tabOrder
    .map((id) => state.tabs.find((tab) => tab.id === id))
    .filter((tab) => tab && wanted.has(importedSourceUrl(tab)));
}

Given('I opened Bring Your Tabs without selecting a source', async function () {
  this.tabImportBefore = await this.call('state');
  this.tabImportFavoritesBefore = await this.call('bookmarkRecords');
  await this.call('openTabImport');
  await waitForTabImportSheet(this);
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(projection.error, 'session-unavailable');
});

When('I select a supported browser profile with a complete restorable session', async function () {
  this.tabImportPrepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(this.tabImportPrepared.ok, true);
});

Then('its normal HTTP and HTTPS tabs are shown by source window and tab order', async function () {
  const dom = await this.call('readTabImportDom');
  assert.equal(dom.step, 'tabs');
  assert.deepEqual(dom.windows, ['Window 1', 'Window 2']);
  assert.deepEqual(dom.preview.map((row) => row.title), FALLBACK_TITLES);
  assert.ok(dom.preview.every((row) => row.selected));
});

Then('exact duplicate open tabs remain separate', async function () {
  const dom = await this.call('readTabImportDom');
  assert.equal(dom.preview.filter((row) => row.meta.startsWith('atlas-docs.example')).length, 2);
});

Then('no tabs, groups, or Favorites have been created', async function () {
  const state = await this.call('state');
  assert.deepEqual(state.tabOrder, this.tabImportBefore.tabOrder);
  assert.deepEqual(state.groups, this.tabImportBefore.groups);
  assert.deepEqual(await this.call('bookmarkRecords'), this.tabImportFavoritesBefore);
});

Given('I reviewed selected open-tab candidates from multiple source windows', async function () {
  this.tabImportFixture = 'folder-fallback';
  this.tabImportBefore = await this.call('state');
  this.tabImportFavoritesBefore = await this.call('bookmarkRecords');
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'review' },
  );
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.dom.groupNames, ['work', 'travel']);
  assert.equal(prepared.dom.applyLabel, 'Open 6 tabs in Blanc');
  this.tabImportProjection = prepared.projection;
});

Then('imported tabs appear in source-window and source-tab order', async function () {
  const state = await this.call('state');
  const imported = importedTabs(state);
  assert.deepEqual(imported.map(importedSourceUrl), FALLBACK_URLS);
  this.tabImportAppliedState = state;
});

Then('source pins remain pinned', async function () {
  const state = await this.call('state');
  const imported = importedTabs(state);
  assert.equal(imported[0].pinned, true);
  assert.ok(imported.slice(1).every((tab) => tab.pinned === false));
});

Then('only the first selected imported tab is awake and focused', async function () {
  const state = await this.waitForState(
    (candidate) => {
      const imported = importedTabs(candidate);
      return imported.length === FALLBACK_URLS.length &&
        candidate.activeTabId === imported[0].id &&
        imported[0].asleep === false &&
        !!imported[0].webContentsId;
    },
    { timeout: 20_000 },
  );
  const imported = importedTabs(state);
  assert.equal(state.activeTabId, imported[0].id);
  assert.equal(imported[0].asleep, false);
  assert.ok(imported[0].webContentsId, 'the focused imported tab should own live web contents');
  this.tabImportAppliedState = state;
});

Then('every other imported tab is quiet and viewless', async function () {
  const state = this.tabImportAppliedState ?? await this.call('state');
  const imported = importedTabs(state);
  for (const tab of imported.slice(1)) {
    assert.equal(tab.asleep, true, `${tab.url} should remain quiet`);
    assert.equal(tab.webContentsId, null, `${tab.url} should remain viewless`);
  }
});

Then('Favorites are unchanged', async function () {
  assert.deepEqual(await this.call('bookmarkRecords'), this.tabImportFavoritesBefore);
});

Then('available browser and profile labels may be listed', async function () {
  const dom = await waitFor(
    () => this.call('readTabImportDom'),
    (value) => value?.sourceLabels?.includes('Google Chrome — Tab migration fixture'),
    'tab-import source labels',
  );
  assert.ok(dom.sourceLabels.includes('Google Chrome — Acceptance profile'));
});

Then('no session file has been opened', async function () {
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(projection.error, 'session-unavailable');
  assert.equal(JSON.stringify(await this.call('persistedSessionData')).includes('atlas-docs'), false);
});

When('I select a source profile', async function () {
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(prepared.ok, true);
});

Then('Blanc reads only its bounded session snapshot', async function () {
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(projection.state, 'ready');
  assert.equal(projection.candidates.length, 6);
});

Given('a tab-migration session contains candidate URLs and a source path', async function () {
  await this.call('openTabImport');
  await waitForTabImportSheet(this);
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(prepared.ok, true);
});

When('the utility renderer requests its candidate projection', async function () {
  this.tabImportRendererDom = await this.call('readTabImportDom');
  this.tabImportSafeProjection = await this.call('getTabImportSessionProjection');
});

Then('it receives opaque IDs, bounded titles, hostnames, source-window and group labels, pin, and selection state', function () {
  const projection = this.tabImportSafeProjection;
  assert.equal(projection.candidates.length, 6);
  for (const candidate of projection.candidates) {
    assert.deepEqual(Object.keys(candidate).sort(), [
      'candidateId', 'excluded', 'hostname', 'pinned', 'selected',
      'sourceGroupName', 'sourceTabOrder', 'sourceWindow', 'title',
    ]);
    assert.match(candidate.candidateId, /\S/);
    assert.match(candidate.hostname, /\.example$/);
    assert.ok(Number.isInteger(candidate.sourceWindow));
    assert.ok(Number.isInteger(candidate.sourceTabOrder));
    assert.ok(candidate.sourceGroupName === null || typeof candidate.sourceGroupName === 'string');
    assert.equal(typeof candidate.pinned, 'boolean');
    assert.equal(candidate.selected, true);
    assert.equal(candidate.excluded, false);
  }
  assert.equal(this.tabImportRendererDom.preview.length, 6);
});

Then('it receives no full URL or source filesystem path', async function () {
  const exposed = JSON.stringify({
    projection: this.tabImportSafeProjection,
    renderer: this.tabImportRendererDom,
  });
  assert.equal(exposed.includes('https://'), false);
  assert.equal(exposed.includes('blanc-browser-home-'), false);
  assert.equal(await this.call('activePageHasTabImportBridge'), false);
});

Given('the newest source session cannot be read while its browser is running', async function () {
  this.tabImportBefore = await this.call('state');
  this.tabImportFavoritesBefore = await this.call('bookmarkRecords');
  await this.call('openTabImport');
  await waitForTabImportSheet(this);
});

When('Blanc can parse an older saved restorable session as preflight evidence', async function () {
  this.quitGate = await this.call(
    'applyTabImportFixture',
    'quit-safety',
    { stage: 'quit-gate' },
  );
  assert.equal(this.quitGate.ok, true);
});

Then('Blanc may ask me to quit the source browser normally', function () {
  assert.equal(this.quitGate.dom.step, 'source');
  assert.equal(this.quitGate.dom.recoveryHidden, false);
  assert.equal(this.quitGate.dom.recoveryButton, 'I’ve quit Google Chrome — check again');
  const waitingRow = this.quitGate.dom.sourceRows.find((row) => row.waiting);
  assert.ok(waitingRow, 'the selected source profile should show a waiting state');
  assert.equal(waitingRow.disabled, true);
  assert.equal(waitingRow.affordance, 'Waiting…');
  assert.equal(this.quitGate.dom.sourceRows.every((row) => row.disabled), true,
    'profile choices stay disabled while the quit gate is active');
});

Then('Blanc says tabs remain saved and restorable without promising automatic reopening', function () {
  assert.match(this.quitGate.dom.recoveryText, /saved, restorable session with 2 tabs/i);
  assert.match(this.quitGate.dom.recoveryText, /reopen automatically .* depends on its startup setting/i);
});

Then('Blanc never force-quits or modifies that browser', async function () {
  assert.equal(this.quitGate.dom.recoveryButtonCount, 1);
  assert.match(this.quitGate.dom.recoveryText, /only reads it and never removes tabs/i);
  const state = await this.call('state');
  assert.deepEqual(state.tabOrder, this.tabImportBefore.tabOrder);
  assert.deepEqual(state.groups, this.tabImportBefore.groups);
  assert.deepEqual(await this.call('bookmarkRecords'), this.tabImportFavoritesBefore);
});

Given('the destination already has a Named Group named {string}', async function (name) {
  await this.call('openTab', 'about:blank');
  await this.call('groupActiveByName', name);
  const state = await this.call('state');
  this.existingTabImportGroup = state.groups.find((group) => group.name === name);
  assert.ok(this.existingTabImportGroup);
});

Given('I renamed a reviewed migration group to {string}', async function (name) {
  const prepared = await this.call(
    'applyTabImportFixture',
    'merge-existing',
    { stage: 'organize' },
  );
  assert.deepEqual(prepared.dom.groupNames, ['project']);
  this.tabImportRenameTarget = name;
});

When('I apply the tab migration', async function () {
  const fixture = this.tabImportFixture ??
    (this.tabImportRenameTarget ? 'merge-existing' : 'folder-fallback');
  let options = this.tabImportRenameTarget
    ? { renameFrom: 'project', renameTo: this.tabImportRenameTarget }
    : {};
  if (fixture === 'stress-500') options = { ...options, directApply: true };
  this.tabImportApply = await this.call('applyTabImportFixture', fixture, options);
  assert.equal(this.tabImportApply.ok, true);
});

Then('those imported tabs join the existing {string} group', async function (name) {
  const state = await this.call('state');
  const imported = importedTabs(state, MERGE_URLS);
  assert.equal(imported.length, 2);
  assert.ok(imported.every((tab) => tab.groupId === this.existingTabImportGroup.id));
  assert.equal(state.groups.find((group) => group.id === this.existingTabImportGroup.id)?.name, name);
});

Then('no second {string} group is created', async function (name) {
  const state = await this.call('state');
  assert.equal(state.groups.filter((group) => group.name === name).length, 1);
});

Given('a tab-migration session belongs to one window and profile', async function () {
  this.otherTabImportRuntimeId = await this.call('openNewWindow');
  assert.ok(this.otherTabImportRuntimeId, 'the foreign window runtime should exist');
  // Create the owned session after the foreign window exists. Opening a new
  // native window is allowed to dismiss surfaces in the previously focused
  // one; that lifecycle behavior is setup, not the ownership attack itself.
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'review' },
  );
  assert.equal(prepared.ok, true);
  this.tabImportOwnerBaseline = {
    state: await this.call('state'),
    favorites: await this.call('bookmarkRecords'),
  };
});

When('a stale generation, another window, or another profile tries to apply it', async function () {
  this.staleTabImportResult = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { runtimeId: 'primary', staleGeneration: true },
  );
  this.foreignTabImportResult = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { runtimeId: this.otherTabImportRuntimeId },
  );
});

Then('the apply is rejected', function () {
  assert.equal(this.staleTabImportResult.error, 'stale-generation');
  assert.equal(this.foreignTabImportResult.error, 'forbidden');
});

Then('no tabs, groups, Favorites, or workspaces are changed', async function () {
  const now = await this.call('state');
  assert.deepEqual(now.tabOrder, this.tabImportOwnerBaseline.state.tabOrder);
  assert.deepEqual(now.groups, this.tabImportOwnerBaseline.state.groups);
  assert.deepEqual(await this.call('bookmarkRecords'), this.tabImportOwnerBaseline.favorites);
});

Given('Blanc asked me to quit the source browser after a successful preflight', async function () {
  const prepared = await this.call(
    'applyTabImportFixture',
    'quit-safety',
    { stage: 'quit-gate' },
  );
  assert.equal(prepared.ok, true);
  assert.equal(prepared.dom.recoveryHidden, false);
});

When('the exact newest session remains locked, changing, incomplete, or malformed', async function () {
  this.afterQuitRefusal = await this.call(
    'applyTabImportFixture',
    'quit-safety',
    { stage: 'after-quit-refusal' },
  );
  assert.equal(this.afterQuitRefusal.ok, true);
});

Then('Blanc does not import an older snapshot', async function () {
  assert.equal(this.afterQuitRefusal.dom.step, 'source');
  assert.equal(this.afterQuitRefusal.dom.recoveryHidden, true);
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(projection.error, 'session-unavailable');
});

Then('Blanc tells me to reopen the source browser', function () {
  assert.match(this.afterQuitRefusal.dom.status, /Reopen Google Chrome/);
  assert.match(this.afterQuitRefusal.dom.status, /will not use an older snapshot/);
});

Given("I am on first-run onboarding's import step", async function () {
  await this.call('newTab');
  await this.waitForState((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return active?.loadedUrl?.startsWith('blanc://newtab');
  });
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.initialReady === true,
    'new-tab first-run data',
  );
  assert.equal(await this.call('showTestFirstRunMigration'), true);
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.privacyHidden === false,
    'first-run dialog',
  );
  assert.equal(await this.call('openFirstRunImportStep'), true);
});

When('I choose Bring your open tabs before or after Favorites import', async function () {
  assert.equal(await this.call('clickFirstRunMigrationFind'), true);
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.options?.length === 3 && value.findHidden === true,
    'first-run migration sources',
  );
  this.firstRunFavoritesBeforeImport = await this.call('bookmarkRecords');
  assert.equal(await this.call('clickFirstRunMigration'), true);
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) =>
      value?.bringTabsHidden === false &&
      value.bringTabsLabel === 'Bring your open tabs…' &&
      value.status.startsWith('Imported '),
    'post-import Bring Your Tabs handoff',
  );
  this.firstRunFavoritesAfterImport = await this.call('bookmarkRecords');
  assert.ok(
    this.firstRunFavoritesAfterImport.length > this.firstRunFavoritesBeforeImport.length,
    'the separate F30 action should import Favorites before the open-tab handoff',
  );
  assert.equal(await this.call('clickFirstRunBringTabs'), true);
  this.firstTabImportSurface = await waitForTabImportSheet(this);
});

Then('the same Bring Your Tabs sheet opens', async function () {
  const surface = await waitForTabImportSheet(this);
  assert.equal(surface.url, 'blanc://tab-import/');
});

Then('Favorites import remains a separate F30 action', async function () {
  assert.deepEqual(await this.call('bookmarkRecords'), this.firstRunFavoritesAfterImport);
});

Given('a tab-migration session has candidates in memory', async function () {
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(prepared.projection.candidates.length, 6);
  this.cancelledTabImportUrls = [...FALLBACK_URLS];
});

When('I cancel or dismiss Bring Your Tabs', async function () {
  this.cancelledTabImport = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'cancel' },
  );
  assert.equal(this.cancelledTabImport.cancelled, true);
});

Then('the session is destroyed', async function () {
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(
    projection.error,
    'session-unavailable',
    JSON.stringify({ projection, cancel: this.cancelledTabImport }),
  );
});

Then('no migration secret enters persistence, sync, telemetry, or logs', async function () {
  const exposed = JSON.stringify({
    disk: await this.call('persistedSessionData'),
    renderer: await this.call('serializedTabsPayload'),
    sync: await this.call('sessionSyncSnapshot'),
    favorites: await this.call('bookmarkRecords'),
  });
  for (const url of this.cancelledTabImportUrls) {
    assert.equal(exposed.includes(url), false, `${url} leaked after migration cancellation`);
  }
});

Given('I reviewed the maximum 500 open-tab candidates', async function () {
  this.tabImportFixture = 'stress-500';
  const prepared = await this.call(
    'applyTabImportFixture',
    this.tabImportFixture,
    { stage: 'review' },
  );
  assert.equal(prepared.ok, true);
  assert.equal(prepared.projection.candidates.length, 500);
  assert.match(prepared.dom.applyLabel, /^Open 500 tabs/);
});

Then('the batch produces one tab-state broadcast', function () {
  assert.equal(this.tabImportApply.broadcastCount, 1);
});

Then('only the focused imported tab has live web contents', async function () {
  this.tabImportStressState = await this.waitForState(
    (state) => {
      const imported = state.tabOrder
        .map((id) => state.tabs.find((tab) => tab.id === id))
        .filter((tab) => importedSourceUrl(tab).startsWith(STRESS_URL_PREFIX));
      return imported.length === 500 &&
        state.activeTabId === imported[0].id &&
        imported[0].asleep === false &&
        imported.filter((tab) => tab.webContentsId !== null).length === 1;
    },
    { timeout: 30_000 },
  );
  const imported = importedTabs(
    this.tabImportStressState,
    this.tabImportStressState.tabs
      .map(importedSourceUrl)
      .filter((url) => url.startsWith(STRESS_URL_PREFIX)),
  );
  assert.equal(imported.length, 500);
  assert.equal(imported[0].id, this.tabImportStressState.activeTabId);
  assert.equal(imported[0].asleep, false);
  assert.ok(imported[0].webContentsId);
});

Then('the other imported tabs remain quiet and viewless', function () {
  const imported = this.tabImportStressState.tabOrder
    .map((id) => this.tabImportStressState.tabs.find((tab) => tab.id === id))
    .filter((tab) => importedSourceUrl(tab).startsWith(STRESS_URL_PREFIX));
  for (const tab of imported.slice(1)) {
    assert.equal(tab.asleep, true, `${tab.url} should remain quiet`);
    assert.equal(tab.webContentsId, null, `${tab.url} should remain viewless`);
  }
});
