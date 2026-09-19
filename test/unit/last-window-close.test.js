'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseHiddenWindowsOnLastClose } = require('../../src/main/last-window-close');

// Windows and Linux quit Blanc from `window-all-closed`, which Electron only
// emits once every BrowserWindow is gone — hidden helpers included. Closing
// the last visible window must therefore release those helpers, or Blanc
// lingers in Task Manager and a relaunch defers to the stuck instance
// (github issue #368, present since v1.16.0 added the display-capture helper).
test('releases hidden windows when the last visible window closes on Windows', () => {
  assert.equal(releaseHiddenWindowsOnLastClose({ platform: 'win32', liveRuntimeWindows: 0 }), true);
});

test('releases hidden windows when the last visible window closes on Linux', () => {
  assert.equal(releaseHiddenWindowsOnLastClose({ platform: 'linux', liveRuntimeWindows: 0 }), true);
});

test('keeps hidden windows while another visible window is still open', () => {
  assert.equal(releaseHiddenWindowsOnLastClose({ platform: 'win32', liveRuntimeWindows: 1 }), false);
});

// macOS keeps running with no windows (dock reopen recreates one), so its
// helpers must survive the last close.
test('keeps hidden windows on macOS, where Blanc stays alive without windows', () => {
  assert.equal(releaseHiddenWindowsOnLastClose({ platform: 'darwin', liveRuntimeWindows: 0 }), false);
});
