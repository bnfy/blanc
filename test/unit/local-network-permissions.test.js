'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

// Every session here is private (persistDecisions:false). permissions.js
// lazy-requires store.js (which needs electron) only on the persisted path, so
// these tests loading at all also prove the private path never touches disk.
const {
  setupPermissionPolicy, setPermissionPrompter, setHeldRequesterCheck,
  localNetworkPolicyFor, localNetworkQueryState, setLocalNetworkDecisionObserver,
} = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = () => {};
  return session;
}

const privateSession = () => {
  const s = fakeSession();
  setupPermissionPolicy(s, { persistDecisions: false });
  return s;
};

const OKTA = 'https://acme.okta.com';
const liveWc = (id = 1) => ({ id, isDestroyed: () => false });
const frame = (origin = OKTA, top = origin) => ({ origin, top: { origin: top }, isDestroyed: () => false });
const probe = (port, over = {}) => ({
  url: `http://localhost:${port}/probe`,
  resourceType: 'xhr',
  initiatorOrigin: OKTA,
  webContents: liveWc(),
  frame: frame(),
  ...over,
});

function deferredPrompter(t) {
  const calls = [];
  setPermissionPrompter((req) => new Promise((resolve) => calls.push({ req, resolve })));
  t.after(() => setPermissionPrompter(null));
  return calls;
}

test('ungated requests get no decision at all', () => {
  const policy = localNetworkPolicyFor(privateSession());
  assert.equal(policy(probe(1, { url: 'https://okta.com/x' })), null);
  assert.equal(policy(probe(1, { resourceType: 'mainFrame' })), null);
  assert.equal(policy(probe(1, { initiatorOrigin: 'http://localhost:3000', frame: frame('http://localhost:3000') })), null);
});

test('a burst of probes shares one prompt; Allow releases all and is remembered', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const policy = localNetworkPolicyFor(session);
  const pending = [8769, 65111, 65112].map((port) => policy(probe(port)));
  await Promise.resolve();
  assert.equal(calls.length, 1, 'one prompt for the burst');
  assert.deepEqual(
    { origin: calls[0].req.origin, permission: calls[0].req.permission },
    { origin: OKTA, permission: 'loopback-network' },
  );
  calls[0].resolve(true);
  assert.deepEqual(await Promise.all(pending), [true, true, true]);

  assert.equal(await policy(probe(8769)), true, 'remembered');
  assert.equal(calls.length, 1, 'no second prompt');
  assert.equal(session.check(null, 'loopback-network', OKTA, { embeddingOrigin: OKTA, requestingUrl: `${OKTA}/` }), true);
  assert.equal(session.check(null, 'local-network', OKTA, { embeddingOrigin: OKTA }), false, 'scopes are separate');
  assert.equal(localNetworkQueryState(session, `${OKTA}/signin`, 'loopback-network'), 'granted');
  assert.equal(localNetworkQueryState(session, `${OKTA}/signin`, 'local-network'), 'prompt');
  assert.equal(localNetworkQueryState(session, `${OKTA}/signin`, 'local-network-access'), 'prompt');
});

test('Block cancels the burst and is remembered', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const policy = localNetworkPolicyFor(session);
  const pending = [1, 2].map((port) => policy(probe(port)));
  await Promise.resolve();
  calls[0].resolve(false);
  assert.deepEqual(await Promise.all(pending), [false, false]);
  assert.equal(await policy(probe(3)), false);
  assert.equal(calls.length, 1);
  assert.equal(localNetworkQueryState(session, OKTA, 'loopback-network'), 'denied');
});

test('a prompt that could not be shown cancels without saving anything', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const policy = localNetworkPolicyFor(session);
  const first = policy(probe(1));
  await Promise.resolve();
  calls[0].resolve(null);
  assert.equal(await first, false);
  assert.equal(localNetworkQueryState(session, OKTA, 'loopback-network'), 'prompt');
  const second = policy(probe(1));
  await Promise.resolve();
  assert.equal(calls.length, 2, 'asks again next time');
  calls[1].resolve(true);
  assert.equal(await second, true);
});

test('a tab closed or parked while the prompt is open saves nothing', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const policy = localNetworkPolicyFor(session);
  let destroyed = false;
  const wc = { id: 7, isDestroyed: () => destroyed };
  const pending = policy(probe(1, { webContents: wc }));
  await Promise.resolve();
  destroyed = true;
  calls[0].resolve(true);
  assert.equal(await pending, false);
  assert.equal(localNetworkQueryState(session, OKTA, 'loopback-network'), 'prompt');

  let held = false;
  setHeldRequesterCheck(() => held);
  t.after(() => setHeldRequesterCheck(null));
  const again = policy(probe(1));
  await Promise.resolve();
  held = true;
  calls[1].resolve(true);
  assert.equal(await again, false);
  assert.equal(localNetworkQueryState(session, OKTA, 'loopback-network'), 'prompt');
  assert.equal(await policy(probe(1)), false, 'a held tab is refused before any prompt');
  assert.equal(calls.length, 2);
});

test('cross-origin frames and opaque initiators are refused without a prompt', async (t) => {
  const calls = deferredPrompter(t);
  const policy = localNetworkPolicyFor(privateSession());
  assert.equal(await policy(probe(1, { initiatorOrigin: 'https://ads.example', frame: frame('https://ads.example', OKTA) })), false);
  assert.equal(await policy(probe(1, { initiatorOrigin: 'null' })), false);
  assert.equal(calls.length, 0);
});

test('a same-origin subframe asks for the top-level site', async (t) => {
  const calls = deferredPrompter(t);
  const policy = localNetworkPolicyFor(privateSession());
  const pending = policy(probe(1, { resourceType: 'subFrame', frame: frame(OKTA, OKTA) }));
  await Promise.resolve();
  assert.equal(calls[0].req.origin, OKTA);
  calls[0].resolve(true);
  assert.equal(await pending, true);
});

test('with no frame, only a stored allow lets a request through', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const policy = localNetworkPolicyFor(session);
  assert.equal(await policy(probe(1, { frame: null, webContents: undefined })), false);
  assert.equal(calls.length, 0, 'nobody to ask');
  const allowed = policy(probe(1));
  await Promise.resolve();
  calls[0].resolve(true);
  await allowed;
  assert.equal(await policy(probe(1, { frame: null, webContents: undefined })), true);
  let thrower = probe(1);
  Object.defineProperty(thrower, 'frame', { get() { throw new Error('gone'); } });
  assert.equal(await policy(thrower), true, 'an unreadable frame is treated as no frame');
});

test('private decisions never leak into a new private session', async (t) => {
  const calls = deferredPrompter(t);
  const first = privateSession();
  const pending = localNetworkPolicyFor(first)(probe(1));
  await Promise.resolve();
  calls[0].resolve(true);
  assert.equal(await pending, true);
  const next = privateSession();
  assert.equal(localNetworkQueryState(next, OKTA, 'loopback-network'), 'prompt');
  assert.equal(next.check(null, 'loopback-network', OKTA, { embeddingOrigin: OKTA }), false);
});

test('local-network targets use their own scope and copy', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const pending = localNetworkPolicyFor(session)(probe(0, { url: 'http://192.168.1.20/status' }));
  await Promise.resolve();
  assert.equal(calls[0].req.permission, 'local-network');
  calls[0].resolve(false);
  assert.equal(await pending, false);
  assert.equal(localNetworkQueryState(session, OKTA, 'local-network'), 'denied');
  assert.equal(localNetworkQueryState(session, OKTA, 'loopback-network'), 'prompt');
});

test('the legacy combined name reads granted or denied only when both scopes agree', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const policy = localNetworkPolicyFor(session);
  const a = policy(probe(1));
  const b = policy(probe(0, { url: 'http://10.0.0.2/' }));
  await Promise.resolve();
  calls[0].resolve(true);
  calls[1].resolve(true);
  await Promise.all([a, b]);
  assert.equal(localNetworkQueryState(session, OKTA, 'local-network-access'), 'granted');
  assert.equal(session.check(null, 'local-network-access', OKTA, { embeddingOrigin: OKTA }), true);
});

test('pages that are never gated read granted; non-web pages get no answer', () => {
  const session = privateSession();
  assert.equal(localNetworkQueryState(session, 'http://localhost:3000/', 'loopback-network'), 'granted');
  assert.equal(localNetworkQueryState(session, 'http://localhost:3000/', 'local-network-access'), 'granted');
  assert.equal(localNetworkQueryState(session, 'http://192.168.1.5/', 'local-network'), 'granted');
  assert.equal(localNetworkQueryState(session, 'http://192.168.1.5/', 'loopback-network'), 'prompt');
  assert.equal(session.check(null, 'loopback-network', 'http://localhost:3000', { embeddingOrigin: 'http://localhost:3000' }), true);
  assert.equal(localNetworkQueryState(session, 'blanc://newtab/', 'loopback-network'), null);
  assert.equal(localNetworkQueryState(session, OKTA, 'camera'), null);
  assert.equal(localNetworkQueryState({}, OKTA, 'loopback-network'), null, 'unknown session');
});

test('the check handler refuses a cross-origin frame even when the top site is allowed', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const pending = localNetworkPolicyFor(session)(probe(1));
  await Promise.resolve();
  calls[0].resolve(true);
  await pending;
  assert.equal(session.check(null, 'loopback-network', 'https://ads.example', {
    embeddingOrigin: OKTA, requestingUrl: 'https://ads.example/frame',
  }), false);
});

test('a Chromium permission request goes through the same prompt and store', async (t) => {
  const calls = deferredPrompter(t);
  const session = privateSession();
  const answered = new Promise((resolve) => session.request(liveWc(), 'local-network-access', resolve, {
    requestingUrl: `${OKTA}/signin`, isMainFrame: true,
  }));
  await Promise.resolve();
  assert.equal(calls[0].req.permission, 'local-network-access');
  calls[0].resolve(true);
  assert.equal(await answered, true);
  assert.equal(localNetworkQueryState(session, OKTA, 'loopback-network'), 'granted');
  assert.equal(localNetworkQueryState(session, OKTA, 'local-network'), 'granted');
  assert.equal(await localNetworkPolicyFor(session)(probe(1)), true);
});

test('decision changes are announced for live permission statuses', async (t) => {
  const calls = deferredPrompter(t);
  const seen = [];
  setLocalNetworkDecisionObserver((change) => seen.push(change));
  t.after(() => setLocalNetworkDecisionObserver(null));
  const session = privateSession();
  const pending = localNetworkPolicyFor(session)(probe(1));
  await Promise.resolve();
  calls[0].resolve(true);
  await pending;
  assert.deepEqual(seen, [{ session, origin: OKTA }]);
});
