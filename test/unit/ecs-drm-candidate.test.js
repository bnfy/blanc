'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { candidateConfig } = require('../../scripts/build-ecs-drm-candidate.cjs');
const fuses = require('../../package.json').build.electronFuses;
test('default ECS packaging probe preserves production fuses without changing input', () => {
  const input = Object.freeze({ ...fuses });
  const config = candidateConfig('/test/runtime', '/test/output', input);
  assert.deepEqual(config.electronFuses, fuses);
  assert.notEqual(config.electronFuses, input);
  assert.equal(config.mac.identity, null);
  assert.equal(config.publish, null);
  assert.equal(config.npmRebuild, false);
  assert.notEqual(config.appId, require('../../package.json').build.appId);
});
test('explicit vendor-fuse control changes only the isolated file-privileges setting', () => {
  const original = { ...fuses };
  const config = candidateConfig('/test/runtime', '/test/output', fuses, true);
  assert.deepEqual(fuses, original);
  const differences = Object.keys(fuses).filter(key => fuses[key] !== config.electronFuses[key]);
  assert.deepEqual(differences, ['grantFileProtocolExtraPrivileges']);
  assert.equal(config.electronFuses.grantFileProtocolExtraPrivileges, true);
});
