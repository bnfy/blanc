'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ZOOM_STEPS, DEFAULT_ZOOM_OPTIONS, normalizePageZoom, percentToLevel, levelToPercent,
  nextZoomPercent, siteKeyFor, usesDefaultZoom, resolveZoomPercent, legacyZoomSites,
} = require('../../src/main/page-zoom');

test('every default option is a step, and 100 can be reached from each', () => {
  for (const option of DEFAULT_ZOOM_OPTIONS) {
    assert.ok(ZOOM_STEPS.includes(option));
    let percent = option;
    const direction = option < 100 ? 1 : -1;
    for (let i = 0; percent !== 100 && i < ZOOM_STEPS.length; i++) percent = nextZoomPercent(percent, direction);
    assert.equal(percent, 100, `from ${option}`);
  }
});

test('Settings offers exactly the default options', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  assert.equal(source.match(/const PAGE_ZOOM_OPTIONS = \[([^\]]*)\]/)[1], DEFAULT_ZOOM_OPTIONS.join(', '));
});

test('stepping from 75 reaches 100 in three presses', () => {
  assert.deepEqual([nextZoomPercent(75, 1), nextZoomPercent(80, 1), nextZoomPercent(90, 1)], [80, 90, 100]);
});

test('a level between steps moves to the next step in the pressed direction', () => {
  assert.equal(nextZoomPercent(83, 1), 90);
  assert.equal(nextZoomPercent(83, -1), 80);
});

test('stepping stops at the ends', () => {
  assert.equal(nextZoomPercent(25, -1), 25);
  assert.equal(nextZoomPercent(500, 1), 500);
  assert.equal(nextZoomPercent(10, -1), 25);
  assert.equal(nextZoomPercent(900, 1), 500);
});

test('percent and level convert both ways', () => {
  assert.equal(percentToLevel(100), 0);
  assert.ok(Math.abs(percentToLevel(120) - 1) < 1e-9);
  for (const percent of ZOOM_STEPS) assert.equal(levelToPercent(percentToLevel(percent)), percent);
});

test('normalizePageZoom accepts only the listed options', () => {
  assert.equal(normalizePageZoom(75), 75);
  for (const value of [33, 250, '75', null, undefined, NaN, 75.5]) assert.equal(normalizePageZoom(value), 100);
});

test('site keys', () => {
  assert.equal(siteKeyFor('https://Example.COM:8443/a?b#c'), 'example.com');
  assert.equal(siteKeyFor('http://user:pw@example.com/'), 'example.com');
  assert.equal(siteKeyFor('http://[::1]:3000/'), '[::1]');
  assert.equal(siteKeyFor('blanc://newtab/?private=1'), 'blanc://newtab');
  for (const url of ['file:///tmp/a.html', 'about:blank', 'data:text/html,x', 'not a url', '', null]) {
    assert.equal(siteKeyFor(url), null, String(url));
  }
});

test('the default reaches web pages and local files, not internal pages', () => {
  assert.equal(usesDefaultZoom('https://example.com/'), true);
  assert.equal(usesDefaultZoom('http://example.com/'), true);
  assert.equal(usesDefaultZoom('file:///tmp/a.html'), true);
  assert.equal(usesDefaultZoom('blob:https://example.com/1234'), true);
  assert.equal(usesDefaultZoom('data:text/html,x'), true);
  assert.equal(usesDefaultZoom('blanc://newtab/'), false);
  assert.equal(usesDefaultZoom('about:blank'), false);
});

test('private zoom wins, then the saved site, then the default', () => {
  const url = 'https://example.com/page';
  const resolve = (privateSites, savedSites) => resolveZoomPercent({ url, privateSites, savedSites, defaultPercent: 75 });
  assert.equal(resolve({ 'example.com': 150 }, { 'example.com': 110 }), 150);
  assert.equal(resolve({}, { 'example.com': 110 }), 110);
  assert.equal(resolve({}, { 'other.com': 110 }), 75);
  assert.equal(resolve(null, null), 75);
});

test('a host named after an Object method is not a saved site', () => {
  for (const host of ['constructor', 'tostring', 'valueof']) {
    assert.equal(resolveZoomPercent({ url: `http://${host}/`, privateSites: {}, savedSites: {}, defaultPercent: 75 }), 75);
  }
  assert.equal(resolveZoomPercent({ url: 'http://constructor/', savedSites: { constructor: 110 }, defaultPercent: 75 }), 110);
});

test('a page with no site key never matches a host named null', () => {
  assert.equal(resolveZoomPercent({ url: 'file:///tmp/a.html', savedSites: { null: 150 }, defaultPercent: 75 }), 75);
});

test('a site saved at 100 stays there under another default', () => {
  assert.equal(resolveZoomPercent({
    url: 'https://example.com/', savedSites: { 'example.com': 100 }, defaultPercent: 75,
  }), 100);
});

test('an internal page is 100 unless the person zoomed it', () => {
  const url = 'blanc://newtab/';
  assert.equal(resolveZoomPercent({ url, savedSites: {}, defaultPercent: 75 }), 100);
  assert.equal(resolveZoomPercent({ url, savedSites: { 'blanc://newtab': 125 }, defaultPercent: 75 }), 125);
});

test('a page with no site key takes the default', () => {
  assert.equal(resolveZoomPercent({ url: 'file:///tmp/a.html', savedSites: {}, defaultPercent: 75 }), 75);
  assert.equal(resolveZoomPercent({ url: 'about:blank', savedSites: {}, defaultPercent: 75 }), 100);
});

test('legacy zoom levels move across from Chromium preferences', () => {
  const preferences = { partition: { per_host_zoom_levels: {
    123: { 'example.com': percentToLevel(150), newtab: percentToLevel(125), 'odd.com': -1 },
    456: { 'object.com': { zoom_level: percentToLevel(80), last_modified: '1' } },
  } } };
  assert.deepEqual(legacyZoomSites(preferences, ['newtab']), {
    'example.com': 150, 'blanc://newtab': 125, 'odd.com': 83, 'object.com': 80,
  });
});

test('junk in Chromium preferences moves nothing', () => {
  for (const value of [null, undefined, 3, 'x', {}, { partition: null }, { partition: { per_host_zoom_levels: 'x' } }]) {
    assert.deepEqual(legacyZoomSites(value, []), {});
  }
  const preferences = { partition: { per_host_zoom_levels: { 1: { 'a.com': 'x', 'b.com': null, 'c.com': Infinity, 'd.com': 0, 'e.com': 40 } } } };
  assert.deepEqual(legacyZoomSites(preferences, []), {});
});
