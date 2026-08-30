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

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 72 matching pairs covering the standard 144-tile set: two identical
  // pairs per quad, flowers paired with flowers, seasons with seasons.
  function shuffledPairs(rng) {
    const pairs = [];
    for (const suit of ['dot', 'bam', 'chr']) for (let n = 1; n <= 9; n++) {
      pairs.push([`${suit}-${n}`, `${suit}-${n}`], [`${suit}-${n}`, `${suit}-${n}`]);
    }
    for (const w of ['e', 's', 'w', 'n']) pairs.push([`wind-${w}`, `wind-${w}`], [`wind-${w}`, `wind-${w}`]);
    for (const d of ['c', 'f', 'p']) pairs.push([`drg-${d}`, `drg-${d}`], [`drg-${d}`, `drg-${d}`]);
    const flowers = shuffle(['flower-1', 'flower-2', 'flower-3', 'flower-4'], rng);
    pairs.push([flowers[0], flowers[1]], [flowers[2], flowers[3]]);
    const seasons = shuffle(['season-1', 'season-2', 'season-3', 'season-4'], rng);
    pairs.push([seasons[0], seasons[1]], [seasons[2], seasons[3]]);
    return shuffle(pairs, rng);
  }

  // Winnable by construction: simulate a winning game on the full layout.
  // Both picked positions are free at the same board state, so the recorded
  // order is itself a valid playthrough of the finished deal. A greedy pass
  // can dead-end (e.g. a lone surviving stack leaves only one free tile);
  // retry with the advancing RNG. The cap only turns a never-expected
  // infinite loop into an error — there is no non-constructive fallback.
  function generateDeal(seed) {
    const rng = createRng(seed);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const kinds = new Array(TURTLE_LAYOUT.length).fill(null);
      const occupied = new Array(TURTLE_LAYOUT.length).fill(true);
      const present = (k) => occupied[k];
      const solution = [];
      let dead = false;
      for (const [a, b] of shuffledPairs(rng)) {
        const free = [];
        for (let i = 0; i < TURTLE_LAYOUT.length; i++) {
          if (occupied[i] && isFreeAt(TURTLE_LAYOUT, i, present)) free.push(i);
        }
        if (free.length < 2) { dead = true; break; }
        const i = free.splice(Math.floor(rng() * free.length), 1)[0];
        const j = free.splice(Math.floor(rng() * free.length), 1)[0];
        kinds[i] = a;
        kinds[j] = b;
        occupied[i] = occupied[j] = false;
        solution.push([i, j]);
      }
      if (!dead) return { kinds, solution };
    }
    throw new Error('mahjong: deal generation failed');
  }

  function createGame(seed) {
    const { kinds } = generateDeal(seed);
    return {
      seed,
      kinds,
      removed: new Array(TURTLE_LAYOUT.length).fill(false),
      history: [],
    };
  }

  function isFree(state, i) {
    if (state.removed[i]) return false;
    return isFreeAt(TURTLE_LAYOUT, i, (k) => !state.removed[k]);
  }

  function movesAvailable(state) {
    const freeByKey = new Map();
    for (let i = 0; i < TURTLE_LAYOUT.length; i++) {
      if (!isFree(state, i)) continue;
      const key = matchKey(state.kinds[i]);
      if (!freeByKey.has(key)) freeByKey.set(key, []);
      freeByKey.get(key).push(i);
    }
    const moves = [];
    for (const indices of freeByKey.values()) {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) moves.push([indices[a], indices[b]]);
      }
    }
    return moves;
  }

  function removePair(state, i, j) {
    if (i === j) return false;
    if (!isFree(state, i) || !isFree(state, j)) return false;
    if (matchKey(state.kinds[i]) !== matchKey(state.kinds[j])) return false;
    state.removed[i] = state.removed[j] = true;
    state.history.push([i, j]);
    return true;
  }

  function undo(state) {
    const last = state.history.pop();
    if (!last) return false;
    state.removed[last[0]] = state.removed[last[1]] = false;
    return true;
  }

  function isWon(state) {
    return state.removed.every(Boolean);
  }

  const MahjongEngine = {
    TURTLE_LAYOUT, createRng, matchKey, isFreeAt, generateDeal,
    createGame, isFree, movesAvailable, removePair, undo, isWon,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MahjongEngine;
  else window.MahjongEngine = MahjongEngine;
})();
