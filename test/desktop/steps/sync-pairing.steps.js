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
  assert.deepEqual(card.pathOrder, ['syncPathCode', 'syncPathStart']);
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
