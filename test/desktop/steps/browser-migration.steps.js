'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Given, When, Then, After } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');
const ctx = require('../support/context');
const { browserDataRoot } = require('../../../src/main/browser-data-import');

async function openMigration(world) {
  await world.call('openFavoritesSheet');
  // Discovery is explicit: nothing is offered until the real button is clicked.
  await waitForValue(
    () => world.call('readBrowserImportDom'),
    (dom) => dom?.findHidden === false && dom.buttonHidden === true,
    'Favorites sheet to offer a browser lookup'
  );
  assert.equal(await world.call('clickBrowserFind'), true);
  return waitForValue(
    () => world.call('readBrowserImportDom'),
    (dom) =>
      dom?.options?.some((option) => option.label === 'Google Chrome — Acceptance profile') &&
      dom.buttonHidden === false,
    'detected browser profile to render on Favorites'
  );
}

async function importProfile(world, expectedCount, statusPattern = /Imported 3 favorites/) {
  assert.equal(await world.call('clickBrowserImport'), true);
  await waitForValue(
    async () => ({
      dom: await world.call('readBrowserImportDom'),
      records: await world.call('bookmarkRecords'),
    }),
    (value) =>
      value.records.length === expectedCount &&
      statusPattern.test(value.dom?.status ?? ''),
    'browser Favorites import to settle'
  );
}

Given('a detected browser profile is offered on the Favorites page', async function () {
  const dom = await openMigration(this);
  const source = dom.options.find((option) => option.label === 'Google Chrome — Acceptance profile');
  assert.ok(source, 'the existing F30 acceptance profile should remain discoverable');
  assert.match(source.value, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(JSON.stringify(dom).includes('blanc-browser-home-'), false);
});

When(/^I import Favorites from that browser profile(?: again)?$/, async function () {
  const before = (await this.call('bookmarkRecords')).length;
  await importProfile(
    this,
    before || 3,
    before ? /already saved/ : /Imported 3 favorites/
  );
});

Then('its supported web Favorites are copied into Blanc', async function () {
  const records = await this.call('bookmarkRecords');
  assert.deepEqual(records.map((record) => record.url).sort(), [
    'https://migration-one.example/',
    'https://migration-three.example/',
    'https://migration-two.example/',
  ]);
  assert.equal(records.some((record) => record.url.startsWith('chrome:')), false);
});

Then('their immediate folders are preserved', async function () {
  const records = new Map(
    (await this.call('bookmarkRecords')).map((record) => [record.url, record])
  );
  assert.equal(records.get('https://migration-one.example/').folder, 'Bookmarks bar');
  assert.equal(records.get('https://migration-two.example/').folder, 'Reading');
  assert.equal(records.get('https://migration-three.example/').folder, 'Other bookmarks');
});

Given('I already imported Favorites from a detected browser profile', async function () {
  await openMigration(this);
  await importProfile(this, 3);
  this.browserMigrationCount = (await this.call('bookmarkRecords')).length;
});

Then('no duplicate Favorites are created', async function () {
  assert.equal((await this.call('bookmarkRecords')).length, this.browserMigrationCount);
});

Then('the migration result reports that every Favorite was already saved', async function () {
  const dom = await this.call('readBrowserImportDom');
  assert.match(dom.status, /All 3 favorites were already saved\./);
});

Given('a fresh first run is awaiting setup', async function () {
  await this.call('newTab');
  await this.waitForState((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return active?.loadedUrl?.startsWith('blanc://newtab');
  });
  await waitForValue(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.initialReady === true,
    'new-tab initial start data to settle'
  );
  assert.equal(await this.call('showTestFirstRunMigration'), true);
});

Then('browser Favorites migration is offered before browsing', async function () {
  // The onboarding dialog is up; its import step carries the offer. Nothing
  // is listed besides the always-available bookmarks-file row — discovery
  // has not run yet (F30/D22: it never runs until asked).
  await waitForValue(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.privacyHidden === false,
    'first-run onboarding dialog to render'
  );
  assert.equal(await this.call('openFirstRunImportStep'), true);
  await waitForValue(
    () => this.call('readFirstRunMigrationDom'),
    (value) =>
      value?.migrationHidden === false &&
      value.findHidden === false &&
      value.options.length === 1, // only the always-available file row
    'first-run import step to render undiscovered'
  );
  assert.equal(await this.call('clickFirstRunMigrationFind'), true);
  const dom = await waitForValue(
    () => this.call('readFirstRunMigrationDom'),
    (value) => value?.options?.length === 3 && value.findHidden === true,
    'first-run browser migration sources to render'
  );
  assert.deepEqual(dom.options, [
    'Google Chrome — Acceptance profile',
    'Google Chrome — Tab migration fixture',
    'From a bookmarks file (HTML)…',
  ]);
});

When('I import Favorites from first-run setup', async function () {
  assert.equal(await this.call('clickFirstRunMigration'), true);
  await waitForValue(
    async () => ({
      dom: await this.call('readFirstRunMigrationDom'),
      records: await this.call('bookmarkRecords'),
    }),
    (value) =>
      value.records.length === 3 &&
      /Imported 3 favorites from Google Chrome/.test(value.dom?.status ?? ''),
    'first-run browser Favorites import to settle'
  );
});

// F30-4/F30-5: a Chrome profile signed in to a Google Account. Recent Chrome
// keeps the account's bookmarks in AccountBookmarks, beside the local
// Bookmarks file or with no Bookmarks file at all. Each scenario creates its
// own profile directory and removes it afterwards, so no other scenario's
// discovery ever sees it. Without a Local State entry the profile is labelled
// by its directory name.
const SIGNED_IN_PROFILE = 'Profile 7';
const SIGNED_IN_LABEL = `Google Chrome — ${SIGNED_IN_PROFILE}`;

// The JSON Chrome's bookmark codec writes, for Bookmarks and AccountBookmarks
// alike: numbered roots with GUIDs and dates, a checksum, a version, and
// sync_metadata in the account file. Blanc reads only the roots and must
// tolerate the rest. Chrome writes it with three-space indentation.
function chromeBookmarksFile({ account }, build) {
  const stamp = '13403000000000000';
  let nextId = 3; // Chrome numbers its three roots 1–3.
  const node = (fields) => ({
    date_added: stamp,
    date_last_used: '0',
    guid: crypto.randomUUID(),
    id: String(++nextId),
    ...fields,
  });
  const link = (name, url) => node({ name, type: 'url', url });
  const folder = (name, children) => node({ children, date_modified: stamp, name, type: 'folder' });
  const { bar = [], other = [], synced = [] } = build({ link, folder });
  const root = (id, name, children) => ({
    children,
    date_added: stamp,
    date_last_used: '0',
    date_modified: stamp,
    guid: crypto.randomUUID(),
    id: String(id),
    name,
    type: 'folder',
  });
  const roots = {
    bookmark_bar: root(1, 'Bookmarks bar', bar),
    other: root(2, 'Other bookmarks', other),
    synced: root(3, 'Mobile bookmarks', synced),
  };
  return JSON.stringify({
    checksum: crypto.createHash('md5').update(JSON.stringify(roots)).digest('hex'),
    roots,
    ...(account ? { sync_metadata: Buffer.from('account-sync-fixture').toString('base64') } : {}),
    version: 1,
  }, null, 3);
}

function writeSignedInProfile(world, files) {
  const chromeRoot = browserDataRoot('chrome', {
    platform: process.platform,
    homeDir: ctx.browserHomeDir,
    env: { ...process.env, LOCALAPPDATA: ctx.browserHomeDir },
  });
  const profileDir = path.join(chromeRoot, SIGNED_IN_PROFILE);
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });
  world.signedInProfileDir = profileDir;
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(profileDir, name), contents);
  }
}

After({ tags: '@F30-4 or @F30-5' }, function () {
  if (this.signedInProfileDir) fs.rmSync(this.signedInProfileDir, { recursive: true, force: true });
});

Given('a signed-in Chrome profile keeps its bookmarks only in AccountBookmarks', function () {
  writeSignedInProfile(this, {
    AccountBookmarks: chromeBookmarksFile({ account: true }, ({ link, folder }) => ({
      bar: [
        link('Account one', 'https://account-one.example/'),
        folder('Recipes', [
          link('Account two', 'https://account-two.example/'),
          link('Chrome flags', 'chrome://flags/'),
        ]),
      ],
      synced: [link('Phone article', 'https://account-mobile.example/')],
    })),
  });
});

Given('a signed-in Chrome profile keeps bookmarks in both Bookmarks and AccountBookmarks', function () {
  writeSignedInProfile(this, {
    Bookmarks: chromeBookmarksFile({ account: false }, ({ link }) => ({
      bar: [
        link('Local only', 'https://local-only.example/'),
        link('Kept in both', 'https://shared.example/'),
      ],
    })),
    AccountBookmarks: chromeBookmarksFile({ account: true }, ({ link }) => ({
      bar: [link('Kept in both', 'https://shared.example/')],
      other: [link('Account only', 'https://account-only.example/')],
    })),
  });
});

When('I look for other browsers and import Favorites from that profile', async function () {
  await this.call('openFavoritesSheet');
  await waitForValue(
    () => this.call('readBrowserImportDom'),
    (dom) => dom?.findHidden === false && dom.buttonHidden === true,
    'Favorites sheet to offer a browser lookup'
  );
  assert.equal(await this.call('clickBrowserFind'), true);
  await waitForValue(
    () => this.call('readBrowserImportDom'),
    (dom) => dom?.options?.some((option) => option.label === SIGNED_IN_LABEL) && dom.buttonHidden === false,
    'the signed-in Chrome profile to be offered'
  );
  assert.equal(await this.call('selectBrowserSource', SIGNED_IN_LABEL), true);
  assert.equal(await this.call('clickBrowserImport'), true);
  const settled = await waitForValue(
    () => this.call('readBrowserImportDom'),
    (dom) => (dom?.status ?? '').startsWith(`${SIGNED_IN_LABEL}: `),
    'the signed-in profile import to settle'
  );
  this.signedInImportStatus = settled.status;
});

Then("the account's web Favorites are copied into Blanc", async function () {
  assert.equal(this.signedInImportStatus, `${SIGNED_IN_LABEL}: Imported 3 favorites.`);
  const records = await this.call('bookmarkRecords');
  assert.deepEqual(records.map((record) => record.url).sort(), [
    'https://account-mobile.example/',
    'https://account-one.example/',
    'https://account-two.example/',
  ]);
});

Then("the account's folders are kept", async function () {
  const folders = new Map(
    (await this.call('bookmarkRecords')).map((record) => [record.url, record.folder])
  );
  assert.equal(folders.get('https://account-one.example/'), 'Bookmarks bar');
  assert.equal(folders.get('https://account-two.example/'), 'Recipes');
  assert.equal(folders.get('https://account-mobile.example/'), 'Mobile bookmarks');
});

Then('the Favorites from both files are copied into Blanc once each', async function () {
  const records = await this.call('bookmarkRecords');
  assert.deepEqual(records.map((record) => record.url).sort(), [
    'https://account-only.example/',
    'https://local-only.example/',
    'https://shared.example/',
  ]);
});

Then('the migration result reports no Favorite as already saved', function () {
  assert.equal(this.signedInImportStatus, `${SIGNED_IN_LABEL}: Imported 3 favorites.`);
});
