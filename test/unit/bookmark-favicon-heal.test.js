'use strict';

// Favorites were showing letter tiles because their favicon record was null,
// not because a renderer forgot to paint one. The store could only be written
// by a favicon event whose URL matched the favorite EXACTLY, so a dashboard
// that redirects (favorite the short URL, icon resolves on the long one) never
// got its icon, and a settled page never emits a second event to try again.

const assert = require('node:assert/strict');
const test = require('node:test');
const { applyFaviconUpdate } = require('../../src/main/bookmark-data');

const PNG = 'data:image/png;base64,AAAA';
const OTHER = 'data:image/png;base64,BBBB';
const fav = (url, favicon = null) => ({ id: url, url, title: url, favicon });

test('an exact URL match sets the icon', () => {
  const items = [fav('https://a.example/x')];
  const out = applyFaviconUpdate(items, { url: 'https://a.example/x', favicon: PNG });
  assert.equal(out.changed, true);
  assert.equal(out.items[0].favicon, PNG);
  assert.equal(items[0].favicon, null, 'input must not be mutated');
});

test('an exact URL match is authoritative enough to CLEAR', () => {
  const out = applyFaviconUpdate([fav('https://a.example/x', PNG)], {
    url: 'https://a.example/x', favicon: null,
  });
  assert.equal(out.changed, true);
  assert.equal(out.items[0].favicon, null);
});

test('a same-origin favorite with no icon is filled — the redirect case', () => {
  // Favorited the short URL; the icon resolved on the redirect target.
  const out = applyFaviconUpdate([fav('https://search.google.com/')], {
    url: 'https://search.google.com/search-console/inspect?resource_id=x',
    favicon: PNG,
  });
  assert.equal(out.changed, true);
  assert.equal(out.items[0].favicon, PNG);
});

test('a same-origin favorite that ALREADY has an icon is never replaced', () => {
  const out = applyFaviconUpdate([fav('https://a.example/one', OTHER)], {
    url: 'https://a.example/two', favicon: PNG,
  });
  assert.equal(out.changed, false);
  assert.equal(out.items[0].favicon, OTHER);
});

test('a null update never travels across the origin — it cannot erase', () => {
  // A page in the origin declaring no favicon must not wipe a good stored icon,
  // which is the ratchet that emptied these records in the first place.
  const out = applyFaviconUpdate([fav('https://a.example/one', PNG)], {
    url: 'https://a.example/two', favicon: null,
  });
  assert.equal(out.changed, false);
  assert.equal(out.items[0].favicon, PNG);
});

test('a different origin is never touched', () => {
  const out = applyFaviconUpdate([fav('https://b.example/x')], {
    url: 'https://a.example/x', favicon: PNG,
  });
  assert.equal(out.changed, false);
});

test('http and https are different origins', () => {
  const out = applyFaviconUpdate([fav('http://a.example/x')], {
    url: 'https://a.example/x', favicon: PNG,
  });
  assert.equal(out.changed, false, 'scheme is part of the origin');
});

test('an unparseable favorite URL is skipped, not crashed on', () => {
  const out = applyFaviconUpdate([fav('not a url'), fav('https://a.example/x')], {
    url: 'https://a.example/y', favicon: PNG,
  });
  assert.equal(out.changed, true);
  assert.equal(out.items[0].favicon, null);
  assert.equal(out.items[1].favicon, PNG);
});

test('no matching favorite reports unchanged so the store never writes', () => {
  const out = applyFaviconUpdate([], { url: 'https://a.example/x', favicon: PNG });
  assert.equal(out.changed, false);
});

test('re-applying the same icon reports unchanged', () => {
  const out = applyFaviconUpdate([fav('https://a.example/x', PNG)], {
    url: 'https://a.example/x', favicon: PNG,
  });
  assert.equal(out.changed, false, 'idempotent — no needless store write or fsync');
});
