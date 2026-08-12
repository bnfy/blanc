'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedAuthEvent } = require('../../src/main/auth-dialog-trust');

function fixture(url = 'blanc://auth/?id=7&host=example.com') {
  const mainFrame = { url };
  const contents = { mainFrame, getURL: () => url };
  return { contents, event: { sender: contents, senderFrame: mainFrame } };
}

test('auth dialog accepts only its exact sender, main frame, and dialog id', () => {
  const { contents, event } = fixture();
  assert.equal(isTrustedAuthEvent(event, contents, 7), true);
  assert.equal(isTrustedAuthEvent(event, contents, 8), false);
  assert.equal(isTrustedAuthEvent({ ...event, sender: {} }, contents, 7), false);
  assert.equal(isTrustedAuthEvent({ ...event, senderFrame: { url: event.senderFrame.url } }, contents, 7), false);
});

test('auth dialog rejects prefix-confusable and navigated documents', () => {
  const prefix = fixture('blanc://auth.evil/?id=7');
  assert.equal(isTrustedAuthEvent(prefix.event, prefix.contents, 7), false);
  const moved = fixture();
  moved.contents.getURL = () => 'blanc://auth/?id=9';
  assert.equal(isTrustedAuthEvent(moved.event, moved.contents, 7), false);
});
