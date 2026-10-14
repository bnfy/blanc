'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  shouldClearPersistedWindowState,
  windowCloseSessionEffect,
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

test('a secondary closed as the last Windows/Linux window keeps its native state', () => {
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: false,
    isPrimaryWindow: false,
    closeEffect: 'quit',
  }), false, 'closing the last window quits Blanc, so the window is restored next launch');
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: false,
    isPrimaryWindow: false,
    closeEffect: 'remove',
  }), true, 'a closed window that was not the last is forgotten (F32-1)');
  assert.equal(shouldClearPersistedWindowState({
    isQuitting: false,
    isPrimaryWindow: false,
    closeEffect: null,
  }), true, 'a forced close (profile deletion) still discards its secondary');
});

test('on macOS the primary close is a Dock close and every other close removes the window', () => {
  assert.equal(windowCloseSessionEffect({
    platform: 'darwin', isPrimaryWindow: true, otherOpenWindows: 0,
  }), 'dock');
  assert.equal(windowCloseSessionEffect({
    platform: 'darwin', isPrimaryWindow: true, otherOpenWindows: 2,
  }), 'dock');
  assert.equal(windowCloseSessionEffect({
    platform: 'darwin', isPrimaryWindow: false, otherOpenWindows: 1,
  }), 'remove');
  assert.equal(windowCloseSessionEffect({
    platform: 'darwin', isPrimaryWindow: false, otherOpenWindows: 0,
  }), 'remove', 'macOS keeps running without windows, so even the last secondary leaves the session');
});

test('on Windows and Linux the last open window keeps its tabs, as Quit does', () => {
  for (const platform of ['win32', 'linux']) {
    for (const isPrimaryWindow of [true, false]) {
      assert.equal(windowCloseSessionEffect({
        platform, isPrimaryWindow, otherOpenWindows: 0,
      }), 'quit', `${platform} ${isPrimaryWindow ? 'primary' : 'secondary'} last window`);
      assert.equal(windowCloseSessionEffect({
        platform, isPrimaryWindow, otherOpenWindows: 1,
      }), 'remove', `${platform} ${isPrimaryWindow ? 'primary' : 'secondary'} with another window open`);
    }
  }
});

test('the pinned Electron major supports native window-state persistence', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const match = String(pkg.devDependencies?.electron ?? '').match(/(\d+)/);
  assert.ok(match, 'Electron version must be pinned in devDependencies');
  assert.ok(Number(match[1]) >= 44, 'windowStatePersistence requires Electron 44 or newer');
});
