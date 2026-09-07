'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createFillStatusSurface } = require('../../src/main/fill-status-surface');

function fakeClock() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    fire: (id) => { const t = pending.get(id); pending.delete(id); t?.fn(); },
    fireAll: () => { for (const id of [...pending.keys()]) { const t = pending.get(id); pending.delete(id); t.fn(); } },
    count: () => pending.size,
  };
}

function harness({
  loaded = true, viewId = 7, ensureViewNull = false, fallbackResult = 'cancel',
  fallbackControlled = false,
} = {}) {
  const sent = [];
  const calls = { attach: 0, hide: 0, restoreFocus: 0, fallback: [] };
  const clock = fakeClock();
  const fallbackResolvers = [];
  const view = {
    webContents: {
      send: (channel, payload) => sent.push({ channel, payload }),
      focus: () => { calls.viewFocus = (calls.viewFocus ?? 0) + 1; },
      isDestroyed: () => false,
    },
    id: viewId,
    loaded,
  };
  const surface = createFillStatusSurface({
    ensureView: () => (ensureViewNull ? null : view),
    attach: () => { calls.attach += 1; },
    hide: () => { calls.hide += 1; },
    showFallbackDialog: (_target, kind) => {
      calls.fallback.push(kind);
      if (!fallbackControlled) return Promise.resolve(fallbackResult);
      return new Promise((resolve) => { fallbackResolvers.push(resolve); });
    },
    restoreFocus: () => { calls.restoreFocus += 1; },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    readinessMs: 2000,
  });
  const target = { runtimeId: 11, tabId: 't1' };
  const answerFallback = (answer) => { fallbackResolvers.shift()?.(answer); };
  return { surface, target, sent, calls, clock, view, answerFallback };
}

const shown = (sent) => sent.filter((m) => m.channel === 'fill:show');
const hidden = (sent) => sent.filter((m) => m.channel === 'fill:hide');
const tick = () => new Promise((resolve) => setImmediate(resolve));
// The harness target's window and its capsule view — the identity a reply
// must carry to resolve that window's record.
const CAPSULE_ID = { runtimeId: 11, viewId: 7 };

test('decision sends a monotonically increasing requestId and resolves from a matching reply', async () => {
  const { surface, target, sent, calls } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  assert.equal(shown(sent).length, 1);
  const { kind, mode, requestId } = shown(sent)[0].payload;
  assert.deepEqual({ kind, mode }, { kind: 'confirm-heuristic', mode: 'decision' });
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'fill' });
  assert.equal(await p, 'primary');
  assert.equal(calls.restoreFocus, 1);

  const p2 = surface.decision(target, 'setup-enable');
  const second = shown(sent)[1].payload.requestId;
  assert.ok(second > requestId, 'requestId must increase');
  surface.handleReply(CAPSULE_ID, { requestId: second, verb: 'cancel' });
  assert.equal(await p2, 'cancel');
});

test('stale, unknown, and wrong-verb replies are ignored', async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  const { requestId } = shown(sent)[0].payload;
  surface.handleReply(CAPSULE_ID, { requestId: requestId - 1, verb: 'fill' }); // stale
  surface.handleReply(CAPSULE_ID, { requestId: requestId + 5, verb: 'fill' }); // unknown
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'open-settings' }); // not in this kind's verbs
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'dismiss' }); // notice verb on a decision
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false, 'decision must still be pending');
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'cancel' });
  assert.equal(await p, 'cancel');
});

test('a reply failing the sender check is ignored', async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  const { requestId } = shown(sent)[0].payload;
  surface.handleReply(null, { requestId, verb: 'fill' });
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false);
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'cancel' });
  await p;
});

test("another window's trusted capsule cannot resolve this window's decision", async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  const { requestId } = shown(sent)[0].payload;
  // Window B's capsule is a verified, trusted chrome surface — but not the
  // active record's view. Correct requestId and verb must still be ignored.
  surface.handleReply({ runtimeId: 42, viewId: 9 }, { requestId, verb: 'fill' });
  surface.handleReply({ runtimeId: 11, viewId: 9 }, { requestId, verb: 'fill' }); // same window, stale view
  surface.handleReply({ runtimeId: 42, viewId: 7 }, { requestId, verb: 'fill' }); // right view id, wrong window
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false, 'only the owning capsule may resolve the decision');
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'cancel' });
  assert.equal(await p, 'cancel');
});

test('readiness deadline before first presentation answers via the native fallback', async () => {
  const { surface, target, sent, calls, clock } = harness({ loaded: false, fallbackResult: 'primary' });
  const p = surface.decision(target, 'setup-enable');
  assert.equal(shown(sent).length, 0, 'unloaded view: show must be queued, not sent');
  clock.fireAll(); // deadline expires
  assert.equal(await p, 'primary');
  assert.deepEqual(calls.fallback, ['setup-enable']);
});

test('ensureView returning null falls back immediately', async () => {
  const { surface, target, calls } = harness({ ensureViewNull: true, fallbackResult: 'cancel' });
  const p = surface.decision(target, 'confirm-heuristic');
  assert.equal(await p, 'cancel');
  assert.deepEqual(calls.fallback, ['confirm-heuristic']);
});

test('queued-show replay: rendererReady resends the original requestId, presents, cancels the deadline', async () => {
  const { surface, target, sent, calls, clock } = harness({ loaded: false });
  const p = surface.decision(target, 'confirm-heuristic');
  assert.equal(shown(sent).length, 0);
  surface.rendererReady(target.runtimeId, 7);
  assert.equal(shown(sent).length, 1, 'replay must send the queued show');
  const { requestId } = shown(sent)[0].payload;
  clock.fireAll(); // any leftover deadline must be inert
  await tick();
  assert.equal(calls.fallback.length, 0, 'presented message must not fall back');
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'fill' });
  assert.equal(await p, 'primary');
});

test('stale-view rendererReady is a no-op and the deadline still falls back', async () => {
  const { surface, target, sent, calls, clock } = harness({ loaded: false });
  const p = surface.decision(target, 'confirm-heuristic');
  surface.rendererReady(target.runtimeId, 3); // old view's late load
  surface.rendererReady(99, 7); // foreign runtime
  assert.equal(shown(sent).length, 0);
  clock.fireAll();
  assert.equal(await p, 'cancel');
  assert.equal(calls.fallback.length, 1);
});

test('boundary advancement: viewGone before rendererReady falls back, after resolves cancel', async () => {
  {
    const { surface, target, calls } = harness({ loaded: false, fallbackResult: 'primary' });
    const p = surface.decision(target, 'confirm-heuristic');
    surface.viewGone(target.runtimeId, 7);
    assert.equal(await p, 'primary');
    assert.equal(calls.fallback.length, 1, 'pre-presentation death substitutes the dialog');
  }
  {
    const { surface, target, calls } = harness({ loaded: false });
    const p = surface.decision(target, 'confirm-heuristic');
    surface.rendererReady(target.runtimeId, 7);
    surface.viewGone(target.runtimeId, 7);
    assert.equal(await p, 'cancel');
    assert.equal(calls.fallback.length, 0, 'post-presentation death must not re-prompt');
  }
});

test('loadFailed matches the boundary the same way viewGone does', async () => {
  const { surface, target, calls } = harness({ loaded: true });
  const p = surface.decision(target, 'confirm-heuristic'); // loaded: presented immediately
  surface.loadFailed(target.runtimeId, 7);
  assert.equal(await p, 'cancel');
  assert.equal(calls.fallback.length, 0);
});

test('cross-window death is a no-op', async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  surface.viewGone(42, 7); // window B's runtime
  surface.loadFailed(42, 7);
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false, 'window A decision must stay pending');
  surface.handleReply(CAPSULE_ID, { requestId: shown(sent)[0].payload.requestId, verb: 'cancel' });
  await p;
});

test('same-runtime stale-view failure is a no-op', async () => {
  const { surface, target, sent } = harness({ viewId: 7 });
  const p = surface.decision(target, 'confirm-heuristic');
  surface.viewGone(target.runtimeId, 3); // pre-recreation view failing late
  surface.loadFailed(target.runtimeId, 3);
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false, 'replacement view message must stay active');
  surface.viewGone(target.runtimeId, 7); // genuinely matching event still behaves per 5
  assert.equal(await p, 'cancel');
});

test('invalidatePending cancels only its own runtime, without focus restore', async () => {
  const { surface, target, calls } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  surface.invalidatePending(42); // window B transition
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false);
  surface.invalidatePending(target.runtimeId);
  assert.equal(await p, 'cancel');
  assert.equal(calls.restoreFocus, 0, 'successor surfaces keep focus');
});

test('notices resolve immediately, and invalidatePending hides only same-runtime notices', async () => {
  const { surface, target, sent } = harness();
  await surface.notice(target, 'no-match');
  assert.equal(shown(sent).length, 1);
  assert.equal(surface.isShowing(), true);
  surface.invalidatePending(42);
  assert.equal(surface.isShowing(), true, 'foreign runtime must not hide the notice');
  surface.invalidatePending(target.runtimeId);
  assert.equal(surface.isShowing(), false);
  assert.equal(hidden(sent).length, 1);
});

test('a new message displaces the old: hide sent, pending decision cancelled', async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  const first = shown(sent)[0].payload.requestId;
  await surface.notice(target, 'no-match');
  assert.equal(await p, 'cancel');
  assert.equal(hidden(sent)[0].payload.requestId, first);
  assert.equal(shown(sent).length, 2);
});

test('fallback stays cancellable: invalidation resolves cancel once and the late Primary is ignored', async () => {
  const { surface, target, clock, answerFallback, calls } = harness({ loaded: false, fallbackControlled: true });
  const p = surface.decision(target, 'confirm-heuristic');
  clock.fireAll(); // deadline → native dialog pending
  assert.equal(calls.fallback.length, 1);
  assert.equal(surface.isShowing(), true, 'a pending fallback decision is still a showing message');
  surface.invalidatePending(target.runtimeId); // successor surface during the dialog
  assert.equal(await p, 'cancel');
  const p2 = surface.decision(target, 'setup-enable'); // new flow after invalidation
  answerFallback('primary'); // the abandoned dialog answered late
  await tick();
  let settled2 = false;
  p2.then(() => { settled2 = true; });
  await tick();
  assert.equal(settled2, false, 'the late Primary must not resolve the new decision');
  assert.equal(calls.restoreFocus, 0, 'a dropped late answer must not steal focus');
  surface.invalidatePending(target.runtimeId);
  assert.equal(await p2, 'cancel');
});

test('a new message during a pending fallback cancels the old decision exactly once', async () => {
  const { surface, target, sent, clock, answerFallback } = harness({ loaded: false, fallbackControlled: true });
  const p = surface.decision(target, 'confirm-heuristic');
  clock.fireAll();
  await surface.notice(target, 'no-match'); // displacement while the dialog is up
  assert.equal(await p, 'cancel');
  assert.equal(surface.isShowing(), true, 'the displacing notice is active');
  surface.rendererReady(target.runtimeId, 7); // the unloaded view finishes loading
  assert.equal(shown(sent).filter((m) => m.payload.kind === 'no-match').length, 1);
  answerFallback('primary'); // late answer ignored
  await tick();
  assert.equal(surface.isShowing(), true, 'the notice must survive the stale dialog answer');
});

test('view events during a pending fallback are inert', async () => {
  const { surface, target, clock, answerFallback, calls } = harness({ loaded: false, fallbackControlled: true });
  const p = surface.decision(target, 'confirm-heuristic');
  clock.fireAll();
  surface.viewGone(target.runtimeId, 7);
  surface.loadFailed(target.runtimeId, 7);
  surface.rendererReady(target.runtimeId, 7);
  assert.equal(calls.fallback.length, 1, 'no second dialog');
  answerFallback('primary');
  assert.equal(await p, 'primary');
});

test('decisions focus the capsule WebContents on both presentation paths; notices never do', async () => {
  {
    const { surface, target, calls, sent } = harness({ loaded: true }); // fast path
    const p = surface.decision(target, 'confirm-heuristic');
    assert.equal(calls.viewFocus, 1, 'fast-path decision must take native focus');
    surface.handleReply(CAPSULE_ID, { requestId: shown(sent)[0].payload.requestId, verb: 'cancel' });
    await p;
  }
  {
    const { surface, target, calls, sent } = harness({ loaded: false }); // replay path
    const p = surface.decision(target, 'confirm-heuristic');
    assert.equal(calls.viewFocus ?? 0, 0);
    surface.rendererReady(target.runtimeId, 7);
    assert.equal(calls.viewFocus, 1, 'replayed decision must take native focus');
    surface.handleReply(CAPSULE_ID, { requestId: shown(sent)[0].payload.requestId, verb: 'cancel' });
    await p;
  }
  {
    const { surface, target, calls } = harness({ loaded: true });
    await surface.notice(target, 'no-match');
    assert.equal(calls.viewFocus ?? 0, 0, 'notices must not steal focus');
  }
});

test('notice replies restore focus and hide', async () => {
  const { surface, target, sent, calls } = harness();
  await surface.notice(target, 'no-match');
  const { requestId } = shown(sent)[0].payload;
  surface.handleReply(CAPSULE_ID, { requestId, verb: 'dismiss' });
  assert.equal(surface.isShowing(), false);
  assert.equal(calls.restoreFocus, 1);
});
