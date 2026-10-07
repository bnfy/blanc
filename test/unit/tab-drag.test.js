'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Same realm as the assertions (a vm context's own Object prototype would
// make deepStrictEqual reject identical intents); globalThis is still a
// private sandbox object, so the browser global never leaks into Node.
function load() {
  const sandbox = {};
  const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/tab-drag.js'), 'utf8');
  vm.runInThisContext(`(function (globalThis) {\n${source}\n})`)(sandbox);
  return sandbox.blancTabDrag;
}
const drag = load();

test('lift found the tab-drag API', () => {
  for (const name of ['resolveTabDrop', 'resolveGroupDrop', 'keyboardTabMove', 'keyboardGroupMove', 'describeMove']) {
    assert.equal(typeof drag[name], 'function', `${name} missing`);
  }
  assert.equal(drag.constants.DRAG_THRESHOLD_PX, 4);
});

// Rows are 20px tall. Layout, top to bottom:
//   pinned: P (0-20)
//   group work (header 20-40): W1 pinned (40-60), W2 (60-80), W3 (80-100)
//   group play collapsed (header 100-120)
//   loose: L1 (120-140), L2 (140-160)
const row = (id, top, pinned = false) => ({ id, pinned, top, bottom: top + 20 });
const model = {
  top: 0, bottom: 160,
  sections: [
    { kind: 'pinned', groupId: null, collapsed: false, top: 0, bottom: 20, header: null, rows: [row('P', 0, true)] },
    { kind: 'group', groupId: 'work', collapsed: false, top: 20, bottom: 100, header: { top: 20, bottom: 40 },
      rows: [row('W1', 40, true), row('W2', 60), row('W3', 80)] },
    { kind: 'group', groupId: 'play', collapsed: true, top: 100, bottom: 120, header: { top: 100, bottom: 120 }, rows: [] },
    { kind: 'loose', groupId: null, collapsed: false, top: 120, bottom: 160, header: null, rows: [row('L1', 120), row('L2', 140)] },
  ],
};
const tabSource = (id, pinned, groupId) => ({ kind: 'tab', id, pinned, groupId, title: id });

test('a gap inside the source bucket resolves to beforeId', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W3', false, 'work'), 61);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W3', groupId: 'work', beforeId: 'W2' });
  assert.deepEqual(hit.indicator, { type: 'line', y: 60 });
});

test('the gap after a bucket\'s last row resolves to null', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 99);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W2', groupId: 'work', beforeId: null });
});

test('a loose tab dropped among group rows joins that group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('L2', false, null), 79);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'L2', groupId: 'work', beforeId: 'W3' });
});

test('a grouped tab dropped in the loose section leaves its group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 141);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W2', groupId: null, beforeId: 'L2' });
});

test('the pin boundary inside a group is valid for both states; deeper gaps only for their own', () => {
  assert.deepEqual(drag.resolveTabDrop(model, tabSource('L1', false, null), 59).intent,
    { kind: 'tab', id: 'L1', groupId: 'work', beforeId: 'W2' });
  assert.deepEqual(drag.resolveTabDrop(model, tabSource('P', true, null), 59).intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null });
  assert.equal(drag.resolveTabDrop(model, tabSource('P', true, null), 81), null, 'pinned tab among unpinned rows');
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 41), null, 'unpinned tab above a group pin');
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 1), null, 'unpinned tab into the pinned section');
});

test('the middle of a header (collapsed or not) appends to that group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('L1', false, null), 110);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'L1', groupId: 'play', beforeId: null });
  assert.deepEqual(hit.indicator, { type: 'header', groupId: 'play' });
  assert.equal(drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 30).intent.groupId, 'work');
});

test('outside the list resolves to nothing', () => {
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), -5), null);
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 400), null);
});

test('an empty loose zone is a valid target for unpinned tabs only', () => {
  const withZone = { ...model, bottom: 190, sections: [...model.sections.slice(0, 3),
    { kind: 'loose', groupId: null, collapsed: false, top: 160, bottom: 190, header: null, rows: [] }] };
  assert.deepEqual(drag.resolveTabDrop(withZone, tabSource('W2', false, 'work'), 175).intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: null });
  assert.equal(drag.resolveTabDrop(withZone, tabSource('W1', true, 'work'), 175), null);
});

test('group drops resolve between group bands', () => {
  assert.deepEqual(drag.resolveGroupDrop(model, 'play', 22).intent,
    { kind: 'group', id: 'play', beforeGroupId: 'work' });
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 119).intent,
    { kind: 'group', id: 'work', beforeGroupId: null });
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 22).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'play' }, 'own position is an accepted no-op target');
  assert.equal(drag.resolveGroupDrop(model, 'work', 500), null);
});

// Keyboard: payload order. Groups: work (open), play (collapsed), solo (open, pins only).
const snapshot = {
  groups: [
    { id: 'work', name: 'work', collapsed: false },
    { id: 'play', name: 'play', collapsed: true },
    { id: 'solo', name: 'solo', collapsed: false },
  ],
  tabs: [
    { id: 'P', groupId: null, pinned: true, title: 'P' },
    { id: 'W1', groupId: 'work', pinned: false, title: 'W1' },
    { id: 'W2', groupId: 'work', pinned: false, title: 'W2' },
    { id: 'Y1', groupId: 'play', pinned: false, title: 'Y1' },
    { id: 'S1', groupId: 'solo', pinned: true, title: 'S1' },
    { id: 'L1', groupId: null, pinned: false, title: 'L1' },
  ],
};

test('keyboard swaps inside a bucket', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'down').intent,
    { kind: 'tab', id: 'W1', groupId: 'work', beforeId: null });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W2', 'up').intent,
    { kind: 'tab', id: 'W2', groupId: 'work', beforeId: 'W1' });
});

test('keyboard crosses into the next eligible bucket, skipping collapsed groups', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W2', 'down').intent,
    { kind: 'tab', id: 'W2', groupId: 'solo', beforeId: null },
    'play is collapsed; solo\'s empty unpinned bucket is a valid visible slot');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'up').intent,
    { kind: 'tab', id: 'L1', groupId: 'solo', beforeId: null });
});

test('keyboard never enters an opposite-state bucket and stops at the ends', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'down').intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null }, 'pinned tab into work\'s empty pinned bucket');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'down'), { stop: 'bottom' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'up'), { stop: 'top' }, 'no unpinned bucket above work');
  assert.equal(drag.keyboardTabMove(snapshot, 'nope', 'up'), null);
});

test('keyboard group moves and end stops', () => {
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'down').intent,
    { kind: 'group', id: 'work', beforeGroupId: 'solo' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'up').intent,
    { kind: 'group', id: 'solo', beforeGroupId: 'play' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'down'), { stop: 'bottom' });
});

test('describeMove names reorders, joins, leaves and dissolving groups', () => {
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'W2', groupId: 'work', beforeId: 'W1' }), 'Moved W2');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'L1', groupId: 'work', beforeId: null }), 'Moved to work');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'W1', groupId: null, beforeId: null }), 'Moved out of work');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'Y1', groupId: 'work', beforeId: null }),
    'Moved to work. Group play removed');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'Y1', groupId: null, beforeId: null }),
    'Moved out of play. Group play removed');
  assert.equal(drag.describeMove(snapshot, { kind: 'group', id: 'play', beforeGroupId: 'work' }), 'Moved group play');
});

function harness({ dropResult = true, modelOverride } = {}) {
  const calls = [];
  const frames = [];
  let currentModel = modelOverride || model;
  let dropResolve;
  let dropReject;
  const effects = {
    readModel: () => { calls.push(['readModel']); return currentModel; },
    capture: (id) => calls.push(['capture', id]),
    release: (id) => calls.push(['release', id]),
    setDragging: (v) => calls.push(['setDragging', v]),
    setSourceDim: (v) => calls.push(['setSourceDim', v]),
    showGhost: () => calls.push(['showGhost']),
    moveGhost: () => {},
    removeGhost: () => calls.push(['removeGhost']),
    setIndicator: (i) => calls.push(['setIndicator', i]),
    scrollBy: (dy) => calls.push(['scrollBy', dy]),
    onDrop: (intent) => {
      calls.push(['onDrop', intent]);
      if (dropResult === 'pending') return new Promise((res, rej) => { dropResolve = res; dropReject = rej; });
      if (dropResult === 'reject') return Promise.reject(new Error('ipc'));
      return Promise.resolve(dropResult);
    },
    onActiveChange: (v) => calls.push(['active', v]),
    announce: (m) => calls.push(['announce', m]),
    // Handles are stable 1-based indices; a run or cancelled frame becomes null.
    requestFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelFrame: (h) => { frames[h - 1] = null; },
    suppressClick: () => calls.push(['suppressClick']),
  };
  const session = drag.createDragSession(effects);
  return {
    session, calls, frames,
    setModel: (m) => { currentModel = m; },
    resolveDrop: (v) => dropResolve(v),
    rejectDrop: () => dropReject(new Error('ipc')),
    named: (name) => calls.filter((c) => c[0] === name),
    pendingFrames: () => frames.filter(Boolean).length,
    runFrame: (index) => { const f = frames[index]; frames[index] = null; f(); },
  };
}
const settle = () => new Promise((r) => setImmediate(r));
const L2 = tabSource('L2', false, null);

test('session: a 3px × 3px diagonal (over 4px in total) starts a drag', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 10, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 13, y: 147 });
  assert.equal(h.session.phase(), 'dragging', 'Euclidean distance, not per-axis');
});

test('session: under 4px stays a click; 4px starts a drag', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 10, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 10, y: 147 });
  assert.equal(h.session.phase(), 'pending');
  h.session.pointerUp({ pointerId: 1 });
  assert.equal(h.session.phase(), 'idle');
  assert.equal(h.named('capture').length, 0);

  h.session.pointerDown({ pointerId: 1, x: 10, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 10, y: 146 });
  assert.equal(h.session.phase(), 'dragging');
  assert.deepEqual(h.named('capture'), [['capture', 1]]);
  assert.deepEqual(h.named('active'), [['active', true]]);
  assert.equal(h.named('suppressClick').length, 1);
  assert.equal(h.named('setSourceDim')[0][1], true);
});

test('session: a valid drop keeps the source dimmed until the IPC settles', async () => {
  const h = harness({ dropResult: 'pending' });
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
  h.session.pointerUp({ pointerId: 1 });
  assert.equal(h.session.phase(), 'settling');
  assert.deepEqual(h.named('onDrop')[0][1], { kind: 'tab', id: 'L2', groupId: 'work', beforeId: 'W3' });
  assert.equal(h.named('setSourceDim').length, 1, 'still dimmed');
  assert.equal(h.session.isActive(), true);
  h.session.lostCapture({ pointerId: 1 });
  assert.equal(h.session.phase(), 'settling', 'our own release does not cancel a settling drop');
  h.resolveDrop(true);
  await settle();
  assert.equal(h.session.phase(), 'idle');
  assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
  assert.deepEqual(h.named('active').at(-1), ['active', false]);
  assert.equal(h.named('announce').length, 0);
});

for (const outcome of [false, 'reject']) {
  test(`session: a drop that resolves ${outcome} restores the source and announces`, async () => {
    const h = harness({ dropResult: outcome });
    h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
    h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
    h.session.pointerUp({ pointerId: 1 });
    await settle();
    assert.equal(h.session.phase(), 'idle');
    assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
    assert.ok(h.named('removeGhost').length >= 1);
    assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null]);
    assert.deepEqual(h.named('announce').at(-1), ['announce', 'Couldn\'t move L2']);
    assert.deepEqual(h.named('active').at(-1), ['active', false]);
  });
}

test('session: Escape while settling is consumed and does not end the drop', async () => {
  const h = harness({ dropResult: 'pending' });
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
  h.session.pointerUp({ pointerId: 1 });
  assert.equal(h.session.escape(), true, 'consumed so the island cannot close');
  assert.equal(h.session.phase(), 'settling', 'the already-sent move is not cancelled');
  h.resolveDrop(true);
  await settle();
  assert.equal(h.session.phase(), 'idle');
  assert.equal(h.named('announce').length, 0);
});

for (const late of ['true', 'false', 'reject']) {
  test(`session: a forced end while settling tears down and ignores a late ${late}`, async () => {
    const h = harness({ dropResult: 'pending' });
    h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
    h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
    h.session.pointerUp({ pointerId: 1 });
    h.session.cancel();
    assert.equal(h.session.phase(), 'idle');
    assert.equal(h.session.isActive(), false);
    assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
    assert.deepEqual(h.named('setDragging').at(-1), ['setDragging', false]);
    assert.deepEqual(h.named('active'), [['active', true], ['active', false]]);
    const callsBefore = h.calls.length;
    if (late === 'reject') h.rejectDrop(); else h.resolveDrop(late === 'true');
    await settle();
    assert.equal(h.calls.length, callsBefore, 'a late result neither announces nor tears down again');
    // A fresh drag after the abort is unaffected by the stale result.
    h.session.pointerDown({ pointerId: 2, x: 0, y: 150, source: L2 });
    assert.equal(h.session.phase(), 'pending');
  });
}

for (const [label, end] of [
  ['Escape', (s) => assert.equal(s.escape(), true)],
  ['pointercancel', (s) => s.pointerCancel({ pointerId: 1 })],
  ['lostpointercapture', (s) => s.lostCapture({ pointerId: 1 })],
  ['release over nothing', (s) => { s.pointerMove({ pointerId: 1, x: 0, y: 900 }); s.pointerUp({ pointerId: 1 }); }],
]) {
  test(`session: ${label} cancels with full teardown and no drop`, () => {
    const h = harness();
    h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
    h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
    end(h.session);
    assert.equal(h.session.phase(), 'idle');
    assert.equal(h.named('onDrop').length, 0);
    assert.deepEqual(h.named('setDragging').at(-1), ['setDragging', false]);
    assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
    assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null]);
    assert.ok(h.named('removeGhost').length >= 1);
    assert.deepEqual(h.named('active').at(-1), ['active', false]);
  });
}

test('session: escape when idle is not handled', () => {
  assert.equal(harness().session.escape(), false);
});

test('session: an invalid gap shows no indicator', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 2 });
  assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null]);
});

test('session: auto-scroll near an edge scrolls and refreshes rects before resolving', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 158 });
  const readsBefore = h.named('readModel').length;
  assert.equal(h.pendingFrames(), 1, 'auto-scroll frame scheduled');
  // After scrolling 12px every row moved up 12px.
  const shifted = { ...model, sections: model.sections.map((s) => ({
    ...s, top: s.top - 12, bottom: s.bottom - 12,
    header: s.header && { top: s.header.top - 12, bottom: s.header.bottom - 12 },
    rows: s.rows.map((r) => ({ ...r, top: r.top - 12, bottom: r.bottom - 12 })) })) };
  h.setModel(shifted);
  h.runFrame(0);
  assert.ok(h.named('scrollBy').length === 1 && h.named('scrollBy')[0][1] > 0);
  assert.equal(h.named('readModel').length, readsBefore + 1, 'rects refreshed after the scroll step');
  // y=158 now sits past L2's shifted bottom (148) → still the loose end slot,
  // computed from the refreshed geometry.
  assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', { type: 'line', y: 148 }]);
  assert.equal(h.pendingFrames(), 1, 'still at the edge, so the next step is scheduled');
  h.session.cancel();
  assert.equal(h.pendingFrames(), 0, 'auto-scroll stops on end');
});

test('session: scrolled() refreshes rects', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
  const reads = h.named('readModel').length;
  h.session.scrolled();
  assert.equal(h.named('readModel').length, reads + 1);
});

test('session: a payload missing the source cancels; a present source does not', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
  h.session.notePayload({ tabs: [{ id: 'L2' }], groups: [] });
  assert.equal(h.session.phase(), 'dragging');
  h.session.notePayload({ tabs: [{ id: 'L1' }], groups: [] });
  assert.equal(h.session.phase(), 'idle');
  const g = harness();
  g.session.pointerDown({ pointerId: 1, x: 0, y: 30, source: { kind: 'group', id: 'work', title: 'work' } });
  g.session.pointerMove({ pointerId: 1, x: 0, y: 115 });
  g.session.notePayload({ tabs: [], groups: [{ id: 'play' }] });
  assert.equal(g.session.phase(), 'idle', 'dissolved source group cancels');
});

test('session: a tab drag cancels when its original group or pinned state changes', () => {
  const W2 = tabSource('W2', false, 'work');
  const start = () => {
    const h = harness();
    h.session.pointerDown({ pointerId: 1, x: 0, y: 70, source: W2 });
    h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
    assert.equal(h.session.phase(), 'dragging');
    return h;
  };
  const groups = [{ id: 'work' }, { id: 'play' }];
  let h = start();
  h.session.notePayload({ tabs: [{ id: 'W2', groupId: 'work', pinned: false }], groups });
  assert.equal(h.session.phase(), 'dragging', 'unchanged source keeps dragging');
  h = start();
  h.session.notePayload({ tabs: [{ id: 'W2', groupId: 'work', pinned: false }], groups: [{ id: 'play' }] });
  assert.equal(h.session.phase(), 'idle', 'original group gone');
  h = start();
  h.session.notePayload({ tabs: [{ id: 'W2', groupId: 'play', pinned: false }], groups });
  assert.equal(h.session.phase(), 'idle', 'moved out of its original group elsewhere');
  h = start();
  h.session.notePayload({ tabs: [{ id: 'W2', groupId: 'work', pinned: true }], groups });
  assert.equal(h.session.phase(), 'idle', 'pinned state changed');
});

test('session: payloads while settling are only deferred', async () => {
  const h = harness({ dropResult: 'pending' });
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
  h.session.pointerUp({ pointerId: 1 });
  h.session.notePayload({ tabs: [{ id: 'L2', groupId: 'work', pinned: false }], groups: [{ id: 'work' }] });
  assert.equal(h.session.phase(), 'settling', 'the payload reflects the move itself');
  h.resolveDrop(true);
  await settle();
  assert.equal(h.session.phase(), 'idle');
});

test('session: a group drag drops a group intent', async () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 110, source: { kind: 'group', id: 'play', title: 'play' } });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 22 });
  h.session.pointerUp({ pointerId: 1 });
  await settle();
  assert.deepEqual(h.named('onDrop')[0][1], { kind: 'group', id: 'play', beforeGroupId: 'work' });
});

test('session: events for another pointer are ignored', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 2, x: 0, y: 100 });
  assert.equal(h.session.phase(), 'pending');
});
