'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { licenseStatus, protectedPage } = require('../desktop/support/ecs-protected-page.cjs');
test('updater playback page extracts only the license platform enum', () => {
  for (const status of [0, 1, 2, 3, 4, 5]) assert.equal(licenseStatus(Uint8Array.from([8, 2, 18, 2, 80, status])), status);
  assert.equal(licenseStatus(Uint8Array.from([8, 5])), null);
  assert.throws(() => licenseStatus(Uint8Array.from([18, 4, 80])), /Truncated/);
});
test('updater playback probe is token-scoped and uses production Widevine', () => {
  assert.throws(() => protectedPage('../other'), /token/);
  const page = protectedPage('a'.repeat(32));
  assert.match(page, /https:\/\/proxy\.widevine\.com\/proxy/);
  assert.match(page, /encryptedEvents/);
  assert.match(page, /video\.mediaKeys/);
  assert.doesNotMatch(page, /proxy\.uat|--no-sandbox|request\.body|response\.data.*send/);
});
