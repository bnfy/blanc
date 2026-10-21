'use strict';

// Floating Glance: the card's drag lifecycle in the strip document
// (src/renderer/glance-card-drag.js). Each step is an IPC round trip, so a
// pointerup can arrive while a step is still in flight; after that the drag
// must end, and later hover moves must not move the card.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createCardDrag } = require('../../src/renderer/glance-card-drag');

function harness() {
  const sent = [];
  const frames = [];
  let pendingResolve = null;
  const drag = createCardDrag({
    send: (kind, input) => {
      sent.push({ kind, ...input });
      return new Promise((resolve) => { pendingResolve = resolve; });
    },
    schedule: (fn) => frames.push(fn),
  });
  const runFrames = () => { while (frames.length) frames.shift()(); };
  const settle = async (frame) => { const resolve = pendingResolve; pendingResolve = null; resolve(frame); await new Promise((r) => setImmediate(r)); };
  return { drag, sent, runFrames, settle };
}

const frame = { x: 100, y: 100, width: 800, height: 600 };

test('a move drag sends the step from the last frame main returned', async () => {
  const { drag, sent, runFrames, settle } = harness();
  drag.start({ pointerId: 1, edge: null, generation: 4, x: 10, y: 10, frame });
  drag.move(1, 40, 30);
  runFrames();
  assert.deepEqual(sent, [{ kind: 'move', generation: 4, dx: 30, dy: 20 }]);
  await settle({ ...frame, x: 130, y: 120 });
  drag.move(1, 50, 30);
  runFrames();
  assert.deepEqual(sent[1], { kind: 'move', generation: 4, dx: 10, dy: 0 });
});

test('a release while a step is in flight ends the drag: later hover moves send nothing', async () => {
  const { drag, sent, runFrames, settle } = harness();
  drag.start({ pointerId: 1, edge: null, generation: 4, x: 10, y: 10, frame });
  drag.move(1, 40, 30);
  runFrames();
  assert.equal(sent.length, 1, 'a step is in flight');
  drag.end(1, 60, 30);
  await settle({ ...frame, x: 130, y: 120 });
  runFrames();
  // The release's own position still lands as the drag's last step.
  assert.deepEqual(sent[1], { kind: 'move', generation: 4, dx: 20, dy: 0 });
  await settle({ ...frame, x: 150, y: 120 });
  runFrames();
  assert.equal(drag.active(), false);
  drag.move(1, 400, 300);
  runFrames();
  assert.equal(sent.length, 2, 'a hover move after the release sends nothing');
});

test('a resize from the left edge keeps the right edge where the pointer wants it', async () => {
  const { drag, sent, runFrames } = harness();
  drag.start({ pointerId: 2, edge: 'w', generation: 1, x: 100, y: 300, frame });
  drag.move(2, 160, 300);
  runFrames();
  assert.deepEqual(sent, [{ kind: 'resize', edge: 'w', generation: 1, dx: 60, dy: 0 }]);
});

test('a refused step (null) ends the drag', async () => {
  const { drag, runFrames, settle } = harness();
  drag.start({ pointerId: 1, edge: null, generation: 4, x: 10, y: 10, frame });
  drag.move(1, 40, 30);
  runFrames();
  await settle(null);
  assert.equal(drag.active(), false);
});

test('a newer card generation cancels the drag', () => {
  const { drag } = harness();
  drag.start({ pointerId: 1, edge: null, generation: 4, x: 10, y: 10, frame });
  drag.cancelUnless(5);
  assert.equal(drag.active(), false);
});
