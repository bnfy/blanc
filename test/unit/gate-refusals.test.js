'use strict';
// A navigation the startup/profile gate refused, queued and replayed may
// report its own ERR_BLOCKED_BY_CLIENT after the replay began, before or after
// the replay commits. Only that failure, while no other navigation has
// started, is kept off the error page; every other failure, including a
// genuine later block of the same URL, is presented as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createGateRefusals, ERR_BLOCKED_BY_CLIENT, WINDOW_MS, MAX_PER_CONTENTS } = require('../../src/main/gate-refusals');
const A = 'https://castlabs.github.io/wv-vmp-lab/';
const B = 'https://example.test/next';
const BLOCKED = ERR_BLOCKED_BY_CLIENT;

// ---- The real tab failure handler, lifted from tab-view.js ----
function handlerSource() {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
  const start = source.indexOf('(_e, errorCode, errorDescription, validatedURL, isMainFrame) => {', source.indexOf("wc.on('did-fail-load'"));
  const end = source.indexOf('\n  }));', start);
  assert.ok(start > 0 && end > start, 'did-fail-load handler not found');
  return `${source.slice(start, end)}\n  }`;
}
function harness() {
  const refusals = createGateRefusals();
  const queued = new Map();
  const state = { gateActive: true, superseded: false };
  const shown = []; const outcomes = [];
  const wc = { id: 4, session: {} };
  const tab = { navEpoch: 1, sleeping: false, private: false, certificateError: null, view: { webContents: wc } };
  const sandbox = {
    tab, wc, id: 't1', URLSearchParams,
    noteWakeSuppressed: () => false,
    isStartupGateActive: () => state.gateActive,
    startupQueuedNavigations: queued,
    shouldPresentTabLoadFailure: (_wc, code, url) => !!url && code !== -3 && !state.superseded,
    deps: { gateRefusals: refusals, navigationTrace: { record: (_event, fields) => outcomes.push(fields.outcome) }, t: key => key, claimOutage: () => null },
    certificateExceptions: { isEligible: () => false },
    certificateObserver: { wasVerifiedThisRun: () => false },
    certificateErrorQuery: () => new URLSearchParams(),
    queueTabNavigation: (_contents, { run }) => shown.push(run),
    liveContents: () => wc, windowRuntimes: { runtimeForTab: () => null }, getOwner: () => null,
  };
  vm.runInNewContext(`this.fail = ${handlerSource()};`, sandbox);
  return {
    refusals, queued, state, tab, shown, outcomes,
    // The startup gate refuses and queues a GET main-frame navigation.
    refuse(url) { queued.set(wc.id, url); refusals.noteRefused(wc.id, url); },
    // The gate opens and replays exactly what is queued (main.js release order).
    release() {
      state.gateActive = false;
      const url = queued.get(wc.id); queued.delete(wc.id);
      if (url) refusals.armReplay(wc.id, url);
    },
    // did-start-navigation, main frame, new document: bumps navEpoch and is
    // counted for attribution (tab-view.js feeds noteNavigationStart).
    start() { tab.navEpoch += 1; refusals.noteNavigationStart(wc.id); },
    // did-navigate (commit) or a same-document start: bumps navEpoch only.
    commit() { tab.navEpoch += 1; },
    fail(code, url) { sandbox.fail({}, code, 'desc', url, true); },
  };
}

test('the replayed refusal\'s late -20 on the replay generation stays off the error page; a second one shows', () => {
  const h = harness();
  h.refuse(A); h.release(); h.start();
  h.fail(BLOCKED, A);
  assert.deepEqual(h.outcomes, ['gate-refused-late']); assert.equal(h.shown.length, 0);
  h.fail(BLOCKED, A);
  assert.deepEqual(h.outcomes, ['gate-refused-late', 'error-page']); assert.equal(h.shown.length, 1);
});

test('audit sequence: a superseded refusal whose failure was ignored never hides a genuine later block of the same URL', () => {
  // Superseded before the gate opened: B replaces A in the queue and is replayed.
  const h = harness();
  h.refuse(A); h.start(); h.refuse(B); h.release(); h.start();
  h.state.superseded = true; h.fail(BLOCKED, A); h.state.superseded = false;   // A's own failure ignored
  h.start(); h.fail(BLOCKED, A);                                               // a genuine later block of A
  assert.deepEqual(h.outcomes, ['not-presented', 'error-page']); assert.equal(h.shown.length, 1);
  // Superseded after the replay: A is replayed, then the user navigates on.
  const g = harness();
  g.refuse(A); g.release(); g.start(); g.start();
  g.state.superseded = true; g.fail(BLOCKED, A); g.state.superseded = false;
  g.start(); g.fail(BLOCKED, A);
  assert.deepEqual(g.outcomes, ['not-presented', 'error-page']); assert.equal(g.shown.length, 1);
});

test('audit sequence: the replay starting and then committing does not turn its late -20 into an error page', () => {
  const h = harness();
  h.refuse(A); h.release(); h.start(); h.commit();   // replay starts (epoch 2), commits (epoch 3)
  h.fail(BLOCKED, A);                                 // the refusal's own delayed failure
  assert.deepEqual(h.outcomes, ['gate-refused-late']); assert.equal(h.shown.length, 0);
  // Same-document navigations inside the replayed page do not supersede it either.
  const g = harness();
  g.refuse(A); g.release(); g.start(); g.commit(); g.commit(); g.commit();
  g.fail(BLOCKED, A);
  assert.deepEqual(g.outcomes, ['gate-refused-late']);
  // But another new-document navigation starting after the commit does.
  const k = harness();
  k.refuse(A); k.release(); k.start(); k.commit(); k.start();
  k.fail(BLOCKED, A);
  assert.deepEqual(k.outcomes, ['error-page']); assert.equal(k.shown.length, 1);
});

test('a newer navigation invalidates the armed refusal even when its failure never arrived', () => {
  const h = harness();
  h.refuse(A); h.release(); h.start();   // replay at generation 2
  h.start(); h.start();                  // the user navigates on, then back to A
  h.fail(BLOCKED, A);                    // genuine block of A on a newer generation
  assert.deepEqual(h.outcomes, ['error-page']); assert.equal(h.shown.length, 1);
});

test('a provider blocking the replayed request itself is shown', () => {
  const h = harness();
  h.refuse(A); h.release(); h.start();
  h.refusals.disarm(4, A);               // coordinator observed a provider cancel of the replay
  h.fail(BLOCKED, A);
  assert.deepEqual(h.outcomes, ['error-page']); assert.equal(h.shown.length, 1);
});

test('refusals that were never replayed, other URLs and other codes are always shown', () => {
  const h = harness();
  h.refuse(A); h.state.gateActive = false;   // gate opened without replaying A
  h.fail(BLOCKED, A);
  const g = harness(); g.refuse(A); g.release(); g.start();
  g.fail(BLOCKED, B); g.fail(-105, A);
  assert.deepEqual(h.outcomes, ['error-page']);
  assert.deepEqual(g.outcomes, ['error-page', 'error-page']);
});

test('a failure while the gate is active is kept off the page as before, and settles its refusal', () => {
  const h = harness();
  h.refuse(A); h.fail(BLOCKED, A);         // gate still active, navigation queued
  assert.deepEqual(h.outcomes, ['gate-suppressed']);
  h.release(); h.start(); h.fail(BLOCKED, A);
  assert.deepEqual(h.outcomes, ['gate-suppressed', 'error-page'], 'nothing left to match after settling');
});

// ---- The tracker on its own ----
test('the tracker: arming, generations, single use, disarm, settle, forget, expiry and bounds', () => {
  const r = createGateRefusals();
  r.noteRefused(4, A);
  r.noteNavigationStart(4);
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), false, 'pending (not replayed) never matches, and pending ignores starts');
  r.armReplay(4, A);
  assert.equal(r.consumeLateFailure(4, A, -3), false, 'other codes never match');
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), true, 'before the replay has even started');
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), false, 'once');
  r.noteRefused(4, A); r.armReplay(4, A); r.noteNavigationStart(4);
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), true, 'after the replay started');
  r.noteRefused(4, A); r.armReplay(4, A); r.noteNavigationStart(4); r.noteNavigationStart(4);
  assert.equal(r.pending(4), 0, 'a second start supersedes the replay and drops the record');
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), false);
  r.noteRefused(4, A); r.noteRefused(4, B); r.armReplay(4, B);
  assert.equal(r.pending(4), 1, 'replaying B drops the superseded A');
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), false);
  r.disarm(4, B); assert.equal(r.consumeLateFailure(4, B, BLOCKED), false, 'disarmed');
  r.noteRefused(4, A); r.armReplay(4, A); r.settle(4, A); assert.equal(r.consumeLateFailure(4, A, BLOCKED), false, 'settled');
  r.noteRefused(4, A); r.armReplay(4, A); r.forget(4); assert.equal(r.consumeLateFailure(4, A, BLOCKED), false, 'forgotten');
  r.armReplay(4, A); assert.equal(r.pending(4), 0, 'arming without a refusal arms nothing');
  r.noteRefused(4, A); r.armReplay(4, A); r.noteNavigationStart(5); r.noteNavigationStart(5);
  assert.equal(r.consumeLateFailure(4, A, BLOCKED), true, 'starts in other contents do not count');
  let clock = 0; const timed = createGateRefusals({ now: () => clock });
  timed.noteRefused(4, A); timed.armReplay(4, A); clock = WINDOW_MS + 1;
  assert.equal(timed.consumeLateFailure(4, A, BLOCKED), false, 'expired');
  for (let i = 0; i < MAX_PER_CONTENTS + 3; i += 1) r.noteRefused(9, `https://example.test/${i}`);
  assert.equal(r.pending(9), MAX_PER_CONTENTS);
  for (const [id, url] of [[0, A], [-1, A], [1.5, A], ['4', A], [6, 'blanc://newtab/'], [6, 'file:///etc/passwd'], [6, null]]) r.noteRefused(id, url);
  assert.equal(r.pending(6), 0);
});

// ---- Wiring ----
test('the startup gate notes only queued GET main-frame loads and arms only what it replays', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const install = main.match(/function installStartupNavigationGate\(sessions\) \{[\s\S]*?\n\}/)?.[0];
  const release = main.match(/function releaseStartupNavigationGate\(sessions, \{ blockerAttached \}\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(install && release);
  const noted = []; const armed = []; const forgotten = []; let listener;
  const view = require('fs').readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
  const liveViewContents = view.match(/const liveViewContents = \(view\) => \{[\s\S]*?\n\};/)?.[0];
  const liveContents = view.match(/const liveContents = \(tab\) => liveViewContents\(tab\?\.view\);/)?.[0];
  const loaded = [];
  const tabWc = { id: 4, isDestroyed: () => false, loadURL: url => { loaded.push(url); return Promise.resolve(); } };
  const sandbox = {
    startupNavigationGateActive: false, startupQueuedNavigations: new Map(), tabs: new Map([['t1', { navEpoch: 3, view: { webContents: tabWc } }]]),
    tabIdByWebContentsId: new Map(), pendingWakes: new Set(), wakeTab: () => Promise.resolve(),
    navigationTrace: { record() {} }, profileNavigationGates: { reconcile() {}, owns: () => false },
    gateRefusals: { noteRefused: (...a) => noted.push(a), armReplay: (...a) => armed.push(a), forget: id => forgotten.push(id) },
    blockingCoordinator: { setGate: (_s, gate) => { listener = gate; } }, installRequestCoordinator() {},
  };
  vm.runInNewContext(`${liveViewContents}\n${liveContents}\n${install}\n${release}\nthis.install = installStartupNavigationGate; this.release = releaseStartupNavigationGate;`, sandbox);
  sandbox.install([{}]);
  assert.equal(listener({ resourceType: 'mainFrame', url: A, method: 'GET', webContentsId: 4 }), true);
  assert.equal(listener({ resourceType: 'mainFrame', url: B, method: 'POST', webContentsId: 5 }), true, 'POST refused, not queued');
  assert.equal(listener({ resourceType: 'subFrame', url: B, method: 'GET', webContentsId: 4 }), false);
  assert.equal(listener({ resourceType: 'mainFrame', url: B, method: 'GET', webContentsId: 7 }), true, 'queued for a contents with no tab');
  assert.deepEqual(noted, [[4, A], [7, B]]);
  sandbox.release([], { blockerAttached: true });
  assert.deepEqual(armed, [[4, A]], 'armed before its replay');
  assert.deepEqual(loaded, [A], 'replay unchanged');
  assert.deepEqual(forgotten, [7], 'a contents without a live tab is forgotten');
});

test('the profile gate notes held GETs and arms its replay; the coordinator reports provider cancels, not gate refusals', async () => {
  const { createProfileNavigationGates } = require('../../src/main/profile-navigation-gates');
  const noted = []; const armed = []; const listeners = new Map(); let phase = 'initializing';
  const target = { tab: { profileId: 'a', private: false, navEpoch: 6 }, wc: { loadURL: () => Promise.resolve() } };
  const priv = { tab: { profileId: 'a', private: true, navEpoch: 1 }, wc: { loadURL: () => Promise.resolve() } };
  const gates = createProfileNavigationGates({ coordinator: { setGate: (s, l) => listeners.set(s, l) }, queued: new Map(),
    resolveContents: id => ({ 1: target, 2: priv })[id] ?? null, ready: () => phase === 'ready', enabled: () => true, startupActive: () => false,
    onRefused: (...a) => noted.push(a), onReplay: (...a) => armed.push(a) });
  gates.hold('a', 'a');
  const request = (id, method = 'GET') => listeners.get('a')({ webContentsId: id, resourceType: 'mainFrame', url: A, method });
  request(1); request(2); request(1, 'POST');
  assert.deepEqual(noted, [[1, A]]);
  request(1); phase = 'ready'; gates.reconcile();
  assert.deepEqual(armed, [[1, A, 6]]);
  const { createBlockingCoordinator, CALLBACK_EVENTS, OBSERVE_EVENTS } = require('../../src/main/blocking-coordinator');
  const handlers = new Map(); const cancels = [];
  const session = { isPersistent: () => true, webRequest: Object.fromEntries([...CALLBACK_EVENTS, ...OBSERVE_EVENTS].map(e => [e, (_f, l) => handlers.set(e, l)])) };
  const coordinator = createBlockingCoordinator(); coordinator.observeCancel(c => cancels.push([c.source, c.stage, c.webContentsId]));
  const request2 = (event, details) => new Promise(resolve => handlers.get(event)(details, resolve));
  const main = { id: 1, resourceType: 'mainFrame', url: A, webContentsId: 4 };
  coordinator.setGate(session, () => true); assert.deepEqual(await request2('onBeforeRequest', main), { cancel: true });
  coordinator.setGate(session, null); coordinator.setProvider(session, { decide: () => ({ cancel: true }) });
  assert.deepEqual(await request2('onBeforeRequest', main), { cancel: true });
  assert.deepEqual(await request2('onBeforeRequest', { ...main, resourceType: 'image' }), { cancel: true });
  coordinator.setProvider(session, { decide: async () => { throw new Error('lost'); } });
  assert.deepEqual(await request2('onHeadersReceived', main), { cancel: true });
  assert.deepEqual(cancels, [['provider', 'onBeforeRequest', 4], ['policy-exception', 'onHeadersReceived', 4]], 'gate refusals and subresources are not reported');
  coordinator.observeCancel(() => { throw new Error('observer bug'); });
  assert.deepEqual(await request2('onHeadersReceived', main), { cancel: true }, 'an observer failure never changes a decision');
});

test('tab-view counts only new-document main-frame starts for gate-refusal attribution', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
  const start = source.indexOf("wc.on('did-start-navigation'");
  const body = source.slice(start, source.indexOf('}));', start));
  assert.match(body, /\(_e, url, isInPlace, isMainFrame\) =>/);
  assert.match(body, /if \(isMainFrame && !isInPlace\) deps\.gateRefusals\?\.noteNavigationStart\(wc\.id\);/);
  // Commits never feed attribution.
  const commit = source.slice(source.indexOf("wc.on('did-navigate'"), source.indexOf("wc.on('did-navigate-in-page'"));
  assert.doesNotMatch(commit, /noteNavigationStart/);
});
