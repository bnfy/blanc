'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function assertElectronVersions({ locked, installed, binary }) {
  if (!/^\d+\.\d+\.\d+$/.test(locked ?? '')) throw new Error('Missing locked Electron version');
  if (installed !== locked || binary !== locked) {
    throw new Error(`Electron runtime mismatch: lock=${locked}, installed=${installed}, running=${binary}. Run npm ci before testing or packaging.`);
  }
  return locked;
}

function lockedElectronVersion(root = path.resolve(__dirname, '..')) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
    .packages?.['node_modules/electron']?.version;
}

function verifyElectronRuntime({ root = path.resolve(__dirname, '..'), runningVersion } = {}) {
  const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
  let binary = runningVersion;
  if (!binary) {
    const executable = require(path.join(root, 'node_modules/electron'));
    const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
    void ignored;
    const result = spawnSync(executable, ['-p', 'process.versions.electron'], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 15_000 });
    if (result.error || result.status !== 0) throw new Error(`Could not verify Electron executable: ${result.error?.message ?? result.stderr}`);
    binary = result.stdout.trim().replace(/^v/, '');
  }
  const locked = lockedElectronVersion(root);
  assertElectronVersions({ locked, installed, binary });
  return { locked, installed, binary };
}

if (require.main === module) console.log(`Electron runtime verified: ${verifyElectronRuntime().binary}`);
module.exports = { assertElectronVersions, lockedElectronVersion, verifyElectronRuntime };
