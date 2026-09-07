'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const loginFixture = require('../fixtures/onepassword-login-item.redacted.json');
const {
  dispatch,
  fixedErrorCode,
  findLoginsWith,
  verifyAccountWith,
  handleMessage,
  isStaleClientError,
  readBuiltIn,
} = require('../../src/main/onepassword-broker');

test('requiring the broker does not eagerly load the 1Password SDK', () => {
  const sdkPath = require.resolve('@1password/sdk');
  assert.equal(require.cache[sdkPath], undefined);
  assert.ok(require.cache[path.resolve(__dirname, '../../src/main/onepassword-broker.js')]);
});

test('verify-account performs exactly one authenticated vault list and leaks no metadata', async () => {
  let lists = 0;
  const client = {
    vaults: { list: async () => { lists += 1; return [{ id: 'v', title: 'Personal' }]; } },
  };
  const result = await verifyAccountWith(client);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(Object.keys(result), ['ok'], 'no vault metadata may leave the broker');
  assert.equal(lists, 1);
});

test('verify-account propagates auth failures with the same fixed codes as find-logins', async () => {
  const denied = Object.assign(new Error('authorization denied'), { name: 'AuthError' });
  const client = { vaults: { list: async () => { throw denied; } } };
  await assert.rejects(() => verifyAccountWith(client), denied);
  assert.equal(fixedErrorCode(denied), 'not-authorized');
});

test('verify-account speaks the {id, ok, value|error} protocol and fails closed on bad input', async () => {
  const replies = [];
  await handleMessage({ id: 7, method: 'verify-account', payload: { account: '   ' } },
    (reply) => replies.push(reply));
  assert.deepEqual(replies, [{ id: 7, ok: false, error: 'invalid-request' }]);
  // A message without a positive safe-integer id is dropped entirely.
  await handleMessage({ method: 'verify-account', payload: { account: 'a' } },
    (reply) => replies.push(reply));
  assert.equal(replies.length, 1);
});

test('broker lists overviews and returns only matching Login metadata', async () => {
  const client = {
    vaults: { list: async () => [{ id: 'vault', title: 'Personal' }] },
    items: { list: async () => [
      { id: 'match', title: 'Example', category: 'Login', updatedAt: new Date(),
        websites: [{ url: 'example.com', autofillBehavior: 'AnywhereOnWebsite' }] },
      { id: 'other', title: 'Other', category: 'Login', updatedAt: new Date(),
        websites: [{ url: 'other.test', autofillBehavior: 'AnywhereOnWebsite' }] },
      { id: 'archived', title: 'Archived', category: 'Login', state: 'archived',
        websites: [{ url: 'example.com', autofillBehavior: 'AnywhereOnWebsite' }] },
      { id: 'note', title: 'Note', category: 'SecureNote', websites: [] },
    ] },
  };
  const result = await findLoginsWith(client, 'https://login.example.com/');
  assert.deepEqual(result.candidates.map((item) => item.itemId), ['match']);
  assert.equal(result.candidates[0].vaultName, 'Personal');
});

test('multiple matches project only bounded built-in usernames for the native picker', async () => {
  const opened = [];
  const client = {
    vaults: { list: async () => [{ id: 'vault', title: 'Personal' }] },
    items: {
      list: async () => [
        { id: 'alice', title: 'google.com', category: 'Login',
          updatedAt: new Date('2026-08-27T12:00:00Z'),
          websites: [{ url: 'google.com', autofillBehavior: 'AnywhereOnWebsite' }] },
        { id: 'bob', title: 'google.com', category: 'Login',
          updatedAt: new Date('2026-08-27T11:00:00Z'),
          websites: [{ url: 'google.com', autofillBehavior: 'AnywhereOnWebsite' }] },
      ],
      get: async (_vaultId, itemId) => {
        opened.push(itemId);
        return { version: itemId === 'alice' ? 4 : 7, fields: [
          { id: 'username', value: `${itemId}@gmail.com` },
          { id: 'password', value: `secret-${itemId}` },
          { id: 'custom-note', value: `note-${itemId}` },
        ] };
      },
    },
  };
  const result = await findLoginsWith(client, 'https://accounts.google.com/');
  assert.deepEqual(opened, ['alice', 'bob']);
  assert.deepEqual(result.candidates.map((item) => item.username),
    ['alice@gmail.com', 'bob@gmail.com']);
  assert.deepEqual(result.candidates.map((item) => item.itemVersion), [4, 7]);
  assert.doesNotMatch(JSON.stringify(result), /secret-|note-/);
});

test('candidate projection propagates authorization failures', async () => {
  const client = {
    vaults: { list: async () => [{ id: 'vault', title: 'Personal' }] },
    items: {
      list: async () => ['one', 'two'].map((id) => ({
        id, title: 'google.com', category: 'Login', updatedAt: new Date(),
        websites: [{ url: 'google.com', autofillBehavior: 'AnywhereOnWebsite' }],
      })),
      get: async () => { throw new Error('user denied authorization'); },
    },
  };
  await assert.rejects(
    findLoginsWith(client, 'https://accounts.google.com/'),
    (error) => fixedErrorCode(error) === 'not-authorized'
  );
});

test('an unreadable candidate stops projection instead of opening an ambiguous picker', async () => {
  const client = {
    vaults: { list: async () => [{ id: 'vault', title: 'Personal' }] },
    items: {
      list: async () => ['one', 'two'].map((id) => ({
        id, title: 'google.com', category: 'Login', updatedAt: new Date(),
        websites: [{ url: 'google.com', autofillBehavior: 'AnywhereOnWebsite' }],
      })),
      get: async () => { throw new Error('individual item unavailable'); },
    },
  };
  await assert.rejects(
    findLoginsWith(client, 'https://accounts.google.com/'),
    (error) => fixedErrorCode(error) === 'sdk-error'
  );
});

// Modeled on @1password/sdk 0.5.0's Item type and 1Password's official
// manage-items example. The live DesktopAuth gate must reconfirm the shape.
test('official Login built-in ids are read from the redacted SDK contract fixture', () => {
  assert.equal(readBuiltIn(loginFixture, 'username'), 'alice@example.test');
  assert.equal(readBuiltIn(loginFixture, 'password'), '<redacted>');
  assert.equal(readBuiltIn(loginFixture, 'missing'), null);
});

test('the broker exposes no separate username or bulk credential read method', async () => {
  await assert.rejects(dispatch('reveal-usernames', {}), { code: 'invalid-request' });
});

test('raw SDK errors collapse to fixed non-secret codes', () => {
  assert.equal(fixedErrorCode(new Error('1Password desktop application not found')), 'desktop-unavailable');
  assert.equal(fixedErrorCode(new Error('user denied authorization')), 'not-authorized');
  class DesktopSessionExpiredError extends Error {}
  const expired = new DesktopSessionExpiredError('opaque detail');
  assert.equal(fixedErrorCode(expired), 'session-expired');
  assert.equal(isStaleClientError(expired), true);
  assert.equal(fixedErrorCode(Object.assign(new Error('changed'), {
    code: 'selection-changed',
  })), 'selection-changed');
  assert.equal(fixedErrorCode(new Error('sensitive backend detail')), 'sdk-error');
});

test('selected credential returns only explicitly requested built-in fields', async () => {
  const sdk = require('@1password/sdk');
  const originalCreateClient = sdk.createClient;
  sdk.createClient = async () => ({
    items: { get: async () => ({ fields: [
      { id: 'username', value: 'alice' },
      { id: 'password', value: 'secret' },
    ] }) },
  });
  try {
    assert.deepEqual(await dispatch('reveal-credential', {
      account: 'Selective test account', vaultId: 'vault', itemId: 'item',
      includeUsername: true, includePassword: false,
    }), { username: 'alice', password: null });
  } finally {
    sdk.createClient = originalCreateClient;
  }
});

test('selected credential refuses an item version changed after the picker opened', async () => {
  const sdk = require('@1password/sdk');
  const originalCreateClient = sdk.createClient;
  sdk.createClient = async () => ({
    items: { get: async () => ({ version: 8, fields: [
      { id: 'username', value: 'bob@gmail.com' },
      { id: 'password', value: 'new-secret' },
    ] }) },
  });
  try {
    await assert.rejects(dispatch('reveal-credential', {
      account: 'Selection binding test account', vaultId: 'vault', itemId: 'item',
      expectedItemVersion: 7, includeUsername: true, includePassword: true,
    }), { code: 'selection-changed' });
  } finally {
    sdk.createClient = originalCreateClient;
  }
});
