'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  trailGeometry,
  celebrationTier,
  CELEBRATION_MS,
  TRAIL_MS,
  AUTO_TRAIL_DELAY_MS,
} = require('../../src/renderer/pages/mahjong-fx');

const O = { left: 100, top: 40, width: 600, height: 400 };
const r = (size, left = 110) => ({ left, top: 50, width: size, height: size * 1.3 });

test('trail runs centre to centre in origin coordinates', () => {
  const g = trailGeometry(
    { left: 110, top: 50, width: 40, height: 52 },
    { left: 210, top: 50, width: 40, height: 52 },
    O,
  );
  assert.deepEqual([g.x, g.y, g.length, g.angle], [30, 36, 100, 0]);
});

test('trail angle follows the second tile', () => {
  const g = trailGeometry({ left: 110, top: 50, width: 40, height: 40 }, { left: 110, top: 150, width: 40, height: 40 }, O);
  assert.equal(g.angle, 90);
  assert.equal(g.length, 100);
});

test('trail thickness scales with tile size and is clamped', () => {
  assert.equal(trailGeometry(r(20), r(20, 300), O).thickness, 3);
  assert.equal(trailGeometry(r(50), r(50, 300), O).thickness, 6);
  assert.equal(trailGeometry(r(120), r(120, 300), O).thickness, 8);
});

test('celebration tiers', () => {
  assert.equal(celebrationTier({ zen: false, outcome: null, reducedMotion: false, hidden: true }), 'none');
  assert.equal(celebrationTier({ zen: false, outcome: 'record', reducedMotion: true, hidden: false }), 'still');
  assert.equal(celebrationTier({ zen: true, outcome: 'record', reducedMotion: false, hidden: false }), 'quiet');
  assert.equal(celebrationTier({ zen: false, outcome: null, reducedMotion: false, hidden: false }), 'standard');
  assert.equal(celebrationTier({ zen: false, outcome: 'first', reducedMotion: false, hidden: false }), 'grand');
  assert.equal(celebrationTier({ zen: false, outcome: 'record', reducedMotion: false, hidden: false }), 'grand');
});

test('timings', () => {
  assert.deepEqual(CELEBRATION_MS, { none: 0, still: 0, quiet: 700, standard: 1200, grand: 1500 });
  assert.ok(Object.isFrozen(CELEBRATION_MS));
  assert.equal(TRAIL_MS, 320);
  assert.equal(AUTO_TRAIL_DELAY_MS, 180);
});
