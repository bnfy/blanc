'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { captureRuntimeForPlatform } = require('./capture-platform');
const allowed = new Set(['darwin', 'win32', 'linux'].map(platform => `src/main/${captureRuntimeForPlatform(platform).preload}`));
function captureWrapperBytes(source) {
  return Buffer.concat([
    Buffer.from("if (location.protocol !== 'chrome-extension:' && navigator.mediaDevices) {\n"), source, Buffer.from('\n}\n'),
  ]);
}
function captureWrapperPath(relativePath) {
  if (!allowed.has(relativePath)) throw new Error('capture-preload-path');
  return `src/main/scoped-${path.basename(relativePath)}`;
}
// Both the locked implementation and its document-scope wrapper live in the
// signed app. No executable preload is extracted to writable profile storage.
function scopedCapturePreload({ sourceRoot, relativePath, pin }) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath));
  if (crypto.createHash('sha256').update(source).digest('hex') !== pin) throw new Error('capture-preload-integrity');
  const destination = path.join(sourceRoot, captureWrapperPath(relativePath));
  if (!fs.readFileSync(destination).equals(captureWrapperBytes(source))) throw new Error('capture-wrapper-integrity');
  return destination;
}
module.exports = { scopedCapturePreload, captureWrapperBytes, captureWrapperPath };
