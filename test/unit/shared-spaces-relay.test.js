'use strict';
// Review fixes for the M16 protocol (#1111): the index revision hint merges by
// its own clock; uploads relay what this version can't interpret instead of
// erasing it; the tombstone reason is given only when expiry would make room.
const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../../src/main/sync-crypto');
const m = require('../../src/main/shared-spaces-model');
const { syncDevice } = require('./support/sync-device');

const id = n => n.toString(16).padStart(32, '0');
const f = (v, c = 100, by = 'b') => ({ v, c, by });
const sid = id(99);
const tab = (n, c = 100, by = 'b', over = {}) => ({ nav: f({ url: 'https://example.test/' + n, title: 'T' + n }, c, by), name: f(null, c, by),
  pinned: f(false, c, by), groupId: f(null, c, by), pos: f(m.keyFor('', '', id(n)), c, by), deleted: f(false, c, by), ...over });
const blob = tabs => ({ v: 1, spaceId: sid, groups: {}, tabs });
const seal = text => encrypt(Buffer.alloc(32), text);
const plan = (fetched, local, pending = {}, extra = {}) => m.pushPlan({ fetchedBlob: fetched, fetchedVersion: fetched ? 'v1' : null, localBlob: local,
  pending, lastMergeAt: 50, now: 200, deviceId: 'a', encryptFn: seal, ...extra });
const entry = (rev, revAt, revBy) => ({ name: f('Work'), color: f('#426c4c'), symbol: f('briefcase'), pos: f(m.keyFor('', '', sid)), deleted: f(false),
  rev, ...(revAt === undefined ? {} : { revAt }), ...(revBy === undefined ? {} : { revBy }) });
const index = e => ({ v: 1, spaces: { [sid]: e } });

// ---- Finding 1: the revision hint ----

test('a newer revision hint replaces an older one whichever hash sorts first', () => {
  for (const [older, newer] of [['ffff000000000000', '0000ffffffffffff'], ['0000ffffffffffff', 'ffffffffffff0000']]) {
    const merged = m.mergeIndex(index(entry(older, 10, 'a')), index(entry(newer, 20, 'b')));
    assert.equal(merged.spaces[sid].rev, newer);
    assert.equal(merged.spaces[sid].revAt, 20);
    assert.deepEqual(m.mergeIndex(index(entry(newer, 20, 'b')), index(entry(older, 10, 'a'))), merged, 'commutative');
  }
});

test('revision ties break by writer then hash, and an unclocked hint ranks below a clocked one', () => {
  assert.equal(m.mergeIndex(index(entry('1111111111111111', 5, 'b')), index(entry('2222222222222222', 5, 'a'))).spaces[sid].rev, '2222222222222222');
  assert.equal(m.mergeIndex(index(entry('2222222222222222', 5, 'a')), index(entry('1111111111111111', 5, 'a'))).spaces[sid].rev, '1111111111111111');
  assert.equal(m.mergeIndex(index(entry('0000000000000000')), index(entry('ffffffffffffffff', 0, 'a'))).spaces[sid].rev, 'ffffffffffffffff');
});

test('revision merge stays associative across three writers', () => {
  const a = index(entry('aaaaaaaaaaaaaaaa', 3, 'x')), b = index(entry('bbbbbbbbbbbbbbbb', 9, 'y')), c = index(entry('cccccccccccccccc', 9, 'x'));
  const left = m.mergeIndex(m.mergeIndex(a, b), c), right = m.mergeIndex(a, m.mergeIndex(b, c));
  assert.deepEqual(left, right);
  assert.equal(left.spaces[sid].rev, 'cccccccccccccccc');
});

test('the upload receipt carries the clock and writer of the revision', () => {
  const p = plan(blob({}), blob({ [id(1)]: tab(1, 150, 'a') }), { tabs: { [id(1)]: tab(1, 150, 'a') } });
  assert.deepEqual(p.indexEntry, { id: sid, rev: p.upload.rev, at: 200, by: 'a' });
  const settled = m.settleUpload(p, {}, { blobStored: true });
  assert.deepEqual(settled.pending.index, p.indexEntry);
});

test('a reader holding an old hint adopts the newer one and fetches; the writer does not refetch its own blob', t => {
  const d = syncDevice({ fetch: async () => { throw new Error('unexpected HTTP'); } }), ctx = { accountId: d.record.accountId, deviceId: 'a', deviceName: 'Mac', platform: 'darwin' };
  t.after(() => d.dispose());
  const s = d.spaces;
  // This device last merged revision "0000…" from writer b.
  s.mergeIndex(index(entry('0000ffffffffffff', 10, 'b')), ctx);
  s.rebind(ctx.accountId).update(x => { x.blobs[sid] = { blob: blob({}), rev: '0000ffffffffffff', mergedAt: Date.now() }; });
  // Writer c then publishes a newer revision whose hash sorts after it.
  s.mergeIndex(index(entry('ffffffffffff0000', 20, 'c')), ctx);
  const st = s.rebind(ctx.accountId).data;
  assert.equal(st.index.spaces[sid].rev, 'ffffffffffff0000', 'the newer hint is adopted');
  assert.notEqual(st.index.spaces[sid].rev, st.blobs[sid].rev, 'so the Space is due for a fetch');
  // Our own upload: the stored revision follows it, and the published hint outranks c's.
  const local = blob({ [id(1)]: tab(1, 300, 'a') });
  s.noteLocalSpace(sid, local, { tabs: local.tabs }, ctx);
  const p = s.exportSpace(sid, blob({}), 'v', ctx, seal);
  s.settleSpace(sid, p, { blobStored: true }, ctx);
  assert.equal(s.rebind(ctx.accountId).data.blobs[sid].rev, p.upload.rev);
  s.rebind(ctx.accountId).update(x => { x.pending[sid].index.at = 5; }); // our clock runs behind c's
  s.mergeIndex(index(entry('ffffffffffff0000', 20, 'c')), ctx);
  const published = s.exportIndex(ctx).spaces[sid];
  assert.equal(published.rev, p.upload.rev);
  assert.ok(published.revAt > 20, 'bumped past the hint it replaces');
  s.settleIndex({ v: 1, spaces: { [sid]: published } }, ctx);
  const after = s.rebind(ctx.accountId).data;
  assert.equal(after.index.spaces[sid].revAt, published.revAt);
  assert.equal(after.index.spaces[sid].rev, after.blobs[sid].rev, 'no fetch of our own write');
  assert.equal(after.pending[sid].index, undefined);
});

// ---- Finding 2: relay ----

test('an upload relays a field this version does not know, unchanged', () => {
  const remote = blob({ [id(1)]: tab(1, 100, 'b', { muted: f(true, 100, 'b') }) });
  const local = blob({ [id(1)]: tab(1), [id(2)]: tab(2, 150, 'a') });
  const p = plan(remote, local, { tabs: { [id(2)]: tab(2, 150, 'a') } });
  assert.deepEqual(p.upload.blob.tabs[id(1)].muted, f(true, 100, 'b'));
  assert.equal(m.sanitizeBlob(p.mergedBlob).tabs[id(1)].muted, undefined, 'never part of the strict view');
});

test('an upload relays a record this version cannot display, including a newer value it cannot interpret', () => {
  const longUrl = 'https://example.test/' + 'x'.repeat(3000);
  const partial = tab(1); delete partial.name;                        // incomplete: no name field
  const newer = tab(2, 100, 'b', { nav: f({ url: longUrl, title: 'Long' }, 300, 'b') }); // URL longer than we accept
  const remote = blob({ [id(1)]: partial, [id(2)]: newer });
  const local = blob({ [id(2)]: tab(2, 100, 'b'), [id(3)]: tab(3, 150, 'a') });
  const p = plan(remote, local, { tabs: { [id(3)]: tab(3, 150, 'a') } });
  assert.deepEqual(p.upload.blob.tabs[id(1)], partial, 'the incomplete record is kept as received');
  assert.equal(p.upload.blob.tabs[id(2)].nav.v.url, longUrl, 'the newer value wins over our older one');
  assert.equal(p.mergedBlob.tabs[id(2)].nav.v.url, 'https://example.test/2', 'the window keeps what this version can show');
  assert.ok(p.upload.blob.tabs[id(3)]);
});

test('the same write keeps its original value rather than our normalized copy', () => {
  const title = 'T'.repeat(300);
  const remote = blob({ [id(1)]: tab(1, 100, 'b', { nav: f({ url: 'https://example.test/1', title }, 100, 'b') }) });
  const p = plan(remote, blob({ [id(2)]: tab(2, 150, 'a') }), { tabs: { [id(2)]: tab(2, 150, 'a') } });
  assert.equal(p.upload.blob.tabs[id(1)].nav.v.title.length, 300);
});

test('content relayed unchanged is not a change: no PUT and no endless rewrite', () => {
  const remote = blob({ [id(1)]: tab(1, 100, 'b', { muted: f(true, 100, 'b') }) });
  const p = plan(remote, m.sanitizeBlob(remote));
  assert.equal(p.upload, null);
  assert.deepEqual(p.pendingAfter, {});
});

test('a relayed newer value acknowledges our older pending write', () => {
  const remote = blob({ [id(1)]: tab(1, 100, 'b', { nav: f({ url: 'ftp://example.test/new', title: 'N' }, 400, 'b') }) });
  const ours = tab(1, 100, 'b', { nav: f({ url: 'https://example.test/old', title: 'O' }, 300, 'a') });
  const p = plan(remote, blob({ [id(1)]: ours }), { tabs: { [id(1)]: { nav: ours.nav } } });
  assert.equal(p.pendingAfter.tabs, undefined, 'beaten by the fetched value, so cleared');
  assert.equal(p.upload, null);
});

test('a record held remotely only in a form we cannot display is not recovered from a stale replica', () => {
  const partial = tab(1); delete partial.name;
  const p = plan(blob({ [id(1)]: partial }), blob({ [id(1)]: tab(1, 100, 'a') }), {}, { lastMergeAt: 1, now: m.LIMITS.tombstoneMs + 10 });
  assert.equal(p.recover.has(id(1)), false);
});

test('relay never brings back an expired tombstone or a record this pass expired', () => {
  const now = m.LIMITS.tombstoneMs + 500;
  const expiredRemote = tab(1, 100, 'b', { deleted: f(true, 100, 'b') });
  const p = plan(blob({ [id(1)]: expiredRemote, [id(2)]: tab(2) }), blob({ [id(2)]: tab(2) }), {}, { now, lastMergeAt: now - 1 });
  assert.equal(p.upload.blob.tabs[id(1)], undefined);
});

test('relay keeps junk out: bad ids, bad field names and malformed fields are not relayed', () => {
  const raw = blob({ [id(1)]: { ...tab(1), 'Bad-Name': f(1), __proto__x: f(1), weird: { v: 1 } }, nothex: tab(2) });
  const relayed = m.relayBlob(raw);
  assert.deepEqual(Object.keys(relayed.tabs), [id(1)]);
  assert.deepEqual(Object.keys(relayed.tabs[id(1)]).sort(), Object.keys(tab(1)).sort());
});

test('relayed content counts against the budget of the upload it travels in', () => {
  // The remote fits, and our strict view of it plus our new tabs would fit too;
  // only the relayed fields push the real payload over, so some of our tabs wait.
  const pad = 'p'.repeat(150 * 1024);
  const remote = blob({ [id(1)]: tab(1, 100, 'b', { note: f(pad) }), [id(2)]: tab(2, 100, 'b', { note: f(pad) }) });
  const filler = Object.fromEntries(Array.from({ length: 60 }, (_, n) => [id(10 + n), tab(10 + n, 160 + n, 'a',
    { nav: f({ url: 'https://example.test/' + 'z'.repeat(1900) + n, title: 'Z'.repeat(200) }, 160 + n, 'a') })]));
  const local = blob({ ...m.sanitizeBlob(remote).tabs, ...filler });
  assert.ok(m.blobFits(remote, seal) && m.blobFits(local, seal));
  const p = plan(remote, local, { tabs: filler });
  assert.ok(p.upload, 'what fits is uploaded');
  assert.ok(m.blobFits(p.upload.blob, seal), 'the finished payload fits');
  assert.ok(p.unsynced.size > 0 && p.unsynced.size < 60, 'some of our tabs wait');
  assert.equal(p.reason, 'full');
  for (const n of [1, 2]) assert.equal(p.upload.blob.tabs[id(n)].note.v.length, pad.length, 'relayed content is never trimmed to make room');
});

test('the index export relays an entry and a field it cannot interpret, and equals an unchanged remote', t => {
  const d = syncDevice({ fetch: async () => { throw new Error('unexpected HTTP'); } }), ctx = { accountId: d.record.accountId, deviceId: 'a', deviceName: 'Mac', platform: 'darwin' };
  t.after(() => d.dispose());
  const other = id(98), partial = entry('1111111111111111', 4, 'b'); delete partial.symbol;
  const remote = { v: 1, spaces: { [sid]: { ...entry('2222222222222222', 4, 'b'), emoji: f('🙂') }, [other]: partial } };
  d.spaces.mergeIndex(remote, ctx);
  const exported = d.spaces.exportIndex(ctx);
  assert.deepEqual(exported.spaces[sid].emoji, f('🙂'));
  assert.deepEqual(exported.spaces[other], partial);
  assert.equal(d.spaces.equals(exported, remote), true, 'no PUT for an unchanged index');
  assert.equal(d.spaces.exportIndex(ctx).spaces[other], undefined, 'a second export with no fetch in between relays nothing stale');
});

// ---- Finding 3: the tombstone reason ----

test('"closed tabs free their room" is given only when their expiry would make the change fit', () => {
  const room = 520192;
  const sized = budget => text => ({ ct: 'x'.repeat(Math.max(0, budget(JSON.parse(text)))) });
  const remote = blob({ [id(1)]: tab(1, 100, 'b', { deleted: f(true, 150, 'b') }), [id(2)]: tab(2) });
  const local = blob({ ...remote.tabs, [id(3)]: tab(3, 300, 'a') });
  const pending = { tabs: { [id(3)]: tab(3, 300, 'a') } };
  // Over budget only while the tombstone is present: expiry would make room.
  const freed = m.pushPlan({ fetchedBlob: remote, fetchedVersion: 'v', localBlob: local, pending, lastMergeAt: 50, now: 400, deviceId: 'a',
    encryptFn: sized(b => (Object.keys(b.tabs).length >= 3 && Object.values(b.tabs).some(t => t.deleted.v) ? room + 10 : 10)) });
  assert.equal(freed.reason, 'tombstones');
  // Over budget with or without it: expiry would not help.
  const full = m.pushPlan({ fetchedBlob: remote, fetchedVersion: 'v', localBlob: local, pending, lastMergeAt: 50, now: 400, deviceId: 'a',
    encryptFn: sized(b => (b.tabs[id(3)] ? room + 10 : 10)) });
  assert.equal(full.reason, 'full');
});
