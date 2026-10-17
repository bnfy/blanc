'use strict';

// src/main/bang-resolution.js: main's authority on a typed bang — settings
// in, URL out, recents recorded except from private tabs.

const test = require('node:test');
const assert = require('node:assert/strict');

const Bangs = require('../../src/renderer/pages/bangs.js');
const { createBangResolver } = require('../../src/main/bang-resolution.js');

const catalog = [
  ['yt', ['ytb'], 'YouTube', 'www.youtube.com', 'https://www.youtube.com/results?search_query=%s', 3, 'https://www.youtube.com/'],
];

function stubSettings(overrides = {}) {
  const recorded = [];
  const data = { bangsEnabled: true, customBangs: [], recentBangs: ['yt'], ...overrides };
  return {
    recorded,
    getSettings: () => ({ ...data }),
    recordRecentBang: (code) => recorded.push(code),
  };
}

test('resolveTyped returns the site URL and records the code', () => {
  const settings = stubSettings();
  const r = createBangResolver({ settings, catalog, Bangs });
  assert.deepEqual(r.resolveTyped('!yt x', { private: false }), {
    url: 'https://www.youtube.com/results?search_query=x', name: 'YouTube', code: 'yt', query: 'x',
  });
  assert.deepEqual(settings.recorded, ['yt']);
});

test('a private tab resolves but records nothing', () => {
  const settings = stubSettings();
  const r = createBangResolver({ settings, catalog, Bangs });
  assert.equal(r.resolveTyped('!yt x', { private: true }).url, 'https://www.youtube.com/results?search_query=x');
  assert.deepEqual(settings.recorded, []);
});

test('bangs off: nothing resolves, nothing is recorded', () => {
  const settings = stubSettings({ bangsEnabled: false });
  const r = createBangResolver({ settings, catalog, Bangs });
  assert.equal(r.resolveTyped('!yt x', { private: false }), null);
  assert.deepEqual(settings.recorded, []);
});

test('unknown codes and plain text resolve to null', () => {
  const r = createBangResolver({ settings: stubSettings(), catalog, Bangs });
  assert.equal(r.resolveTyped('!zzz x', { private: false }), null);
  assert.equal(r.resolveTyped('plain words', { private: false }), null);
});

test('custom bangs from settings win', () => {
  const settings = stubSettings({ customBangs: [{ code: 'yt', name: 'Mine', template: 'https://m.example/?q=%s' }] });
  const r = createBangResolver({ settings, catalog, Bangs });
  assert.equal(r.resolveTyped('!yt q', { private: false }).url, 'https://m.example/?q=q');
});

test('hasBangToken is about shape, not knowledge or the switch', () => {
  const r = createBangResolver({ settings: stubSettings({ bangsEnabled: false }), catalog, Bangs });
  assert.equal(r.hasBangToken('!zzz x'), true);
  assert.equal(r.hasBangToken('x !yt'), true);
  assert.equal(r.hasBangToken('!yt x'), true);
  assert.equal(r.hasBangToken('x'), false);
  assert.equal(r.hasBangToken('hello!'), false);
});

test('state projects the three settings', () => {
  const settings = stubSettings({ customBangs: [{ code: 'm', name: 'M', template: 'https://m.example/?q=%s' }] });
  const r = createBangResolver({ settings, catalog, Bangs });
  assert.deepEqual(r.state(), {
    enabled: true,
    custom: [{ code: 'm', name: 'M', template: 'https://m.example/?q=%s' }],
    recent: ['yt'],
  });
});
