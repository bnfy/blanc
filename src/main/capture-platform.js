'use strict';

// Runtime selection is main-process owned. No page argument, environment flag,
// or picker result may opt a passing platform into another platform's changes.
// These files are pinned in src/main/capture-runtime-lock.json. Changing a
// pin requires an explicit evidence update for every platform using that file.
const PLAYOUT = Object.freeze({
  revision: 'fda425eb',
  preload: 'capture-preload-playout.js',
  broker: 'display-capture-broker-playout.js',
  helper: 'display-capture-helper-playout.js',
});
const LINUX = Object.freeze({
  revision: 'c26127eb',
  preload: 'capture-preload-linux.js',
  broker: 'display-capture-broker-linux.js',
  helper: 'display-capture-helper-linux.js',
});
// Preserve the exact existing Windows paths and bytes. Linux's future work
// goes into separate files, never through the Windows runtime.
const WINDOWS = Object.freeze({
  revision: 'c26127eb',
  preload: 'capture-preload.js',
  broker: 'display-capture-broker.js',
  helper: 'display-capture-helper.js',
});

function captureRuntimeForPlatform(platform = process.platform) {
  if (platform === 'darwin') return PLAYOUT;
  if (platform === 'win32') return WINDOWS;
  if (platform === 'linux') return LINUX;
  throw new Error('Unsupported capture platform');
}

module.exports = { captureRuntimeForPlatform };
