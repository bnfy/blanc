'use strict';

// The /bangs page's logic: the directory's rows and search, the featured
// cards and the icon tiles, all against the pinned data.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/bangs.json'), 'utf8'));
const directory = () => import('../../site/src/scripts/bangs-directory.mjs');

test('directoryRows derives the opened host and the engine tag', async () => {
  const { directoryRows } = await directory();
  const rows = directoryRows(data);
  assert.equal(rows.length, 10624);
  const ubuntufr = rows.find((row) => row.code === 'ubuntufr');
  assert.equal(ubuntufr.via, 'Google');
  assert.equal(ubuntufr.host, 'www.google.fr');
  assert.equal(rows.find((row) => row.code === 'yt').via, null);
});

test('directoryRows sorts the whole list without stalling the page', async () => {
  // A collator per comparison took ~290 ms on a fast Mac; one shared takes ~15.
  // Timing it flaked on slow CI runners (166–376 ms on hosted Intel Macs), so
  // check the cause instead: sorting builds no collator and never falls back
  // to String#localeCompare, which makes one per call.
  const { directoryRows } = await directory();
  const RealCollator = Intl.Collator;
  const realLocaleCompare = String.prototype.localeCompare;
  let collators = 0;
  let localeCompares = 0;
  Intl.Collator = function Collator(...args) { collators += 1; return new RealCollator(...args); };
  String.prototype.localeCompare = function localeCompare(...args) { localeCompares += 1; return realLocaleCompare.apply(this, args); };
  try {
    directoryRows(data);
  } finally {
    Intl.Collator = RealCollator;
    String.prototype.localeCompare = realLocaleCompare;
  }
  assert.equal(collators, 0, 'no collator per call');
  assert.equal(localeCompares, 0, 'no localeCompare per comparison');
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

test("featuredCards follows the app's popular list", async () => {
  const { featuredCards } = await directory();
  const cards = featuredCards(data);
  assert.equal(cards.length, 19);
  assert.deepEqual(cards.map((card) => card.code), data.popular);
  const w = cards.find((card) => card.code === 'w');
  assert.equal(w.name, 'Wikipedia');
  assert.equal(w.host, 'wikipedia.org');
  assert.equal(w.codes[0], 'w');
  for (const card of cards) {
    assert.ok(card.codes.length >= 1 && card.codes.length <= 3, card.code);
    assert.equal(new Set(card.codes).size, card.codes.length, `${card.code} repeats a code`);
  }
  assert.equal(cards.find((card) => card.code === 'yt').codes[0], 'yt');
});

test('iconTile is stable and readable', async () => {
  const { iconTile } = await directory();
  const youtube = iconTile('www.youtube.com', 'YouTube');
  assert.equal(youtube.letter, 'Y');
  assert.deepEqual(iconTile('www.youtube.com', 'YouTube'), youtube);
  assert.equal(iconTile('example.org', '_ Blender').letter, 'B');
  assert.equal(iconTile('9gag.com', '9GAG').letter, '9');
  const tones = new Set();
  for (const entry of data.entries) {
    const { tone } = iconTile(entry[3], entry[2]);
    assert.ok(Number.isInteger(tone) && tone >= 0 && tone <= 5, entry[3]);
    tones.add(tone);
  }
  assert.ok(tones.size >= 5, `only ${tones.size} tones occur`);
});

test('iconUrl keeps the host as the path', async () => {
  const { iconUrl } = await directory();
  assert.equal(iconUrl('maps.google.com'), '/bang-icons/maps.google.com');
});
