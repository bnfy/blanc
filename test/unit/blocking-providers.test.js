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
      if (name === './blocking-resources') return require('../../src/main/blocking-resources');
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
      if (name === 'node:fs') return { existsSync: () => true, rmSync: destination => { assert(destination.endsWith(path.join('managed-ublock', 'profile_to_delete'))); operations.push('remove'); } };
      if (name === './blocking-resources') return require('../../src/main/blocking-resources');
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

test('unsupported uBO keeps recovery documents usable while remote traffic stays gated', async () => {
  const preferences = { adblockProvider: 'ublock-origin', adblockEnabled: true };
  const root = path.resolve('/blanc-test-app');
  let gate;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8'), {
    module, process: { env: {}, platform: 'darwin', arch: 'arm64', versions: { electron: 'next-runtime' } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: false, getAppPath: () => root } };
      if (name === './adblock') return { attachAdBlockerToSession() {}, detachAdBlockerFromSession() {}, coordinator: { setProvider: (_session, value) => { gate = value; } } };
      if (name === './ublock-provider') return { createUblockProvider: () => { throw new Error('unsupported extension must not load'); } };
      if (name === './ublock-platforms.json') return { electron: '44.5.1', platforms: { 'darwin-arm64': { enabled: true } } };
      return require(name.startsWith('./') ? '../../src/main/' + name.slice(2) : name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => preferences }, hooks: {} });
  await assert.rejects(manager.attach('personal', { normal: {}, private: {} }), /ubo-platform-unverified/);
  assert.equal(manager.status('personal').phase, 'unsupported');
  const allowed = ['blanc://settings/', 'blanc://error/', 'blanc-chrome://overlay.html', require('node:url').pathToFileURL(path.join(root, 'src/renderer/pages/error.html')).href];
  for (const url of allowed) assert.equal(gate.decide('onBeforeRequest', { url }).cancel, undefined, url);
  for (const url of ['https://example.org/', require('node:url').pathToFileURL(path.join(root, 'outside.html')).href]) assert.equal(gate.decide('onBeforeRequest', { url }).cancel, true, url);
  preferences.adblockEnabled = false;
  assert.equal(gate.decide('onBeforeRequest', { url: 'https://example.org/' }).cancel, undefined);
});

test('one failing profile leaves all sessions protected and still initializes the others', async () => {
  const owned = { first: { normal: {}, private: {} }, second: { normal: {}, private: {} } };
  const attached = new Set(), gates = new Map(), initialized = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8'), {
    module, process: { env: { BLANC_UBLOCK_TEST: '1' }, platform: 'darwin', arch: 'arm64', versions: { electron: '44.5.1' } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: false, getAppPath: () => '/app' } };
      if (name === './adblock') return { attachAdBlockerToSession: session => attached.add(session), detachAdBlockerFromSession() {}, coordinator: { setProvider: (session, provider) => gates.set(session, provider) } };
      if (name === './ublock-platforms.json') return { electron: '44.5.1', platforms: {} };
      if (name === './ublock-provider') return { createUblockProvider: ({ profileId }) => {
        let phase = 'initializing';
        return { setEnabled() {}, status: () => ({ phase }), decide: () => phase === 'ready' ? {} : { cancel: true }, initialize: async () => {
          assert(attached.has(owned.first.private)); assert(attached.has(owned.second.private));
          assert.equal(gates.get(owned.first.normal).decide('onBeforeRequest', { url: 'https://example.org/' }).cancel, true);
          assert.equal(gates.get(owned.second.normal).decide('onBeforeRequest', { url: 'https://example.org/' }).cancel, true);
          initialized.push(profileId); phase = profileId === 'first' ? 'failed' : 'ready';
          if (phase === 'failed') throw new Error('background failed');
        } };
      } };
      return require(name.startsWith('./') ? '../../src/main/' + name.slice(2) : name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => ({ adblockProvider: 'ublock-origin', adblockEnabled: true }) }, hooks: {} });
  await assert.rejects(manager.attachAll(['first', 'second'], id => owned[id]), /blocking-profile-initialization-failed/);
  assert.deepEqual(initialized, ['first', 'second']);
  assert.equal(manager.status('first').phase, 'failed'); assert.equal(manager.status('second').phase, 'ready');
  assert.equal(gates.get(owned.first.normal).decide().cancel, true);
  assert.equal(gates.get(owned.second.normal).decide().cancel, undefined);
});

test('ordinary packages hide uBO unless a prior selection needs recovery', () => {
  const preferences = { adblockProvider: 'blanc', adblockEnabled: true };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8'), {
    module, process: { env: {}, platform: 'linux', arch: 'x64', versions: { electron: '44.5.1' } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: true } };
      if (name === '../../package.json') return {};
      if (name === './adblock' || name === './ublock-provider') return {};
      if (name === './ublock-platforms.json') return { electron: '44.5.1', platforms: {} };
      return require(name.startsWith('./') ? '../../src/main/' + name.slice(2) : name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => preferences }, hooks: {} });
  assert.equal(manager.status('default').exposed, false);
  preferences.adblockProvider = 'ublock-origin';
  assert.equal(manager.status('default').exposed, true);
});

function retiredManager({ runtime = '44.5.1', enabled = true } = {}) {
  const operations = [];
  const preferences = { adblockProvider: 'ublock-origin', adblockEnabled: enabled };
  const startup = { phase: 'initializing' };
  const module = { exports: {} };
  const builtin = {
    attachAdBlockerToSession: (session, options) => operations.push({ session, enabled: options.enabled }),
    detachAdBlockerFromSession() {}, providerForSession: session => session,
    setAdBlockEnabled: value => operations.push({ enabled: value }), coordinator: { setProvider() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8'), {
    module, process: { env: { BLANC_UBLOCK_TEST: '1' }, platform: 'darwin', arch: 'arm64', versions: { electron: runtime } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: true, getAppPath: () => '/fixture' } };
      if (name === '../../package.json') return { blancUblockBundled: false };
      if (name === './adblock') return builtin;
      if (name === './ublock-platforms.json') return { electron: '44.5.1', manifestV2: 'retired', platforms: { 'darwin-arm64': { enabled: false } } };
      if (name === './ublock-provider') return { createUblockProvider() { throw new Error('retired runtime must not load uBO'); } };
      return require(name.startsWith('./') ? '../../src/main/' + name.slice(2) : name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => preferences }, hooks: { startupStatus: () => startup } });
  return { manager, preferences, operations, startup };
}
test('reviewed MV2 retirement attaches Blanc to every session while preserving the saved uBO selection', async () => {
  const { manager, preferences, operations, startup } = retiredManager();
  const sessions = { personal: { normal: {}, private: {} }, work: { normal: {}, private: {} } };
  await manager.attachAll(Object.keys(sessions), id => sessions[id]);
  assert.equal(manager.active, 'blanc');
  assert.equal(manager.status('personal').phase, 'initializing');
  startup.phase = 'ready';
  const state = manager.status('personal');
  assert.equal(state.fallback, 'manifest-v2-retired');
  assert.equal(state.selected, 'ublock-origin'); assert.equal(state.active, 'blanc');
  assert.equal(state.restartPending, false); assert.equal(state.supported, false);
  assert.equal(state.phase, 'ready');
  assert.equal(preferences.adblockProvider, 'ublock-origin');
  for (const [profileId, owned] of Object.entries(sessions)) {
    for (const privateTab of [false, true]) {
      const session = privateTab ? owned.private : owned.normal;
      assert.equal(manager.effectiveForTab({ profileId, private: privateTab }), session);
      assert(operations.some(op => op.session === session && op.enabled === true));
    }
    assert.equal(manager.forTab({ profileId, private: false }), null);
  }
  startup.phase = 'failed';
  assert.equal(manager.status('personal').phase, 'failed', 'Blanc startup failure is not presented as protection');
});
test('retirement honors global-off and switching permanently to Blanc needs no restart', async () => {
  const { manager, preferences, operations, startup } = retiredManager({ enabled: false });
  await manager.attach('personal', { normal: {}, private: {} });
  assert(operations.every(op => op.enabled === false));
  assert.equal(manager.status('personal').enabled, false);
  startup.phase = 'disabled';
  assert.equal(manager.status('personal').phase, 'disabled');
  preferences.adblockProvider = 'blanc';
  manager.setEnabled(false);
  assert.equal(manager.status('personal').restartPending, false);
  assert.equal(manager.status('personal').fallback, null);
  preferences.adblockEnabled = true; manager.setEnabled(true);
  assert.equal(operations.at(-1).enabled, true);
});
test('a retirement declaration for another runtime cannot mask an unreviewed runtime or initialization failure', async () => {
  const { manager } = retiredManager({ runtime: '99.0.0' });
  assert.equal(manager.active, 'ublock-origin');
  assert.equal(manager.status('personal').fallback, null);
  await assert.rejects(manager.attach('personal', { normal: {}, private: {} }), /ubo-platform-unverified/);
});
