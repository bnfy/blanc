'use strict';

// F45 Arc Spaces import, driven through the real Bring Your Tabs sheet. Test
// runs point Arc discovery at the synthetic browser home with the macOS
// layout (or a chosen platform), so Linux CI exercises every path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Before, After, Given, When, Then } = require('@cucumber/cucumber');
const ctx = require('../support/context');

const tags = '@F45';

function arcFile() {
  return path.join(ctx.browserHomeDir, 'Library', 'Application Support', 'Arc', 'StorableSidebar.json');
}

const flat = (records) => records.flatMap((record) => [record.id, record]);
const tab = (id, parentID, url, title = null) => ({
  id, parentID, childrenIds: [], title, data: { tab: { savedURL: url, savedTitle: `Saved ${id}` } },
});
const folder = (id, parentID, title, childrenIds) => ({ id, parentID, childrenIds, title, data: { list: {} } });
const box = (id, childrenIds, containerType = { spaceItems: { _0: 'space' } }) => ({
  id, parentID: null, childrenIds, title: null, data: { itemContainer: { containerType } },
});
const space = (id, title, pinnedId, todayId, extra = {}) => ({
  id, title, newContainerIDs: [{ pinned: {} }, pinnedId, { unpinned: { _0: { shared: {} } } }, todayId], ...extra,
});

/** Two Spaces: "Work" (a loose pinned tab, a folder, a Today tab) and "Reading". */
function writeSidebar(world, { separateProfile = false, favorites = [] } = {}) {
  const url = (name) => world.fixtureUrl(`arc-${name}`);
  const sidebar = {
    sidebar: {
      containers: [{ global: {} }, {
        spaces: flat([
          space('arc-space-work', 'Work', 'pw', 'tw', separateProfile
            ? { profile: { custom: { _0: { directoryBasename: 'Profile 7' } } } } : {}),
          space('arc-space-reading', 'Reading', 'pr', 'tr'),
        ]),
        items: flat([
          box('pw', ['mail', 'eng']),
          tab('mail', 'pw', url('mail'), 'Inbox'),
          folder('eng', 'pw', 'Engineering', ['ci', 'docs']),
          tab('ci', 'eng', url('ci')),
          tab('docs', 'eng', url('docs')),
          box('tw', ['news']),
          tab('news', 'tw', url('news')),
          box('pr', ['longreads']),
          folder('longreads', 'pr', 'Long reads', ['essay']),
          tab('essay', 'longreads', url('essay')),
          box('tr', ['paper']),
          tab('paper', 'tr', url('paper')),
          box('fav', favorites.map((_, i) => `f${i}`), { topApps: { _0: { default: {} } } }),
          ...favorites.map((favUrl, i) => tab(`f${i}`, 'fav', favUrl, `Favorite ${i}`)),
        ]),
      }],
    },
  };
  fs.mkdirSync(path.dirname(arcFile()), { recursive: true });
  fs.writeFileSync(arcFile(), JSON.stringify(sidebar));
  world.arcUrls = { mail: url('mail'), ci: url('ci'), docs: url('docs'), news: url('news'), essay: url('essay'), paper: url('paper') };
}

async function waitFor(read, predicate, label, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    last = await read();
    if (predicate(last)) return last;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}; last: ${JSON.stringify(last)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function openSheet(world) {
  await world.call('openTabImport');
  await waitFor(() => world.call('utilitySurface'),
    (s) => s?.visible === true && s.ready === true && s.url === 'blanc://tab-import/', 'Bring Your Tabs sheet');
}

/** Read the Arc row and preview from the sheet's DOM. */
function sheetDom(world) {
  return world.call('arcImportPage', `() => ({
    entryHidden: document.getElementById('arcImportEntry').hidden,
    entryText: document.getElementById('arcImportEntry').textContent,
    entryButtons: [...document.querySelectorAll('#arcImportEntry button')].map((b) => b.textContent),
    previewHidden: document.querySelector('[data-arc-panel="preview"]').hidden,
    previewText: document.querySelector('[data-arc-panel="preview"]').textContent,
    resultHidden: document.querySelector('[data-arc-panel="result"]').hidden,
    resultText: document.querySelector('[data-arc-panel="result"]').textContent,
    buttons: [...document.querySelectorAll('[data-arc-panel] button')].map((b) => ({ text: b.textContent, disabled: b.disabled })),
    status: document.getElementById('tabImportStatus').textContent,
  })`);
}

async function clickSheetButton(world, text) {
  const clicked = await world.call('arcImportPage', `() => {
    const button = [...document.querySelectorAll('#arcImportEntry button, [data-arc-panel] button')]
      .find((b) => b.textContent === ${JSON.stringify(text)} && !b.disabled);
    if (!button) return false;
    button.click();
    return true;
  }`);
  assert.equal(clicked, true, `button "${text}" is available`);
}

async function bringAll(world) {
  await openSheet(world);
  await waitFor(() => sheetDom(world), (d) => !d.entryHidden, 'Arc row');
  await clickSheetButton(world, 'Bring Spaces from Arc');
  const dom = await waitFor(() => sheetDom(world), (d) => !d.previewHidden, 'Arc preview');
  const apply = dom.buttons.find((b) => /^Create \d/.test(b.text));
  assert.ok(apply, `an apply button in ${JSON.stringify(dom.buttons)}`);
  await clickSheetButton(world, apply.text);
}

async function setRoom(world, free) {
  for (let i = 0; i < 25 - free; i += 1) {
    assert.equal((await world.call('workspaceAction', 'save', `Existing ${i + 1}`)).ok, true);
  }
}

Before({ tags }, async function () {
  assert.ok(ctx.browserHomeDir, 'synthetic browser home');
  fs.rmSync(path.dirname(arcFile()), { recursive: true, force: true });
  await this.call('arcImport', 'platform', 'darwin');
  await this.call('arcImport', 'choose-file', null);
});

After({ tags }, async function () {
  fs.rmSync(path.dirname(arcFile()), { recursive: true, force: true });
  if (this.arcChosenDir) fs.rmSync(this.arcChosenDir, { recursive: true, force: true });
  await this.call('arcImport', 'platform', 'darwin');
  await this.call('arcImport', 'choose-file', null);
});

Given("Arc's sidebar file exists on this device", function () {
  writeSidebar(this);
});

When('I open Bring Your Tabs', async function () {
  this.arcReadsBefore = await this.call('arcImport', 'reads');
  await openSheet(this);
  this.arcDom = await waitFor(() => sheetDom(this), (d) => !d.entryHidden, 'Arc row');
});

Then('Blanc offers to bring Spaces from Arc', function () {
  assert.deepEqual(this.arcDom.entryButtons, ['Bring Spaces from Arc', 'Choose file…']);
  assert.match(this.arcDom.entryText, /Bring your Spaces, pinned tabs and folders from Arc\./);
});

Then("Arc's sidebar file has not been read", async function () {
  assert.equal(await this.call('arcImport', 'reads'), this.arcReadsBefore);
});

Given('there is room for three more spaces', async function () {
  await setRoom(this, 3);
});

Given('there is room for one more space', async function () {
  await setRoom(this, 1);
});

Given('Blanc Patron is not active', async function () {
  await this.call('clearSupporter');
});

Given('an Arc sidebar with Spaces named {string} and {string}', function (first, second) {
  assert.deepEqual([first, second], ['Work', 'Reading']);
  writeSidebar(this);
});

When('I bring both Spaces from Arc', async function () {
  this.arcBefore = {
    records: await this.call('arcImport', 'records'),
    windows: await this.call('windowRuntimes'),
    state: await this.call('state'),
  };
  await bringAll(this);
  this.arcDom = await waitFor(() => sheetDom(this),
    (d) => !d.resultHidden || /fits|space/.test(d.previewText) && d.previewText.includes('Only'), 'Arc result');
});

Then('Blanc creates spaces named {string} and {string} in one write', async function (first, second) {
  assert.equal(this.arcDom.resultHidden, false);
  assert.match(this.arcDom.resultText, new RegExp(`Created 2 spaces: ${first} and ${second}\\.`));
  const records = await this.call('arcImport', 'records');
  const created = records.filter((r) => [first, second].includes(r.name));
  assert.deepEqual(created.map((r) => r.name), [first, second]);
  this.arcRecords = created;
});

Then('their loose pinned tabs are pinned and their folders are groups', function () {
  const [work, reading] = this.arcRecords;
  const u = this.arcUrls;
  assert.deepEqual(work.urls, [u.mail, u.ci, u.docs, u.news]);
  assert.deepEqual(work.pinned, [true, false, false, false]);
  assert.deepEqual(work.groups.map((g) => g.name), ['engineering']);
  const engineering = work.groups[0].id;
  assert.deepEqual(work.groupIds, [null, engineering, engineering, null]);
  assert.equal(work.meta[0].title, 'Inbox');
  assert.deepEqual(reading.urls, [u.essay, u.paper]);
  assert.deepEqual(reading.groups.map((g) => g.name), ['long reads']);
});

Then('no window is switched to either space', async function () {
  const windows = await this.call('windowRuntimes');
  assert.equal(windows.filter((w) => w.attached).length, this.arcBefore.windows.filter((w) => w.attached).length);
  const urls = new Set(Object.values(this.arcUrls));
  const state = await this.call('state');
  assert.equal(state.tabs.filter((t) => urls.has(t.url)).length, 0, 'no Arc tab is open in any window');
});

Then('Blanc explains that only one more space fits', function () {
  assert.equal(this.arcDom.previewHidden, false);
  assert.match(this.arcDom.previewText, /Only 1 more space fits\./);
});

Then('no space is created', async function () {
  assert.deepEqual(await this.call('arcImport', 'records'), this.arcBefore.records);
});

Given('an Arc sidebar with two top-row Favorites, one already in Blanc', async function () {
  this.arcFavoriteUrls = [this.fixtureUrl('arc-calendar'), this.fixtureUrl('arc-existing')];
  writeSidebar(this, { favorites: this.arcFavoriteUrls });
  await this.call('seedFavorite', this.arcFavoriteUrls[1], 'Existing favorite');
});

When('I bring the Favorites from Arc', async function () {
  await openSheet(this);
  await waitFor(() => sheetDom(this), (d) => !d.entryHidden, 'Arc row');
  await clickSheetButton(this, 'Bring Spaces from Arc');
  await waitFor(() => sheetDom(this), (d) => !d.previewHidden, 'Arc preview');
  // Keep only the Favorites: clear both Space checkboxes.
  await this.call('arcImportPage', `() => {
    const boxes = [...document.querySelectorAll('[data-arc-panel="preview"] input[type=checkbox]')];
    for (const box of boxes.slice(0, 2)) { box.checked = false; box.dispatchEvent(new Event('change')); }
    return boxes.length;
  }`);
  await clickSheetButton(this, 'Add Favorites');
  this.arcDom = await waitFor(() => sheetDom(this), (d) => !d.resultHidden, 'Arc result');
});

Then('one Favorite is added to a folder named {string}', async function (name) {
  assert.match(this.arcDom.resultText, /Added 1 Favorite to the Arc folder\./);
  const records = await this.call('bookmarkRecords');
  const added = records.find((r) => r.url === this.arcFavoriteUrls[0]);
  assert.deepEqual(added && { title: added.title, folder: added.folder }, { title: 'Favorite 0', folder: name });
});

Then('the existing Favorite is unchanged', async function () {
  const records = await this.call('bookmarkRecords');
  const existing = records.filter((r) => r.url === this.arcFavoriteUrls[1]);
  assert.equal(existing.length, 1);
  assert.equal(existing[0].title, 'Existing favorite');
  assert.notEqual(existing[0].folder, 'Arc');
});

Given('an Arc sidebar with Spaces that use a separate Arc profile', function () {
  writeSidebar(this, { separateProfile: true });
});

When('Blanc shows the Arc preview', async function () {
  await openSheet(this);
  await waitFor(() => sheetDom(this), (d) => !d.entryHidden, 'Arc row');
  // Exactly what the page's own bridge returns, as the page receives it.
  this.arcProjection = await this.call('arcImportPage', '() => window.bowserPages.tabImport.arcRead(\'arc\')');
});

Then('the page receives Space names, counts and opaque ids only', function () {
  const p = this.arcProjection;
  assert.deepEqual(p.spaces.map((s) => [s.id, s.name, s.tabCount, s.folderCount, s.separateProfile]), [
    ['space-1', 'Work', 4, 1, true],
    ['space-2', 'Reading', 2, 1, false],
  ]);
});

Then('no URL, file path, Arc id or Arc profile name reaches the page', function () {
  const text = JSON.stringify(this.arcProjection);
  for (const secret of ['http', ctx.browserHomeDir, 'StorableSidebar', 'arc-space-', 'Profile 7', 'Inbox']) {
    assert.equal(text.includes(secret), false, `projection leaks ${secret}`);
  }
});

Given('Blanc is running on Linux', async function () {
  await this.call('arcImport', 'platform', 'linux');
  // A sidebar copied from another computer, chosen through the stand-in for
  // the native file dialog.
  this.arcChosenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-arc-chosen-'));
  writeSidebar(this);
  const chosen = path.join(this.arcChosenDir, 'StorableSidebar.json');
  fs.renameSync(arcFile(), chosen);
  await this.call('arcImport', 'choose-file', chosen);
});

Then('Blanc explains that Arc never came to Linux', function () {
  assert.match(this.arcDom.entryText, /Arc never came to Linux\./);
  assert.deepEqual(this.arcDom.entryButtons, ['Choose file…']);
});

Then('offers to choose a copied StorableSidebar.json file', async function () {
  await clickSheetButton(this, 'Choose file…');
  const dom = await waitFor(() => sheetDom(this), (d) => !d.previewHidden, 'Arc preview from a chosen file');
  assert.match(dom.previewText, /Work/);
  assert.match(dom.previewText, /Reading/);
});

Given('I am previewing the Spaces from Arc', async function () {
  await openSheet(this);
  await waitFor(() => sheetDom(this), (d) => !d.entryHidden, 'Arc row');
  await clickSheetButton(this, 'Bring Spaces from Arc');
  await waitFor(() => sheetDom(this), (d) => !d.previewHidden, 'Arc preview');
  assert.equal(await this.call('arcImport', 'has-session'), true);
});

When('I close Bring Your Tabs', async function () {
  // The sheet's own ✕, the way a person closes it.
  const clicked = await this.call('arcImportPage', `() => {
    const close = document.querySelector('.sheet-close');
    if (!close) return false;
    close.click();
    return true;
  }`);
  assert.equal(clicked, true);
  await waitFor(() => this.call('utilitySurface'), (s) => !s?.visible, 'the sheet to close');
});

Then("Blanc no longer holds Arc's Spaces", async function () {
  assert.equal(await this.call('arcImport', 'has-session'), false);
});

