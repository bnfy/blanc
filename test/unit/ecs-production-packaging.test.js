'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');
test('ECS production packaging is opt-in, unpublished, and keeps the normal application identity', () => {
  const base = require('../../package.json');
  const source = read('scripts/build-ecs-production.cjs');
  assert.equal(base.devDependencies.electron, '^44.9.3');
  assert.equal(base.build.appId, 'me.bnfy.bowser');
  assert.equal(base.build.electronFuses.grantFileProtocolExtraPrivileges, false);
  assert.match(source, /publish: 'never'/);
  assert.match(source, /publication is forbidden/);
  assert.match(source, /\.\.\.base.build/);
  assert.doesNotMatch(source, /main:|appId:|provisioningProfile:|entitlements:/);
  assert.match(source, /blancEcsUblockQualification: true/);
});
test('ECS archives are immutable and each supported target has an independent digest', () => {
  const pin = require('../../build/ecs-runtime.json');
  assert.equal(pin.version, '44.9.3+wvcus');
  assert.match(pin.vendorCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(pin.archives).sort(), ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);
  for (const digest of Object.values(pin.archives)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(read('scripts/prepare-ecs-runtime.cjs'), /Cached ECS archive checksum mismatch/);
});
test('VMP signing is before Apple signing and after Windows signing', () => {
  const source = read('scripts/ecs-production-packaging.cjs');
  const afterPack = source.slice(source.indexOf('async function afterPack'), source.indexOf('async function afterSign'));
  const afterSign = source.slice(source.indexOf('async function afterSign'));
  assert.match(afterPack, /platform === 'darwin'\) evs\('sign-pkg'/);
  assert.doesNotMatch(afterPack, /platform === 'win32'\) evs\('sign-pkg'/);
  assert.match(afterSign, /electronPlatformName === 'win32'\) evs\('sign-pkg'/);
  assert.match(afterSign, /evs\('verify-pkg'/);
  assert.doesNotMatch(source, /--force/);
});

test('ECS release mode drops internal markers, needs the pipeline and the reviewed uBO record', () => {
  const build = read('scripts/build-ecs-production.cjs');
  const hooks = read('scripts/ecs-production-packaging.cjs');
  const verify = read('scripts/verify-ecs-production-package.cjs');
  const fuses = read('scripts/verify-electron-fuses.mjs');
  assert.match(build, /release \? \{ blancRuntime: 'ecs', blancEcsRuntime: pin.version \}/);
  assert.match(build, /process.env.BLANC_ECS_RELEASE_PIPELINE !== '1'/);
  assert.match(build, /Internal uBlock validation cannot enter an ECS release build/);
  assert.match(build, /release \? '..\/dist' : '..\/dist-ecs'/);
  assert.match(hooks, /if \(release === internal\) throw Error/);
  assert.match(hooks, /ecsRuntime !== pin.version\) throw Error\('ECS release runtime lacks a reviewed uBO runtime record'\)/);
  assert.match(verify, /assert.equal\(metadata.blancUblockInternalValidation, undefined\)/);
  assert.match(fuses, /\[FuseV1Options.GrantFileProtocolExtraPrivileges, ecs\]/);
  assert.match(fuses, /--ecs requires a package built on the ECS runtime/);
  // VMP signing order and publication refusal are unchanged.
  assert.match(build, /publish: 'never'/);
});
