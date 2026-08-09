'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  RANGE,
  smoothstep,
  distanceToRect,
  closeness,
  lean,
  shadowClearanceAtFullCloseness,
  fitsInsideStrip,
  SCALE_AT_1,
  RISE_AT_1,
} = require('../../src/main/island-proximity');

// The resting pill as it actually renders, measured in the running chrome:
// top 11.5, bottom 50.28 inside a 64px strip, with the shadow fading to white
// exactly at 64. See the --shadow-pill note in tokens/layout.css.
const PILL = { x: 466, y: 11.5, width: 348, height: 38.78 };
const SHADOW_REACH = 13.72;
const STRIP_H = 64;

test('closeness is 0 beyond the range and 1 on the pill', () => {
  assert.equal(closeness({ x: 640, y: PILL.y + PILL.height + RANGE }, PILL), 0);
  assert.equal(closeness({ x: 640, y: PILL.y + PILL.height + RANGE + 400 }, PILL), 0);
  assert.equal(closeness({ x: 640, y: PILL.y + 5 }, PILL), 1);
});

test('closeness rises as the cursor approaches, with no step at the edge', () => {
  const at = (d) => closeness({ x: 640, y: PILL.y + PILL.height + d }, PILL);
  const samples = [250, 200, 150, 100, 50, 10, 0].map(at);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] > samples[i - 1], `closeness should grow: ${samples}`);
  }
  // smoothstep flattens at both ends, so the first step off the edge is tiny —
  // that is what stops the effect switching on visibly.
  assert.ok(at(249) < 0.001, `just inside the range should be imperceptible, got ${at(249)}`);
  assert.ok(at(1) > 0.999, `all but touching should be ~1, got ${at(1)}`);
});

test('distance is measured to the pill box, not its centre', () => {
  // A cursor beside the pill's left edge is close, even though the pill is wide.
  const besideEdge = { x: PILL.x - 20, y: PILL.y + 10 };
  assert.equal(distanceToRect(besideEdge, PILL), 20);
  // Inside the box is zero.
  assert.equal(distanceToRect({ x: 640, y: 20 }, PILL), 0);
});

test('smoothstep is clamped and symmetric about its midpoint', () => {
  assert.equal(smoothstep(-1), 0);
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(2), 1);
  assert.equal(smoothstep(0.5), 0.5);
  assert.ok(Math.abs((smoothstep(0.25) + smoothstep(0.75)) - 1) < 1e-9);
});

test('lean points toward the cursor and is gated by closeness', () => {
  const k = 1;
  const left = lean({ x: PILL.x - 100, y: PILL.y }, PILL, k);
  const right = lean({ x: PILL.x + PILL.width + 100, y: PILL.y }, PILL, k);
  assert.ok(left < 0, 'cursor to the left should lean left');
  assert.ok(right > 0, 'cursor to the right should lean right');
  assert.ok(Math.abs(left) <= 1 && Math.abs(right) <= 1, 'lean stays in -1..1');
  // Dead centre, no lean.
  assert.ok(Math.abs(lean({ x: PILL.x + PILL.width / 2, y: PILL.y }, PILL, k)) < 1e-9);
  // Far away, no lean even though the cursor is off to one side.
  assert.equal(lean({ x: PILL.x - 100, y: PILL.y }, PILL, 0), 0);
});

// ---------------------------------------------------------------------------
// The one that matters. This is a guard, not a description: the pill's shadow
// has ZERO headroom at rest, so if someone shrinks the rise or grows the scale
// the shadow starts getting sliced at the strip's edge — the exact bug fixed in
// PR #93, twice. The numbers here mirror styles.css.
// ---------------------------------------------------------------------------

test('the rise out-runs the scale, so the shadow never reaches the strip edge', () => {
  const clearance = shadowClearanceAtFullCloseness({
    pillHeight: PILL.height,
    shadowReach: SHADOW_REACH,
  });
  assert.ok(clearance > 0,
    `the shadow would clip at full closeness by ${(-clearance).toFixed(2)}px — ` +
    `the rise (${RISE_AT_1}px) must exceed ${((PILL.height + SHADOW_REACH) * SCALE_AT_1).toFixed(2)}px`);

  // And state where the shadow actually lands, so a regression reads clearly.
  const shadowBottom = PILL.y + PILL.height + SHADOW_REACH - clearance;
  assert.ok(shadowBottom <= STRIP_H,
    `shadow bottom ${shadowBottom.toFixed(2)} must stay inside the ${STRIP_H}px strip`);
});

test('every term is linear in closeness, so k=1 is the worst case', () => {
  // Half closeness = half the growth and half the rise, so clearance halves too.
  const full = shadowClearanceAtFullCloseness({ pillHeight: PILL.height, shadowReach: SHADOW_REACH });
  const half = shadowClearanceAtFullCloseness({
    pillHeight: PILL.height, shadowReach: SHADOW_REACH,
    scaleAt1: SCALE_AT_1 / 2, riseAt1: RISE_AT_1 / 2,
  });
  assert.ok(Math.abs(half - full / 2) < 1e-9,
    'clearance must scale linearly with closeness — otherwise k=1 is not the worst case');
});

test('fitsInsideStrip rejects the shapes that broke before', () => {
  const base = { pillHeight: PILL.height, shadowReach: SHADOW_REACH };
  // No rise at all — the original variant C, which overshot badly.
  assert.equal(fitsInsideStrip({ ...base, riseAt1: 0 }), false);
  // A rise that only pays for the box and forgets the shadow stretches too.
  assert.equal(fitsInsideStrip({ ...base, riseAt1: PILL.height * SCALE_AT_1 }), false);
  // What we ship.
  assert.equal(fitsInsideStrip(base), true);
});
