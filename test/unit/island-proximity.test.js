'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  RANGE,
  SETTLE,
  smoothstep,
  distanceToRect,
  closeness,
  shadowClearanceAtFullCloseness,
  fitsInsideStrip,
  SCALE_AT_1,
  RISE_AT_1,
} = require('../../src/main/island-proximity');

// The website-inspired resting island's rendered geometry. The shorter site
// shadow reaches 12px below the 44px face and remains inside the 68px strip.
const PILL = { x: 466, y: 11.5, width: 348, height: 44 };
const SHADOW_REACH = 12;
const STRIP_H = 68;

test('closeness is 0 beyond the range and 1 on the pill', () => {
  assert.equal(closeness({ x: 640, y: PILL.y + PILL.height + RANGE }, PILL), 0);
  assert.equal(closeness({ x: 640, y: PILL.y + PILL.height + RANGE + 400 }, PILL), 0);
  assert.equal(closeness({ x: 640, y: PILL.y + 5 }, PILL), 1);
});

test('closeness rises as the cursor approaches, with no step at the edge', () => {
  const at = (d) => closeness({ x: 640, y: PILL.y + PILL.height + d }, PILL);
  // Strictly growing over the active band only — [SETTLE, RANGE].
  const samples = [250, 210, 170, 130, 90].map(at);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] > samples[i - 1], `closeness should grow: ${samples}`);
  }
  // smoothstep flattens at both ends, so the first step off the edge is tiny —
  // that is what stops the effect switching on visibly.
  assert.ok(at(249) < 0.001, `just inside the range should be imperceptible, got ${at(249)}`);
  assert.ok(at(SETTLE + 1) > 0.999, `just outside the settle distance should be ~1, got ${at(SETTLE + 1)}`);
});

// The mis-click fix: the pill finishes moving while the cursor is still on
// approach. Inside SETTLE the effect is exactly settled — the click target is
// stationary at aim time.
test('closeness is exactly 1 at and inside the settle distance', () => {
  const at = (d) => closeness({ x: 640, y: PILL.y + PILL.height + d }, PILL);
  assert.equal(at(SETTLE), 1);
  assert.equal(at(40), 1);
  assert.equal(at(0), 1);
  assert.ok(SETTLE >= 60, `the settle band must leave real aiming room, got ${SETTLE}px`);
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

// ---------------------------------------------------------------------------
// The one that matters. This is a guard, not a description: the pill's shadow
// still needs enough headroom at full proximity: if someone shrinks the rise
// or grows the scale, the shadow can be sliced at the strip's edge. The
// numbers here mirror styles.css.
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
