'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const pin = require('../build/ecs-runtime.json');
const pending = new Map();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function prepare(platform, arch) {
  const target = `${platform}-${arch}`;
  if (!Object.hasOwn(pin.archives, target)) throw Error(`Unreviewed ECS target: ${target}`);
  const name = `electron-v${pin.version}-${target}.zip`;
  const url = `https://github.com/castlabs/electron-releases/releases/download/v${encodeURIComponent(pin.version)}/${encodeURIComponent(name)}`;
  const { downloadArtifact } = await import('@electron/get');
  const archive = await downloadArtifact({ version: pin.version, artifactName: 'electron', platform, arch,
    checksums: { [name]: pin.archives[target] }, mirrorOptions: { resolveAssetURL: async () => url } });
  if (hash(await fs.readFile(archive)) !== pin.archives[target]) throw Error('Cached ECS archive checksum mismatch');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-production-runtime-'));
  const { extract } = await import('@electron-internal/extract-zip');
  await extract(archive, { dir: directory });
  const executable = path.join(directory, platform === 'darwin'
    ? 'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'
    : platform === 'win32' ? 'electron.exe' : 'electron');
  let nativePatch = null;
  if (platform === 'linux') {
    const patched = require('./ecs-linux-cdm-zygote-trial.cjs').patchVerifiedRuntime(await fs.readFile(executable));
    await fs.writeFile(executable, patched.bytes);
    nativePatch = patched.receipt;
    execFileSync('cc', ['-shared', '-fPIC', '-O2', '-Wall', '-Wextra', '-Werror', '-fvisibility=hidden',
      '-Wl,-z,relro,-z,now', path.join(__dirname, 'ecs-linux-cdm-preload.c'), '-o', path.join(directory, 'blanc-cdm-preload.so'), '-ldl'], { stdio: 'inherit' });
  }
  return { directory, platform, arch, version: pin.version, archiveSha256: pin.archives[target],
    frameworkSha256: hash(await fs.readFile(executable)), nativePatch, url };
}
function prepareEcsRuntime(platform, arch) {
  const key = `${platform}-${arch}`;
  if (!pending.has(key)) pending.set(key, prepare(platform, arch));
  return pending.get(key);
}
module.exports = { prepareEcsRuntime };
