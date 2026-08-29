'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildHintProbeScript,
  createFillHintScheduler,
  configTransition,
} = require('../../src/main/fill-hint');

function fakeClock() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    fireAll: () => { for (const id of [...pending.keys()]) { const t = pending.get(id); pending.delete(id); t.fn(); } },
    count: () => pending.size,
    delays: () => [...pending.values()].map((t) => t.ms),
  };
}

function harness({ probeResults = [true], eligible = true } = {}) {
  const clock = fakeClock();
  const hints = [];
  const state = {
    eligible,
    epochs: new Map(),
    tokens: new Map(),
    probes: 0,
    resolvers: [],
  };
  const scheduler = createFillHintScheduler({
    runProbe: () => {
      state.probes += 1;
      return new Promise((resolve) => { state.resolvers.push(resolve); });
    },
    isEligible: () => state.eligible,
    tabEpoch: (tab) => state.epochs.get(tab.id) ?? 0,
    contentsToken: (tab) => (state.tokens.has(tab.id) ? state.tokens.get(tab.id) : 100 + tab.id),
    onHint: (tab, hinted) => hints.push({ id: tab.id, hinted }),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    recheckMs: 2500,
  });
  const resolveNext = (value) => { state.resolvers.shift()?.(value); };
  const tab = { id: 1 };
  void probeResults;
  return { scheduler, tab, hints, clock, state, resolveNext };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('probe script is structure-only, rejects contradicted tokens, and requires real visibility', () => {
  const script = buildHintProbeScript();
  assert.match(script, /current-password/);
  assert.match(script, /new-password/, 'the contradiction check must be present');
  assert.match(script, /checkVisibility/);
  assert.match(script, /checkOpacity/);
  assert.match(script, /innerWidth|innerHeight/, 'viewport intersection bound');
  assert.doesNotMatch(script, /\.value\b/);
  assert.doesNotMatch(script, /innerText|textContent/);
});

test('a positive probe hints; a negative schedules exactly one recheck that can hint', async () => {
  const { scheduler, tab, hints, clock, resolveNext } = harness();
  scheduler.notePageLoad(tab);
  resolveNext(false);
  await tick();
  assert.deepEqual(hints, []);
  assert.equal(clock.count(), 1, 'one recheck timer');
  assert.deepEqual(clock.delays(), [2500]);
  clock.fireAll();
  resolveNext(true);
  await tick();
  assert.deepEqual(hints, [{ id: 1, hinted: true }]);
  assert.equal(clock.count(), 0, 'no second recheck after the recheck');
});

test('stale results are discarded: epoch change', async () => {
  const { scheduler, tab, hints, state, resolveNext } = harness();
  scheduler.notePageLoad(tab);
  state.epochs.set(1, 5); // navigation while the probe was in flight
  resolveNext(true);
  await tick();
  assert.deepEqual(hints, []);
});

test('stale results are discarded: eligibility turned off', async () => {
  const { scheduler, tab, hints, state, resolveNext } = harness();
  scheduler.notePageLoad(tab);
  state.eligible = false;
  resolveNext(true);
  await tick();
  assert.deepEqual(hints, []);
});

test('stale results are discarded: WebContents token replaced (quiet/wake) or gone', async () => {
  {
    const { scheduler, tab, hints, state, resolveNext } = harness();
    scheduler.notePageLoad(tab);
    state.tokens.set(1, 999); // a NEW renderer for the same tab object
    resolveNext(true);
    await tick();
    assert.deepEqual(hints, []);
  }
  {
    const { scheduler, tab, hints, state, resolveNext } = harness();
    scheduler.notePageLoad(tab);
    state.tokens.set(1, null); // no live contents any more
    resolveNext(true);
    await tick();
    assert.deepEqual(hints, []);
  }
});

test('a tab with no live contents at schedule time never probes', () => {
  const { scheduler, tab, state } = harness();
  state.tokens.set(1, null);
  scheduler.notePageLoad(tab);
  assert.equal(state.probes, 0);
});

test('clearTab cancels the pending recheck and retracts only a shown hint', async () => {
  const { scheduler, tab, hints, clock, resolveNext } = harness();
  scheduler.notePageLoad(tab);
  resolveNext(false);
  await tick();
  assert.equal(clock.count(), 1);
  scheduler.clearTab(tab);
  assert.equal(clock.count(), 0, 'recheck cancelled');
  assert.deepEqual(hints, [], 'no hint was shown, so none is retracted');
  scheduler.notePageLoad(tab);
  resolveNext(true);
  await tick();
  scheduler.clearTab(tab);
  assert.deepEqual(hints, [{ id: 1, hinted: true }, { id: 1, hinted: false }]);
});

test('clearAll clears every timer and retracts every shown hint', async () => {
  const { scheduler, hints, clock, resolveNext, state } = harness();
  const tabA = { id: 1 };
  const tabB = { id: 2 };
  scheduler.notePageLoad(tabA);
  resolveNext(true);
  await tick();
  scheduler.notePageLoad(tabB);
  resolveNext(false);
  await tick();
  assert.equal(clock.count(), 1, 'tabB recheck pending');
  scheduler.clearAll();
  assert.equal(clock.count(), 0);
  assert.deepEqual(hints, [{ id: 1, hinted: true }, { id: 1, hinted: false }]);
  void state;
});

test('noteConfigChanged probes the active tab immediately when eligible', async () => {
  const { scheduler, tab, hints, state, resolveNext } = harness();
  scheduler.noteConfigChanged(tab);
  assert.equal(state.probes, 1);
  resolveNext(true);
  await tick();
  assert.deepEqual(hints, [{ id: 1, hinted: true }]);
});

test('an already-probed epoch is not re-probed on activation', async () => {
  const { scheduler, tab, state, resolveNext } = harness();
  scheduler.notePageLoad(tab);
  resolveNext(true);
  await tick();
  scheduler.noteActivated(tab);
  assert.equal(state.probes, 1, 'same epoch: one probe total');
  state.epochs.set(1, 2);
  scheduler.noteActivated(tab);
  assert.equal(state.probes, 2, 'new epoch: activation probes');
});

test('probe rejections are swallowed silently', async () => {
  const clock = fakeClock();
  const hints = [];
  const scheduler = createFillHintScheduler({
    runProbe: () => Promise.reject(new Error('boom')),
    isEligible: () => true,
    tabEpoch: () => 0,
    contentsToken: () => 7,
    onHint: (tab, hinted) => hints.push({ id: tab.id, hinted }),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  scheduler.notePageLoad({ id: 1 });
  await tick();
  await tick();
  assert.deepEqual(hints, []);
});

test('configTransition classifies enable, disable, account edits, and noise', () => {
  const off = { onePasswordEnabled: false, onePasswordAccount: '' };
  const on = { onePasswordEnabled: true, onePasswordAccount: 'Team' };
  assert.equal(configTransition(off, on), 'became-eligible');
  assert.equal(configTransition(on, off), 'cleared');
  assert.equal(configTransition(on, { ...on, onePasswordAccount: 'Other' }), 'cleared');
  assert.equal(configTransition(on, { ...on, onePasswordAccount: ' Team ' }), null, 'trim-equal edits are noise');
  assert.equal(configTransition(on, on), null);
  assert.equal(configTransition(off, { ...off, onePasswordAccount: 'Team' }), null, 'account without enable stays ineligible');
  assert.equal(configTransition({ onePasswordEnabled: true, onePasswordAccount: '' }, on), 'became-eligible');
});
