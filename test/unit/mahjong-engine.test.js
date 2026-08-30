const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../../src/renderer/pages/mahjong-engine');

test('turtle layout: 144 positions, unique, well-formed', () => {
  assert.equal(E.TURTLE_LAYOUT.length, 144);
  const seen = new Set(E.TURTLE_LAYOUT.map((p) => `${p.x},${p.y},${p.z}`));
  assert.equal(seen.size, 144);
  const perLayer = [0, 0, 0, 0, 0];
  for (const p of E.TURTLE_LAYOUT) {
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.z));
    perLayer[p.z]++;
  }
  assert.deepEqual(perLayer, [87, 36, 16, 4, 1]);
  // No two tiles on the same layer overlap (tiles are 2x2 in half-units).
  for (let i = 0; i < 144; i++) for (let j = i + 1; j < 144; j++) {
    const a = E.TURTLE_LAYOUT[i], b = E.TURTLE_LAYOUT[j];
    if (a.z !== b.z) continue;
    assert.ok(Math.abs(a.x - b.x) >= 2 || Math.abs(a.y - b.y) >= 2,
      `tiles ${i} and ${j} overlap`);
  }
});

test('rng is deterministic and in [0,1)', () => {
  const a = E.createRng(42), b = E.createRng(42), c = E.createRng(43);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('matchKey: flowers and seasons are class-matched, all else identity', () => {
  assert.equal(E.matchKey('flower-1'), 'flower');
  assert.equal(E.matchKey('flower-4'), 'flower');
  assert.equal(E.matchKey('season-2'), 'season');
  assert.equal(E.matchKey('dot-5'), 'dot-5');
  assert.equal(E.matchKey('wind-e'), 'wind-e');
  assert.equal(E.matchKey('drg-p'), 'drg-p');
});

test('freeness: covered tiles and doubly-flanked tiles are blocked', () => {
  const L = E.TURTLE_LAYOUT;
  const all = () => true;
  // The apex tile (z=4) is free on a full board.
  const apex = L.findIndex((p) => p.z === 4);
  assert.ok(E.isFreeAt(L, apex, all));
  // The far-left odd tile (x=0) is free on a full board.
  const farLeft = L.findIndex((p) => p.x === 0);
  assert.ok(E.isFreeAt(L, farLeft, all));
  // The very last tile of the far-right pair (x=28) is free; its inner
  // neighbor (x=26) is flanked on both sides -> blocked.
  const outerRight = L.findIndex((p) => p.x === 28);
  const innerRight = L.findIndex((p) => p.x === 26);
  assert.ok(E.isFreeAt(L, outerRight, all));
  assert.equal(E.isFreeAt(L, innerRight, all), false);
  // A z=0 tile under the z=1 block (col 4..9, row 1..6) is covered -> blocked.
  const covered = L.findIndex((p) => p.z === 0 && p.x === 8 && p.y === 2);
  assert.equal(E.isFreeAt(L, covered, all), false);
  // Row 0 end tile (x=24, y=0): right side open on a full board -> free.
  const rowEnd = L.findIndex((p) => p.z === 0 && p.x === 24 && p.y === 0);
  assert.ok(E.isFreeAt(L, rowEnd, all));
  // An interior row-0 tile is flanked left+right and uncovered -> blocked.
  const interior = L.findIndex((p) => p.z === 0 && p.x === 12 && p.y === 0);
  assert.equal(E.isFreeAt(L, interior, all), false);
});
