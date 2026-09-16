'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createBrokerRegistry } = require('../../src/main/display-capture-state');
const { projectDisplayShares } = require('../../src/main/display-capture-indicator');

function approve(reg, tabId, extras = {}) {
  const started = reg.beginRequest({
    tabId,
    webContentsId: tabId,
    frameId: 1,
    origin: extras.origin || `https://meet-${tabId}.example`,
    documentGeneration: 1,
    audioRequested: extras.audioRequested !== false,
  });
  reg.admit(started.requestId);
  return reg.approve(started.requestId, {
    sourceId: extras.sourceId || `screen:${tabId}`,
    computerAudioApproved: extras.computerAudioApproved === true,
    surfaceLabel: extras.surfaceLabel || `Screen ${tabId}`,
    surfaceKind: extras.surfaceKind || 'screen',
  });
}

test('two active shares project as a collection keyed by shareId', () => {
  const reg = createBrokerRegistry();
  const a = approve(reg, 1, { origin: 'https://a.example', surfaceLabel: 'A', computerAudioApproved: true });
  const b = approve(reg, 2, { origin: 'https://b.example', surfaceLabel: 'B' });
  const rows = projectDisplayShares(reg.listShares(), { tabIds: [1, 2] });
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].shareId, rows[1].shareId);
  assert.deepEqual(new Set(rows.map((row) => row.shareId)), new Set([a.shareId, b.shareId]));
  reg.stopShare(a.shareId);
  const left = projectDisplayShares(reg.listShares(), { tabIds: [1, 2] });
  assert.equal(left.length, 1);
  assert.equal(left[0].shareId, b.shareId);
  assert.equal(left[0].origin, 'https://b.example');
  assert.equal(left[0].surfaceLabel, 'B');
  assert.equal(left[0].computerAudio, false);
});

test('pending and active both appear; mic-only capturing yields no display shares', () => {
  const reg = createBrokerRegistry();
  reg.beginRequest({
    tabId: 1,
    webContentsId: 1,
    frameId: 1,
    origin: 'https://pending.example',
    documentGeneration: 1,
    audioRequested: true,
  });
  approve(reg, 2, { origin: 'https://live.example', surfaceLabel: 'Live' });
  const rows = projectDisplayShares(reg.listShares(), { tabIds: [1, 2] });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.pending === true && row.origin === 'https://pending.example'));
  assert.ok(rows.some((row) => row.pending === false && row.origin === 'https://live.example'));
  assert.deepEqual(projectDisplayShares([], { capturingOnly: true }), []);
});
