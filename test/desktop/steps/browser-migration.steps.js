'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

async function openMigration(world) {
  await world.call('openFavoritesSheet');
  return waitForValue(
    () => world.call('readBrowserImportDom'),
    (dom) => dom?.options?.length === 1 && dom.buttonHidden === false,
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
  assert.equal(dom.options[0].label, 'Google Chrome — Acceptance profile');
  assert.match(dom.options[0].value, /^[A-Za-z0-9_-]{24}$/);
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
  const dom = await waitForValue(
    () => this.call('readFirstRunMigrationDom'),
    (value) =>
      value?.privacyHidden === false &&
      value.migrationHidden === false &&
      value.options.length === 1,
    'first-run browser migration to render'
  );
  assert.deepEqual(dom.options, ['Google Chrome — Acceptance profile']);
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
