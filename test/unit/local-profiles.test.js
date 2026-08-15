'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createLocalProfileManager, MAX_LOCAL_PROFILES } = require('../../src/main/local-profiles');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const destroyProfileWindowSource = mainSource.match(
  /async function destroyProfileWindow\(runtime\) \{[\s\S]*?\n\}/
)?.[0];

function fakeStore(data = {}) {
  return {
    data,
    update(fn) { fn(this.data); },
    updateAndFlush(fn) { fn(this.data); return true; },
  };
}

test('manager creates bounded opaque identities and edits named profiles', () => {
  const store = fakeStore();
  const manager = createLocalProfileManager({
    store,
    makeId: () => '00000000-0000-4000-8000-000000000001',
    now: () => 123,
  });
  const created = manager.create('  Client   Work ');
  assert.deepEqual(created, {
    id: 'profile_00000000-0000-4000-8000-000000000001',
    name: 'Client Work',
    createdAt: 123,
  });
  assert.equal(manager.get(created.id).name, 'Client Work');
  assert.equal(manager.rename(created.id, 'Studio').name, 'Studio');
  assert.equal(manager.remove(created.id, { flush: true }).id, created.id);
  assert.deepEqual(manager.list().map((profile) => profile.id), ['default']);
});

test('manager refuses unsupported registries, Personal deletion, and profile overflow', () => {
  const future = createLocalProfileManager({
    store: fakeStore({ version: 99, profiles: [] }),
  });
  assert.throws(() => future.create('Work'), /newer local-profile registry/);

  const profiles = Array.from({ length: MAX_LOCAL_PROFILES }, (_, index) => ({
    id: index === 0 ? 'default' : `profile_${index}`,
    name: index === 0 ? 'Personal' : `Profile ${index}`,
    createdAt: index,
  }));
  const full = createLocalProfileManager({
    store: fakeStore({ version: 1, profiles }),
  });
  assert.throws(() => full.create('Overflow'), /up to 16/);
  assert.throws(() => full.remove('default'), /cannot be deleted/);
});

test('profile deletion settles native visibility before force-destroying its window', async () => {
  assert.ok(destroyProfileWindowSource,
    'destroyProfileWindow not found in main.js — update this test with it');
  const listeners = new Map();
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    once(event, listener) {
      calls.push(`once:${event}`);
      listeners.set(event, listener);
    },
    hide() {
      calls.push('hide');
      listeners.get('hide')?.();
    },
    destroy() {
      calls.push('destroy');
      listeners.get('closed')?.();
    },
  };
  const sandbox = {};
  vm.runInNewContext(`${destroyProfileWindowSource}\nthis.__destroy = destroyProfileWindow;`, sandbox);

  await sandbox.__destroy({ window });

  assert.deepEqual(calls, ['once:hide', 'hide', 'once:closed', 'destroy']);
});
