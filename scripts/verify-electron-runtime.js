'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function verifyRuntime({ root, platform, arch, archive = path.join(root, '.runtime/electron.zip'),
  recordPath = path.join(root, '.runtime/blanc-runtime-build.json') }) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'runtime/electron/source.json'), 'utf8'));
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  for (const key of Object.keys(lock)) {
    if (JSON.stringify(record[key]) !== JSON.stringify(lock[key])) throw new Error(`Runtime source mismatch: ${key}`);
  }
  const normalizedArch = { aarch64: 'arm64', arm64: 'arm64', AMD64: 'x64', x86_64: 'x64' }[record.machine];
  if (record.platform !== platform || normalizedArch !== arch) throw new Error('Runtime target does not match the package target');
  for (const patch of lock.patches) {
    if (hash(path.join(root, 'runtime/electron', patch.file)) !== patch.sha256) throw new Error('Runtime patch has changed');
  }
  if (!/^[a-f0-9]{64}$/.test(record.archiveSha256) || hash(archive) !== record.archiveSha256) {
    throw new Error('Runtime archive is missing or differs from its build record');
  }
  return record;
}

function verifyLinuxAudio({ root, arch, resources = null }) {
  const directory = resources ?? path.join(root, 'native/linux');
  const binary = path.join(directory, 'audio-monitor');
  const record = JSON.parse(fs.readFileSync(binary + '.json', 'utf8'));
  const bytes = fs.readFileSync(binary);
  fs.accessSync(binary, fs.constants.X_OK);
  const machine = { x64: 62, arm64: 183 }[arch];
  if (!machine || bytes.length < 20 || bytes.subarray(0, 4).toString('hex') !== '7f454c46'
      || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== machine
      || record.arch !== arch || record.binarySha256 !== hash(binary)
      || record.sourceSha256 !== hash(path.join(root, 'runtime/linux-audio/monitor.c'))) {
    throw new Error('Linux audio helper source, binary, or architecture mismatch');
  }
  return record;
}

module.exports = async function beforePack(context) {
  const { Arch } = require('builder-util');
  const root = context.packager.projectDir;
  const record = verifyRuntime({ root, platform: context.electronPlatformName, arch: Arch[context.arch] });
  const config = context.packager.config;
  // A missing archive or invalid record must fail before electron-builder
  // extracts anything. Never allow its hook-error fallback to stock Electron.
  if (config.electronDist !== '.runtime/electron.zip' || config.electronVersion !== record.electronVersion) {
    throw new Error('Packaging must use the verified patched Electron archive');
  }
  if (context.electronPlatformName === 'linux') {
    verifyLinuxAudio({ root, arch: Arch[context.arch] });
  }
};
module.exports.verifyRuntime = verifyRuntime;
module.exports.verifyLinuxAudio = verifyLinuxAudio;
