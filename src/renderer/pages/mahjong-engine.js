// Pure mahjong-solitaire logic: the turtle position table, seeded RNG,
// freeness, winnable deal generation, and the game-state machine. No DOM,
// no require('electron') — unit-tested directly under node --test and
// loaded in blanc://mahjong via a plain <script> tag (window.MahjongEngine).
(() => {
  'use strict';

  // Positions in half-tile units: a tile occupies [x, x+2) x [y, y+2) on
  // layer z. Classic 144-tile turtle: 87 + 36 + 16 + 4 + 1.
  function buildTurtleLayout() {
    const p = [];
    // Layer 0: eight rows of whole-tile columns (col -> x = col * 2).
    const rows = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
    rows.forEach(([from, to], row) => {
      for (let col = from; col <= to; col++) p.push({ x: col * 2, y: row * 2, z: 0 });
    });
    // The three half-row tiles: far left, and the two on the far right.
    p.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
    for (let col = 4; col <= 9; col++) for (let row = 1; row <= 6; row++) p.push({ x: col * 2, y: row * 2, z: 1 });
    for (let col = 5; col <= 8; col++) for (let row = 2; row <= 5; row++) p.push({ x: col * 2, y: row * 2, z: 2 });
    for (let col = 6; col <= 7; col++) for (let row = 3; row <= 4; row++) p.push({ x: col * 2, y: row * 2, z: 3 });
    p.push({ x: 13, y: 7, z: 4 });
    return p;
  }
  const TURTLE_LAYOUT = buildTurtleLayout();

  // mulberry32 — small, deterministic, good enough for shuffling.
  function createRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function matchKey(kind) {
    if (kind.startsWith('flower-')) return 'flower';
    if (kind.startsWith('season-')) return 'season';
    return kind;
  }

  // A tile is free iff no present tile overlaps it on the layer above and at
  // least one of its sides is fully open. `present(k)` says whether tile k is
  // still on the board (callers decide: full board, partial deal, live game).
  function isFreeAt(layout, i, present) {
    const p = layout[i];
    let leftOpen = true;
    let rightOpen = true;
    for (let k = 0; k < layout.length; k++) {
      if (k === i || !present(k)) continue;
      const q = layout[k];
      if (q.z === p.z + 1 && Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2) return false;
      if (q.z === p.z && Math.abs(q.y - p.y) < 2) {
        if (q.x === p.x - 2) leftOpen = false;
        if (q.x === p.x + 2) rightOpen = false;
      }
    }
    return leftOpen || rightOpen;
  }

  const MahjongEngine = { TURTLE_LAYOUT, createRng, matchKey, isFreeAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = MahjongEngine;
  else window.MahjongEngine = MahjongEngine;
})();
