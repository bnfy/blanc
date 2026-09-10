'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { CHROME_DISPLAY_CAPTURE_HELPER_URL } = require('../../src/main/chrome-protocol');
const { createHelperAuthority } = require('../../src/main/display-capture-broker');

function fakeWc({ url = CHROME_DISPLAY_CAPTURE_HELPER_URL, destroyed = false } = {}) {
  return {
    isDestroyed: () => destroyed,
    getURL: () => url,
  };
}

test('authorized helper sender requires live wc, exact URL, and token', () => {
  const auth = createHelperAuthority();
  const wc = fakeWc();
  assert.equal(auth.isAuthorizedHelperSender(wc, CHROME_DISPLAY_CAPTURE_HELPER_URL), false);
  auth.authorize(wc);
  assert.equal(auth.isAuthorizedHelperSender(wc, CHROME_DISPLAY_CAPTURE_HELPER_URL), true);
  assert.equal(auth.isAuthorizedHelperSender(wc, 'blanc-chrome://index/'), false);
  assert.equal(auth.isAuthorizedHelperSender(fakeWc({ url: 'https://meet.example/' }), CHROME_DISPLAY_CAPTURE_HELPER_URL), false);
  assert.equal(auth.isAuthorizedHelperSender(fakeWc({ destroyed: true }), CHROME_DISPLAY_CAPTURE_HELPER_URL), false);
  assert.equal(auth.isAuthorizedHelperSender(null, CHROME_DISPLAY_CAPTURE_HELPER_URL), false);
});
