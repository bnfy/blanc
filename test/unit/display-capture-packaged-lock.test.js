'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { verifyCaptureRuntime } = require('../../scripts/verify-packaged-capture-runtime');
const { captureRuntimeForPlatform } = require('../../src/main/capture-platform');
const root = path.resolve(__dirname, '../..');
const readMember = member => fs.readFileSync(path.join(root, member));

for (const platform of ['darwin','win32','linux']) {
  test(`package gate verifies ${platform} runtime and rejects a substituted helper`, () => {
    const result = verifyCaptureRuntime(readMember, platform);
    assert.equal(result.platform, platform);
    const helper = `src/renderer/${captureRuntimeForPlatform(platform).helper}`;
    assert.throws(() => verifyCaptureRuntime(member => member === helper ? Buffer.from('different helper') : readMember(member), platform), /capture runtime drift/);
  });
}

test('Linux runtime changes cannot become Windows or Mac package runtime', () => {
  const linux = new Set(verifyCaptureRuntime(readMember, 'linux').members);
  const changedLinux = member => linux.has(member) ? Buffer.from('Linux experiment') : readMember(member);
  assert.doesNotThrow(() => verifyCaptureRuntime(changedLinux, 'win32'));
  assert.doesNotThrow(() => verifyCaptureRuntime(changedLinux, 'darwin'));
  assert.throws(() => verifyCaptureRuntime(changedLinux, 'linux'), /capture runtime drift/);
});

test('package gate rejects dispatch drift even when the runtime hashes match', () => {
  assert.throws(() => verifyCaptureRuntime(member => member === 'src/main/capture-platform.js' ? Buffer.from('wrong mapping') : readMember(member), 'darwin'), /dispatch mismatch/);
  const pkg = require('../../package.json');
  assert.ok(pkg.build.files.includes('src/**/*')); // lock is inside the packaged source tree
  assert.match(readMember('scripts/after-pack-app-icons.js').toString(), /verifyPackagedCaptureRuntime\(path\.join\(resourcesDir, 'app\.asar'\), context\.electronPlatformName\)/);
});

test('a shared relay change reopens every platform instead of silently carrying forward passes', () => {
  const changed = member => member === 'src/main/display-capture-ice.js' ? Buffer.from('changed relay') : readMember(member);
  for (const platform of ['darwin','win32','linux']) {
    assert.throws(() => verifyCaptureRuntime(changed, platform), /shared capture dependency drift/);
  }
});
