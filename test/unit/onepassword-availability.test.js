'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isOnePasswordAvailable } = require('../../src/main/onepassword-availability');

test('1Password login fill is available only on macOS', () => {
  assert.equal(isOnePasswordAvailable('darwin'), true);
  assert.equal(isOnePasswordAvailable('win32'), false);
  assert.equal(isOnePasswordAvailable('linux'), false);
  assert.equal(isOnePasswordAvailable('freebsd'), false);
  assert.equal(isOnePasswordAvailable(''), false);
});
