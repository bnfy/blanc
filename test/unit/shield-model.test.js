'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  shieldChipState, shieldPopoverModel, connectionState, connectionFor,
  committedUrlOf, activeConnection,
} = require('../../src/main/shield-model');

const HTTP = 'https://www.theverge.com/article';

test('chip is hidden without a blockable host', () => {
  for (const url of ['blanc://newtab/', 'view-source:https://a.com/', '', null, 'devtools://x']) {
    assert.equal(shieldChipState({ url, blockedCount: 5, excepted: false, adblockEnabled: true }).mode, 'hidden');
  }
});

test('chip is quiet at zero blocked while protected', () => {
  const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: true });
  assert.deepEqual(s, { mode: 'quiet', count: 0, title: 'Protected — click for site controls' });
});

test('chip counts while protected, singular at 1', () => {
  const many = shieldChipState({ url: HTTP, blockedCount: 12, excepted: false, adblockEnabled: true });
  assert.equal(many.mode, 'count');
  assert.equal(many.count, 12);
  assert.equal(many.title, 'Blanc blocked 12 ads & trackers on this page — click for site controls');
  const one = shieldChipState({ url: HTTP, blockedCount: 1, excepted: false, adblockEnabled: true });
  assert.equal(one.title, 'Blanc blocked 1 ad or tracker on this page — click for site controls');
});

test('chip is off when the site is excepted — site tooltip wins over global', () => {
  for (const adblockEnabled of [true, false]) {
    const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: true, adblockEnabled });
    assert.deepEqual(s, { mode: 'off', count: 0, title: 'Ads allowed on this site — click for site controls' });
  }
});

test('chip is off with the global tooltip when blocking is off everywhere', () => {
  const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: false });
  assert.deepEqual(s, { mode: 'off', count: 0, title: 'Ad blocking is off — click for details' });
});

test('popover is null without a blockable host', () => {
  assert.equal(shieldPopoverModel({ url: 'blanc://settings/', blockedCount: 0, excepted: false, adblockEnabled: true }), null);
});

test('popover site variant, protection on, count lines', () => {
  const zero = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: true });
  assert.deepEqual(zero, { variant: 'site', host: 'theverge.com', on: true, countLine: 'Nothing blocked on this page yet', connection: null });
  const one = shieldPopoverModel({ url: HTTP, blockedCount: 1, excepted: false, adblockEnabled: true });
  assert.equal(one.countLine, '1 ad or tracker blocked on this page');
  const many = shieldPopoverModel({ url: HTTP, blockedCount: 12, excepted: false, adblockEnabled: true });
  assert.equal(many.countLine, '12 ads & trackers blocked on this page');
});

test('popover site variant when excepted — even with global blocking off', () => {
  for (const adblockEnabled of [true, false]) {
    const v = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: true, adblockEnabled });
    assert.deepEqual(v, { variant: 'site', host: 'theverge.com', on: false, countLine: 'Ads allowed on this site', connection: null });
  }
});

test('popover global-off variant when not excepted and blocking is off', () => {
  const v = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: false });
  assert.deepEqual(v, { variant: 'global-off', host: 'theverge.com', on: false, countLine: 'Ad blocking is off everywhere', connection: null });
});

// ---- Connection derivation (design: 2026-08-08-site-info-in-shield-popover) ----

test('connectionState maps schemes, not security properties', () => {
  assert.equal(connectionState('https://example.com/a'), 'https');
  assert.equal(connectionState('https://www.example.com/'), 'https');
  assert.equal(connectionState('http://neverssl.com/'), 'http');
});

test('connectionState treats loopback HTTP as local', () => {
  for (const url of [
    'http://localhost:3000/',
    'http://sub.localhost/',
    'http://127.0.0.1:8080/',
    'http://127.15.2.9/',
    'http://[::1]:5173/',
  ]) {
    assert.equal(connectionState(url), 'local', url);
  }
});

test('connectionState is null where no scheme claim can be made', () => {
  for (const url of ['blanc://newtab/', 'file:///tmp/a.html', 'not a url', '', null, undefined]) {
    assert.equal(connectionState(url), null, String(url));
  }
});

test('connectionFor withholds any claim while loading', () => {
  assert.equal(connectionFor({ url: 'https://example.com/', isLoading: true }), null);
  assert.equal(connectionFor({ url: 'http://neverssl.com/', isLoading: true }), null);
  assert.equal(connectionFor({ url: 'https://example.com/', isLoading: false }), 'https');
  assert.equal(connectionFor({ url: null, isLoading: false }), null);
});

test('popover model carries a supplied connection through unmodified', () => {
  for (const connection of ['https', 'http', 'local', null]) {
    const model = shieldPopoverModel({
      url: 'https://www.example.com/x', blockedCount: 3,
      excepted: false, adblockEnabled: true, connection,
    });
    assert.equal(model.connection, connection, String(connection));
  }
});

test('popover model does not re-derive connection from the url', () => {
  // http url, but main supplied https — the model must not "correct" it.
  const model = shieldPopoverModel({
    url: 'http://neverssl.com/', blockedCount: 0,
    excepted: false, adblockEnabled: true, connection: 'https',
  });
  assert.equal(model.connection, 'https');
});

test('popover model still normalizes the host', () => {
  const model = shieldPopoverModel({
    url: 'https://www.example.com/x', blockedCount: 0,
    excepted: false, adblockEnabled: true, connection: 'https',
  });
  assert.equal(model.host, 'example.com');
});

// A view whose committed url is only readable when it is alive.
const fakeView = (url, { destroyed = false, throws = false } = {}) => ({
  webContents: {
    isDestroyed: () => destroyed,
    getURL() {
      if (throws) throw new Error('view is gone');
      return url;
    },
  },
});

test('committedUrlOf reads a live view and refuses a dead one', () => {
  assert.equal(committedUrlOf(fakeView('https://example.com/x')), 'https://example.com/x');
  assert.equal(committedUrlOf(fakeView('https://example.com/x', { destroyed: true })), null);
  assert.equal(committedUrlOf(fakeView('https://example.com/x', { throws: true })), null);
  assert.equal(committedUrlOf(fakeView('')), null);
  assert.equal(committedUrlOf({}), null);
  assert.equal(committedUrlOf(null), null);
  assert.equal(committedUrlOf(undefined), null);
});

test('activeConnection reads the value back out of the serialized list', () => {
  const tabs = [
    { id: 1, connection: 'http' },
    { id: 2, connection: 'https' },
    { id: 3, connection: null },
  ];
  assert.equal(activeConnection(tabs, 2), 'https');
  assert.equal(activeConnection(tabs, 3), null);
  assert.equal(activeConnection(tabs, 99), null);
  assert.equal(activeConnection([], 1), null);
  assert.equal(activeConnection(null, 1), null);
});

test('the active tab and the popover report the same connection', () => {
  // The payload-level invariant: within one broadcast, whatever the active
  // serialized tab claims is exactly what the popover claims. Both loaded and
  // loading, and for a view that cannot be read at all.
  const cases = [
    { view: fakeView('https://www.example.com/x'), isLoading: false, expect: 'https' },
    { view: fakeView('https://www.example.com/x'), isLoading: true, expect: null },
    { view: fakeView('http://neverssl.com/'), isLoading: false, expect: 'http' },
    { view: fakeView('http://localhost:3000/'), isLoading: false, expect: 'local' },
    { view: fakeView('https://www.example.com/x', { destroyed: true }), isLoading: false, expect: null },
    { view: fakeView('https://www.example.com/x', { throws: true }), isLoading: false, expect: null },
  ];
  for (const { view, isLoading, expect } of cases) {
    // What serializeTabs() puts on the payload.
    const serialized = [{ id: 7, connection: connectionFor({ url: committedUrlOf(view), isLoading }) }];
    // What activeShieldPopover() must consume — never a fresh derivation.
    const popover = shieldPopoverModel({
      url: 'https://www.example.com/x',
      blockedCount: 0,
      excepted: false,
      adblockEnabled: true,
      connection: activeConnection(serialized, 7),
    });
    assert.equal(serialized[0].connection, expect);
    assert.equal(popover.connection, serialized[0].connection);
  }
});
