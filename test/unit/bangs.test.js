'use strict';

// src/renderer/pages/bangs.js: the pure bang parser, resolver and picker
// matcher shared by main and the overlay (spec:
// docs/superpowers/specs/2026-10-16-bangs-design.md, "The module").

const test = require('node:test');
const assert = require('node:assert/strict');

const Bangs = require('../../src/renderer/pages/bangs.js');
const { parseBang, resolveBang, matchBangs, findBang, encodeQuery, isBangCode } = Bangs;

const cat = [
  ['yt', ['ytb', 'watch'], 'YouTube', 'www.youtube.com', 'https://www.youtube.com/results?search_query=%s', 3, 'https://www.youtube.com/'],
  ['y', [], 'Yahoo', 'yahoo.com', 'https://search.yahoo.com/search?p=%s', 3, 'https://yahoo.com/'],
  ['ytm', [], 'YouTube Music', 'music.youtube.com', 'https://music.youtube.com/search?q=%s', 3, 'https://music.youtube.com/'],
  ['ytmusic2', [], 'YouTube Music Two', 'two.example', 'https://two.example/?q=%s', 3, 'https://two.example/'],
  ['raw', [], 'Raw', 'raw.org', 'https://raw.org/%s', 0, 'https://raw.org/'],
  ['w', [], 'Wikipedia', 'wikipedia.org', 'https://en.wikipedia.org/wiki/Special:Search?search=%s', 3, 'https://wikipedia.org/'],
];

test('isBangCode is anchored to the whole string', () => {
  for (const ok of ['yt', 'x_1-2', 'a', '0']) assert.equal(isBangCode(ok), true, ok);
  for (const bad of ['yt q', 'bad code', 'a.b', '_x', '-x', '', 'a'.repeat(33), 'yt\n', 1, null]) {
    assert.equal(isBangCode(bad), false, String(bad));
  }
});

test('parseBang finds a code at the start', () => {
  assert.deepEqual(parseBang('!yt lofi'), { code: 'yt', query: 'lofi', position: 'start' });
  assert.deepEqual(parseBang('  !yt   lofi beats  '), { code: 'yt', query: 'lofi beats', position: 'start' });
  assert.equal(parseBang('!YT lofi').code, 'yt');
  assert.equal(parseBang('!x_1-2 q').code, 'x_1-2');
  assert.deepEqual(parseBang('!yt'), { code: 'yt', query: '', position: 'start' });
});

test('parseBang finds a code at the end', () => {
  assert.deepEqual(parseBang('lofi !yt'), { code: 'yt', query: 'lofi', position: 'end' });
  assert.equal(parseBang('lofi\t!yt').position, 'end');
  assert.equal(parseBang('lofi\n!yt').position, 'end');
});

test('the first token wins', () => {
  assert.deepEqual(parseBang('!w cats !yt'), { code: 'w', query: 'cats !yt', position: 'start' });
});

test('parseBang rejects what is not a bang', () => {
  for (const text of ['hello!', '5!', '!', '! yt', 'a !yt b', '!a.b x', '!' + 'a'.repeat(33), '!_x', '', '   ', 'plain words']) {
    assert.equal(parseBang(text), null, JSON.stringify(text));
  }
  assert.equal(parseBang(undefined), null);
});

test('encodeQuery honors the encoding bits', () => {
  assert.equal(encodeQuery('a b&c', 3), 'a+b%26c');
  assert.equal(encodeQuery('a b&c', 1), 'a%20b%26c');
  assert.equal(encodeQuery('a b', 0), 'a b');
  assert.equal(encodeQuery('a b', 2), 'a+b');
});

test('resolveBang builds the site URL from the catalog', () => {
  assert.deepEqual(resolveBang('!yt lofi beats', cat, []), {
    url: 'https://www.youtube.com/results?search_query=lofi+beats',
    name: 'YouTube', code: 'yt', query: 'lofi beats',
  });
  assert.equal(resolveBang('!ytb x', cat, []).code, 'yt');
  assert.equal(resolveBang('!yt', cat, []).url, 'https://www.youtube.com/');
  assert.equal(resolveBang('!raw a b', cat, []).url, 'https://raw.org/a b');
  assert.equal(resolveBang('!yt foo.html', cat, []).query, 'foo.html');
  assert.equal(resolveBang('lofi !yt', cat, []).url, 'https://www.youtube.com/results?search_query=lofi');
});

test('resolveBang returns null for unknown codes and plain text', () => {
  assert.equal(resolveBang('!zzz x', cat, []), null);
  assert.equal(resolveBang('!important css', cat, []), null);
  assert.equal(resolveBang('lofi', cat, []), null);
});

test('custom bangs win over the catalog, code and alias alike', () => {
  const mine = { code: 'yt', name: 'Mine', template: 'https://mine.example/?s=%s' };
  assert.equal(resolveBang('!yt q', cat, [mine]).url, 'https://mine.example/?s=q');
  assert.equal(resolveBang('!yt q', cat, [mine]).name, 'Mine');
  const shadowAlias = { code: 'ytb', name: 'Shadow', template: 'https://shadow.example/?s=%s' };
  assert.equal(resolveBang('!ytb q', cat, [shadowAlias]).url, 'https://shadow.example/?s=q');
  assert.equal(resolveBang('!yt q', cat, [shadowAlias]).url, 'https://www.youtube.com/results?search_query=q');
});

test('custom bangs encode with the defaults and open their origin when empty', () => {
  const loc = { code: 'loc', name: 'L', template: 'http://10.0.0.5:8080/s?q=%s' };
  assert.equal(resolveBang('!loc', cat, [loc]).url, 'http://10.0.0.5:8080/');
  assert.equal(resolveBang('!loc a b&c', cat, [loc]).url, 'http://10.0.0.5:8080/s?q=a+b%26c');
});

test('findBang resolves aliases to the primary entry', () => {
  assert.equal(findBang('ytb', cat, []).code, 'yt');
  assert.equal(findBang('YT', cat, []).name, 'YouTube');
  assert.equal(findBang('nope', cat, []), null);
  assert.equal(findBang('yt', cat, [{ code: 'yt', name: 'Mine', template: 'https://m.example/?q=%s' }]).custom, true);
  assert.equal(findBang('yt', cat, []).custom, false);
});

test('matchBangs with an empty prefix lists recent then popular only', () => {
  const rows = matchBangs('', cat, [], ['ytm'], ['yt', 'y']);
  assert.deepEqual(rows.map((r) => [r.section, r.code]), [['recent', 'ytm'], ['popular', 'yt'], ['popular', 'y']]);
  assert.equal(rows[0].name, 'YouTube Music');
  assert.equal(rows[0].domain, 'music.youtube.com');
  assert.equal(rows[0].custom, false);
});

test('matchBangs filters by code prefix, leaving out the exact match and duplicates', () => {
  const rows = matchBangs('y', cat, [], [], ['ytm']);
  assert.deepEqual(rows.map((r) => [r.section, r.code]), [['popular', 'ytm'], ['all', 'yt'], ['all', 'ytmusic2']]);
});

test('matchBangs orders shorter codes first, then alphabetically', () => {
  const rows = matchBangs('yt', cat, [], [], []);
  assert.deepEqual(rows.map((r) => r.code), ['ytm', 'ytmusic2']);
});

test('matchBangs matches site names by substring after codes', () => {
  const rows = matchBangs('tube', cat, [], [], []);
  assert.deepEqual(rows.map((r) => r.code), ['yt', 'ytm', 'ytmusic2']);
});

test('matchBangs caps at eight rows', () => {
  const big = Array.from({ length: 20 }, (_, i) => [`z${i}`, [], `Z ${i}`, `z${i}.org`, `https://z${i}.org/?q=%s`, 3, `https://z${i}.org/`]);
  assert.equal(matchBangs('z', big, [], [], []).length, 8);
});

test('matchBangs lists custom bangs with their template host', () => {
  const rows = matchBangs('min', cat, [{ code: 'mine', name: 'Mine', template: 'https://search.mine.example/?q=%s' }], [], []);
  assert.deepEqual(rows.map((r) => [r.section, r.code, r.custom, r.domain]), [['all', 'mine', true, 'search.mine.example']]);
});

test('matchBangs matches aliases but shows the primary code', () => {
  assert.deepEqual(matchBangs('wat', cat, [], [], []).map((r) => r.code), ['yt']);
  // An exact alias is the hint row's job, so the picker leaves it out.
  assert.deepEqual(matchBangs('ytb', cat, [], [], []).map((r) => r.code), []);
});
