const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport, projection, clearRecord,
} = require('../../src/main/capture-state');

const MAIN = { origin: 'https://meet.example', isMainFrame: true };
const IFRAME = { origin: 'https://embed.example', isMainFrame: false };

test('grant lights exactly its scopes; video-only never lights audio', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['video'] });
  assert.deepEqual(projection(r), { audio: false, video: true });
});

test('resolved settlement confirms; counts then govern', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applySettlement(r, { ...MAIN, outcome: 'resolved', scopes: ['audio'] });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 1, videoLive: 0 });
  assert.deepEqual(projection(r), { audio: true, video: false });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 0, videoLive: 0 });
  assert.deepEqual(projection(r), { audio: false, video: false });
});

test('rejected settlement retires its anchor (device failure goes dark)', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] });
  assert.deepEqual(projection(r), { audio: false, video: false });
});

test('concurrent grants each keep an anchor; one settlement consumes one', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  assert.equal(applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] }), true);
  assert.deepEqual(projection(r), { audio: true, video: false },
    'the second call is still pending; its anchor must survive');
});

test('non-matching reports/settlements cannot clear an unconfirmed anchor', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...IFRAME, scopes: ['audio'] });          // subframe grant: unconfirmable
  applyFrameReport(r, 'main', { ...MAIN, audioLive: 0, videoLive: 0 });
  applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] });
  assert.deepEqual(projection(r), { audio: true, video: false },
    'patch failed / wrong frame => stuck on until navigation');
});

test('summed frame counts: one stopped capture cannot clear another', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applySettlement(r, { ...MAIN, outcome: 'resolved', scopes: ['audio'] });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 2, videoLive: 0 });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 1, videoLive: 0 });
  assert.deepEqual(projection(r), { audio: true, video: false });
});

test('settlement matching requires equal normalized scopes', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio', 'video'] });
  assert.equal(applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] }), false);
  assert.deepEqual(projection(r), { audio: true, video: true });
});

test('grants and clearRecord bump generation (the Stop-timeout token)', () => {
  const r = createCaptureRecord();
  const g0 = r.generation;
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  assert.ok(r.generation > g0, 'a new call invalidates a pending stop decision');
  const g1 = r.generation;
  clearRecord(r);
  assert.ok(r.generation > g1);
  assert.deepEqual(projection(r), { audio: false, video: false });
  assert.equal(r.anchors.length, 0);
  assert.equal(r.frames.size, 0);
});
