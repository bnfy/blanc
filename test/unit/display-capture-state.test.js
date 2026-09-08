'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createBrokerRegistry } = require('../../src/main/display-capture-state');

function start(reg, extras = {}) {
  return reg.beginRequest({
    tabId: 1,
    webContentsId: 10,
    frameId: 1,
    origin: 'https://meet.example',
    documentGeneration: 1,
    audioRequested: true,
    ...extras,
  });
}

test('one pending request per tab', () => {
  const reg = createBrokerRegistry();
  const first = start(reg);
  assert.ok(first.requestId);
  assert.deepEqual(start(reg), { error: 'pending' });
  assert.equal(reg.tabHasBlockingShare(1), true);
});

test('stale approve is ignored', () => {
  const reg = createBrokerRegistry();
  const { requestId } = start(reg);
  reg.admit(requestId);
  reg.invalidateGeneration(10, 1);
  reg.approve(requestId, {
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  assert.deepEqual(reg.listShares(), []);
  assert.equal(reg.tabHasBlockingShare(1), false);
});

test('computer audio cannot be approved when the site did not request it', () => {
  const reg = createBrokerRegistry();
  const { requestId } = start(reg, { audioRequested: false });
  reg.admit(requestId);
  const share = reg.approve(requestId, {
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  assert.equal(share.computerAudio, false);
});

test('clone consumers are independent; last audio consumer releases audio only', () => {
  const reg = createBrokerRegistry();
  const { requestId } = start(reg);
  reg.admit(requestId);
  const { shareId } = reg.approve(requestId, {
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  reg.addConsumer(shareId, { kind: 'video', trackKey: 'v1' });
  reg.addConsumer(shareId, { kind: 'audio', trackKey: 'a1' });
  reg.addConsumer(shareId, { kind: 'audio', trackKey: 'a2' });
  assert.deepEqual(reg.removeConsumer(shareId, { kind: 'audio', trackKey: 'a1' }), {
    releasedKind: null,
    shareEnded: false,
  });
  assert.deepEqual(reg.removeConsumer(shareId, { kind: 'audio', trackKey: 'a2' }), {
    releasedKind: 'audio',
    shareEnded: false,
  });
  assert.equal(reg.listShares()[0].computerAudio, false);
  assert.equal(reg.tabHasBlockingShare(1), true);
  assert.deepEqual(reg.removeConsumer(shareId, { kind: 'video', trackKey: 'v1' }), {
    releasedKind: 'video',
    shareEnded: true,
  });
  assert.equal(reg.tabHasBlockingShare(1), false);
});

test('stopShare releases every consumer', () => {
  const reg = createBrokerRegistry();
  const { requestId } = start(reg);
  reg.admit(requestId);
  const { shareId } = reg.approve(requestId, {
    sourceId: 'screen:1:0',
    computerAudioApproved: true,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  reg.addConsumer(shareId, { kind: 'video', trackKey: 'v1' });
  reg.addConsumer(shareId, { kind: 'audio', trackKey: 'a1' });
  const stopped = reg.stopShare(shareId);
  assert.equal(stopped.shareEnded, true);
  assert.deepEqual(new Set(stopped.releasedKinds), new Set(['video', 'audio']));
  assert.equal(reg.tabHasBlockingShare(1), false);
});

test('tabHasBlockingShare is true for pending and active', () => {
  const reg = createBrokerRegistry();
  const { requestId } = start(reg);
  assert.equal(reg.tabHasBlockingShare(1), true);
  reg.admit(requestId);
  assert.equal(reg.tabHasBlockingShare(1), true);
  reg.approve(requestId, {
    sourceId: 'screen:1:0',
    computerAudioApproved: false,
    surfaceLabel: 'Entire screen',
    surfaceKind: 'screen',
  });
  assert.equal(reg.tabHasBlockingShare(1), true);
});
