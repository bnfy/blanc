'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { brokerEnvironment, createOnePasswordClient } = require('../../src/main/onepassword-client');

test('broker environment excludes unrelated application secrets', () => {
  assert.deepEqual(brokerEnvironment({
    HOME: '/home/alice', PATH: '/bin', OP_SERVICE_ACCOUNT_TOKEN: 'secret',
    GH_TOKEN: 'secret-two', XDG_RUNTIME_DIR: '/run/user/1',
  }), { HOME: '/home/alice', PATH: '/bin', XDG_RUNTIME_DIR: '/run/user/1' });
});

test('client forks the Plugin helper on macOS and resolves bounded replies', async () => {
  const child = new EventEmitter();
  child.kill = () => true;
  child.postMessage = (message) => setImmediate(() => child.emit('message', {
    id: message.id, ok: true, value: { candidates: [] },
  }));
  let captured;
  const client = createOnePasswordClient({
    utilityProcess: { fork: (modulePath, args, options) => {
      captured = { modulePath, args, options };
      return child;
    } },
    platform: 'darwin',
    env: { HOME: '/tmp/home' },
    idleExitMs: 60_000,
  });
  assert.deepEqual(await client.findLogins('Account', 'https://example.com'), { candidates: [] });
  assert.equal(captured.options.allowLoadingUnsignedLibraries, true);
  assert.equal(captured.options.stdio, 'ignore');
  assert.equal(captured.options.serviceName, 'Blanc Credential Broker');
  assert.deepEqual(captured.options.execArgv, []);
  assert.equal('revealUsernames' in client, false);
  client.stop();
});

test('non-mac clients never request unsigned-library loading', async () => {
  const child = new EventEmitter();
  child.kill = () => true;
  child.postMessage = (message) => setImmediate(() => child.emit('message', {
    id: message.id, ok: true, value: { loaded: true },
  }));
  let options;
  const client = createOnePasswordClient({
    utilityProcess: { fork: (_modulePath, _args, value) => { options = value; return child; } },
    platform: 'win32', idleExitMs: 60_000,
  });
  await client.probePackage();
  assert.equal('allowLoadingUnsignedLibraries' in options, false);
  client.stop();
});

test('credential reveal forwards the picker item-version binding', async () => {
  const child = new EventEmitter();
  child.kill = () => true;
  let posted;
  child.postMessage = (message) => {
    posted = message;
    setImmediate(() => child.emit('message', {
      id: message.id, ok: true, value: { username: 'alice', password: 'secret' },
    }));
  };
  const client = createOnePasswordClient({
    utilityProcess: { fork: () => child },
    platform: 'darwin', idleExitMs: 60_000,
  });
  await client.revealCredential('Account', {
    vaultId: 'vault', itemId: 'item', itemVersion: 7,
  }, { username: true, password: true });
  assert.deepEqual(posted.payload, {
    account: 'Account', vaultId: 'vault', itemId: 'item', expectedItemVersion: 7,
    includeUsername: true, includePassword: true,
  });
  client.stop();
});
