'use strict';
// The index revision hint must never fall behind the Space blob (Nov 2, 2026:
// an iPhone published its 47-minute-old receipt over the Mac's newer hint, so
// the iPhone, whose blob matched the regressed hint, never fetched again).
// A receipt names the hint it replaces and is dropped once another device has
// published over that hint; a device that downloads a blob the hint doesn't
// describe publishes a correction.
const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../../src/main/sync-crypto');
const m = require('../../src/main/shared-spaces-model');
const { syncDevice } = require('./support/sync-device');

const id = n => n.toString(16).padStart(32, '0');
const f = (v, c = 100, by = 'b') => ({ v, c, by });
const sid = id(99);
const tab = (n, c = 100, by = 'b') => ({ nav: f({ url: 'https://example.test/' + n, title: 'T' + n }, c, by), name: f(null, c, by),
  pinned: f(false, c, by), groupId: f(null, c, by), pos: f(m.keyFor('', '', id(n)), c, by), deleted: f(false, c, by) });
const blob = tabs => ({ v: 1, spaceId: sid, groups: {}, tabs });
const seal = text => encrypt(Buffer.alloc(32), text);
const entry = (rev, revAt, revBy) => ({ name: f('Work'), color: f('#426c4c'), symbol: f('briefcase'), pos: f(m.keyFor('', '', sid)), deleted: f(false),
  rev, ...(revAt === undefined ? {} : { revAt }), ...(revBy === undefined ? {} : { revBy }) });
const index = e => ({ v: 1, spaces: { [sid]: e } });

function device(t, deviceId) {
  const d = syncDevice({ fetch: async () => { throw new Error('unexpected HTTP'); } });
  t.after(() => d.dispose());
  const ctx = { accountId: d.record.accountId, deviceId, deviceName: deviceId, platform: 'darwin' };
  return { s: d.spaces, ctx, data: () => d.spaces.rebind(ctx.accountId).data };
}

test('a receipt names the hint it replaces', () => {
  const p = m.pushPlan({ fetchedBlob: blob({}), fetchedVersion: 'v1', localBlob: blob({ [id(1)]: tab(1, 150, 'a') }),
    pending: { tabs: { [id(1)]: tab(1, 150, 'a') } }, lastMergeAt: 50, now: 200, deviceId: 'a', encryptFn: seal,
    indexHint: entry('1111111111111111', 40, 'b') });
  assert.deepEqual(p.indexEntry, { id: sid, rev: p.upload.rev, at: 200, by: 'a', base: { rev: '1111111111111111', revAt: 40, revBy: 'b' } });
  assert.deepEqual(m.applyLocalEdits({ index: p.indexEntry }).index, p.indexEntry, 'the base survives a save');
});

test('a receipt another device published over is dropped, and the device fetches instead', t => {
  const { s, ctx, data } = device(t, 'phone');
  // The phone last merged the Mac's hint and blob, then uploaded its own write.
  s.mergeIndex(index(entry('1111111111111111', 10, 'mac')), ctx);
  s.rebind(ctx.accountId).update(x => { x.blobs[sid] = { blob: blob({}), rev: '1111111111111111', mergedAt: Date.now() }; });
  const local = blob({ [id(1)]: tab(1, 300, 'phone') });
  s.noteLocalSpace(sid, local, { tabs: local.tabs }, ctx);
  const p = s.exportSpace(sid, blob({}), 'v', ctx, seal);
  s.settleSpace(sid, p, { blobStored: true }, ctx);
  const receipt = data().pending[sid].index;
  assert.equal(receipt.rev, p.upload.rev);
  // Before the phone publishes its receipt, the Mac uploads over the phone's
  // blob and publishes that newer revision, by a clock that runs behind.
  s.mergeIndex(index(entry('3333333333333333', receipt.at - 5000, 'mac')), ctx);
  const published = s.exportIndex(ctx).spaces[sid];
  assert.equal(published.rev, '3333333333333333', 'the stale receipt does not regress the hint');
  assert.equal(published.revBy, 'mac');
  s.settleIndex({ v: 1, spaces: { [sid]: published } }, ctx);
  assert.equal(data().pending[sid].index, undefined, 'the dropped receipt is not published later');
  assert.notEqual(data().index.spaces[sid].rev, data().blobs[sid].rev, 'so the phone is due to fetch the Mac\'s write');
});

test('a receipt still replaces the hint it was built on, even from a device whose clock runs behind', t => {
  const { s, ctx, data } = device(t, 'phone');
  s.mergeIndex(index(entry('1111111111111111', 900000000000000, 'mac')), ctx);
  s.rebind(ctx.accountId).update(x => { x.blobs[sid] = { blob: blob({}), rev: '1111111111111111', mergedAt: Date.now() }; });
  const local = blob({ [id(1)]: tab(1, 300, 'phone') });
  s.noteLocalSpace(sid, local, { tabs: local.tabs }, ctx);
  const p = s.exportSpace(sid, blob({}), 'v', ctx, seal);
  s.settleSpace(sid, p, { blobStored: true }, ctx);
  const published = s.exportIndex(ctx).spaces[sid];
  assert.equal(published.rev, p.upload.rev);
  assert.ok(published.revAt > 900000000000000);
  s.settleIndex({ v: 1, spaces: { [sid]: published } }, ctx);
  assert.equal(data().pending[sid].index, undefined);
  assert.equal(data().index.spaces[sid].rev, data().blobs[sid].rev);
});

test('a receipt saved before receipts named their base still publishes', t => {
  const { s, ctx, data } = device(t, 'phone');
  s.mergeIndex(index(entry('3333333333333333', 50, 'mac')), ctx);
  s.rebind(ctx.accountId).update(x => { x.blobs[sid] = { blob: blob({}), rev: '2222222222222222' }; x.pending[sid] = { index: { id: sid, rev: '2222222222222222', at: 40, by: 'phone' } }; });
  assert.equal(s.exportIndex(ctx).spaces[sid].rev, '2222222222222222');
  assert.ok(data().pending[sid].index);
});

test('a device that downloads a blob the hint does not describe corrects the hint', t => {
  const { s, ctx, data } = device(t, 'mac');
  // The index regressed to an older revision; the Worker holds a newer blob.
  s.mergeIndex(index(entry('1111111111111111', 70, 'phone')), ctx);
  const remote = blob({ [id(1)]: tab(1, 300, 'mac') });
  s.rebind(ctx.accountId).update(x => { x.knownIndex[sid] = true; x.blobs[sid] = { blob: remote, rev: m.revisionOf(remote), lastPublishable: remote, mergedAt: Date.now() }; });
  const p = s.mergeSpace(sid, remote, 'v2', ctx, seal);
  assert.equal(p.upload, null, 'nothing to write');
  assert.deepEqual(p.indexEntry, { id: sid, rev: m.revisionOf(remote), at: p.indexEntry.at, by: 'mac', base: { rev: '1111111111111111', revAt: 70, revBy: 'phone' } });
  assert.deepEqual(data().pending[sid].index, p.indexEntry, 'the correction waits for the index upload');
  const published = s.exportIndex(ctx).spaces[sid];
  assert.equal(published.rev, m.revisionOf(remote));
  assert.ok(published.revAt > 70);
});

test('no correction when the hint already describes the downloaded blob', t => {
  const { s, ctx, data } = device(t, 'mac');
  const remote = blob({ [id(1)]: tab(1, 300, 'mac') });
  s.mergeIndex(index(entry(m.revisionOf(remote), 70, 'phone')), ctx);
  s.rebind(ctx.accountId).update(x => { x.knownIndex[sid] = true; x.blobs[sid] = { blob: remote, rev: m.revisionOf(remote), lastPublishable: remote, mergedAt: Date.now() }; });
  const p = s.mergeSpace(sid, remote, 'v2', ctx, seal);
  assert.equal(p.indexEntry, null);
  assert.equal(data().pending[sid].index, undefined);
});

test('receiptSuperseded: dropped only when another device replaced the base', () => {
  const base = { rev: '1111111111111111', revAt: 10, revBy: 'mac' };
  const receipt = { id: sid, rev: '2222222222222222', at: 20, by: 'phone', base };
  assert.equal(m.receiptSuperseded(receipt, entry('1111111111111111', 10, 'mac'), 'phone'), false, 'base unchanged');
  assert.equal(m.receiptSuperseded(receipt, entry('3333333333333333', 30, 'mac'), 'phone'), true, 'replaced by another device');
  assert.equal(m.receiptSuperseded(receipt, entry('3333333333333333', 30, 'phone'), 'phone'), false, 'replaced by this device');
  assert.equal(m.receiptSuperseded({ ...receipt, base: undefined }, entry('3333333333333333', 30, 'mac'), 'phone'), false, 'no base: older receipt');
  assert.equal(m.receiptSuperseded(receipt, entry('1111111111111111', 11, 'mac'), 'phone'), true, 'same rev, newer hint');
});
