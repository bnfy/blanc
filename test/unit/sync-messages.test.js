'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { syncErrorText } = require('../../src/main/sync-messages');
const { englishT: t } = require('../support/english-t');

test('sync error codes read as the English Settings showed before codes', () => {
  const cases = {
    'service-unavailable': 'Sync is available only in official Blanc builds.',
    'name-too-short': 'Choose a sync name (at least 2 characters).',
    'weak-passphrase': 'Use a longer passphrase — 16+ characters, or 10+ with mixed characters.',
    'key-protect-failed': 'Could not protect the sync key.',
    'credentials-save-failed': 'Could not save protected sync credentials.',
    'bad-passphrase': 'Passphrase doesn’t match this sync account.',
    'rate-limited': 'Too many sync attempts — try again in a minute.',
    conflict: 'Sync kept getting interrupted — try again in a moment.',
    server: 'Sync sent an unexpected response — try again later.',
    'server-error': 'Sync server error — try again later.',
    offline: 'Couldn’t reach sync — check your connection.',
    'sync-off': 'Sync is off.',
    'local-key-protect': 'Could not protect the local sync key',
    'local-key-unlock': 'Could not unlock the local sync key',
    'wipe-offline': 'Couldn’t reach sync to erase the server copy — check your connection and try again.',
    'rejected:404': 'Sync rejected the request (HTTP 404).',
    'wipe-failed:503': 'Sync couldn’t erase the server copy (HTTP 503) — try again later.',
    'key:decryption-failed': 'OS credential decryption failed',
    'key:persist-failed': 'Could not persist protected sync key',
    'key-store:store-unavailable': 'A secure OS credential store is unavailable. Configure the OS keychain/credential store and try again.',
  };
  for (const [code, text] of Object.entries(cases)) assert.equal(syncErrorText(code, t), text, code);
});

test('every key-storage code has interface text', () => {
  for (const code of ['encryption-unavailable', 'store-unavailable', 'invalid-key', 'encryption-failed', 'missing', 'decryption-failed', 'persist-failed']) {
    assert.notEqual(syncErrorText(`key:${code}`, t), `key:${code}`, code);
  }
});

test('no error stays null, and a sentence saved before codes passes through', () => {
  assert.equal(syncErrorText(null, t), null);
  assert.equal(syncErrorText(undefined, t), null);
  assert.equal(syncErrorText('Tabs were not refreshed on the previous pass.', t), 'Tabs were not refreshed on the previous pass.');
  assert.equal(syncErrorText('rejected:abc', t), 'rejected:abc');
});
