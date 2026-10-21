'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkWhatsNewPage } = require('../../src/main/whats-new-check');

// The one request Blanc makes on its own for What's New: a HEAD for the page,
// with no cookies and no redirects; only a 200 counts, and it never throws.
const URL = 'https://blanc.day/whats-new/1.39';
const answering = (status) => async () => ({ status });

test('a 200 means the page exists', async () => {
  assert.equal(await checkWhatsNewPage(URL, { fetch: answering(200) }), true);
});

test('anything else means it does not', async () => {
  assert.equal(await checkWhatsNewPage(URL, { fetch: answering(404) }), false);
  assert.equal(await checkWhatsNewPage(URL, { fetch: answering(301) }), false);
  assert.equal(await checkWhatsNewPage(URL, { fetch: async () => { throw new Error('offline'); } }), false);
});

test('a request that never answers gives up after the timeout', async () => {
  const hanging = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  assert.equal(await checkWhatsNewPage(URL, { fetch: hanging, timeoutMs: 20 }), false);
});

test('the request sends no cookies, follows no redirects and is not cached', async () => {
  let seen;
  await checkWhatsNewPage(URL, { fetch: async (url, init) => { seen = { url, init }; return { status: 200 }; } });
  assert.equal(seen.url, URL);
  const { signal, ...init } = seen.init;
  assert.ok(signal);
  assert.deepEqual(init, { method: 'HEAD', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
});
