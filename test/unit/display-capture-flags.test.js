'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
  LINUX_INPUT_VOLUME_FEATURE,
  captureDisabledFeatures,
} = require('../../src/main/display-capture-flags');

test('merges extras onto an existing comma list without duplicates', () => {
  assert.equal(
    mergeDisabledFeatures('FedCm', [MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`
  );
  assert.equal(
    mergeDisabledFeatures(`FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`, [MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`
  );
});

test('empty prior keeps only extras', () => {
  assert.equal(mergeDisabledFeatures('', ['FedCm', MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`);
});

test('capture flags stay platform-specific and preserve existing disables', () => {
  assert.deepEqual(captureDisabledFeatures('darwin'), [MAC_CATAP_LOOPBACK_FEATURE]);
  assert.deepEqual(captureDisabledFeatures('linux'), [LINUX_INPUT_VOLUME_FEATURE]);
  assert.deepEqual(captureDisabledFeatures('win32'), []);
  assert.equal(mergeDisabledFeatures(`Existing,FedCm,${LINUX_INPUT_VOLUME_FEATURE}`,
    ['FedCm', ...captureDisabledFeatures('linux')]), `Existing,FedCm,${LINUX_INPUT_VOLUME_FEATURE}`);
});
