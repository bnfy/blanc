'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { captureRuntimeForPlatform } = require('../src/main/capture-platform');
const { scopedCapturePreload, captureWrapperBytes, captureWrapperPath } = require('../src/main/scoped-session-preload');
const lock = require('../src/main/capture-runtime-lock.json');
const sourceRoot = path.join(__dirname, '..');
for (const platform of ['darwin', 'win32', 'linux']) {
  const relativePath = `src/main/${captureRuntimeForPlatform(platform).preload}`;
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(sourceRoot, captureWrapperPath(relativePath)), captureWrapperBytes(fs.readFileSync(path.join(sourceRoot, relativePath))));
  scopedCapturePreload({ sourceRoot, relativePath, pin: lock.files[relativePath] });
}
console.log('Verified signed capture wrappers for macOS, Windows and Linux.');
