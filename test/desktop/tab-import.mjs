import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';

const FALLBACK_TITLES = [
  'Atlas docs',
  'Atlas issues',
  'Hotels',
  'Flights',
  'Direct in reset',
];

const FALLBACK_URLS = [
  'https://atlas-docs.example/guide',
  'https://atlas-issues.example/board',
  'https://hotels.example/stay',
  'https://flights.example/search',
  'https://direct-in-reset.example/',
];

const MERGE_URLS = [
  'https://project-brief.example/',
  'https://project-board.example/',
];

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

When('I select a bookmarks source and one of its folders', async function () {
  this.tabImportPrepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(this.tabImportPrepared.ok, true);
});

Then('its supported web pages are previewed in source order', async function () {
  const dom = await this.call('readTabImportDom');
  assert.equal(dom.step, 'preview');
  assert.deepEqual(dom.preview.map((row) => row.title), FALLBACK_TITLES);
  assert.ok(dom.preview.every((row) => row.selected));
});

Then('exact duplicate URLs appear only once', async function () {
  const dom = await this.call('readTabImportDom');
  assert.equal(dom.duplicateBadge, '1 duplicate removed');
  assert.equal(dom.preview.filter((row) => row.meta.startsWith('atlas-docs.example')).length, 1);
});

Then('no tabs, groups, or Favorites have been created', async function () {
  const state = await this.call('state');
  assert.deepEqual(state.tabOrder, this.tabImportBefore.tabOrder);
  assert.deepEqual(state.groups, this.tabImportBefore.groups);
  assert.deepEqual(await this.call('bookmarkRecords'), this.tabImportFavoritesBefore);
});

Given('I reviewed selected candidates from nested source folders', async function () {
  this.tabImportBefore = await this.call('state');
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'review' },
  );
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.dom.groupNames, ['work', 'travel']);
  assert.match(prepared.dom.applyLabel, /^Open 5 tabs in 2 groups/);
  this.tabImportProjection = prepared.projection;
});

Then('imported tabs appear in preview order', async function () {
  const state = await this.call('state');
  const imported = importedTabs(state);
  assert.deepEqual(imported.map(importedSourceUrl), FALLBACK_URLS);
  this.tabImportAppliedState = state;
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

Then("imported Favorites use each page's immediate source subfolder", async function () {
  const records = new Map(
    (await this.call('bookmarkRecords')).map((record) => [record.url, record]),
  );
  assert.equal(records.get(FALLBACK_URLS[0]).folder, 'work');
  assert.equal(records.get(FALLBACK_URLS[1]).folder, 'work');
  assert.equal(records.get(FALLBACK_URLS[2]).folder, 'travel');
  assert.equal(records.get(FALLBACK_URLS[3]).folder, 'travel');
  assert.equal(records.get(FALLBACK_URLS[4]).folder, null);
});

Then('available source labels may be listed', async function () {
  const dom = await waitFor(
    () => this.call('readTabImportDom'),
    (value) => value?.sourceLabels?.includes('Google Chrome — Tab migration fixture'),
    'tab-import source labels',
  );
  assert.ok(dom.sourceLabels.includes('Google Chrome — Acceptance profile'));
});

Then('no browser profile or bookmarks file has been read', async function () {
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(projection.error, 'session-unavailable');
  assert.equal(JSON.stringify(await this.call('persistedSessionData')).includes('atlas-docs'), false);
});

When('I select a source', async function () {
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(prepared.ok, true);
});

Then('Blanc reads only its bounded bookmarks snapshot', async function () {
  const projection = await this.call('getTabImportSessionProjection');
  assert.equal(projection.state, 'ready');
  assert.equal(projection.candidates.length, 5);
});

Given('a desktop tab-migration session contains candidate URLs and a source path', async function () {
  await this.call('openTabImport');
  await waitForTabImportSheet(this);
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(prepared.ok, true);
});

When('the utility renderer requests its folder and candidate projections', async function () {
  this.tabImportRendererDom = await this.call('readTabImportDom');
  this.tabImportSafeProjection = await this.call('getTabImportSessionProjection');
});

Then('it receives opaque identifiers, titles, hostnames, folder labels, and selection state', function () {
  const projection = this.tabImportSafeProjection;
  assert.equal(projection.candidates.length, 5);
  for (const candidate of projection.candidates) {
    assert.deepEqual(Object.keys(candidate).sort(), [
      'candidateId', 'excluded', 'folderPath', 'hostname', 'selected', 'title',
    ]);
    assert.match(candidate.candidateId, /\S/);
    assert.match(candidate.hostname, /\.example$/);
    assert.ok(Array.isArray(candidate.folderPath));
    assert.equal(candidate.selected, true);
    assert.equal(candidate.excluded, false);
  }
  assert.equal(this.tabImportRendererDom.preview.length, 5);
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

Given('the destination already has a tab group named {string}', async function (name) {
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
    { stage: 'review' },
  );
  assert.deepEqual(prepared.dom.groupNames, ['project']);
  this.tabImportRenameTarget = name;
});

When('I apply the tab migration', async function () {
  const fixture = this.tabImportRenameTarget ? 'merge-existing' : 'folder-fallback';
  const options = this.tabImportRenameTarget
    ? { renameFrom: 'project', renameTo: this.tabImportRenameTarget }
    : {};
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

Given('a desktop tab-migration session belongs to one window and profile', async function () {
  const created = await this.call('createProfileWindow', 'F39 Other');
  assert.equal(created.ok, true, created.message);
  this.otherTabImportRuntimeId = created.runtimeId;
  this.otherTabImportProfileId = created.profile.id;
  assert.equal(await this.call('focusWindow'), true);
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
    otherFavorites: await this.call('profileBookmarkUrls', created.profile.id),
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
  assert.deepEqual(
    await this.call('profileBookmarkUrls', this.otherTabImportProfileId),
    this.tabImportOwnerBaseline.otherFavorites,
  );
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

When('I finish a Favorites import and choose to bring a folder in as tabs', async function () {
  assert.equal(await this.call('clickFirstRunMigrationFind'), true);
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.options?.length === 3 && value.findHidden === true,
    'first-run migration sources',
  );
  assert.equal(await this.call('clickFirstRunMigration'), true);
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) =>
      value?.bringTabsHidden === false &&
      value.bringTabsLabel === 'Bring a folder in as tabs…',
    'post-import Bring Your Tabs handoff',
  );
  assert.equal(await this.call('clickFirstRunBringTabs'), true);
  this.firstTabImportSurface = await waitForTabImportSheet(this);
});

Then('the Bring Your Tabs sheet opens', async function () {
  const surface = await waitForTabImportSheet(this);
  assert.equal(surface.url, 'blanc://tab-import/');
});

When('I skip full import and choose to bring tabs without importing everything', async function () {
  // Invoking the already-open utility page toggles it closed. A new ledger
  // then gives this half of the scenario a fresh onboarding dialog whose
  // handoff has not observed a successful Favorites import.
  await this.call('openTabImport');
  await waitFor(
    () => this.call('utilitySurface'),
    (surface) => surface?.visible === false,
    'first Bring Your Tabs sheet to close',
  );
  await this.call('newTab');
  await this.waitForState((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return active?.loadedUrl?.startsWith('blanc://newtab');
  });
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.initialReady === true,
    'second new-tab first-run data',
  );
  assert.equal(await this.call('showTestFirstRunMigration'), true);
  await waitFor(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.privacyHidden === false,
    'second first-run dialog',
  );
  assert.equal(await this.call('openFirstRunImportStep'), true);
  const dom = await this.call('readFirstRunMigrationDom');
  assert.equal(dom.bringTabsLabel, 'Bring tabs without importing everything…');
  assert.equal(await this.call('clickFirstRunBringTabs'), true);
});

Then('the same Bring Your Tabs sheet opens', async function () {
  const surface = await waitForTabImportSheet(this);
  assert.equal(surface.url, this.firstTabImportSurface.url);
});

Given('a tab-migration session has candidates or embeddings in memory', async function () {
  const prepared = await this.call(
    'applyTabImportFixture',
    'folder-fallback',
    { stage: 'preview' },
  );
  assert.equal(prepared.projection.candidates.length, 5);
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

Then('the session and embeddings are destroyed', async function () {
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
