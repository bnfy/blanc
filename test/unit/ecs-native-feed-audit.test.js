'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyUpdateRequest, assertStagingRequests } = require('../desktop/ecs-native-smoke.cjs');
test('native candidate feed audit rejects production paths even after report sanitization', () => {
  assert.doesNotThrow(() => assertStagingRequests(['/staging.yml', '/staging-mac.yml', '/staging-linux.yml'].map(classifyUpdateRequest)));
  for (const forbidden of ['/latest.yml', '/latest-mac.yml', '/latest-linux.yml', '/unknown', '/staging.yml/redirect']) {
    const requests = ['/staging.yml', forbidden].map(classifyUpdateRequest);
    assert.equal(requests[1], 'unexpected');
    assert.throws(() => assertStagingRequests(requests), /production or unexpected/);
  }
  assert.throws(() => assertStagingRequests([]), /actually be requested/);
});
