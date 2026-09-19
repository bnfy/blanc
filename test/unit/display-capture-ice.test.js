'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { filterSignaling, MAX_SIGNAL_BYTES } = require('../../src/main/display-capture-ice');

const local = new Set(['127.0.0.1', '::1', '192.168.1.20']);

test('rejects a public candidate', () => {
  const line = 'a=candidate:1 1 UDP 2122260223 8.8.8.8 59999 typ host';
  assert.equal(filterSignaling(line, { localAddresses: local }).ok, false);
});

test('keeps a verified same-machine host address', () => {
  const line = 'a=candidate:1 1 UDP 2122260223 192.168.1.20 59999 typ host';
  assert.equal(filterSignaling(line, { localAddresses: local }).ok, true);
});

test('typ host alone is not enough without a local address', () => {
  const line = 'a=candidate:1 1 UDP 2122260223 203.0.113.5 59999 typ host';
  assert.equal(filterSignaling(line, { localAddresses: local }).ok, false);
});
