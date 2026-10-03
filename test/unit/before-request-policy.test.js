'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createBeforeRequestPolicy } = require('../../src/main/before-request-policy');

test('ordinary requests delegate only while blocking is enabled and not excepted', () => {
  const details = { resourceType: 'mainFrame', url: 'https://chromewebstore.google.com/' };
  let result;
  let blockCalls = 0;
  const disabled = createBeforeRequestPolicy({
    isBlockingEnabled: () => false,
    isExcepted: () => false,
    blockRequest: () => { blockCalls += 1; },
  });
  disabled(details, (value) => { result = value; });
  assert.deepEqual(result, {});

  const excepted = createBeforeRequestPolicy({
    isBlockingEnabled: () => true,
    isExcepted: () => true,
    blockRequest: () => { blockCalls += 1; },
  });
  excepted(details, (value) => { result = value; });
  assert.deepEqual(result, {});

  const protectedRequest = createBeforeRequestPolicy({
    isBlockingEnabled: () => true,
    isExcepted: () => false,
    blockRequest: (_details, callback) => {
      blockCalls += 1;
      callback({ cancel: false });
    },
  });
  protectedRequest(details, (value) => { result = value; });
  assert.deepEqual(result, { cancel: false });
  assert.equal(blockCalls, 1);
});
