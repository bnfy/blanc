'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrustedPagesEvent } = require('../../src/main/pages-ipc-trust');

function eventFor(url = 'blanc://settings/') {
  const session = {};
  const mainFrame = { url };
  const sender = { mainFrame, session, getURL: () => url };
  return { event: { sender, senderFrame: mainFrame }, sender, session };
}

test('pages IPC requires the exact host, session, main frame, and owned surface', () => {
  const { event, sender, session } = eventFor();
  const policy = {
    hosts: new Set(['settings']),
    sessions: new Set([session]),
    ownsSender: (host, candidate) => host === 'settings' && candidate === sender,
  };
  assert.equal(isTrustedPagesEvent(event, policy), true);
  assert.equal(isTrustedPagesEvent(event, { ...policy, hosts: new Set(['history']) }), false);
  assert.equal(isTrustedPagesEvent(event, { ...policy, sessions: new Set([{}]) }), false);
  assert.equal(isTrustedPagesEvent(event, { ...policy, ownsSender: () => false }), false);
  assert.equal(isTrustedPagesEvent({ ...event, senderFrame: { url: event.senderFrame.url } }, policy), false);
});

test('pages IPC rejects non-root paths and contents/frame URL disagreement', () => {
  const nested = eventFor('blanc://settings/borrowed');
  assert.equal(isTrustedPagesEvent(nested.event, {
    hosts: new Set(['settings']), sessions: new Set([nested.session]), ownsSender: () => true,
  }), false);
  const mismatch = eventFor('blanc://settings/');
  mismatch.sender.getURL = () => 'blanc://history/';
  assert.equal(isTrustedPagesEvent(mismatch.event, {
    hosts: new Set(['settings']), sessions: new Set([mismatch.session]), ownsSender: () => true,
  }), false);
});

test('tab-import IPC rejects a different internal host and subframe', () => {
  const { event, sender, session } = eventFor('blanc://tab-import/');
  const policy = {
    hosts: new Set(['tab-import']),
    sessions: new Set([session]),
    ownsSender: (host, candidate) => host === 'tab-import' && candidate === sender,
  };
  assert.equal(isTrustedPagesEvent(event, policy), true);

  const wrongHost = eventFor('blanc://bookmarks/');
  assert.equal(isTrustedPagesEvent(wrongHost.event, {
    ...policy,
    sessions: new Set([wrongHost.session]),
    ownsSender: () => true,
  }), false);

  const childFrame = { url: 'blanc://tab-import/' };
  assert.equal(isTrustedPagesEvent({ ...event, senderFrame: childFrame }, policy), false);
});
