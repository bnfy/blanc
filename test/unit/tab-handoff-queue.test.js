'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { sanitizeTabHandoff } = require('../../src/main/tab-import-handoff');

// Run the real orchestration functions with deferred network and native-window
// boundaries. These are behavioral tests, not source-pattern assertions.
const main = fs.readFileSync(require.resolve('../../src/main/main'), 'utf8');
const source = main.slice(main.indexOf('async function processTabHandoff('), main.indexOf('function destroyQuietTabRecord('));
const payload = { v: 1, sourceBrowser: 'safari', tabs: [{ url: 'https://example.test/', title: 'A', active: true }] };
const settled = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const claims = [];
  const shown = [];
  const runtime = { id: 'window', profileId: 'personal', window: { isDestroyed: () => false }, utilitySheetUrl: null };
  const context = {
    pendingTabHandoff: null, tabHandoffClaimInFlight: false, activeTabHandoffRequest: null,
    pendingTabHandoffUrls: [], tabHandoffsFlushable: true,
    parseTabImportUrl: (url) => ({ id: url }), tabHandoffRuntime: () => runtime,
    localProfiles: { getLocalProfile: () => ({ id: 'personal', name: 'Personal' }) },
    DEFAULT_PROFILE_ID: 'personal', sanitizeTabHandoff, URL, app: {},
    claimTabHandoff: (parsed) => new Promise((resolve, reject) => claims.push({ ...parsed, resolve, reject })),
    tabHandoffErrorMessage: (code) => code,
    rt: () => runtime, withWindowRuntime: (_runtime, fn) => fn(),
    sameUtilityPage: (a, b) => a === b, bringExternalWindowToFront: () => {},
    focusPendingTabHandoff: () => { shown.push('focus'); },
    showUtilityPage: (url) => { runtime.utilitySheetUrl = url; shown.push(context.pendingTabHandoff?.state); },
    hideUtilitySheet: ({ discardTabHandoff = true } = {}) => {
      runtime.utilitySheetUrl = null;
      if (discardTabHandoff) context.pendingTabHandoff = null;
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, claims, shown, runtime };
}

test('canceling a slow claim queues one replacement and ignores the old result', async () => {
  const { context: c, claims, shown } = harness();
  c.queueTabHandoff('first');
  c.cancelPendingTabHandoff();
  c.queueTabHandoff('second');
  assert.equal(c.pendingTabHandoff.state, 'waiting');
  assert.equal(shown.at(-1), 'waiting');
  c.queueTabHandoff('third');
  assert.equal(shown.at(-1), 'focus');
  assert.equal(claims.length, 1);
  assert.equal(JSON.stringify(c.pendingTabHandoffProjection()), '{"state":"waiting"}');
  claims[0].resolve(payload);
  await settled();
  assert.equal(c.pendingTabHandoff.state, 'loading');
  assert.equal(c.tabHandoffClaimInFlight, true);
  assert.deepEqual(claims.map((claim) => claim.id), ['first', 'second']);
  claims[1].resolve(payload);
  await settled();
  assert.equal(c.pendingTabHandoff.state, 'ready');
  assert.equal(c.tabHandoffClaimInFlight, false);
  assert.equal(c.activeTabHandoffRequest, null);
});

test('canceling the waiting replacement leaves it unclaimed', async () => {
  const { context: c, claims } = harness();
  c.queueTabHandoff('first'); c.cancelPendingTabHandoff();
  c.queueTabHandoff('second'); c.cancelPendingTabHandoff();
  claims[0].resolve(payload);
  await settled();
  assert.equal(claims.length, 1);
  assert.equal(c.pendingTabHandoff, null);
  assert.equal(c.tabHandoffClaimInFlight, false);
});

test('a timed-out canceled claim drains its replacement without showing stale error', async () => {
  const { context: c, claims } = harness();
  c.queueTabHandoff('first'); c.cancelPendingTabHandoff(); c.queueTabHandoff('second');
  claims[0].reject(new Error('offline'));
  await settled();
  assert.equal(c.pendingTabHandoff.state, 'loading');
  assert.equal(claims[1].id, 'second');
  claims[1].resolve(payload);
  await settled();
  assert.equal(c.pendingTabHandoff.state, 'ready');
});

test('closing the waiting window discards its replacement and permits a later import', async () => {
  const { context: c, claims, runtime } = harness();
  c.queueTabHandoff('first'); c.cancelPendingTabHandoff(); c.queueTabHandoff('second');
  // The native closed listener clears its owned pending handoff.
  c.pendingTabHandoff = null; runtime.window = null;
  claims[0].resolve(payload);
  await settled();
  assert.equal(claims.length, 1);
  c.queueTabHandoff('third');
  c.flushTabHandoffs();
  assert.equal(claims.length, 1);
  runtime.window = { isDestroyed: () => false };
  c.flushTabHandoffs();
  assert.equal(claims[1].id, 'third');
  claims[1].resolve(payload);
  await settled();
});

test('startup gate is not released by an early flush', async () => {
  const { context: c, claims } = harness();
  c.tabHandoffsFlushable = false;
  c.queueTabHandoff('first'); c.flushTabHandoffs();
  assert.equal(claims.length, 0);
  assert.equal(c.tabHandoffsFlushable, false);
  c.tabHandoffsFlushable = true; c.flushTabHandoffs();
  assert.equal(claims.length, 1);
  claims[0].resolve(payload);
  await settled();
});

test('reopening a window shows the first queued replacement while cancellation settles', async () => {
  const { context: c, claims, runtime } = harness();
  c.queueTabHandoff('first'); c.cancelPendingTabHandoff();
  runtime.window = null;
  c.queueTabHandoff('second');
  runtime.window = { isDestroyed: () => false };
  c.flushTabHandoffs();
  assert.equal(c.pendingTabHandoff.state, 'waiting');
  assert.equal(c.pendingTabHandoff.url, 'second');
  c.queueTabHandoff('third');
  assert.equal(c.pendingTabHandoff.url, 'second');
  claims[0].resolve(payload);
  await settled();
  assert.equal(claims[1].id, 'second');
  claims[1].resolve(payload);
  await settled();
});

test('native sheet setup failure releases the busy flag', async () => {
  const { context: c, claims } = harness();
  c.showUtilityPage = () => { throw new Error('native failure'); };
  c.queueTabHandoff('first');
  await settled();
  assert.equal(c.tabHandoffClaimInFlight, false);
  assert.equal(c.activeTabHandoffRequest, null);
  assert.equal(claims.length, 0);
  c.showUtilityPage = () => {};
  c.queueTabHandoff('second');
  assert.equal(claims[0].id, 'second');
  claims[0].resolve(payload);
  await settled();
});

test('claim timeout covers response-body reads and always clears its timer', async () => {
  const claimSource = main.slice(main.indexOf('async function claimTabHandoff('), main.indexOf('async function processTabHandoff('));
  let fireTimeout;
  let cleared = false;
  const c = {
    AbortController,
    setTimeout: (fn, ms) => { assert.equal(ms, 10_000); fireTimeout = fn; return 1; },
    clearTimeout: () => { cleared = true; },
    net: { fetch: async (_url, options) => ({ ok: true, signal: options.signal }) },
    tabImportClaimUrl: () => 'https://tabs.blancbrowser.com/v1/handoffs/id/claim',
    tabImportRelayOrigin: () => 'https://tabs.blancbrowser.com',
    MAX_TAB_IMPORT_ENVELOPE_BYTES: 256 * 1024,
    readBoundedResponseBytes: async (response) => {
      fireTimeout();
      assert.equal(response.signal.aborted, true);
      // The bounded reader wraps stream aborts as invalid-envelope. The
      // request deadline must still be reported as an offline timeout.
      throw new Error('invalid-envelope');
    },
  };
  vm.createContext(c);
  vm.runInContext(claimSource, c);
  await assert.rejects(c.claimTabHandoff({ id: 'id', key: 'key' }), /offline/);
  assert.equal(cleared, true);
});
