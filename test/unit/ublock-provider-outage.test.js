'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, until, plain } = require('./support/ublock-provider-harness');
const { createRecoveryBudget } = require('../../src/main/ublock-recovery');

const PAGE = 'https://example.org/article';
const errorUrl = token => `blanc://error/?${new URLSearchParams({ url: PAGE, code: '-20', desc: 'ERR_BLOCKED_BY_CLIENT', ...(token ? { outage: token } : {}) })}`;
function setup(t, extra = {}) {
  const reloads = [];
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 2000, ...extra },
    hooks: { reloadAfterOutage: entry => reloads.push(entry) } });
  return { h, reloads };
}
async function cancelledByOutage(h, details) {
  await h.provider.initialize();
  const decision = h.provider.decide('onBeforeRequest', { webContentsId: 9, resourceType: 'mainFrame', method: 'GET', url: PAGE, ...details });
  decision.catch(() => {});
  await until(() => h.requests().length >= 1);
  h.crashBackground();
  await assert.rejects(decision);
}

test('the outage\'s own failure claims a token, and the page reloads after commit and recovery', async t => {
  const { h, reloads } = setup(t);
  await cancelledByOutage(h, { id: 10 });
  const token = h.provider.claimOutage(9, PAGE);
  assert.match(token, /^[0-9a-f]{32}$/);
  h.provider.noteMainFrameCommitted(9, errorUrl(token));
  assert.equal(reloads.length, 0, 'waits for uBO');
  await until(() => h.provider.status().phase === 'ready');
  assert.deepEqual(plain(reloads), [{ webContentsId: 9, token, url: PAGE }]);
});

test('recovery may finish before the error page commits', async t => {
  const { h, reloads } = setup(t);
  await cancelledByOutage(h, { id: 11 });
  const token = h.provider.claimOutage(9, PAGE);
  await until(() => h.provider.status().phase === 'ready');
  assert.equal(reloads.length, 0, 'waits for the error page');
  h.provider.noteMainFrameCommitted(9, errorUrl(token));
  assert.deepEqual(plain(reloads), [{ webContentsId: 9, token, url: PAGE }]);
});

test('a later navigation to the same URL cannot claim the older record', async t => {
  const { h } = setup(t);
  await cancelledByOutage(h, { id: 12 });
  // A later POST to the same URL starts in that tab (new request id).
  h.provider.decide('onBeforeRequest', { id: 13, webContentsId: 9, resourceType: 'mainFrame', method: 'POST', url: PAGE }).catch(() => {});
  assert.equal(h.provider.claimOutage(9, PAGE), null);
});

test('a stale record cannot be claimed', async t => {
  const { h } = setup(t, { outageClaimMs: 30 });
  await cancelledByOutage(h, { id: 14 });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(h.provider.claimOutage(9, PAGE), null);
});

test('POST and subresource cancellations are never recorded', async t => {
  for (const details of [{ id: 15, method: 'POST' }, { id: 16, resourceType: 'script' }]) {
    const { h } = setup(t);
    await cancelledByOutage(h, details);
    assert.equal(h.provider.claimOutage(9, PAGE), null);
  }
});

test('leaving the error page drops its token', async t => {
  const { h, reloads } = setup(t);
  await cancelledByOutage(h, { id: 17 });
  const token = h.provider.claimOutage(9, PAGE);
  h.provider.noteMainFrameCommitted(9, 'https://elsewhere.example/');
  await until(() => h.provider.status().phase === 'ready');
  h.provider.noteMainFrameCommitted(9, errorUrl(token));
  assert.equal(reloads.length, 0);
});
