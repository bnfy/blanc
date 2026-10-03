'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('unrelated settings preserve the one-broadcast batch boundary while provider changes notify', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8');
  const preferences = { adblockProvider: 'blanc', adblockEnabled: true };
  const toggles = []; let changes = 0;
  const builtin = { setAdBlockEnabled: value => toggles.push(value) };
  const startup = { phase: 'initializing' };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { env: {}, platform: 'darwin', arch: 'arm64', versions: { electron: '44.5.1' } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: false } };
      if (name === './adblock') return builtin;
      if (name === './ublock-provider') return {};
      if (name === './ublock-platforms.json') return { electron: '44.5.1', ublock: '1.75.0', platforms: {} };
      return require(name);
    },
  });
  const providers = module.exports.createBlockingProviders({ settings: { getSettings: () => preferences }, hooks: { startupStatus: () => startup }, onStateChange: () => changes++ });
  assert.equal(providers.status('personal').phase, 'initializing');
  startup.phase = 'failed'; startup.error = 'sensitive exception detail';
  assert.equal(providers.status('personal').phase, 'failed');
  assert.equal(providers.status('personal').error, 'blanc-initialization-failed');
  assert(!JSON.stringify(providers.status('personal')).includes('sensitive exception detail'));
  startup.phase = 'ready';
  assert.equal(providers.status('personal').phase, 'ready');
  preferences.tabImportCompleted = true;
  providers.setEnabled(true);
  assert.equal(changes, 0); assert.deepEqual(toggles, []);
  preferences.adblockEnabled = false; providers.setEnabled(false);
  assert.equal(changes, 1); assert.deepEqual(toggles, [false]);
  providers.setEnabled(false);
  assert.equal(changes, 1);
  preferences.adblockProvider = 'ublock-origin'; providers.setEnabled(false);
  assert.equal(changes, 2); assert.deepEqual(toggles, [false]);
  assert.equal(providers.status('personal').restartPending, true);
  assert.equal(providers.status('personal').active, 'blanc');
});

test('a private session attached after initialization honors a global disable that arrived during the build', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/adblock.js'), 'utf8');
  const attach = source.match(/function attachAdBlockerToSession\(session, \{ enabled = true \} = \{\}\) \{[\s\S]*?\n\}/)?.[0];
  assert(attach);
  const sessions = new Set(); const operations = []; const session = {};
  let enabled = true;
  const context = {
    attachedSessions: sessions, facadeFor: value => value,
    blocker: { isBlockingEnabled: () => enabled, disableBlockingInSession: () => { enabled = false; operations.push('disable'); } },
    ownedCosmetics: { clearSession: value => { assert.equal(value, session); operations.push('clear'); } },
    applyBlockingWithExceptions: () => { enabled = true; operations.push('enable'); },
    installBeforeRequestPolicy: () => operations.push('policy'),
  };
  vm.runInNewContext(`${attach}\nthis.attach = attachAdBlockerToSession`, context);
  context.attach(session, { enabled: false });
  assert.equal(enabled, false); assert(sessions.has(session));
  assert.deepEqual(operations, ['clear', 'disable', 'policy']);
  context.attach(session, { enabled: false });
  assert.deepEqual(operations, ['clear', 'disable', 'policy', 'policy']);
  context.attach(session, { enabled: true }); assert.equal(enabled, true);
  assert.equal(operations.at(-1), 'enable');
});

test('profile deletion after switching to Blanc erases the prior native principal and preserves failed cleanup for retry', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8');
  const operations = []; const owned = { normal: {}, private: {} }; let fail = true;
  const provider = { setEnabled: value => { assert.equal(value, false); }, eraseStorage: async () => { operations.push('erase'); if (fail) throw new Error('native storage unavailable'); }, dispose: () => operations.push('unload') };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { env: {}, platform: 'darwin', arch: 'arm64', versions: { electron: '44.5.1' } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: false, getPath: () => '/profile-test' } };
      if (name === 'node:fs') return { existsSync: () => true, rmSync: destination => { assert(destination.endsWith('/managed-ublock/profile_to_delete')); operations.push('remove'); } };
      if (name === './adblock') return { detachAdBlockerFromSession() {}, coordinator: { setProvider() {} } };
      if (name === './ublock-provider') return { createUblockProvider: options => { assert.equal(options.session, owned.normal); assert.equal(options.profileId, 'profile_to_delete'); return provider; } };
      if (name === './ublock-platforms.json') return { electron: '44.5.1', ublock: '1.75.0', platforms: {} };
      return require(name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => ({ adblockProvider: 'blanc', adblockEnabled: true }) }, hooks: {} });
  await assert.rejects(manager.dispose('profile_to_delete', owned), /native storage unavailable/);
  assert.deepEqual(operations, ['erase']);
  fail = false; await manager.dispose('profile_to_delete', owned);
  assert.deepEqual(operations, ['erase', 'erase', 'unload', 'remove']);
});
