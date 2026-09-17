'use strict';

// Pure policy for what happens when a browser window closes and no visible
// runtime window remains. No `require('electron')` here — unit-tested.
//
// Windows and Linux quit Blanc from `window-all-closed`, and Electron only
// emits that once EVERY BrowserWindow is gone — hidden helpers included. So
// the last visible close must release those helpers, or Blanc lingers in
// Task Manager and a relaunch defers to the stuck instance through the
// single-instance lock (github issue #368; the display-capture helper
// introduced this in v1.16.0). macOS deliberately keeps running with no
// windows (dock reopen recreates one), so its helpers must survive.
function releaseHiddenWindowsOnLastClose({ platform, liveRuntimeWindows }) {
  return platform !== 'darwin' && liveRuntimeWindows === 0;
}

module.exports = { releaseHiddenWindowsOnLastClose };
