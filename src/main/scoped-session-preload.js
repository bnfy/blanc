'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, installVerifiedFiles } = require('./ublock-package');

// Preserve the platform capture implementation byte for byte. A separately
// verified host wrapper only changes its document scope, avoiding execution
// of website instrumentation inside native extension pages/backgrounds.
function scopedCapturePreload({ sourceRoot, userData, relativePath, pin }) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath));
  if (hash(source) !== pin) throw new Error('capture-preload-integrity');
  const bytes = Buffer.concat([
    Buffer.from("if (location.protocol !== 'chrome-extension:' && navigator.mediaDevices) {\n"), source, Buffer.from('\n}\n'),
  ]);
  fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
  const destination = path.join(fs.realpathSync(userData), 'managed-session-preloads', path.basename(relativePath, '.js'));
  installVerifiedFiles(new Map([['preload.js', bytes]]), destination);
  return path.join(destination, 'preload.js');
}
module.exports = { scopedCapturePreload };
