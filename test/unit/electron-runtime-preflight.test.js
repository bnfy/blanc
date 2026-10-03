'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertElectronVersions } = require('../../scripts/preflight-electron-runtime');

test('runtime verification requires the installed package and binary to match the lock', () => {
  assert.equal(assertElectronVersions({ locked: '44.5.1', installed: '44.5.1', binary: '44.5.1' }), '44.5.1');
  for (const versions of [
    { installed: '44.4.3', binary: '44.4.3' },
    { installed: '44.5.1', binary: '44.4.3' },
    { installed: '44.4.3', binary: '44.5.1' },
  ]) assert.throws(() => assertElectronVersions({ locked: '44.5.1', ...versions }), /runtime mismatch/);
  assert.throws(() => assertElectronVersions({ installed: '44.5.1', binary: '44.5.1' }), /Missing locked/);
});
