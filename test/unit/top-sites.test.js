'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_TITLE_LENGTH, rankTopSites, siteKey } = require('../../src/main/top-sites');

test('top sites collapse visits by hostname and rank count before recency', () => {
  const sites = rankTopSites([
    { url: 'https://www.alpha.example/latest', title: 'Alpha latest', visitedAt: 60 },
    { url: 'https://beta.example/two', title: 'Beta two', visitedAt: 50 },
    { url: 'https://alpha.example/older', title: 'Alpha older', visitedAt: 40 },
    { url: 'https://beta.example/one', title: 'Beta one', visitedAt: 30 },
    { url: 'https://alpha.example/oldest', title: 'Alpha oldest', visitedAt: 20 },
    { url: 'https://gamma.example/', title: 'Gamma', visitedAt: 70 },
  ]);

  assert.deepEqual(sites.slice(0, 3), [
    {
      key: 'alpha.example',
      url: 'https://www.alpha.example/latest',
      title: 'Alpha latest',
      visitCount: 3,
    },
    {
      key: 'beta.example',
      url: 'https://beta.example/two',
      title: 'Beta two',
      visitCount: 2,
    },
    {
      key: 'gamma.example',
      url: 'https://gamma.example/',
      title: 'Gamma',
      visitCount: 1,
    },
  ]);
});

test('top sites reject non-web and malformed records and use recency for ties', () => {
  const sites = rankTopSites([
    { url: 'blanc://settings/', title: 'Settings', visitedAt: 100 },
    { url: 'not a url', title: 'Broken', visitedAt: 100 },
    { url: 'https://newer.example/', title: '', visitedAt: 90 },
    { url: 'https://older.example/', title: 'Older', visitedAt: 80 },
  ], { limit: 1 });

  assert.deepEqual(sites, [{
    key: 'newer.example',
    url: 'https://newer.example/',
    title: 'newer.example',
    visitCount: 1,
  }]);
  assert.equal(siteKey('http://www.Example.com/path'), 'example.com');
  assert.equal(siteKey('http://[::1]/path'), '[::1]');
  assert.equal(siteKey('http://foo_bar/path'), 'foo_bar');
  assert.equal(siteKey('file:///tmp/a'), null);
});

test('top sites retain useful local page titles while bounding renderer data', () => {
  const longTitle = `Example Domain ${'details '.repeat(30)}`;
  const [site] = rankTopSites([
    { url: 'https://example.com/', title: longTitle, visitedAt: 1 },
  ]);

  assert.equal(site.title, longTitle.trim().slice(0, MAX_TITLE_LENGTH));
  assert.notEqual(site.title, 'example');
});

test('top sites support bounded pagination without repeating candidates', () => {
  const entries = Array.from({ length: 60 }, (_, index) => ({
    url: `https://site-${String(index).padStart(2, '0')}.example/`,
    title: `Site ${index}`,
    visitedAt: 100 - index,
  }));

  const first = rankTopSites(entries, { limit: 48 });
  const second = rankTopSites(entries, { limit: 48, offset: first.length });
  assert.equal(first.length, 48);
  assert.equal(second.length, 12);
  assert.equal(second[0].key, 'site-48.example');
  assert.equal(new Set([...first, ...second].map((site) => site.key)).size, 60);
});
