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
  // The page's interface strings, as every chrome document loads them.
  const { createTranslator } = require('../../src/renderer/pages/i18n.js');
  const strings = require('../../src/renderer/pages/strings.en.js');
  const sandbox = {
    blancI18n: { t: createTranslator({ locale: 'en', messages: strings.messages }) },
    TabSections: require('../../src/renderer/tab-sections.js'),
  };
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
    { kind: 'group', id: 'work', beforeGroupId: 'L1' }, 'below play is above the first ungrouped tab');
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 159).intent,
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
    { kind: 'tab', id: 'W2', groupId: null, beforeId: 'Y1' },
    'a group\'s last tab steps down into the gap below it, above collapsed play');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'up').intent,
    { kind: 'tab', id: 'L1', groupId: 'solo', beforeId: null });
});

test('keyboard never enters an opposite-state bucket and stops at the ends', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'down').intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null }, 'pinned tab into work\'s empty pinned bucket');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'down'), { stop: 'bottom' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'up').intent,
    { kind: 'tab', id: 'W1', groupId: null, beforeId: 'W1' }, 'the gap above work: ungrouped in place');
  assert.equal(drag.keyboardTabMove(snapshot, 'nope', 'up'), null);
});

test('keyboard group moves and end stops', () => {
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'down').intent,
    { kind: 'group', id: 'work', beforeGroupId: 'solo' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'up').intent,
    { kind: 'group', id: 'solo', beforeGroupId: 'play' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'down').intent,
    { kind: 'group', id: 'solo', beforeGroupId: null }, 'past the run of ungrouped tabs below it');
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

test('session: releasing beside the list (over the page) is not a drop', async () => {
  const h = harness({ modelOverride: { ...model, left: 0, right: 240 } });
  h.session.pointerDown({ pointerId: 1, x: 20, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 20, y: 79 });
  assert.notDeepEqual(h.named('setIndicator').at(-1), ['setIndicator', null], 'inside: a target');
  h.session.pointerMove({ pointerId: 1, x: 600, y: 79 });
  assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null], 'beside the list: no target');
  h.session.pointerUp({ pointerId: 1 });
  await settle();
  assert.equal(h.named('onDrop').length, 0);
  assert.equal(h.session.phase(), 'idle');
});

// Recently closed band, top to bottom: work (header 0-20, W1 20-40),
// the band (header 40-60, no rows), play collapsed (header 60-80), loose L1 (80-100).
const bandModel = {
  top: 0, bottom: 100, left: 0, right: 600,
  sections: [
    { kind: 'group', groupId: 'work', collapsed: false, top: 0, bottom: 40, header: { top: 0, bottom: 20 },
      rows: [{ id: 'W1', pinned: false, top: 20, bottom: 40 }] },
    { kind: 'closed', groupId: 'recently-closed', collapsed: true, top: 40, bottom: 60, header: { top: 40, bottom: 60 }, rows: [] },
    { kind: 'group', groupId: 'play', collapsed: true, top: 60, bottom: 80, header: { top: 60, bottom: 80 }, rows: [] },
    { kind: 'loose', groupId: null, collapsed: false, top: 80, bottom: 100, header: null,
      rows: [{ id: 'L1', pinned: false, top: 80, bottom: 100 }] },
  ],
};
const bandSnapshot = {
  groups: [{ id: 'work', name: 'work', collapsed: false }, { id: 'solo', name: 'solo', collapsed: false }],
  closedSlot: 1,
  closed: [{ id: 'x', title: 'X', favicon: null, tabCount: 1 }],
  tabs: [{ id: 'W1', groupId: 'work', pinned: false, title: 'W1' }, { id: 'S1', groupId: 'solo', pinned: false, title: 'S1' }],
};

test('the closed band is never a tab drop target', () => {
  for (let y = 40; y <= 60; y += 5) {
    const drop = drag.resolveTabDrop(bandModel, { kind: 'tab', id: 'L1', pinned: false, groupId: null }, y);
    assert.notEqual(drop?.intent.groupId, 'recently-closed', `y=${y}`);
  }
});

test('a group dropped onto the band slot lands above it', () => {
  assert.deepEqual(drag.resolveGroupDrop(bandModel, 'play', 45).intent,
    { kind: 'group', id: 'play', beforeGroupId: 'recently-closed' });
});

test('a group dropped just below the band lands below it', () => {
  assert.deepEqual(drag.resolveGroupDrop(bandModel, 'work', 65).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'play' });
});

test('keyboard moves step past the band in the island only', () => {
  assert.deepEqual(drag.keyboardGroupMove(bandSnapshot, 'work', 'down', { withClosed: true }).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'solo' });
  assert.deepEqual(drag.keyboardGroupMove(bandSnapshot, 'solo', 'up', { withClosed: true }).intent,
    { kind: 'group', id: 'solo', beforeGroupId: 'recently-closed' });
  assert.deepEqual(drag.keyboardGroupMove(bandSnapshot, 'work', 'down').intent,
    { kind: 'group', id: 'work', beforeGroupId: null }, 'the rail keeps today\'s result');
});

test('the band itself moves with the keyboard', () => {
  assert.deepEqual(drag.keyboardGroupMove(bandSnapshot, 'recently-closed', 'up', { withClosed: true }).intent,
    { kind: 'group', id: 'recently-closed', beforeGroupId: 'work' });
  assert.deepEqual(drag.keyboardGroupMove({ ...bandSnapshot, closedSlot: 0 }, 'recently-closed', 'up', { withClosed: true }),
    { stop: 'top' });
  assert.equal(drag.keyboardGroupMove({ ...bandSnapshot, closed: [] }, 'recently-closed', 'up', { withClosed: true }), null);
});

test('describeMove names a band move', () => {
  assert.equal(drag.describeMove(bandSnapshot, { kind: 'group', id: 'recently-closed', beforeGroupId: 'solo' }),
    'Moved Recently closed');
});

test('closedSlotIndex clamps', () => {
  assert.equal(drag.closedSlotIndex({ ...bandSnapshot, closedSlot: 5 }), 2);
  assert.equal(drag.closedSlotIndex({ groups: [] }), 0);
  assert.equal(drag.closedSlotIndex({ ...bandSnapshot, closedSlot: -3 }), 0);
});

test('CLOSED_SECTION_ID matches main', () => {
  assert.equal(drag.constants.CLOSED_SECTION_ID, require('../../src/main/closed-slot').CLOSED_SECTION_ID);
});

// Geometry observed in installed Electron Blanc 1.36.0, not prototype CSS.
const tieRow = (id, top, pinned = false) => ({ id, top, bottom: top + 32, pinned });
const tieSection = (kind, top, bottom, rows) => ({ kind, groupId: null, top, bottom, rows });
const tieTab = (id, pinned = false) => ({ kind: 'tab', id, pinned, groupId: null });

test('empty pinned section cannot swallow the first loose-tab gap', () => {
  const model = { top: 65, bottom: 161, sections: [
    tieSection('pinned', 65, 65, []),
    tieSection('loose', 65, 161, [tieRow('A', 65), tieRow('N', 97), tieRow('B', 129)]),
  ] };
  assert.equal(drag.resolveTabDrop(model, tieTab('B'), 73)?.intent.beforeId, 'A');
});

test('coincident boundary accepts each source only into its own bucket', () => {
  const model = { top: 0, bottom: 128, sections: [
    tieSection('pinned', 0, 64, [tieRow('P', 0, true), tieRow('Q', 32, true)]),
    tieSection('loose', 64, 128, [tieRow('A', 64), tieRow('B', 96)]),
  ] };
  assert.equal(drag.resolveTabDrop(model, tieTab('B'), 64)?.intent.beforeId, 'A');
  assert.equal(drag.resolveTabDrop(model, tieTab('P', true), 64)?.intent.beforeId, null);
  assert.equal(drag.resolveTabDrop(model, tieTab('B'), 5), null);
  assert.equal(drag.resolveTabDrop(model, tieTab('P', true), 120), null);
});

test('a pinned source still prefers the pinned section beside empty loose', () => {
  const model = { top: 0, bottom: 64, sections: [
    tieSection('pinned', 0, 64, [tieRow('P', 0, true), tieRow('Q', 32, true)]),
    tieSection('loose', 64, 64, []),
  ] };
  assert.equal(drag.resolveTabDrop(model, tieTab('P', true), 64)?.intent.beforeId, null);
});

// Ungrouped tabs anywhere (spec 2026-10-17). Group sections carry their first
// drawn tab (data-first-tab-id) so a gap above a group can name it.
const gapModel = {
  top: 0, bottom: 150,
  sections: [
    { kind: 'group', groupId: 'work', firstTabId: 'W1', collapsed: false, top: 0, bottom: 60, header: { top: 0, bottom: 20 },
      rows: [row('W1', 20), row('W2', 40)] },
    { kind: 'loose', groupId: null, collapsed: false, top: 60, bottom: 80, header: null, rows: [row('L1', 60)] },
    { kind: 'group', groupId: 'play', firstTabId: 'Y1', collapsed: true, top: 80, bottom: 100, header: { top: 80, bottom: 100 }, rows: [] },
    // A band's bottom padding (140-150) separates its last row from the gap below.
    { kind: 'group', groupId: 'solo', firstTabId: 'S1', collapsed: false, top: 100, bottom: 150, header: { top: 100, bottom: 120 },
      rows: [row('S1', 120)] },
  ],
};

test('drop above the first group is loose', () => {
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('L1', false, null), 1).intent,
    { kind: 'tab', id: 'L1', groupId: null, beforeId: 'W1' });
});

test('drop between two groups is loose with the next group\'s first tab', () => {
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('S1', false, 'solo'), 99).intent,
    { kind: 'tab', id: 'S1', groupId: null, beforeId: 'S1' }, 'just above solo, its own first tab');
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('W2', false, 'work'), 79).intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: 'Y1' }, 'the end of a run is above the next group');
});

test('drop below the last group appends', () => {
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('W2', false, 'work'), 149).intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: null });
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('W2', false, 'work'), 141).intent,
    { kind: 'tab', id: 'W2', groupId: 'solo', beforeId: null }, 'just under the last row still joins');
  assert.equal(drag.resolveTabDrop(gapModel, tabSource('P', true, null), 149), null, 'pins never enter a gap');
});

test('header top quarter targets the gap, middle joins', () => {
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('L1', false, null), 102).intent,
    { kind: 'tab', id: 'L1', groupId: null, beforeId: 'S1' });
  assert.deepEqual(drag.resolveTabDrop(gapModel, tabSource('L1', false, null), 110).intent,
    { kind: 'tab', id: 'L1', groupId: 'solo', beforeId: null });
});

test('group drop between two loose tabs', () => {
  const twoLoose = { top: 0, bottom: 80, sections: [
    { kind: 'loose', groupId: null, collapsed: false, top: 0, bottom: 40, header: null, rows: [row('L1', 0), row('L2', 20)] },
    { kind: 'group', groupId: 'work', firstTabId: 'W1', collapsed: false, top: 40, bottom: 80, header: { top: 40, bottom: 60 },
      rows: [row('W1', 60)] },
  ] };
  assert.deepEqual(drag.resolveGroupDrop(twoLoose, 'work', 21).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'L2' });
  assert.deepEqual(drag.resolveGroupDrop(twoLoose, 'work', 1).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'L1' });
});

const gapSnapshot = {
  groups: [
    { id: 'work', name: 'work', collapsed: false },
    { id: 'play', name: 'play', collapsed: true },
    { id: 'solo', name: 'solo', collapsed: false },
  ],
  tabs: [
    { id: 'L0', groupId: null, pinned: false, title: 'L0' },
    { id: 'W1', groupId: 'work', pinned: false, title: 'W1' },
    { id: 'W2', groupId: 'work', pinned: false, title: 'W2' },
    { id: 'Y1', groupId: 'play', pinned: false, title: 'Y1' },
    { id: 'S1', groupId: 'solo', pinned: false, title: 'S1' },
    { id: 'L1', groupId: null, pinned: false, title: 'L1' },
    { id: 'L2', groupId: null, pinned: false, title: 'L2' },
  ],
};

test('keyboard down from a group\'s last tab stops in the gap below', () => {
  assert.deepEqual(drag.keyboardTabMove(gapSnapshot, 'W2', 'down').intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: 'Y1' });
  assert.deepEqual(drag.keyboardTabMove(gapSnapshot, 'L0', 'down').intent,
    { kind: 'tab', id: 'L0', groupId: 'work', beforeId: 'W1' }, 'a run\'s last tab joins the next group at its top');
});

test('keyboard skips a collapsed group but keeps its gaps', () => {
  // The gap above play, then the gap between play and solo, then solo.
  const step1 = { ...gapSnapshot, tabs: gapSnapshot.tabs.map((t) => (t.id === 'W2' ? { ...t, groupId: null } : t)) };
  step1.tabs = [step1.tabs[0], step1.tabs[1], step1.tabs[2], ...step1.tabs.slice(3)];
  assert.deepEqual(drag.keyboardTabMove(step1, 'W2', 'down').intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: 'S1' }, 'past collapsed play into the gap above solo');
  assert.deepEqual(drag.keyboardTabMove(gapSnapshot, 'S1', 'up').intent,
    { kind: 'tab', id: 'S1', groupId: null, beforeId: 'S1' }, 'the gap between play and solo');
});

test('group keyboard move steps over a whole run', () => {
  assert.deepEqual(drag.keyboardGroupMove(gapSnapshot, 'solo', 'down').intent,
    { kind: 'group', id: 'solo', beforeGroupId: null });
  assert.deepEqual(drag.keyboardGroupMove(gapSnapshot, 'work', 'up').intent,
    { kind: 'group', id: 'work', beforeGroupId: 'L0' });
  assert.deepEqual(drag.keyboardGroupMove(gapSnapshot, 'work', 'down').intent,
    { kind: 'group', id: 'work', beforeGroupId: 'solo' });
});

test('closedSlotIndex counts groups and ungrouped tabs', () => {
  assert.equal(drag.closedSlotIndex({ ...gapSnapshot, closedSlot: 9 }), 6);
  assert.equal(drag.closedSlotIndex({ ...gapSnapshot, closedSlot: 2 }), 2);
});

// Recently closed between ungrouped tabs (final review, Important 1): the
// place directly above the band says so; directly below names the next item.
const bandRunModel = {
  top: 0, bottom: 100,
  sections: [
    { kind: 'loose', groupId: null, collapsed: false, top: 0, bottom: 40, header: null, rows: [row('L1', 0), row('L2', 20)] },
    { kind: 'closed', groupId: 'recently-closed', collapsed: true, top: 44, bottom: 60, header: { top: 44, bottom: 60 }, rows: [] },
    { kind: 'loose', groupId: null, collapsed: false, top: 64, bottom: 84, header: null, rows: [row('L3', 64)] },
  ],
};

test('the end of the run above the band is directly above the band', () => {
  assert.deepEqual(drag.resolveTabDrop(bandRunModel, tabSource('L3', false, null), 41).intent,
    { kind: 'tab', id: 'L3', groupId: null, beforeId: 'recently-closed' });
  assert.deepEqual(drag.resolveTabDrop(bandRunModel, tabSource('L1', false, null), 63).intent,
    { kind: 'tab', id: 'L1', groupId: null, beforeId: 'L3' }, 'directly below the band');
});

test('keyboard steps a tab across the band one place at a time in the island', () => {
  const snap = {
    groups: [],
    closedSlot: 1,
    closed: [{ id: 'x', title: 'X', favicon: null, tabCount: 1 }],
    tabs: [{ id: 'L1', groupId: null, pinned: false, title: 'L1' }, { id: 'L2', groupId: null, pinned: false, title: 'L2' }],
  };
  assert.deepEqual(drag.keyboardTabMove(snap, 'L2', 'up', { withClosed: true }).intent,
    { kind: 'tab', id: 'L2', groupId: null, beforeId: 'recently-closed' });
  assert.deepEqual(drag.keyboardTabMove(snap, 'L1', 'down', { withClosed: true }).intent,
    { kind: 'tab', id: 'L1', groupId: null, beforeId: 'L2' });
  assert.deepEqual(drag.keyboardTabMove(snap, 'L2', 'up').intent,
    { kind: 'tab', id: 'L2', groupId: null, beforeId: 'L1' }, 'the rail has no band');
});
