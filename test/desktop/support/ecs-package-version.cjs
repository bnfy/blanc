'use strict';
// The Electron version a public ECS package must report, after proving the
// package is the pinned ECS build: ECS runtime, exactly the pinned version, a
// recognized target, a valid pinned digest and an exactly matching archive
// digest. Missing or unknown metadata fails; it never compares undefined.
const assert = require('node:assert/strict');
const path = require('node:path');
const { extractFile } = require('@electron/asar');
const DIGEST = /^[a-f0-9]{64}$/;
function verifyEcsPackageMetadata(metadata, pin = require('../../../build/ecs-runtime.json')) {
  assert.equal(metadata?.blancRuntime, 'ecs', 'package is not an ECS build');
  assert.equal(metadata.blancEcsRuntime, pin.version, 'package is not the pinned ECS runtime');
  assert.equal(typeof metadata.blancEcsTarget, 'string', 'package names no ECS target');
  assert.ok(Object.hasOwn(pin.archives, metadata.blancEcsTarget), `unrecognized ECS target: ${metadata.blancEcsTarget}`);
  const pinned = pin.archives[metadata.blancEcsTarget];
  assert.match(String(pinned), DIGEST, 'pinned archive digest is invalid');
  assert.match(String(metadata.blancEcsArchiveSha256), DIGEST, 'package archive digest is missing or invalid');
  assert.equal(metadata.blancEcsArchiveSha256, pinned, 'package archive digest differs from the pin');
  return pin.version.split('+')[0];
}
function expectedEcsElectron(root, platform = process.platform) {
  const asar = path.join(path.resolve(root), platform === 'darwin' ? 'Contents/Resources/app.asar' : 'resources/app.asar');
  return verifyEcsPackageMetadata(JSON.parse(extractFile(asar, 'package.json')));
}
module.exports = { verifyEcsPackageMetadata, expectedEcsElectron };
