'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  shouldClearPersistedWindowState,
  windowStateName,
  windowStatePersistenceOptions,
} = require('../../src/main/window-state-persistence');

const ROOT = path.join(__dirname, '..', '..');

test('each restored runtime gets a stable, distinct native persistence name', () => {
  assert.equal(windowStateName('primary'), 'blanc-window-primary');
  assert.equal(windowStateName('window_abc123'), 'blanc-window-window_abc123');
  assert.notEqual(windowStateName('window_one'), windowStateName('window_two'));
});

test('native persistence includes both normal bounds and display mode', () => {
  assert.deepEqual(windowStatePersistenceOptions('primary'), {
    name: 'blanc-window-primary',
    windowStatePersistence: {
      bounds: true,
      displayMode: true,
    },
  });
});

test('unsafe or unusable runtime ids cannot become native persistence keys', () => {
  for (const id of ['', null, 'with spaces', '../escape', 'w'.repeat(65)]) {
    assert.throws(() => windowStateName(id), /Invalid window runtime id/);
  }
});

test('only an explicitly closed secondary forgets its persisted native state', () => {
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: false,
    isPrimaryWindow: false,
  }), true);
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: true,
    isPrimaryWindow: false,
  }), false, 'secondary state survives a whole-app quit');
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: false,
    isPrimaryWindow: true,
  }), false, 'primary state survives macOS Dock close');
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: true,
    isPrimaryWindow: true,
  }), false);
});

test('the pinned Electron major supports native window-state persistence', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const match = String(pkg.devDependencies?.electron ?? '').match(/(\d+)/);
  assert.ok(match, 'Electron version must be pinned in devDependencies');
  assert.ok(Number(match[1]) >= 44, 'windowStatePersistence requires Electron 44 or newer');
});
