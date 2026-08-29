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

function harness({ loaded = true, viewId = 7, ensureViewNull = false, fallbackResult = 'cancel' } = {}) {
  const sent = [];
  const calls = { attach: 0, hide: 0, restoreFocus: 0, fallback: [] };
  const clock = fakeClock();
  const view = {
    webContents: { send: (channel, payload) => sent.push({ channel, payload }), isDestroyed: () => false },
    id: viewId,
    loaded,
  };
  const surface = createFillStatusSurface({
    ensureView: () => (ensureViewNull ? null : view),
    attach: () => { calls.attach += 1; },
    hide: () => { calls.hide += 1; },
    showFallbackDialog: async (_target, kind) => { calls.fallback.push(kind); return fallbackResult; },
    restoreFocus: () => { calls.restoreFocus += 1; },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    readinessMs: 2000,
  });
  const target = { runtimeId: 11, tabId: 't1' };
  return { surface, target, sent, calls, clock, view };
}

const shown = (sent) => sent.filter((m) => m.channel === 'fill:show');
const hidden = (sent) => sent.filter((m) => m.channel === 'fill:hide');
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('decision sends a monotonically increasing requestId and resolves from a matching reply', async () => {
  const { surface, target, sent, calls } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  assert.equal(shown(sent).length, 1);
  const { kind, mode, requestId } = shown(sent)[0].payload;
  assert.deepEqual({ kind, mode }, { kind: 'confirm-heuristic', mode: 'decision' });
  surface.handleReply(true, { requestId, verb: 'fill' });
  assert.equal(await p, 'primary');
  assert.equal(calls.restoreFocus, 1);

  const p2 = surface.decision(target, 'setup-enable');
  const second = shown(sent)[1].payload.requestId;
  assert.ok(second > requestId, 'requestId must increase');
  surface.handleReply(true, { requestId: second, verb: 'cancel' });
  assert.equal(await p2, 'cancel');
});

test('stale, unknown, and wrong-verb replies are ignored', async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  const { requestId } = shown(sent)[0].payload;
  surface.handleReply(true, { requestId: requestId - 1, verb: 'fill' }); // stale
  surface.handleReply(true, { requestId: requestId + 5, verb: 'fill' }); // unknown
  surface.handleReply(true, { requestId, verb: 'open-settings' }); // not in this kind's verbs
  surface.handleReply(true, { requestId, verb: 'dismiss' }); // notice verb on a decision
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false, 'decision must still be pending');
  surface.handleReply(true, { requestId, verb: 'cancel' });
  assert.equal(await p, 'cancel');
});

test('a reply failing the sender check is ignored', async () => {
  const { surface, target, sent } = harness();
  const p = surface.decision(target, 'confirm-heuristic');
  const { requestId } = shown(sent)[0].payload;
  surface.handleReply(false, { requestId, verb: 'fill' });
  let settled = false;
  p.then(() => { settled = true; });
  await tick();
  assert.equal(settled, false);
  surface.handleReply(true, { requestId, verb: 'cancel' });
  await p;
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
  surface.handleReply(true, { requestId, verb: 'fill' });
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
  surface.handleReply(true, { requestId: shown(sent)[0].payload.requestId, verb: 'cancel' });
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

test('notice replies restore focus and hide', async () => {
  const { surface, target, sent, calls } = harness();
  await surface.notice(target, 'no-match');
  const { requestId } = shown(sent)[0].payload;
  surface.handleReply(true, { requestId, verb: 'dismiss' });
  assert.equal(surface.isShowing(), false);
  assert.equal(calls.restoreFocus, 1);
});
