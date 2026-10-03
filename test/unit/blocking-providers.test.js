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
  const providers = module.exports.createBlockingProviders({ settings: { getSettings: () => preferences }, hooks: {}, onStateChange: () => changes++ });
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
