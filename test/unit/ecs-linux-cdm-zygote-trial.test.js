'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { patchVerifiedRuntime, restoreCdmMask } = require('../../scripts/ecs-linux-cdm-zygote-trial.cjs');
test('experimental CDM zygote patch rejects all unrecognized binaries', () => {
  for (const bytes of [null, Buffer.alloc(0), Buffer.from('not the vendor runtime')]) {
    assert.throws(() => patchVerifiedRuntime(bytes), /exact pinned vendor/);
  }
});
test('experimental zygote mask restores only kCdm without modifying other exclusions', () => {
  const before = Buffer.from('b9b00000000fa3c1731831c0eb04', 'hex');
  const after = restoreCdmMask(before);
  assert.equal(before.toString('hex'), 'b9b00000000fa3c1731831c0eb04');
  assert.equal(after.toString('hex'), 'b9a00000000fa3c1731831c0eb04');
  assert.equal(before.readUInt32LE(1) ^ after.readUInt32LE(1), 1 << 4);
  assert.equal(after.readUInt32LE(1) & (1 << 5), 1 << 5);
  assert.equal(after.readUInt32LE(1) & (1 << 7), 1 << 7);
  const wrong = Buffer.from(before); wrong[0] = 0;
  assert.throws(() => restoreCdmMask(wrong), /Unrecognized/);
});
