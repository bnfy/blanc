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
      if (name === './ublock-platforms.json') return { electron: '44.5.1', ublock: '1.75.0', platforms: { 'darwin-arm64': { enabled: true } } };
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
      if (name === './ublock-platforms.json') return { electron: '44.5.1', ublock: '1.75.0', platforms: { 'darwin-arm64': { enabled: true } } };
      return require(name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => ({ adblockProvider: 'blanc', adblockEnabled: true }) }, hooks: {} });
  await assert.rejects(manager.dispose('profile_to_delete', owned), /native storage unavailable/);
  assert.deepEqual(operations, ['erase']);
  fail = false; await manager.dispose('profile_to_delete', owned);
  assert.deepEqual(operations, ['erase', 'erase', 'unload', 'remove']);
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
  assert.equal(manager.active, 'ublock-origin');
  assert.equal(manager.status('first').fallback, null, 'an available provider failure must never substitute Blanc');
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

function unavailableManager({ runtime = '44.5.1', enabled = true, manifestV2 = 'retired', platform = { enabled: false }, bundled = false, architecture = 'arm64', translated = false } = {}) {
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
    module, process: { env: { BLANC_UBLOCK_TEST: '1' }, platform: 'darwin', arch: architecture, versions: { electron: runtime } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: true, runningUnderARM64Translation: translated, getAppPath: () => '/fixture', getPath: () => '/fixture-profile' } };
      if (name === 'node:fs') return { existsSync: () => true, rmSync: value => operations.push({ removed: value }) };
      if (name === '../../package.json') return { blancUblockBundled: bundled };
      if (name === './adblock') return builtin;
      if (name === './ublock-platforms.json') return { electron: '44.5.1', manifestV2, platforms: platform ? { ['darwin-' + architecture]: platform } : {} };
      if (name === './ublock-provider') return { createUblockProvider() { throw new Error('unavailable build must not load uBO'); } };
      return require(name.startsWith('./') ? '../../src/main/' + name.slice(2) : name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => preferences }, hooks: { startupStatus: () => startup } });
  return { manager, preferences, operations, startup };
}
test('reviewed MV2 retirement attaches Blanc to every session while preserving the saved uBO selection', async () => {
  const { manager, preferences, operations, startup } = unavailableManager();
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
for (const manifestV2 of ['retired', 'supported']) test(`unavailable uBO honors global-off and switching permanently to Blanc (${manifestV2})`, async () => {
  const { manager, preferences, operations, startup } = unavailableManager({ enabled: false, manifestV2 });
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
for (const [scenario, options] of [
  ['Intel app under Rosetta', { manifestV2: 'supported', bundled: true, platform: { enabled: true }, architecture: 'x64', translated: true }],
  ['disabled platform', { manifestV2: 'supported', bundled: true }],
  ['unlisted platform', { manifestV2: 'supported', bundled: true, platform: null }],
  ['payload omitted from an approved platform', { manifestV2: 'supported', platform: { enabled: true } }],
  ['unreviewed Electron version', { manifestV2: 'supported', bundled: true, platform: { enabled: true }, runtime: '99.0.0' }],
  ['retirement record for a different runtime', { runtime: '99.0.0' }],
]) test(`${scenario} starts Blanc automatically without losing the selected uBO configuration`, async () => {
  const { manager, preferences, operations, startup } = unavailableManager(options);
  const owned = { normal: {}, private: {} };
  await manager.attach('personal', owned);
  startup.phase = 'ready';
  const state = manager.status('personal');
  assert.equal(state.active, 'blanc'); assert.equal(state.selected, 'ublock-origin');
  assert.equal(state.fallback, 'ublock-unavailable'); assert.equal(state.phase, 'ready');
  assert.equal(state.supported, false); assert.equal(state.restartPending, false);
  assert.equal(preferences.adblockProvider, 'ublock-origin');
  assert.equal(manager.effectiveForTab({ profileId: 'personal', private: false }), owned.normal);
  assert(operations.some(op => op.session === owned.normal && op.enabled));
  assert(operations.some(op => op.session === owned.private && op.enabled));
});


test('deleting a profile in an unavailable build never loads its old native uBO principal', async () => {
  const { manager, operations } = unavailableManager({ manifestV2: 'supported', bundled: true });
  await manager.dispose('personal', { normal: {}, private: {} });
  assert(operations.some(op => op.removed?.endsWith(path.join('managed-ublock', 'personal'))));
});

test('approved native Intel remains selectable without the Rosetta fallback', () => {
  const { manager } = unavailableManager({ manifestV2: 'supported', bundled: true,
    platform: { enabled: true }, architecture: 'x64', translated: false });
  assert.equal(manager.active, 'ublock-origin');
  assert.equal(manager.status('personal').supported, true);
  assert.equal(manager.status('personal').fallback, null);
});

test('a provider failure keeps its startup stage and stage timings in the bounded diagnostics', async () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8'), {
    module, process: { env: { BLANC_UBLOCK_TEST: '1' }, platform: 'darwin', arch: 'arm64', versions: { electron: '44.5.1' } },
    require: name => {
      if (name === 'electron') return { app: { isPackaged: false, getAppPath: () => '/app' } };
      if (name === './adblock') return { attachAdBlockerToSession() {}, detachAdBlockerFromSession() {}, coordinator: { setProvider() {} } };
      if (name === './ublock-platforms.json') return { electron: '44.5.1', platforms: {} };
      if (name === './ublock-provider') return { createUblockProvider: ({ onStateChange }) => {
        let state = { id: 'ublock-origin', version: '1.75.0', phase: 'initializing', error: null, stage: 'cssHostLoad', timings: {} };
        return { setEnabled() {}, status: () => state, initialize: async () => {
          state = { ...state, phase: 'failed', error: 'ubo-initialization-failed', stage: 'install', timings: { cssHostLoad: 12.5, cssHostReady: 3, install: 18000 } };
          onStateChange(state);
          throw new Error('ubo-initialization-failed');
        } };
      } };
      return require(name.startsWith('./') ? '../../src/main/' + name.slice(2) : name);
    },
  });
  const manager = module.exports.createBlockingProviders({ settings: { getSettings: () => ({ adblockProvider: 'ublock-origin', adblockEnabled: true }) }, hooks: {} });
  await assert.rejects(manager.attach('personal', { normal: {}, private: {} }));
  assert.deepEqual(JSON.parse(JSON.stringify(manager.status('personal').diagnostics)), [{ provider: 'ublock-origin', version: '1.75.0', error: 'ubo-initialization-failed',
    stage: 'install', timings: { cssHostLoad: 12.5, cssHostReady: 3, install: 18000 } }]);
});

test('Settings retry leaves a recovering provider to its own episode', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8');
  const retry = source.match(/  async function retry\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert(retry, 'blocking-providers still defines retry()');
  const calls = [];
  const provider = phase => ({ status: () => ({ phase }), retry: async () => calls.push(phase) });
  const context = { profiles: new Map([['a', { provider: provider('recovering') }], ['b', { provider: provider('failed') }]]) };
  vm.runInNewContext(`${retry}\nthis.retry = retry;`, context);
  await context.retry();
  assert.deepEqual(calls, ['failed']);
});
