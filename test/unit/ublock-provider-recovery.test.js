'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, until, plain } = require('./support/ublock-provider-harness');
const { createRecoveryBudget } = require('../../src/main/ublock-recovery');

const fast = (options = {}) => ({ budget: createRecoveryBudget({ delaysMs: [0, 0, 0], ...options }), deadlineMs: 2000 });
async function ready(h) { await h.provider.initialize(); assert.equal(h.provider.status().phase, 'ready'); }

test('a crash after ready restarts uBO automatically', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  await ready(h);
  h.crashBackground();
  assert.equal(h.provider.status().phase, 'recovering');
  assert.equal(h.provider.status().recovery.kind, 'restarting');
  await until(() => h.provider.status().phase === 'ready');
  assert.deepEqual(plain(h.provider.status().recovery), { kind: 'recovered', attempt: 1 });
  assert.equal(h.created.extensions.filter(id => id === 'ublockorigin').length, 2);
});

test('a failure before the first ready keeps today\'s manual recovery', async t => {
  const h = createProviderHarness(t, { recovery: fast(), gates: { ready: true } });
  const started = h.provider.initialize(); started.catch(() => {});
  await until(() => h.provider.status().stage === 'ready');
  h.crashBackground();
  await assert.rejects(started);
  assert.equal(h.provider.status().phase, 'failed');
  assert.equal(h.provider.status().recovery, undefined);
});

test('an ineligible failure goes straight to manual recovery', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  await ready(h);
  const decision = h.provider.decide('onBeforeRequest', { id: 1, url: 'https://example.org/', resourceType: 'mainFrame', method: 'GET', webContentsId: 9 });
  await until(() => h.requests().length === 1);
  h.answer(h.requests()[0].message.id, 'not-an-object');
  assert.deepEqual(plain(await decision), { cancel: true });
  assert.equal(h.provider.status().phase, 'failed');
  assert.equal(h.provider.status().error, 'ubo-response-invalid');
});

test('an ineligible failure inside an automatic attempt ends the episode', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  await ready(h);
  h.setReadyNode(true); // the restarted background reports Node access
  h.crashBackground();
  await until(() => h.provider.status().phase === 'failed');
  assert.equal(h.provider.status().recovery.kind, 'exhausted');
  assert.equal(h.provider.status().recovery.reason, 'ineligible');
});

test('a failure after the budget is spent shows manual recovery', async t => {
  const h = createProviderHarness(t, { recovery: fast({ limit: 1 }) });
  await ready(h);
  h.crashBackground();
  await until(() => h.provider.status().phase === 'ready');
  h.crashBackground();
  assert.equal(h.provider.status().phase, 'failed');
  assert.equal(h.provider.status().recovery.reason, 'budget');
});

test('an attempt still starting at the episode deadline is cancelled', async t => {
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 150 } });
  await ready(h);
  h.stall.ready = 'never'; // the restarted uBO never reports ready
  h.crashBackground();
  await until(() => h.provider.status().phase === 'failed', 1000);
  assert.equal(h.provider.status().recovery.reason, 'deadline');
  assert.equal(h.provider.status().error, 'ubo-background-crashed');
  // The cancelled run closes its views as its rejected step unwinds.
  await until(() => h.created.views.every(view => view.webContents.destroyed));
});

test('recovery ends at uBO ready even when a tool page never finishes restoring', async t => {
  const toolWc = { id: 50, url: 'chrome-extension://ublockorigin/dashboard.html', session: null, mainFrame: { framesInSubtree: [] },
    loads: [], getURL: () => toolWc.url, getTitle: () => 'Dashboard', isDestroyed: () => false, isLoading: () => false,
    on() { return toolWc; }, removeListener() { return toolWc; },
    loadURL(url) { toolWc.loads.push(url); if (url.startsWith('chrome-extension://')) return new Promise(() => {}); toolWc.url = url; return Promise.resolve(); } };
  const tab = { id: 't1', profileId: 'personal', private: false, runtimeId: 'r1' };
  const h = createProviderHarness(t, { recovery: fast(), hooks: { listTabs: () => [tab], liveContents: () => toolWc } });
  toolWc.session = h.background.session;
  await ready(h);
  h.crashBackground();
  assert.match(toolWc.loads[0], /uBlock%20Origin%20is%20restarting/);
  await until(() => h.provider.status().phase === 'ready');
  await until(() => toolWc.loads.includes('chrome-extension://ublockorigin/dashboard.html'));
  assert.equal(h.provider.status().phase, 'ready', 'the never-settling restore does not hold recovery');
});

test('the budget-exhaustion hook is refused outside the unpackaged test build', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  assert.throws(() => h.provider.exhaustRecoveryForTest(), /test-only/);
});
