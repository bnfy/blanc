'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  rng,
  moonFeatures,
  starField,
  flareGhosts,
  risePath,
  easeOutCubic,
} = require('../../src/renderer/pages/mahjong-sky');

test('rng is deterministic per seed and stays in [0, 1)', () => {
  const a = rng(42);
  const b = rng(42);
  const values = Array.from({ length: 50 }, () => a());
  assert.deepEqual(values, Array.from({ length: 50 }, () => b()));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(values.slice(0, 5), Array.from({ length: 5 }, rng(7)));
});

test('moon features sit inside the unit disc and repeat for a seed', () => {
  const moon = moonFeatures(3);
  assert.deepEqual(moon, moonFeatures(3));
  assert.ok(moon.maria.length >= 16 && moon.craters.length >= 120, 'clustered seas and many small craters');
  for (const f of [...moon.maria, ...moon.craters]) {
    assert.ok(Math.hypot(f.x, f.y) + f.r <= 1.001, `feature at ${f.x},${f.y} r${f.r} leaves the disc`);
  }
});

test('star field covers the sky with varied brightness', () => {
  const stars = starField(9, 80);
  assert.equal(stars.length, 80);
  assert.ok(stars.every((s) => s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 0.8));
  const sizes = new Set(stars.map((s) => Math.round(s.size * 10)));
  assert.ok(sizes.size > 4, 'star sizes vary');
  assert.ok(stars.some((s) => s.glint) && stars.some((s) => !s.glint));
});

test('lens-flare ghosts line up on the axis through the frame centre', () => {
  const sun = { x: 300, y: 500 };
  const centre = { x: 500, y: 300 };
  const ghosts = flareGhosts(sun, centre);
  assert.ok(ghosts.length >= 5);
  for (const g of ghosts) {
    // collinear with sun and centre
    const cross = (centre.x - sun.x) * (g.y - sun.y) - (centre.y - sun.y) * (g.x - sun.x);
    assert.ok(Math.abs(cross) < 1e-6, 'ghost off axis');
    assert.ok(g.alpha > 0 && g.alpha <= 0.35);
  }
});

test('celestial bodies rise from below the frame to their resting height', () => {
  const start = risePath(0, 800, 500, 'sun');
  const end = risePath(1, 800, 500, 'sun');
  assert.equal(start.x, 800 * 0.36, 'the sun rises off centre so lens ghosts spread across the frame');
  assert.equal(risePath(1, 800, 500, 'moon').x, 800 * 0.62);
  assert.ok(start.y > 500, 'starts below the horizon');
  assert.ok(Math.abs(end.y - 500 * 0.58) < 1e-9);
  assert.ok(risePath(1, 800, 500, 'moon').y < end.y, 'the moon rests higher than the sun');
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});
