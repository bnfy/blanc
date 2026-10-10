'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isOnePasswordAvailable } = require('../../src/main/onepassword-availability');

test('1Password login fill is available on macOS, Windows and Linux only', () => {
  assert.equal(isOnePasswordAvailable('darwin'), true);
  assert.equal(isOnePasswordAvailable('win32'), true);
  assert.equal(isOnePasswordAvailable('linux'), true);
  assert.equal(isOnePasswordAvailable('freebsd'), false);
  assert.equal(isOnePasswordAvailable('aix'), false);
  assert.equal(isOnePasswordAvailable(''), false);
});
