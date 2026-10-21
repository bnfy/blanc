'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HOVER_OPEN_DWELL_MS, initialHoverState, pointInRect, hoverStep } = require('../../src/main/island-hover-open');

const move = (state, inside, extra = {}) => hoverStep(state, {
  type: 'move', inside, eligible: true, buttonsDown: false, ...extra,
});

test('entry starts one dwell and motion inside does not restart', () => {
  const entered = move(initialHoverState(), true);
  assert.equal(entered.effect, 'start');
  for (let i = 0; i < 3; i += 1) assert.equal(move(entered.state, true).effect, null);
});

test('exit before dwell cancels and re-arms', () => {
  const entered = move(initialHoverState(), true);
  assert.deepEqual(move(entered.state, false), {
    state: { inside: false, armed: true, dwelling: false }, effect: 'cancel',
  });
});

test('fired opens once; exit and re-entry re-arms', () => {
  const entered = move(initialHoverState(), true);
  const fired = hoverStep(entered.state, { type: 'fired' });
  assert.equal(fired.effect, 'open');
  assert.equal(hoverStep(fired.state, { type: 'fired' }).effect, null);
  assert.equal(move(fired.state, true).effect, null);
  const exited = move(fired.state, false);
  assert.equal(move(exited.state, true).effect, 'start');
});

test('retract sample never starts a dwell', () => {
  let step = move(initialHoverState(), true, { sampled: true });
  assert.deepEqual(step, { state: { inside: true, armed: false, dwelling: false }, effect: null });
  assert.equal(move(step.state, true).effect, null);
  step = move(step.state, false);
  assert.equal(move(step.state, true).effect, 'start');
});

test('ineligible entry and buttons down disarm until exit', () => {
  let step = move(initialHoverState(), true, { eligible: false });
  assert.equal(move(step.state, true).effect, null);
  step = move(initialHoverState(), true, { buttonsDown: true });
  assert.equal(step.effect, null);
  const entered = move(initialHoverState(), true);
  assert.equal(move(entered.state, true, { buttonsDown: true }).effect, 'cancel');
});

test('ineligible event cancels and disarms until exit', () => {
  const entered = move(initialHoverState(), true);
  let step = hoverStep(entered.state, { type: 'ineligible' });
  assert.equal(step.effect, 'cancel');
  assert.equal(move(step.state, true).effect, null);
  step = move(step.state, false);
  assert.equal(move(step.state, true).effect, 'start');
});

test('pointInRect includes edges and rejects invalid rectangles', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };
  assert.equal(pointInRect({ x: 10, y: 20 }, rect), true);
  assert.equal(pointInRect({ x: 40, y: 60 }, rect), true);
  assert.equal(pointInRect({ x: 41, y: 60 }, rect), false);
  assert.equal(pointInRect({ x: 10, y: 20 }, null), false);
});

test('dwell constant is 300 ms', () => assert.equal(HOVER_OPEN_DWELL_MS, 300));
