'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { typedHttpsFallback, keepsFallback, httpFallbackFor } = require('../../src/main/typed-https-fallback');

test('a bare domain upgraded to https gets an http fallback', () => {
  assert.deepEqual(typedHttpsFallback('keurig.com', 'https://keurig.com'), {
    httpsUrl: 'https://keurig.com',
    httpUrl: 'http://keurig.com/',
  });
  assert.deepEqual(typedHttpsFallback('  example.com/a?b=1 ', 'https://example.com/a?b=1'), {
    httpsUrl: 'https://example.com/a?b=1',
    httpUrl: 'http://example.com/a?b=1',
  });
});

test('an address typed with https:// gets the same fallback', () => {
  assert.deepEqual(typedHttpsFallback('https://keurig.com', 'https://keurig.com'), {
    httpsUrl: 'https://keurig.com',
    httpUrl: 'http://keurig.com/',
  });
  assert.deepEqual(typedHttpsFallback(' https://Keurig.com/brew ', 'https://Keurig.com/brew'), {
    httpsUrl: 'https://Keurig.com/brew',
    httpUrl: 'http://keurig.com/brew',
  });
});

test("a bang's https address falls back like a typed one", () => {
  const url = 'https://duckduckgo.com/?q=coffee';
  assert.deepEqual(typedHttpsFallback(url, url), { httpsUrl: url, httpUrl: 'http://duckduckgo.com/?q=coffee' });
});

test('local, IP and ported addresses never fall back, as HTTPS-Upgrades leaves them', () => {
  for (const text of ['https://192.168.1.1', 'https://localhost', 'https://router', 'https://printer.local',
    'https://app.test', 'https://example.com:8443', 'https://[::1]', 'nas.local', 'https://box.home.arpa']) {
    assert.equal(typedHttpsFallback(text, text.startsWith('https://') ? text : `https://${text}`), null, text);
  }
});

test('other schemes, a search, or userinfo get none', () => {
  assert.equal(typedHttpsFallback('http://keurig.com', 'http://keurig.com'), null);
  assert.equal(typedHttpsFallback('blanc://newtab', 'blanc://newtab'), null);
  assert.equal(typedHttpsFallback('coffee makers', 'https://duckduckgo.com/?q=coffee+makers'), null);
  assert.equal(typedHttpsFallback('localhost:3000', 'http://localhost:3000'), null);
  assert.equal(typedHttpsFallback('user:pw@example.com', 'https://user:pw@example.com'), null);
  assert.equal(typedHttpsFallback('keurig.com', undefined), null);
});

const pending = typedHttpsFallback('keurig.com', 'https://keurig.com');

test('a refused or failed TLS connection to the typed address falls back', () => {
  for (const code of [-102, -101, -100, -107, -118, -7, -324, -200, -202]) {
    assert.equal(httpFallbackFor(pending, { code, url: 'https://keurig.com/' }), 'http://keurig.com/', String(code));
  }
});

test('failures http cannot fix never fall back', () => {
  for (const code of [-3, -20, -105, -106, -21, -27, -300]) {
    assert.equal(httpFallbackFor(pending, { code, url: 'https://keurig.com/' }), null, String(code));
  }
});

test('only the typed address itself falls back', () => {
  assert.equal(httpFallbackFor(pending, { code: -102, url: 'https://www.keurig.com/' }), null);
  assert.equal(httpFallbackFor(pending, { code: -102, url: 'http://keurig.com/' }), null);
  assert.equal(httpFallbackFor(null, { code: -102, url: 'https://keurig.com/' }), null);
  assert.equal(keepsFallback(pending, 'https://KEURIG.com/'), true);
  assert.equal(keepsFallback(pending, 'https://www.keurig.com/'), false);
  assert.equal(keepsFallback(null, 'https://keurig.com/'), false);
});
