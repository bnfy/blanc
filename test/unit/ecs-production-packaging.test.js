'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');
test('ECS production packaging is opt-in, unpublished, and keeps the normal application identity', () => {
  const base = require('../../package.json');
  const source = read('scripts/build-ecs-production.cjs');
  assert.equal(base.devDependencies.electron, '^44.8.0');
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
