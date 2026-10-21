'use strict';

// The /bangs page's two pieces of logic: the directory's search and the
// try-it box's answer. Both run against the pinned data and the pinned copy
// of the app's own bangs.js, so the box answers as the app does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/bangs.json'), 'utf8'));
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'site/src/scripts/bangs.js'), 'utf8'), sandbox);
const Bangs = sandbox.window.Bangs;
const directory = () => import('../../site/src/scripts/bangs-directory.mjs');
const tryit = () => import('../../site/src/scripts/bangs-tryit.mjs');
const plain = (value) => JSON.parse(JSON.stringify(value));

async function describe(text) {
  const { describeTryIt } = await tryit();
  return plain(describeTryIt(text, Bangs, data.entries, data.popular, data.labels));
}

test('a known bang with words gives the hint row and the address', async () => {
  const r = await describe('!yt lofi');
  assert.equal(r.kind, 'bang');
  assert.deepEqual(r.hint, { code: 'yt', title: 'Search YouTube for “lofi”', url: 'https://www.youtube.com/results?search_query=lofi' });
  assert.deepEqual(r.sections, []);
});

test('the hint shows the primary code, as the app does, and a trailing bang works', async () => {
  assert.equal((await describe('!w golden retriever')).hint.code, 'wikipedia');
  assert.equal((await describe('lofi !yt')).hint.url, 'https://www.youtube.com/results?search_query=lofi');
});

test('a bare known code opens the site and lists the longer codes', async () => {
  const r = await describe('!yt');
  assert.equal(r.hint.title, 'Open YouTube');
  assert.equal(r.hint.url, 'https://www.youtube.com/');
  const all = r.sections.find((s) => s.section === 'all');
  assert.ok(all && all.rows.length > 0 && all.count === all.rows.length);
  assert.ok(all.rows.every((row) => row.code !== 'yt'), 'the exact code is the hint, not a picker row');
});

test('! alone lists every popular bang; a known prefix keeps its hint', async () => {
  const picker = await describe('!');
  assert.equal(picker.kind, 'picker');
  assert.deepEqual(picker.sections.map((s) => [s.section, s.count]), [['popular', 19]]);
  const y = await describe('!y');
  assert.equal(y.kind, 'bang');
  assert.ok(y.sections.length > 0);
});

test('unknown codes, and text that is not a bang, are told apart', async () => {
  assert.equal((await describe('!zzzq')).kind, 'unknown-code');
  assert.equal((await describe('!zzzq words')).kind, 'unknown-code');
  for (const text of ['github.com', '/sleep', 'plain words']) assert.equal((await describe(text)).kind, 'other', text);
  for (const text of ['', '   ']) assert.equal((await describe(text)).kind, 'empty', JSON.stringify(text));
});

test('the hint and section labels are the pinned app copy, filled in literally', async () => {
  const { describeTryIt } = await tryit();
  const labels = { search: 'Find {query} on {site}', open: 'Go to {site}', popular: 'Popular', all: 'All bangs' };
  const ask = (text) => plain(describeTryIt(text, Bangs, data.entries, data.popular, labels));
  assert.equal(ask('!yt lofi').hint.title, 'Find lofi on YouTube');
  assert.equal(ask('!yt $& $1').hint.title, 'Find $& $1 on YouTube');
  assert.equal(ask('!yt').hint.title, 'Go to YouTube');
  assert.deepEqual(ask('!').sections.map((s) => s.label), ['Popular']);
  assert.ok(ask('!yt').sections.some((s) => s.label === 'All bangs'));
});

test('pasted whitespace collapses and long input is capped at 200 characters', async () => {
  assert.equal((await describe('!yt\tlo\nfi')).hint.title, 'Search YouTube for “lo fi”');
  const long = '!yt ' + 'a'.repeat(10000);
  const started = Date.now();
  const r = await describe(long);
  assert.ok(Date.now() - started < 50);
  assert.equal(r.hint.title.length < 230, true);
  assert.ok(decodeURIComponent(new URL(r.hint.url).searchParams.get('search_query')).length <= 196);
});

test('directoryRows derives the opened host and the engine tag', async () => {
  const { directoryRows } = await directory();
  const rows = directoryRows(data);
  assert.equal(rows.length, 10624);
  const ubuntufr = rows.find((row) => row.code === 'ubuntufr');
  assert.equal(ubuntufr.via, 'Google');
  assert.equal(ubuntufr.host, 'www.google.fr');
  assert.equal(rows.find((row) => row.code === 'yt').via, null);
});

test('directoryRows reuses one collator and sorts the complete directory', () => {
  // Guard the expensive per-comparison construction regression directly.
  // Shared CI CPU contention is not a reliable wall-clock performance oracle.
  let constructions = 0;
  let comparisons = 0;
  const context = {
    URL,
    Intl: {
      Collator: function (...args) {
        constructions++;
        const collator = new Intl.Collator(...args);
        return { compare(a, b) { comparisons++; return collator.compare(a, b); } };
      },
    },
  };
  const source = fs.readFileSync(path.join(ROOT, 'site/src/scripts/bangs-directory.mjs'), 'utf8');
  vm.runInNewContext(source.replace(/^export /gm, ''), context);
  const expected = new Intl.Collator('en', { sensitivity: 'base', ignorePunctuation: true });
  for (let pass = 0; pass < 2; pass++) {
    comparisons = 0;
    const rows = context.directoryRows(data);
    assert.equal(rows.length, data.entries.length);
    assert.deepEqual(rows.map((row) => row.code).sort(), data.entries.map(([code]) => code).sort());
    for (let i = 1; i < rows.length; i++) {
      const before = rows[i - 1], after = rows[i];
      const order = expected.compare(before.name, after.name);
      assert.ok(order < 0 || (order === 0 && before.code <= after.code));
    }
    assert.ok(comparisons > 0, 'the shared collator actually compares names');
    assert.ok(comparisons < 4 * rows.length * Math.ceil(Math.log2(rows.length)),
      'comparison work stays within a generous n log n bound');
    assert.equal(constructions, 1, 'reuse the collator across comparisons and calls');
  }
});

test('filterBangs finds a bang by site or by code, literally', async () => {
  const { directoryRows, filterBangs } = await directory();
  const rows = directoryRows(data);
  const codes = (query) => filterBangs(rows, query).map((row) => row.code);
  assert.equal(codes('youtube')[0], 'yt');
  assert.equal(codes('yt')[0], 'yt');
  assert.ok(codes('yt').indexOf('yt') < codes('yt').indexOf('ytl'), 'shorter codes first');
  assert.deepEqual(codes('!yt'), codes('yt'));
  assert.deepEqual(codes('YouTube'), codes('youtube'));
  assert.ok(codes('amazon.com').includes('a'));
  for (const odd of ['c++', '(', '.*']) assert.doesNotThrow(() => filterBangs(rows, odd), odd);
  assert.equal(filterBangs(rows, '').length, rows.length);
});

test('directory order ignores leading punctuation in site names', async () => {
  const { directoryRows } = await directory();
  const rows = directoryRows(data);
  assert.match(rows[0].name, /^[0-9a-z]/i, `first row is ${rows[0].name}`);
  const index = (code) => rows.findIndex((row) => row.code === code);
  const firstB = rows.findIndex((row) => /^b/i.test(row.name));
  const blender = rows.findIndex((row) => row.name === '_ Blender Stack Exchange');
  assert.ok(blender > firstB, '_ Blender Stack Exchange sorts with the B names');
  assert.ok(index('yt') > 0);
});
