'use strict';
// Native runner only; no publisher, release API, credential persistence, or
// public-feed output. Download bytes are bound to reviewed vendor checksums.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { buildFull } = require('./build-full-ecs-candidate.cjs');
const pin = require('../build/ecs-runtime.json');
const pins = Object.freeze(pin.archives);
async function main() {
  const target = `${process.platform}-${process.arch}`;
  if (!pins[target]) throw Error(`No reviewed native ECS pin for ${target}`);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-vendor-'));
  const name = `electron-v${pin.version}-${target}.zip`;
  const url = `https://github.com/castlabs/electron-releases/releases/download/v${encodeURIComponent(pin.version)}/${encodeURIComponent(name)}`;
  const { downloadArtifact } = await import('@electron/get');
  const archive = await downloadArtifact({ version: pin.version, artifactName: 'electron',
    platform: process.platform, arch: process.arch, checksums: { [name]: pins[target] },
    mirrorOptions: { resolveAssetURL: async () => url } });
  // Independently recheck the reviewed pin, including cached downloads.
  if (createHash('sha256').update(await fs.readFile(archive)).digest('hex') !== pins[target]) throw Error('ECS archive checksum mismatch');
  const runtime = path.join(dir, 'runtime');
  await fs.mkdir(runtime);
  const { extract } = await import('@electron-internal/extract-zip');
  await extract(archive, { dir: runtime });
  let nativeSecurityPatch = null;
  if (process.env.BLANC_ECS_CDM_ZYGOTE_TRIAL === '1') {
    if (target !== 'linux-x64') throw Error('CDM zygote trial is Linux x64 only');
    const executable = path.join(runtime, 'electron');
    const patched = require('./ecs-linux-cdm-zygote-trial.cjs').patchVerifiedRuntime(await fs.readFile(executable));
    await fs.writeFile(executable, patched.bytes);
    nativeSecurityPatch = patched.receipt;
    const shim = path.join(runtime, 'blanc-cdm-preload.so');
    require('node:child_process').execFileSync('cc', ['-shared', '-fPIC', '-O2', '-Wall', '-Wextra', '-Werror', '-fvisibility=hidden',
      '-Wl,-z,relro,-z,now', path.join(__dirname, 'ecs-linux-cdm-preload.c'), '-o', shim, '-ldl'], { stdio: 'inherit' });
    nativeSecurityPatch.preloadShimSha256 = createHash('sha256').update(await fs.readFile(shim)).digest('hex');
    nativeSecurityPatch.preloadSourceSha256 = createHash('sha256').update(await fs.readFile(path.join(__dirname, 'ecs-linux-cdm-preload.c'))).digest('hex');
    await fs.mkdir('output/ecs-native', { recursive: true });
    await fs.writeFile('output/ecs-native/native-patch.json', JSON.stringify(nativeSecurityPatch, null, 2));
  }
  await buildFull(runtime, { nativeValidation: true, stagingUpdater: true, nativeSecurityPatch });
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { pins };
