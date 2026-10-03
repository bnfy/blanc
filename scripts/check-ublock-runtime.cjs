'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { satisfies } = require('semver');
function verifyRuntimePins({ metadata, lock, matrix, runtime } = {}) {
  assert.equal(lock.packages['node_modules/electron'].version, matrix.electron, 'uBO Electron matrix differs from the locked official runtime');
  assert.equal(lock.packages[''].devDependencies.electron, metadata.devDependencies.electron, 'Electron dependency/lock specification drift');
  assert(satisfies(matrix.electron, metadata.devDependencies.electron), 'uBO matrix runtime is outside the Electron dependency specification');
  if (runtime) assert.equal(runtime, matrix.electron, 'uBO build runtime differs from the reviewed matrix');
}
function checkRuntime(runtime) {
  const root = path.join(__dirname, '..');
  verifyRuntimePins({ metadata: require(path.join(root, 'package.json')), lock: require(path.join(root, 'package-lock.json')),
    matrix: require(path.join(root, 'src/main/ublock-platforms.json')), runtime });
}
if (require.main === module) { checkRuntime(); console.log('uBO runtime matrix matches the official locked Electron version.'); }
module.exports = { verifyRuntimePins, checkRuntime };
