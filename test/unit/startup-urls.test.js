'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  externalUrlActivationPlan,
  webUrlsFromArgv,
} = require('../../src/main/startup-urls');

test('startup handoff accepts only explicit HTTP(S) URLs', () => {
  assert.deepEqual(webUrlsFromArgv([
    '/Applications/Blanc.app',
    'https://example.com/a',
    'HTTP://EXAMPLE.COM/b',
    'http://localhost:8080/',
    'notes.html',
    '/tmp/notes.html',
    'file:///etc/passwd',
    'data:text/html,hello',
    'javascript:alert(1)',
    'blanc://settings/',
  ]), [
    'https://example.com/a',
    'HTTP://EXAMPLE.COM/b',
    'http://localhost:8080/',
  ]);
});

test('startup handoff rejects malformed input without throwing', () => {
  assert.deepEqual(webUrlsFromArgv(null), []);
  assert.deepEqual(webUrlsFromArgv([null, 4, {}, '']), []);
});

test('multi-URL handoff loads every tab but activates only the final one', () => {
  assert.deepEqual(externalUrlActivationPlan(['https://a.test/', 'https://b.test/']), [
    { url: 'https://a.test/', activate: false },
    { url: 'https://b.test/', activate: true },
  ]);
  assert.deepEqual(externalUrlActivationPlan(['https://only.test/']), [
    { url: 'https://only.test/', activate: true },
  ]);
  assert.deepEqual(externalUrlActivationPlan(null), []);
});
