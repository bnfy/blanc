'use strict';

const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

// Settings → Sync device pairing (design 2026-10-16 §4.2): the off-state code
// path up to the network call. Joining itself is proven by the unit flows,
// since the desktop harness runs against no Worker.

const dom = (ctx) => waitForValue(() => ctx.call('settingsSyncPairingDom'), (value) => !!value, 'the Sync card');

Then('the Sync card offers Add this device to my sync before Start syncing from this device', async function () {
  const card = await dom(this);
  assert.equal(card.pathOrder[0], 'syncPathCode');
  assert.ok(card.pathOrder.indexOf('syncPathCode') < card.pathOrder.indexOf('syncPathStart'));
});

When('I choose Add this device to my sync', async function () {
  assert.equal(await this.call('settingsSyncPairingAct', 'choose-code'), true);
});

Then('the code field replaces the name and passphrase fields', async function () {
  await waitForValue(
    () => this.call('settingsSyncPairingDom'),
    (card) => card?.codeFormVisible === true && card.nameFormVisible === false && card.pathsVisible === false,
    'the code form',
  );
});

When('I type {string} into the code field', async function (text) {
  assert.equal(await this.call('settingsSyncPairingAct', 'type-code', text), true);
});

Then('Connect is disabled', async function () {
  await waitForValue(() => this.call('settingsSyncPairingDom'), (card) => card?.connectDisabled === true, 'Connect disabled');
});

Then('Connect is enabled', async function () {
  await waitForValue(() => this.call('settingsSyncPairingDom'), (card) => card?.connectDisabled === false, 'Connect enabled');
});

When('I choose Use my sync name and passphrase instead', async function () {
  assert.equal(await this.call('settingsSyncPairingAct', 'use-passphrase'), true);
});

Then('the name and passphrase fields replace the code field', async function () {
  await waitForValue(
    () => this.call('settingsSyncPairingDom'),
    (card) => card?.nameFormVisible === true && card.codeFormVisible === false,
    'the name and passphrase form',
  );
});

// Sync without a passphrase and the joined sheet (design 2026-10-28). These
// run against a local copy of the Worker (test/desktop/support/sync-fixture),
// so Turn on Sync creates a real account there and never touches blanc.day.
const { Before, After, Given } = require('@cucumber/cucumber');
const { createSyncFixture } = require('../support/sync-fixture');
const ctx = require('../support/context');

Before({ tags: '@sync-server', timeout: 180000 }, async function () {
  this.syncServer = await createSyncFixture();
  await ctx.relaunch({ BLANC_TEST_SYNC_ENDPOINT: this.syncServer.url }, { freshProfile: true });
  await this.call('reset');
});

After({ tags: '@sync-server', timeout: 180000 }, async function () {
  try { await this.call('sharedSpacesTest', 'disable'); }
  finally {
    try { await ctx.relaunch(); } finally { await this.syncServer?.close(); }
  }
});

const card = (world, predicate, label) => waitForValue(() => world.call('settingsSyncPairingDom'), (value) => !!value && predicate(value), label);

Then('the Sync card leads with Turn on Sync and keeps the passphrase paths under Other ways', async function () {
  const dom = await card(this, (value) => value.turnOnVisible, 'Turn on Sync');
  assert.equal(dom.firstPath, 'syncTurnOn');
  assert.deepEqual(dom.otherWays, ['syncPathJoin', 'syncPathStart']);
});

When('I choose Turn on Sync', async function () {
  assert.equal(await this.call('settingsSyncPairingAct', 'turn-on'), true);
});

Then('Sync is on under the name {string}', { timeout: 60000 }, async function (name) {
  await card(this, (value) => value.syncOn && value.handle === name, `Sync on as ${name}`);
});

Then('the recovery-code prompt is shown', async function () {
  await card(this, (value) => value.recoveryPromptVisible, 'the recovery-code prompt');
});

When('I choose Add device', async function () {
  assert.equal(await this.call('settingsSyncPairingAct', 'add-device'), true);
});

Then('the sheet shows a pairing code', { timeout: 30000 }, async function () {
  const dom = await card(this, (value) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.sheetCode), 'a pairing code in the sheet');
  assert.equal(dom.sheetOpen, true);
});

When('a new device named {string} joins the sync', async function (name) {
  assert.equal(name, 'zzz-peer', 'the test hook adds the pseudo-peer zzz-peer');
  assert.equal(await this.call('sharedSpacesTest', 'pairingPeer'), true);
});

Then('the sheet says {string}', { timeout: 30000 }, async function (text) {
  await card(this, (value) => value.joinedTitle === text, text);
});

Then('the sheet asks to keep Spaces and groups in sync', { timeout: 30000 }, async function () {
  await card(this, (value) => value.askingSpaces, 'the Spaces question');
});

When('I choose Not now in the sheet', async function () {
  assert.equal(await this.call('settingsSyncPairingAct', 'spaces-not-now'), true);
});

Then('the sheet no longer asks and offers Done', async function () {
  await card(this, (value) => !value.askingSpaces && value.doneVisible, 'Done without the question');
});

Then('the window asks to be left out of screen capture', async function () {
  await waitForValue(() => this.call('windowsContentProtected'), (count) => count === 1, 'one protected window');
});

Then('no window asks to be left out of screen capture', async function () {
  await waitForValue(() => this.call('windowsContentProtected'), (count) => count === 0, 'no protected window');
});
