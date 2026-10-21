'use strict';

// Floating Glance: moving, resizing and resetting the card. Every change
// carries the open card's generation, so a message from a card that has
// closed (or been replaced) never moves anything; saves are debounced and a
// close flushes them.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createGlanceCardController } = require('../../src/main/glance-card-controller');
const { frameToFractions, CARD_MIN_WIDTH, CARD_MIN_HEIGHT } = require('../../src/main/glance-card');

const area = { x: 0, y: 68, width: 1600, height: 832 };

function harness() {
  const world = { open: true, generation: 1, stored: null, writes: 0, relayouts: 0, timers: [] };
  const controller = createGlanceCardController({
    isOpen: () => world.open,
    generation: () => world.generation,
    pageArea: () => area,
    readFrame: () => world.stored,
    writeFrame: (fractions) => { world.stored = fractions; world.writes += 1; return true; },
    relayout: () => { world.relayouts += 1; },
    setTimer: (fn, ms) => { const timer = { fn, ms, cleared: false }; world.timers.push(timer); return timer; },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
  });
  const close = () => { controller.flush(); world.open = false; world.generation += 1; };
  const reopen = () => { world.open = true; world.generation += 1; };
  const pending = () => world.timers.filter((t) => !t.cleared && !t.ran);
  const runTimers = () => { for (const t of pending()) { t.ran = true; t.fn(); } };
  return { world, controller, close, reopen, pending, runTimers };
}

test('a move shifts the card and saves it after 250 ms', () => {
  const { world, controller, pending, runTimers } = harness();
  const start = controller.frame();
  const moved = controller.move({ generation: 1, dx: 40, dy: 20 });
  assert.deepEqual(moved, { ...start, x: start.x + 40, y: start.y + 20 });
  assert.deepEqual(controller.frame(), moved, 'the live frame follows before the save');
  assert.equal(world.writes, 0);
  assert.equal(pending()[0].ms, 250);
  runTimers();
  assert.deepEqual(world.stored, frameToFractions(moved, area));
  assert.ok(world.relayouts >= 1);
});

test('a move carrying an old generation after a close changes nothing', () => {
  const { world, controller, close } = harness();
  close();
  assert.equal(controller.move({ generation: 1, dx: 40, dy: 0 }), null);
  assert.equal(world.stored, null);
});

test('after a close and an immediate reopen, the first card\'s late move cannot move the new card', () => {
  const { world, controller, close, reopen } = harness();
  close();
  reopen();
  const before = controller.frame();
  assert.equal(controller.move({ generation: 1, dx: 300, dy: 0 }), null);
  assert.deepEqual(controller.frame(), before);
  assert.equal(world.stored, null);
});

test('a close flushes a pending save at once and leaves no timer', () => {
  const { world, controller, close, pending } = harness();
  const moved = controller.move({ generation: 1, dx: 10, dy: 10 });
  close();
  assert.deepEqual(world.stored, frameToFractions(moved, area));
  assert.equal(pending().length, 0);
});

test('a resize below the minimum stops at it', () => {
  const { controller } = harness();
  const frame = controller.resize({ generation: 1, edge: 'se', dx: -5000, dy: -5000 });
  assert.equal(frame.width, CARD_MIN_WIDTH);
  assert.equal(frame.height, CARD_MIN_HEIGHT);
});

test('a resize with an unknown edge or a bad delta changes nothing', () => {
  const { controller } = harness();
  const before = controller.frame();
  assert.deepEqual(controller.resize({ generation: 1, edge: 'middle', dx: 50, dy: 50 }), before);
  assert.deepEqual(controller.move({ generation: 1, dx: Number.NaN, dy: 'x' }), before);
});

test('reset forgets the remembered frame', () => {
  const { world, controller, runTimers } = harness();
  controller.move({ generation: 1, dx: 100, dy: 0 });
  runTimers();
  assert.notEqual(world.stored, null);
  const reset = controller.reset({ generation: 1 });
  assert.equal(world.stored, null);
  assert.deepEqual(reset, controller.frame());
});

test('nothing changes while no Glance is open', () => {
  const { world, controller } = harness();
  world.open = false;
  assert.equal(controller.move({ generation: 1, dx: 1, dy: 1 }), null);
  assert.equal(controller.resize({ generation: 1, edge: 'e', dx: 1, dy: 0 }), null);
  assert.equal(controller.reset({ generation: 1 }), null);
});
