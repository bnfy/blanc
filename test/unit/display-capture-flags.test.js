'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
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
