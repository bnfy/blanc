'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { extractFile } = require('@electron/asar');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const base = require('../package.json');
const pin = require('../build/ecs-runtime.json');
async function verify(app) {
  const mac = process.platform === 'darwin';
  const resources = path.join(app, mac ? 'Contents/Resources' : 'resources');
  const metadata = JSON.parse(extractFile(path.join(resources, 'app.asar'), 'package.json'));
  assert.equal(metadata.blancRuntime, 'ecs');
  assert.equal(metadata.blancEcsRuntime, pin.version);
  assert.equal(metadata.blancEcsUblockQualification, true);
  assert.equal(metadata.blancUblockInternalValidation, true);
  assert.equal(metadata.blancUblockBundled, true);
  assert.equal(metadata.name, base.name);
  assert.equal(metadata.main, base.main);
  assert.equal(pin.archives[metadata.blancEcsTarget], metadata.blancEcsArchiveSha256);
  if (process.platform === 'linux') {
    assert.equal(metadata.blancEcsNativePatch?.experimental, true);
    assert.equal(metadata.blancEcsNativePatch?.patchedSha256, metadata.blancEcsFrameworkSha256);
  }
  const executable = path.join(app, mac ? 'Contents/MacOS/Blanc' : process.platform === 'win32' ? 'Blanc.exe' : 'blanc');
  const wire = await getCurrentFuseWire(executable);
  assert.equal(wire.version, '1');
  for (const [key, expected] of Object.entries({ ...base.build.electronFuses, grantFileProtocolExtraPrivileges: true })) {
    const name = key[0].toUpperCase() + key.slice(1);
    assert.equal(typeof FuseV1Options[name], 'number', `Unknown configured fuse: ${name}`);
    assert.equal(wire[FuseV1Options[name]], expected ? 49 : 48, name);
  }
  require('./verify-packaged-compliance').verifyPackagedCompliance(resources);
  console.log('ECS integration identity, archive pin, uBO payload, runtime SBOM and final fuse wire verified.');
}
if (require.main === module) verify(path.resolve(process.argv[2])).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { verify };
