'use strict';

// bangs/build.mjs turns Kagi's bang list into the catalog the Island and
// main share. These tests pin the transform rules the design fixes
// (docs/superpowers/specs/2026-10-16-bangs-design.md, "The data").

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const load = () => import('../../bangs/build.mjs');

test('transformEntry rewrites the placeholder and derives encoding and home', async () => {
  const { transformEntry } = await load();
  const yt = transformEntry({
    s: 'YouTube', d: 'www.youtube.com', t: 'yt', ts: ['ytb', 'a.b'],
    u: 'https://www.youtube.com/results?search_query={{{s}}}',
  }, { excluded: {} });
  assert.deepEqual(yt.entry, ['yt', ['ytb'], 'YouTube', 'www.youtube.com',
    'https://www.youtube.com/results?search_query=%s', 3, 'https://www.youtube.com/']);
});

test('fmt flags change encoding and home', async () => {
  const { transformEntry } = await load();
  const e = transformEntry({ s: 'X', d: 'x.org', t: 'x', u: 'https://x.org/s/{{{s}}}', fmt: ['open_base_path'] }, { excluded: {} });
  assert.equal(e.entry[5], 0); // fmt present without url_encode_* → no encoding
  assert.equal(e.entry[6], 'https://x.org/');
  const snap = transformEntry({
    s: 'Y', d: 'y.org', ad: 'real.example', t: 'y', u: 'https://y.org/?q={{{s}}}',
    fmt: ['open_snap_domain', 'open_base_path', 'url_encode_placeholder'],
  }, { excluded: {} });
  assert.equal(snap.entry[5], 1);
  assert.equal(snap.entry[6], 'https://real.example/'); // snap domain wins over base path
  assert.ok(transformEntry({
    s: 'B', d: 'b.org', ad: 'javascript:alert(1)', t: 'b', u: 'https://b.org/?q={{{s}}}', fmt: ['open_snap_domain'],
  }, { excluded: {} }).dropped);
});

test('codes and aliases are lowercased', async () => {
  const { transformEntry } = await load();
  const e = transformEntry({ s: 'Up', d: 'up.org', t: 'UP', ts: ['Upper'], u: 'https://up.org/?q={{{s}}}' }, { excluded: {} });
  assert.deepEqual([e.entry[0], e.entry[1]], ['up', ['upper']]);
});

test('drops regex, dotted codes, non-https, host placeholders and excluded', async () => {
  const { transformEntry } = await load();
  const base = { s: 'Z', d: 'z.org', t: 'z', u: 'https://z.org/?q={{{s}}}' };
  assert.ok(transformEntry({ ...base, x: '(.*)' }, { excluded: {} }).dropped);
  assert.ok(transformEntry({ ...base, t: 'a.b' }, { excluded: {} }).dropped);
  assert.ok(transformEntry({ ...base, u: 'http://z.org/?q={{{s}}}' }, { excluded: {} }).dropped);
  assert.ok(transformEntry({ ...base, u: 'https://{{{s}}}.z.org/' }, { excluded: {} }).dropped);
  assert.ok(transformEntry(base, { excluded: { z: 'test' } }).dropped);
  // An excluded alias drops only that alias.
  const partial = transformEntry({ ...base, ts: ['zz', 'zzz'] }, { excluded: { zz: 'test' } });
  assert.deepEqual(partial.entry[1], ['zzz']);
});

test('generated catalog is current', async () => {
  const { generate } = await load();
  assert.equal(generate(), fs.readFileSync(path.join(ROOT, 'src/renderer/pages/bangs-catalog.js'), 'utf8'));
});

test('generated catalog loads as a module and exposes well-formed entries', () => {
  const catalog = require('../../src/renderer/pages/bangs-catalog.js');
  assert.ok(Array.isArray(catalog) && catalog.length > 9000);
  for (const entry of catalog) {
    assert.equal(entry.length, 7);
    assert.match(entry[0], /^[a-z0-9][a-z0-9_-]{0,31}$/);
    assert.ok(entry[4].includes('%s'));
    assert.equal(new URL(entry[6]).href, entry[6]); // normalized
    assert.match(entry[6], /^https?:\/\//);
  }
});
