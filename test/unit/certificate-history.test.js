'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  emptyEntryMarks, freshCertificateRecord, commitEntryMarks, cloneEntryMarks,
} = require('../../src/main/certificate-history');

const cert = { subject: 'nas', issuer: 'nas', validFrom: 1, validTo: 2, fingerprint: 'sha256/AAA' };
const ORIGIN = 'https://nas.home.arpa:443';
const MARK = { origin: ORIGIN, certificate: cert };
const A = 'https://nas.home.arpa/one';
const B = 'https://nas.home.arpa/two';
const C = 'https://nas.home.arpa/three';

function commit(prior, entryUrls, activeIndex, freshRecord = null) {
  return commitEntryMarks(prior, { entryUrls, activeIndex, committedUrl: entryUrls[activeIndex], freshRecord });
}

test('fresh record: pending for the committed origin, else a stored exception, else nothing', () => {
  assert.deepEqual(freshCertificateRecord({ committedUrl: A, pending: { url: B, certificate: cert }, stored: null }), MARK);
  assert.deepEqual(freshCertificateRecord({ committedUrl: A, pending: null, stored: { certificate: cert } }), MARK);
  assert.equal(freshCertificateRecord({ committedUrl: A, pending: { url: 'https://10.0.0.1/', certificate: cert }, stored: null }), null);
  assert.equal(freshCertificateRecord({ committedUrl: 'blanc://error/?x', pending: { url: A, certificate: cert }, stored: { certificate: cert } }), null);
});

test('a trusted same-host load gets its own entry; Back restores the unsafe entry and Forward does not', () => {
  let r = commit(emptyEntryMarks(), [A], 0, MARK);
  assert.deepEqual(r.record, MARK);
  r = commit(r.state, [A, B], 1);                // new trusted load, same host
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks, [MARK, null]);
  r = commit(r.state, [A, B], 0);                // Back (traversal, no request)
  assert.deepEqual(r.record, MARK);
  r = commit(r.state, [A, B], 1);                // Forward
  assert.equal(r.record, null);
});

test('a new load from the middle replaces forward entries and their marks', () => {
  let r = commit(emptyEntryMarks(), [A], 0);
  r = commit(r.state, [A, B], 1, MARK);
  r = commit(r.state, [A, B], 0);                // Back to A
  r = commit(r.state, [A, C], 1);                // new load replaces B
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks, [null, null]);
});

test('reload and replace at the same index recompute instead of inheriting', () => {
  let r = commit(emptyEntryMarks(), [A], 0, MARK);
  r = commit(r.state, [A], 0);                   // reload after Stop allowing
  assert.equal(r.record, null);
});

test('ambiguous: a new load of the URL already in the forward slot keeps its mark', () => {
  let r = commit(emptyEntryMarks(), [A], 0);
  r = commit(r.state, [A, B], 1, MARK);
  r = commit(r.state, [A, B], 0);
  r = commit(r.state, [A, B], 1);                // Forward, or a new load of B
  assert.deepEqual(r.record, MARK, 'fails toward Not secure');
});

test('front pruning at the entry cap realigns marks by one position', () => {
  const urls = Array.from({ length: 50 }, (_, i) => `https://site${i}.test/`);
  const marked = 'https://nas.home.arpa/p10';
  urls[10] = marked;
  const prior = { urls, marks: urls.map((u) => (u === marked ? MARK : null)), index: 49 };
  const next = [...urls.slice(1), 'https://site50.test/'];
  const r = commit(prior, next, 49);
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks[9], MARK);
  assert.equal(r.state.marks.filter(Boolean).length, 1);
});

test('an unresolvable history marks every entry of a marked origin', () => {
  const prior = { urls: [A, 'https://other.test/'], marks: [MARK, null], index: 1 };
  const r = commit(prior, ['https://x.test/', C, 'https://y.test/'], 2);
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks, [null, MARK, null]);
});

test('clone copies arrays so a closed entry and a live tab never share state', () => {
  const r = commit(emptyEntryMarks(), [A], 0, MARK);
  const copy = cloneEntryMarks(r.state);
  copy.marks[0] = null;
  assert.deepEqual(r.state.marks[0], MARK);
  assert.deepEqual(cloneEntryMarks(null), emptyEntryMarks());
});
