'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  savesSessionEntry,
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

test('a closed secondary forgets its native state; quit and macOS Dock close keep it', () => {
  assert.equal(shouldClearPersistedWindowState({
    platform: 'darwin',
    isQuitting: false,
    isPrimaryWindow: false,
  }), true);
  assert.equal(shouldClearPersistedWindowState({
    platform: 'darwin',
    isQuitting: true,
    isPrimaryWindow: false,
  }), false, 'secondary state survives a whole-app quit');
  assert.equal(shouldClearPersistedWindowState({
    platform: 'darwin',
    isQuitting: false,
    isPrimaryWindow: true,
  }), false, 'primary state survives macOS Dock close');
  assert.equal(shouldClearPersistedWindowState({
    platform: 'linux',
    isQuitting: true,
    isPrimaryWindow: true,
  }), false);
});

test('on Windows and Linux a primary closed with another window open is removed like any other', () => {
  for (const platform of ['win32', 'linux']) {
    assert.equal(shouldClearPersistedWindowState({
      platform, isQuitting: false, isPrimaryWindow: true, closeEffect: 'remove',
    }), true, `${platform}: there is no Dock reopen, so the closed primary leaves (F32-1)`);
    assert.equal(shouldClearPersistedWindowState({
      platform, isQuitting: false, isPrimaryWindow: true, closeEffect: 'quit',
    }), false, `${platform}: the last window still keeps its tabs, as Quit does`);
    assert.equal(shouldClearPersistedWindowState({
      platform, isQuitting: false, isPrimaryWindow: true, closeEffect: null,
    }), true, `${platform}: a forced close (profile deletion) clears the primary too`);
  }
});

test('a window is saved while it is open or still holds tabs', () => {
  assert.equal(savesSessionEntry({ resident: false, window: {}, tabOrder: [] }), true,
    'an open window with no tabs yet');
  assert.equal(savesSessionEntry({ resident: false, window: null, tabOrder: ['tab'] }), true,
    'the macOS primary after Dock close keeps its tabs for the next launch');
  assert.equal(savesSessionEntry({ resident: false, window: null, tabOrder: [] }), false,
    'a windowless runtime with no tabs would only come back as an empty window');
  assert.equal(savesSessionEntry({ resident: true, window: null, tabOrder: ['tab'] }), false,
    'a Blanc Spaces resident is never a saved window');
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
