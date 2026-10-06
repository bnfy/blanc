'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileNavigationGates, MAX_PENDING } = require('../../src/main/profile-navigation-gates');
function fixture() {
  let enabled = true; let startup = false;
  const phases = new Map([['a', 'initializing'], ['b', 'initializing']]);
  const targets = new Map(); const listeners = new Map(); const loaded = []; const queued = new Map();
  for (const [id, profileId] of [[1, 'a'], [2, 'b']]) targets.set(id, {
    tab: { profileId, private: false, navEpoch: 1 },
    wc: { loadURL: url => { loaded.push([id, url]); return Promise.resolve(); } },
  });
  const gates = createProfileNavigationGates({ coordinator: { setGate: (session, listener) => listeners.set(session, listener) }, queued,
    resolveContents: id => targets.get(id), ready: id => phases.get(id) === 'ready', enabled: () => enabled, startupActive: () => startup });
  for (const profile of ['a', 'b']) gates.hold(profile, profile);
  const request = (id, url = 'https://fixture.test/', method = 'GET') => listeners.get(targets.get(id).tab.profileId)({ webContentsId: id, resourceType: 'mainFrame', url, method });
  return { gates, phases, targets, loaded, queued, listeners, request, disable: () => { enabled = false; }, startup: value => { startup = value; } };
}
test('a first profile GET waits for its own provider and replays once', () => {
  const f = fixture(); assert(f.request(1)); assert(f.request(2));
  f.gates.reconcile(); assert.equal(f.loaded.length, 0);
  f.phases.set('a', 'ready'); f.gates.reconcile(); f.gates.reconcile();
  assert.deepEqual(f.loaded, [[1, 'https://fixture.test/']]); assert(f.gates.owns(2));
  assert(!f.queued.has(1)); assert.equal(f.listeners.get('a'), null);
});
test('failed initialization remains gated; retry or explicit disable releases GETs', () => {
  for (const retry of [true, false]) {
    const f = fixture(); f.request(1); f.phases.set('a', 'failed'); f.gates.reconcile(); assert.equal(f.loaded.length, 0);
    if (retry) f.phases.set('a', 'ready'); else f.disable();
    f.gates.reconcile(); assert.equal(f.loaded.length, 1);
  }
});
test('POST, private and stale documents are never replayed', () => {
  const f = fixture(); f.request(1); assert(f.request(1, 'https://fixture.test/post', 'POST')); assert(!f.queued.has(1));
  f.targets.get(2).tab.private = true; assert(f.request(2)); assert(!f.queued.has(2));
  f.phases.set('a', 'ready'); f.phases.set('b', 'ready'); f.gates.reconcile(); assert.equal(f.loaded.length, 0);
  for (const invalidate of [f => { f.targets.get(1).tab.navEpoch++; }, f => { f.targets.get(1).wc = { loadURL() { throw new Error('stale WC replayed'); } }; }, f => { f.targets.get(1).tab.profileId = 'b'; }, f => f.targets.delete(1)]) {
    const g = fixture(); g.request(1); invalidate(g); g.phases.set('a', 'ready'); g.gates.reconcile(); assert.equal(g.loaded.length, 0);
  }
});
test('local navigation or profile deletion forgets the deferred page', () => {
  for (const deletion of [true, false]) {
    const f = fixture(); f.request(1);
    if (deletion) f.gates.forget('a'); else assert(!f.request(1, 'blanc://newtab/'));
    f.phases.set('a', 'ready'); f.gates.reconcile(); assert.equal(f.loaded.length, 0); assert(!f.queued.has(1));
  }
});
test('global startup release does not prematurely release another profile', () => {
  const f = fixture(); f.startup(true); f.request(1); f.phases.set('a', 'ready'); f.gates.reconcile(); assert.equal(f.loaded.length, 0);
  f.startup(false); f.gates.reconcile(); assert.equal(f.loaded.length, 1); assert(f.gates.active(f.targets.get(2).tab));
});

test('failed-profile queues are bounded and closed views release their slots', () => {
  const f = fixture(); f.phases.set('a', 'failed');
  for (let id = 3; id < MAX_PENDING + 4; id++) {
    f.targets.set(id, { tab: { profileId: 'a', private: false, navEpoch: 1 }, wc: { loadURL: () => Promise.resolve() } });
    assert(f.request(id));
  }
  assert.equal(f.queued.size, MAX_PENDING);
  f.targets.delete(3); f.gates.reconcile(); assert.equal(f.queued.size, MAX_PENDING - 1);
  assert(f.request(MAX_PENDING + 3)); assert.equal(f.queued.size, MAX_PENDING);
});
