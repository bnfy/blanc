'use strict';

/**
 * Island proximity — how close the cursor is to the resting pill.
 *
 * Main owns this because the cursor spends most of its life over the page,
 * which is a different WebContentsView from the chrome the pill lives in. The
 * chrome renderer never sees those moves. Main does (every view reports its
 * input events), so main measures the distance and hands the renderer a single
 * number; the renderer only animates.
 *
 * Pure functions, no Electron. The clipping invariant below is the reason this
 * is a module rather than a few lines inline: it needs a test.
 */

/** How far out the pill starts reacting, in CSS px. */
const RANGE = 250;

/** Inside this distance the effect is fully settled (k = 1): the pill reaches
 *  its final size and position while the cursor is still on approach, so the
 *  click target has stopped moving before the user aims at it. (The lean can
 *  still drift sub-pixel amounts inside the settle zone — it tracks cursor x —
 *  but at MAX_LEAN 3px over a ~400px denominator that is well under 1px.) */
const SETTLE = 80;

/** Furthest the pill leans toward the cursor, in CSS px. */
const MAX_LEAN = 3;

/** Geometry of the effect at full closeness. Mirrors styles.css — see fitsInsideStrip. */
const SCALE_AT_1 = 0.02;    // grows 2%
const RISE_AT_1 = 2;        // lifts 2px

/** Smoothstep: no edge you can feel at either end of the range. */
function smoothstep(t) {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Shortest distance from a point to a rectangle's edge; 0 when inside.
 * Measured to the box rather than its centre — otherwise a wide pill reads as
 * "far" while the cursor is sitting right beside it.
 */
function distanceToRect(point, rect) {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/** 0 when further than RANGE, 1 at or inside SETTLE. The active band is
 *  [settle, range]: the motion finishes early so the pill is stationary well
 *  before the cursor arrives. */
function closeness(point, rect, range = RANGE, settle = SETTLE) {
  if (!point || !rect || !(rect.width > 0) || !(range > settle)) return 0;
  const d = distanceToRect(point, rect);
  if (d <= settle) return 1;
  const k = smoothstep(1 - Math.min(d - settle, range - settle) / (range - settle));
  // Snap the ends. Dividing by the range leaves float dust at the boundary
  // (1 - 250/250 comes out at 1e-16, not 0), and an exact 0 is what lets the
  // sender stop talking to the renderer once you walk away.
  if (k < 1e-4) return 0;
  if (k > 1 - 1e-4) return 1;
  return k;
}

/**
 * Which way, and how hard, the pill leans: -1 (cursor far to the left) through
 * +1. Scaled by closeness so it can only lean while it is also awake.
 */
function lean(point, rect, k) {
  if (!point || !rect || !(rect.width > 0) || !(k > 0)) return 0;
  const centreX = rect.x + rect.width / 2;
  const offset = (point.x - centreX) / (rect.width / 2 + RANGE);
  return Math.max(-1, Math.min(1, offset)) * k;
}

/**
 * THE INVARIANT. The pill's shadow currently fades to nothing exactly at the
 * bottom of the chrome strip — there is no headroom at all (see the
 * `--shadow-pill` note in tokens/layout.css). Scaling the pill therefore
 * clips it twice over: the box grows downward, and the shadow grows with it.
 *
 * The rise is what pays for both. This returns how far the shadow's bottom
 * edge sits from the strip's edge at full closeness — positive means clear.
 * It must never be negative, at any closeness, and because every term is
 * linear in k, checking k = 1 checks the whole range.
 *
 * Keep this in step with the `#islandPill` rules in styles.css.
 */
function shadowClearanceAtFullCloseness({
  pillHeight,
  shadowReach,
  scaleAt1 = SCALE_AT_1,
  riseAt1 = RISE_AT_1,
}) {
  // Downward growth of the box, plus the shadow stretching by the same factor.
  const growth = (pillHeight + shadowReach) * scaleAt1;
  return riseAt1 - growth;
}

/** Convenience predicate for the test and for anyone tuning the numbers. */
function fitsInsideStrip(geometry) {
  return shadowClearanceAtFullCloseness(geometry) > 0;
}

module.exports = {
  RANGE,
  SETTLE,
  MAX_LEAN,
  SCALE_AT_1,
  RISE_AT_1,
  smoothstep,
  distanceToRect,
  closeness,
  lean,
  shadowClearanceAtFullCloseness,
  fitsInsideStrip,
};
