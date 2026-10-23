'use strict';
// Native runner only; no publisher, release API, credential persistence, or
// public-feed output. Download bytes are bound to reviewed vendor checksums.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { buildFull } = require('./build-full-ecs-candidate.cjs');
const pins = Object.freeze({
  'darwin-arm64': '3f49f11710e87974b6b7c7acb2c172c1f37c804f319f7c887e0a791bbda8dc6b',
  'darwin-x64': '99ca1b2c3bb295d7927ef8d17137952385844d67f63dbe827a7214aecca181fe',
  'linux-x64': '80cb5218ab814597282ebe41d16fb5a98abb0c75370e9195914e40e097359fad',
  'win32-x64': '1ab1e5aa4566f218873d272af1a57c6162ad83911a69bbd4b0e341c37c6c40fc',
});
async function main() {
  const target = `${process.platform}-${process.arch}`;
  if (!pins[target]) throw Error(`No reviewed native ECS pin for ${target}`);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-vendor-'));
  const name = `electron-v44.9.3+wvcus-${target}.zip`;
  const url = `https://github.com/castlabs/electron-releases/releases/download/v44.9.3%2Bwvcus/${encodeURIComponent(name)}`;
  const response = await fetch(url);
  if (!response.ok) throw Error(`ECS download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== pins[target]) throw Error('ECS archive checksum mismatch');
  const archive = path.join(dir, name), runtime = path.join(dir, 'runtime');
  await fs.writeFile(archive, bytes); await fs.mkdir(runtime);
  const { extract } = await import('@electron-internal/extract-zip');
  await extract(archive, { dir: runtime });
  let nativeSecurityPatch = null;
  if (process.env.BLANC_ECS_CDM_ZYGOTE_TRIAL === '1') {
    if (target !== 'linux-x64') throw Error('CDM zygote trial is Linux x64 only');
    const executable = path.join(runtime, 'electron');
    const patched = require('./ecs-linux-cdm-zygote-trial.cjs').patchVerifiedRuntime(await fs.readFile(executable));
    await fs.writeFile(executable, patched.bytes);
    nativeSecurityPatch = patched.receipt;
    await fs.mkdir('output/ecs-native', { recursive: true });
    await fs.writeFile('output/ecs-native/native-patch.json', JSON.stringify(nativeSecurityPatch, null, 2));
  }
  await buildFull(runtime, { nativeValidation: true, stagingUpdater: true, nativeSecurityPatch });
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { pins };
