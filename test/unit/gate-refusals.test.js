'use strict';
// A navigation the startup/profile gate refused and queued may report its own
// ERR_BLOCKED_BY_CLIENT after the gate replayed it. Only that exact late
// failure is kept off the error page; everything else is presented as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGateRefusals, ERR_BLOCKED_BY_CLIENT, WINDOW_MS, MAX_PER_CONTENTS } = require('../../src/main/gate-refusals');
const URL_A = 'https://castlabs.github.io/wv-vmp-lab/';
const URL_B = 'https://example.test/next';

test('a refused navigation\'s late -20 is matched once; a second, identical failure is presented', () => {
  const refusals = createGateRefusals();
  refusals.noteRefused(4, URL_A);
  assert.equal(refusals.consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), true);
  assert.equal(refusals.consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), false, 'a later real block of the same URL still shows');
});

test('unrelated failures are never matched: other URL, other code, other contents, no refusal', () => {
  const refusals = createGateRefusals();
  refusals.noteRefused(4, URL_A);
  assert.equal(refusals.consumeLateFailure(4, URL_B, ERR_BLOCKED_BY_CLIENT), false, 'a provider block of another URL');
  for (const code of [-2, -3, -105, -200, -312]) assert.equal(refusals.consumeLateFailure(4, URL_A, code), false, `code ${code}`);
  assert.equal(refusals.consumeLateFailure(5, URL_A, ERR_BLOCKED_BY_CLIENT), false, 'another tab');
  assert.equal(createGateRefusals().consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), false, 'never refused');
  assert.equal(refusals.pending(4), 1, 'the real refusal is still recorded');
});

test('superseding navigations: every refused URL is matched once, in any order', () => {
  const refusals = createGateRefusals();
  refusals.noteRefused(4, URL_A); refusals.noteRefused(4, URL_B);
  assert.equal(refusals.consumeLateFailure(4, URL_B, ERR_BLOCKED_BY_CLIENT), true);
  assert.equal(refusals.consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), true);
  assert.equal(refusals.pending(4), 0);
});

test('a failure kept off the page while the gate was active settles its refusal', () => {
  const refusals = createGateRefusals();
  refusals.noteRefused(4, URL_A);
  refusals.settle(4, URL_A);
  assert.equal(refusals.consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), false);
});

test('closed or replaced contents forget their refusals; records expire after the window', () => {
  const refusals = createGateRefusals();
  refusals.noteRefused(4, URL_A); refusals.forget(4);
  assert.equal(refusals.consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), false, 'destroyed contents');
  let clock = 0;
  const timed = createGateRefusals({ now: () => clock });
  timed.noteRefused(4, URL_A);
  clock = WINDOW_MS + 1;
  assert.equal(timed.consumeLateFailure(4, URL_A, ERR_BLOCKED_BY_CLIENT), false, 'expired');
  assert.equal(timed.pending(4), 0);
});

test('bounded per contents; non-web URLs and invalid contents are ignored', () => {
  const refusals = createGateRefusals();
  for (let i = 0; i < MAX_PER_CONTENTS + 3; i += 1) refusals.noteRefused(4, `https://example.test/${i}`);
  assert.equal(refusals.pending(4), MAX_PER_CONTENTS);
  assert.equal(refusals.consumeLateFailure(4, 'https://example.test/0', ERR_BLOCKED_BY_CLIENT), false, 'oldest dropped');
  for (const [id, url] of [[0, URL_A], [-1, URL_A], [1.5, URL_A], ['4', URL_A], [6, 'blanc://newtab/'], [6, 'file:///etc/passwd'], [6, null]]) refusals.noteRefused(id, url);
  assert.equal(refusals.pending(6), 0);
});

test('the startup gate notes only the GET main-frame navigations it actually queues', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const source = main.match(/function installStartupNavigationGate\(sessions\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'installStartupNavigationGate not found');
  const noted = []; let listener;
  const sandbox = {
    startupNavigationGateActive: false, startupQueuedNavigations: new Map(), tabs: new Map(), tabIdByWebContentsId: new Map(),
    navigationTrace: { record() {} }, gateRefusals: { noteRefused: (id, url) => noted.push([id, url]) },
    blockingCoordinator: { setGate: (_session, gate) => { listener = gate; } },
  };
  vm.runInNewContext(`${source}\nthis.install = installStartupNavigationGate;`, sandbox);
  sandbox.install([{}]);
  assert.equal(listener({ resourceType: 'mainFrame', url: URL_A, method: 'GET', webContentsId: 4 }), true);
  assert.equal(listener({ resourceType: 'mainFrame', url: URL_B, method: 'POST', webContentsId: 4 }), true, 'POST is still refused');
  assert.equal(listener({ resourceType: 'subFrame', url: URL_B, method: 'GET', webContentsId: 4 }), false);
  assert.equal(listener({ resourceType: 'mainFrame', url: 'blanc://newtab/', method: 'GET', webContentsId: 4 }), false);
  assert.equal(listener({ resourceType: 'mainFrame', url: URL_B, method: 'GET', webContentsId: 0 }), true, 'no contents: refused, not queued');
  assert.deepEqual(noted, [[4, URL_A]], 'only the queued GET is noted');
  assert.deepEqual([...sandbox.startupQueuedNavigations], [[4, URL_A]], 'queueing is unchanged');
});

test('the profile gate notes only the GET navigations it holds for replay', () => {
  const { createProfileNavigationGates } = require('../../src/main/profile-navigation-gates');
  const noted = []; const listeners = new Map();
  const target = { tab: { profileId: 'a', private: false, navEpoch: 1 }, wc: { loadURL: () => Promise.resolve() } };
  const priv = { tab: { profileId: 'a', private: true, navEpoch: 1 }, wc: { loadURL: () => Promise.resolve() } };
  const gates = createProfileNavigationGates({ coordinator: { setGate: (s, l) => listeners.set(s, l) }, queued: new Map(),
    resolveContents: id => ({ 1: target, 2: priv })[id] ?? null, ready: () => false, enabled: () => true, startupActive: () => false,
    onRefused: (id, url) => noted.push([id, url]) });
  gates.hold('a', 'a');
  const request = (id, method = 'GET') => listeners.get('a')({ webContentsId: id, resourceType: 'mainFrame', url: URL_A, method });
  assert.equal(request(1), true); assert.equal(request(1, 'POST'), true); assert.equal(request(2), true);
  assert.deepEqual(noted, [[1, URL_A]], 'POST and private navigations are refused but never noted for replay');
});

test('the tab failure handler drops only a matching late refusal; every other failure reaches the error page', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
  const start = source.indexOf("wc.on('did-fail-load'");
  const handler = source.slice(start, source.indexOf('const canContinue', start));
  const order = ["if (!shouldPresentTabLoadFailure(wc, errorCode, validatedURL)) { traceFailure('not-presented'); return; }",
    'if (isStartupGateActive(tab) && startupQueuedNavigations.has(wc.id) && /^https?:/i.test(validatedURL)) {',
    'deps.gateRefusals?.settle(wc.id, validatedURL);',
    'if (deps.gateRefusals?.consumeLateFailure(wc.id, validatedURL, errorCode)) {',
    "traceFailure('gate-refused-late');",
    "traceFailure('error-page');"].map(text => { const at = handler.indexOf(text); assert.ok(at >= 0, text); return at; });
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'guards keep their order');
  assert.match(source, /const refusalContentsId = wc\.id;\n  wc\.once\('destroyed', \(\) => deps\.gateRefusals\?\.forget\(refusalContentsId\)\);/);
});
