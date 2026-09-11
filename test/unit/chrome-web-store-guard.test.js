'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isChromeWebStoreUrl,
  shouldBlockChromeWebStoreRequest,
  createBeforeRequestPolicy,
} = require('../../src/main/chrome-web-store-guard');

test('only the exact Chrome Web Store host is classified as unsafe', () => {
  for (const url of [
    'https://chromewebstore.google.com/',
    'https://chromewebstore.google.com/detail/example/abc',
    'http://chromewebstore.google.com/detail/example/abc',
    'https://CHROMEWEBSTORE.GOOGLE.COM/detail/example/abc',
  ]) assert.equal(isChromeWebStoreUrl(url), true, url);

  for (const url of [
    'https://chrome.google.com/webstore/',
    'https://chromewebstore.google.com.evil.test/',
    'https://example.com/?next=https://chromewebstore.google.com/',
    'blanc://newtab/',
    'not a url',
  ]) assert.equal(isChromeWebStoreUrl(url), false, url);
});

test('the guard blocks Web Store documents but leaves non-document resources alone', () => {
  for (const resourceType of ['mainFrame', 'subFrame']) {
    assert.equal(shouldBlockChromeWebStoreRequest({
      resourceType,
      url: 'https://chromewebstore.google.com/detail/example/abc',
    }), true);
  }
  for (const resourceType of ['script', 'image', 'xhr', 'other', undefined]) {
    assert.equal(shouldBlockChromeWebStoreRequest({
      resourceType,
      url: 'https://chromewebstore.google.com/detail/example/abc',
    }), false);
  }
});

test('the Web Store guard outranks blocker state and site exceptions', () => {
  let blockCalls = 0;
  const handler = createBeforeRequestPolicy({
    isBlockingEnabled: () => true,
    isExcepted: () => true,
    blockRequest: () => { blockCalls += 1; },
  });
  let result;
  handler({ resourceType: 'mainFrame', url: 'https://chromewebstore.google.com/' }, (value) => { result = value; });
  assert.deepEqual(result, { cancel: true });
  assert.equal(blockCalls, 0);
});

test('ordinary requests delegate only while blocking is enabled and not excepted', () => {
  const details = { resourceType: 'mainFrame', url: 'https://example.com/' };
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
