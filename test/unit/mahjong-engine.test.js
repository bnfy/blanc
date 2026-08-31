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
  assert.equal(E.matchKey('wind-e-motif'), 'wind-e-motif');
  assert.equal(E.matchKey('wind-e-seal'), 'wind-e-seal');
  assert.equal(E.matchKey('drg-c-motif'), 'drg-c-motif');
  assert.equal(E.matchKey('drg-c-seal'), 'drg-c-seal');
  assert.notEqual(E.matchKey('wind-e-motif'), E.matchKey('wind-e-seal'));
  assert.notEqual(E.matchKey('drg-c-motif'), E.matchKey('drg-c-seal'));
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

test('deals are winnable by construction across many seeds', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const { kinds, solution } = E.generateDeal(seed);
    assert.equal(kinds.length, 144);
    assert.ok(kinds.every((k) => typeof k === 'string'));
    assert.equal(solution.length, 72);
    // Turtle keeps the full ordinary set, while every visual special is an
    // exact two-tile pair rather than a four-tile symbol family.
    const counts = new Map();
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const suit of ['dot', 'bam', 'chr']) for (let n = 1; n <= 9; n++) {
      assert.equal(counts.get(`${suit}-${n}`), 4);
    }
    for (const kind of E.SPECIAL_VARIANT_KINDS) assert.equal(counts.get(kind), 2);
    for (let n = 1; n <= 4; n++) {
      assert.equal(counts.get(`flower-${n}`), 1);
      assert.equal(counts.get(`season-${n}`), 1);
    }
    // Replay the recorded removal order as an actual game: every step must
    // remove a FREE, MATCHING pair, and the board must end empty.
    const removed = new Array(144).fill(false);
    const present = (k) => !removed[k];
    for (const [i, j] of solution) {
      assert.notEqual(i, j);
      assert.ok(!removed[i] && !removed[j]);
      assert.ok(E.isFreeAt(E.TURTLE_LAYOUT, i, present), `seed ${seed}: tile ${i} not free`);
      assert.ok(E.isFreeAt(E.TURTLE_LAYOUT, j, present), `seed ${seed}: tile ${j} not free`);
      assert.equal(E.matchKey(kinds[i]), E.matchKey(kinds[j]));
      removed[i] = removed[j] = true;
    }
    assert.ok(removed.every(Boolean));
  }
});

test('deals are deterministic per seed and differ across seeds', () => {
  assert.deepEqual(E.generateDeal(7).kinds, E.generateDeal(7).kinds);
  assert.notDeepEqual(E.generateDeal(7).kinds, E.generateDeal(8).kinds);
});

test('game state: remove validates, undo round-trips, win detected', () => {
  const game = E.createGame(11);
  assert.equal(game.removed.filter(Boolean).length, 0);

  const moves = E.movesAvailable(game);
  assert.ok(moves.length > 0);
  const [i, j] = moves[0];

  // Invalid removals are rejected without mutating.
  assert.equal(E.removePair(game, i, i), false);
  const blocked = game.kinds.findIndex((_, k) => !E.isFree(game, k));
  assert.equal(E.removePair(game, i, blocked), false);
  assert.equal(game.history.length, 0);

  // A valid removal mutates and records.
  const before = JSON.parse(JSON.stringify({ removed: game.removed }));
  assert.equal(E.removePair(game, i, j), true);
  assert.ok(game.removed[i] && game.removed[j]);
  assert.equal(game.history.length, 1);

  // Undo restores exactly the prior state.
  assert.equal(E.undo(game), true);
  assert.deepEqual(game.removed, before.removed);
  assert.equal(game.history.length, 0);
  assert.equal(E.undo(game), false); // nothing left to undo

  // Playing the whole generated solution wins the game.
  const { solution } = E.generateDeal(11);
  for (const [a, b] of solution) assert.equal(E.removePair(game, a, b), true);
  assert.equal(E.isWon(game), true);
  assert.deepEqual(E.movesAvailable(game), []);

  // Undo after a recorded win resumes play with a serializable, recordable
  // state instead of retaining terminal-only completion metadata.
  game.completionRecorded = true;
  assert.equal(E.undo(game), true);
  assert.equal(E.isWon(game), false);
  assert.equal(game.completionRecorded, false);
  assert.equal(E.movesAvailable(game).length > 0, true);
  assert.deepEqual(E.restoreGame(E.serializeGame(game)), game);
});

test('movesAvailable pairs are all free and matching', () => {
  const game = E.createGame(23);
  for (const [i, j] of E.movesAvailable(game)) {
    assert.ok(E.isFree(game, i) && E.isFree(game, j));
    assert.equal(E.matchKey(game.kinds[i]), E.matchKey(game.kinds[j]));
  }
});

test('a non-winning state with no matchable free pair reports stuck', () => {
  const game = E.createGame(5);
  // Hand-built stuck state: exactly two tiles left, both free, not matching.
  game.removed.fill(true);
  const i = 0;
  const j = game.kinds.findIndex(
    (k, idx) => idx !== i && E.matchKey(k) !== E.matchKey(game.kinds[i])
  );
  game.removed[i] = game.removed[j] = false;
  assert.ok(E.isFree(game, i) && E.isFree(game, j));
  assert.equal(E.isWon(game), false);
  assert.deepEqual(E.movesAvailable(game), []);
  assert.equal(E.removePair(game, i, j), false);
});

test('all v2 layouts have the promised size, layer count, and valid coordinates', () => {
  const expected = {
    turtle: { count: 144, layers: [87, 36, 16, 4, 1] },
    arch: { count: 96, layers: [72, 18, 6] },
    peaks: { count: 72, layers: [48, 16, 6, 2] },
  };
  assert.deepEqual(Object.keys(E.LAYOUTS), ['turtle', 'arch', 'peaks']);
  for (const [id, definition] of Object.entries(E.LAYOUTS)) {
    const positions = definition.positions;
    assert.equal(positions.length, expected[id].count);
    assert.equal(definition.tileCount, expected[id].count);
    assert.equal(definition.layers, expected[id].layers.length);
    assert.ok(Number.isInteger(definition.revision) && definition.revision > 0);
    const seen = new Set();
    const layers = new Array(definition.layers).fill(0);
    positions.forEach((position) => {
      assert.ok(Number.isInteger(position.x) && position.x >= 0);
      assert.ok(Number.isInteger(position.y) && position.y >= 0);
      assert.ok(Number.isInteger(position.z) && position.z >= 0 && position.z < definition.layers);
      const key = `${position.x},${position.y},${position.z}`;
      assert.equal(seen.has(key), false, `${id}: duplicate ${key}`);
      seen.add(key);
      layers[position.z] += 1;
    });
    assert.deepEqual(layers, expected[id].layers);
    for (let first = 0; first < positions.length; first++) {
      for (let second = first + 1; second < positions.length; second++) {
        const a = positions[first];
        const b = positions[second];
        if (a.z === b.z) {
          assert.ok(Math.abs(a.x - b.x) >= 2 || Math.abs(a.y - b.y) >= 2,
            `${id}: same-layer overlap at ${first}/${second}`);
        }
      }
    }
  }
});

test('Arch is a broad, supported three-layer table rather than a portrait stack', () => {
  const positions = E.ARCH_LAYOUT;
  const expectedLayers = [
    { xs: Array.from({ length: 12 }, (_, index) => index * 2), ys: [0, 2, 4, 6, 8, 10] },
    { xs: Array.from({ length: 9 }, (_, index) => 3 + index * 2), ys: [4, 6] },
    { xs: [6, 8, 10, 12, 14, 16], ys: [5] },
  ];
  expectedLayers.forEach(({ xs, ys }, layer) => {
    const actual = positions.filter((position) => position.z === layer);
    assert.deepEqual([...new Set(actual.map((position) => position.x))], xs);
    assert.deepEqual([...new Set(actual.map((position) => position.y))], ys);
    assert.equal(actual.length, xs.length * ys.length);
  });

  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(...positions.map((position) => position.y));
  assert.deepEqual([maxX + 2 - minX, maxY + 2 - minY], [24, 12]);

  for (const position of positions.filter((candidate) => candidate.z > 0)) {
    const supports = positions.filter((candidate) =>
      candidate.z === position.z - 1
      && Math.abs(candidate.x - position.x) < 2
      && Math.abs(candidate.y - position.y) < 2
    );
    assert.equal(supports.length, position.z === 1 ? 2 : 4);
  }
  assert.equal(positions.filter((_, index) => E.isFreeAt(positions, index, () => true)).length, 18);
});

test('every layout is solvable and contains every special visual pair across hundreds of seeded deals', () => {
  for (const [layoutId, definition] of Object.entries(E.LAYOUTS)) {
    for (let seed = 0; seed < 200; seed++) {
      const { kinds, solution } = E.generateDeal({ seed, layoutId });
      assert.equal(kinds.length, definition.tileCount);
      assert.equal(solution.length, definition.tileCount / 2);
      const specialCounts = new Map(E.SPECIAL_VARIANT_KINDS.map((kind) => [kind, 0]));
      for (const kind of kinds) {
        if (specialCounts.has(kind)) specialCounts.set(kind, specialCounts.get(kind) + 1);
      }
      for (const [kind, count] of specialCounts) {
        assert.equal(count, 2, `${layoutId}/${seed}: expected one exact ${kind} pair`);
      }
      const removed = new Array(definition.tileCount).fill(false);
      const present = (index) => !removed[index];
      for (const [first, second] of solution) {
        assert.ok(E.isFreeAt(definition.positions, first, present), `${layoutId}/${seed}: first blocked`);
        assert.ok(E.isFreeAt(definition.positions, second, present), `${layoutId}/${seed}: second blocked`);
        assert.equal(E.matchKey(kinds[first]), E.matchKey(kinds[second]));
        removed[first] = removed[second] = true;
      }
      assert.ok(removed.every(Boolean));
    }
  }
});

test('createGame supports v2 options while preserving the numeric legacy form', () => {
  const legacy = E.createGame(912);
  assert.equal(legacy.layoutId, 'turtle');
  assert.equal(legacy.mode, 'classic');
  assert.equal(legacy.kinds.length, 144);

  const tray = E.createGame({
    seed: 912,
    layoutId: 'peaks',
    mode: 'tray',
    gameId: 'game-912',
    dailyKey: '2026-08-30',
  });
  assert.equal(tray.version, 2);
  assert.equal(tray.layoutId, 'peaks');
  assert.equal(tray.layoutRevision, E.LAYOUTS.peaks.revision);
  assert.equal(tray.mode, 'tray');
  assert.equal(tray.gameId, 'game-912');
  assert.equal(tray.dailyKey, '2026-08-30');
  assert.equal(tray.kinds.length, 72);
  assert.deepEqual(tray.tray, []);
  assert.deepEqual(tray.assists, { undo: 0, hint: 0, shuffle: 0 });
});

test('Classic selectTile selects, switches, removes a pair, and undo restores it', () => {
  const state = E.createGame({ seed: 41, layoutId: 'arch', mode: 'classic' });
  const [first, second] = E.availableMoves(state)[0];
  assert.deepEqual(E.selectTile(state, first), { ok: true, type: 'selected', index: first });
  assert.equal(state.selected, first);
  assert.deepEqual(E.selectTile(state, first), { ok: true, type: 'deselected', index: first });

  const mismatch = Array.from({ length: state.kinds.length }, (_, index) => index).find(
    (index) => E.isFree(state, index) && E.matchKey(state.kinds[index]) !== E.matchKey(state.kinds[first])
  );
  E.selectTile(state, first);
  const mismatchResult = E.selectTile(state, mismatch);
  assert.equal(mismatchResult.type, 'mismatch');
  assert.equal(state.selected, mismatch);

  state.selected = null;
  E.selectTile(state, first);
  const pairResult = E.selectTile(state, second);
  assert.equal(pairResult.type, 'pair');
  assert.ok(state.removed[first] && state.removed[second]);
  assert.equal(E.undo(state), true);
  assert.equal(state.removed[first], false);
  assert.equal(state.removed[second], false);
  assert.equal(state.assists.undo, 1);
});

test('Classic hints and Tray auto-matching never pair different-looking variants', () => {
  const classic = E.createGame({ seed: 42, layoutId: 'arch', mode: 'classic' });
  const free = Array.from({ length: classic.kinds.length }, (_, index) => index)
    .filter((index) => E.isFree(classic, index));
  assert.ok(free.length >= 4);
  const [motifOne, sealOne, motifTwo, sealTwo] = free;
  classic.kinds[motifOne] = classic.kinds[motifTwo] = 'wind-n-motif';
  classic.kinds[sealOne] = classic.kinds[sealTwo] = 'wind-n-seal';

  const relevantMoves = E.availableMoves(classic).filter((move) =>
    move.some((index) => [motifOne, sealOne, motifTwo, sealTwo].includes(index))
  );
  assert.ok(relevantMoves.some((move) => move.includes(motifOne) && move.includes(motifTwo)));
  assert.ok(relevantMoves.some((move) => move.includes(sealOne) && move.includes(sealTwo)));
  assert.equal(relevantMoves.some((move) =>
    move.some((index) => [motifOne, motifTwo].includes(index))
      && move.some((index) => [sealOne, sealTwo].includes(index))
  ), false);

  assert.equal(E.selectTile(classic, motifOne).type, 'selected');
  assert.equal(E.selectTile(classic, sealOne).type, 'mismatch');
  assert.equal(classic.removed[motifOne], false);
  assert.equal(classic.removed[sealOne], false);
  E.selectTile(classic, sealOne);
  E.selectTile(classic, motifOne);
  assert.equal(E.selectTile(classic, motifTwo).type, 'pair');

  const tray = E.createGame({ seed: 43, layoutId: 'arch', mode: 'tray' });
  const trayFree = Array.from({ length: tray.kinds.length }, (_, index) => index)
    .filter((index) => E.isFree(tray, index));
  const [trayMotifOne, traySealOne, trayMotifTwo, traySealTwo] = trayFree;
  tray.kinds[trayMotifOne] = tray.kinds[trayMotifTwo] = 'drg-c-motif';
  tray.kinds[traySealOne] = tray.kinds[traySealTwo] = 'drg-c-seal';
  assert.equal(E.selectTile(tray, trayMotifOne).type, 'tray-park');
  assert.equal(E.selectTile(tray, traySealOne).type, 'tray-park');
  const matched = E.selectTile(tray, trayMotifTwo);
  assert.equal(matched.type, 'tray-pair');
  assert.deepEqual(matched.indices, [trayMotifOne, trayMotifTwo]);
  assert.deepEqual(tray.tray, [traySealOne]);
  assert.equal(E.undo(tray), true);
  assert.deepEqual(tray.tray, [traySealOne]);
  assert.equal(tray.removed[trayMotifOne], false);
  assert.equal(tray.removed[trayMotifTwo], false);
});

function clearAvailableTrayPair(state) {
  const move = E.availableMoves(state).find((candidate) => candidate.length === 2);
  assert.ok(move, 'expected a matchable pair');
  if (state.tray.includes(move[0])) return E.selectTile(state, move[1]);
  assert.equal(E.selectTile(state, move[0]).type, 'tray-park');
  return E.selectTile(state, move[1]);
}

test('Tray momentum scoring rises by 50, caps at 500, and milestones add a flat non-recursive bonus', () => {
  const state = E.createGame({ seed: 118, layoutId: 'turtle', mode: 'tray' });
  let expectedScore = 0;
  for (let count = 1; count <= 15; count++) {
    const result = clearAvailableTrayPair(state);
    const points = Math.min(100 + (count - 1) * 50, 500);
    expectedScore += points + (count % 5 === 0 ? 100 : 0);
    assert.equal(result.comboCount, count);
    assert.equal(result.userPoints, points);
    assert.equal(result.bonusPoints, count % 5 === 0 ? 100 : 0);
    assert.equal(result.milestone, count % 5 === 0);
    assert.equal(state.comboRemainingMs, E.COMBO_WINDOW_MS);
    assert.equal(state.score, expectedScore);
  }
  assert.equal(state.maxCombo, 15);
});

test('the pure combo clock expires exactly at five seconds', () => {
  const state = E.createGame({ seed: 119, layoutId: 'peaks', mode: 'tray' });
  clearAvailableTrayPair(state);
  assert.equal(E.advanceComboClock(state, 4_999).expired, false);
  assert.equal(state.comboRemainingMs, 1);
  assert.equal(E.advanceComboClock(state, 1).expired, true);
  assert.equal(state.comboCount, 0);
  assert.throws(() => E.advanceComboClock(state, -1), /non-negative/);
});

test('Tray matches the oldest compatible tile and undo restores the cleared pair', () => {
  const seed = 204;
  const state = E.createGame({ seed, layoutId: 'arch', mode: 'tray' });
  const { solution } = E.generateDeal({ seed, layoutId: 'arch' });
  const [first, mate] = solution[0];
  const parkedOther = Array.from({ length: state.kinds.length }, (_, index) => index).find(
    (index) => index !== first && index !== mate && E.isFree(state, index)
      && E.matchKey(state.kinds[index]) !== E.matchKey(state.kinds[first])
  );
  assert.equal(E.selectTile(state, first).type, 'tray-park');
  assert.equal(E.selectTile(state, parkedOther).type, 'tray-park');
  const matched = E.selectTile(state, mate);
  assert.equal(matched.type, 'tray-pair');
  assert.equal(matched.points, 100);
  assert.deepEqual(matched.indices, [first, mate]);
  assert.deepEqual(state.tray, [parkedOther]);

  assert.equal(E.undo(state), true);
  assert.deepEqual(state.tray, [parkedOther]);
  assert.equal(state.removed[first], false);
  assert.equal(state.removed[mate], false);
  assert.equal(state.score, 0);
  assert.equal(E.undo(state), true);
  assert.deepEqual(state.tray, []);
  assert.equal(state.removed[parkedOther], false);
});

test('Tray move discovery includes parked-tile mates and safe singleton picks', () => {
  const state = E.createGame({ seed: 205, layoutId: 'peaks', mode: 'tray' });
  const free = Array.from({ length: state.kinds.length }, (_, index) => index)
    .filter((index) => E.isFree(state, index));
  assert.ok(free.length >= 5);
  state.kinds[free[0]] = state.kinds[free[1]] = 'chr-1';
  state.kinds[free[2]] = 'chr-2';
  state.kinds[free[3]] = 'chr-3';
  state.kinds[free[4]] = 'chr-4';

  E.selectTile(state, free[0]);
  assert.deepEqual(E.availableMoves(state)[0], [free[0], free[1]]);

  // Three unmatched parked tiles still expose legal single-tile actions;
  // the engine must not report a false no-moves state before Rescue.
  E.selectTile(state, free[2]);
  E.selectTile(state, free[3]);
  const moves = E.availableMoves(state);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((move) => move.length === 1 || state.tray.includes(move[0])));
});

test('parking unmatched tiles keeps momentum alive and a later match continues it', () => {
  const state = E.createGame({ seed: 206, layoutId: 'turtle', mode: 'tray' });
  const free = Array.from({ length: state.kinds.length }, (_, index) => index)
    .filter((index) => E.isFree(state, index));
  assert.ok(free.length >= 6);
  const [a1, a2, b1, b2, c1, c2] = free;
  state.kinds[a1] = state.kinds[a2] = 'chr-1';
  state.kinds[b1] = state.kinds[b2] = 'chr-2';
  state.kinds[c1] = state.kinds[c2] = 'chr-3';

  E.selectTile(state, a1);
  E.selectTile(state, b1);
  assert.equal(E.selectTile(state, b2).comboCount, 1);
  const oldA = E.selectTile(state, a2);
  assert.equal(oldA.comboCount, 2);
  assert.equal(state.score, 250);

  E.selectTile(state, c1);
  const fresh = E.selectTile(state, c2);
  assert.equal(fresh.comboCount, 3);
  assert.equal(fresh.points, 200);
});

test('undo restores a composite milestone action and ends momentum', () => {
  let state = E.createGame({ seed: 207, layoutId: 'turtle', mode: 'tray' });
  for (let count = 1; count < 5; count++) clearAvailableTrayPair(state);
  const before = E.serializeGame(state);
  const milestone = clearAvailableTrayPair(state);
  state = E.restoreGame(E.serializeGame(state));
  assert.equal(E.undo(state), true);
  assert.equal(state.score, before.score);
  assert.equal(state.autoClears, before.autoClears);
  assert.equal(state.comboCount, 0);
  for (const index of [...milestone.indices, ...(milestone.autoClear?.indices || [])]) assert.equal(state.removed[index], false);
});

test('milestone automatic clears protect the oldest parked tray tile first', () => {
  const state = E.createGame({ seed: 208, layoutId: 'peaks', mode: 'tray' });
  const free = Array.from({ length: state.kinds.length }, (_, index) => index)
    .filter((index) => E.isFree(state, index));
  const [parked, userFirst, userSecond, parkedMate] = free;
  state.kinds[parked] = state.kinds[parkedMate] = 'chr-1';
  state.kinds[userFirst] = state.kinds[userSecond] = 'chr-2';
  E.selectTile(state, parked);
  state.comboCount = state.maxCombo = 4;
  state.comboRemainingMs = E.COMBO_WINDOW_MS;
  E.selectTile(state, userFirst);
  const result = E.selectTile(state, userSecond);
  assert.deepEqual(result.autoClear, { source: 'tray', indices: [parked, parkedMate] });
  assert.equal(state.autoClears, 1);
  assert.deepEqual(state.tray, []);
});

test('board automatic clears rank exposure, then layer height, then board indices', () => {
  for (const [seed, expected] of [
    [1, [90, 143]],
    [2, [87, 143]],
    [7, [90, 143]],
  ]) {
    const state = E.createGame({ seed, layoutId: 'turtle', mode: 'tray' });
    assert.deepEqual(E.automaticPair(state), { source: 'board', indices: expected });
  }
});

test('a milestone without an eligible automatic pair still awards its one-time bonus', () => {
  const state = E.createGame({ seed: 209, layoutId: 'peaks', mode: 'tray' });
  const [first, second] = E.generateDeal({ seed: 209, layoutId: 'peaks' }).solution[0];
  state.removed.fill(true);
  state.removed[first] = state.removed[second] = false;
  state.comboCount = state.maxCombo = 4;
  state.comboRemainingMs = E.COMBO_WINDOW_MS;
  E.selectTile(state, first);
  const result = E.selectTile(state, second);
  assert.equal(result.autoClear, null);
  assert.equal(result.bonusPoints, 100);
  assert.equal(result.score, 400);
  assert.equal(state.autoClears, 0);
  assert.equal(state.status, 'won');
});

function fillUnmatchedTray(state) {
  const picked = [];
  const keys = new Set();
  while (picked.length < E.TRAY_SIZE) {
    const index = Array.from({ length: state.kinds.length }, (_, candidate) => candidate).find(
      (candidate) => E.isFree(state, candidate) && !keys.has(E.matchKey(state.kinds[candidate]))
    );
    assert.notEqual(index, undefined, 'expected another nonmatching free tile');
    keys.add(E.matchKey(state.kinds[index]));
    picked.push(index);
    E.selectTile(state, index);
  }
  return picked;
}

test('shuffle and a fresh board reset active momentum', () => {
  const state = E.createGame({ seed: 776, layoutId: 'arch', mode: 'tray' });
  clearAvailableTrayPair(state);
  assert.equal(state.comboCount, 1);
  assert.equal(E.shuffleRemaining(state, E.createRng(42)), true);
  assert.equal(state.comboCount, 0);
  assert.equal(state.comboRemainingMs, 0);

  const restarted = E.createGame({ seed: state.seed, layoutId: state.layoutId, mode: state.mode });
  assert.equal(restarted.comboCount, 0);
  assert.equal(restarted.maxCombo, 0);
  assert.equal(restarted.comboRemainingMs, 0);
  assert.equal(restarted.autoClears, 0);
});

test('four unmatched Tray tiles enter rescue; undo and shuffle both recover', () => {
  const undoState = E.createGame({ seed: 777, layoutId: 'peaks', mode: 'tray' });
  clearAvailableTrayPair(undoState);
  assert.equal(undoState.comboCount, 1);
  const picked = fillUnmatchedTray(undoState);
  assert.equal(undoState.status, 'rescue');
  assert.equal(undoState.comboCount, 0);
  assert.equal(undoState.comboRemainingMs, 0);
  assert.equal(undoState.tray.length, 4);
  assert.equal(E.selectTile(undoState, 0).type, 'rescue');
  assert.equal(E.undo(undoState), true);
  assert.equal(undoState.status, 'playing');
  assert.equal(undoState.tray.length, 3);
  assert.equal(undoState.removed[picked.at(-1)], false);

  const shuffleState = E.createGame({ seed: 778, layoutId: 'peaks', mode: 'tray' });
  fillUnmatchedTray(shuffleState);
  const multiset = shuffleState.kinds.slice().sort();
  assert.equal(E.shuffleRemaining(shuffleState, E.createRng(99)), true);
  assert.equal(shuffleState.status, 'playing');
  assert.deepEqual(shuffleState.tray, []);
  assert.equal(shuffleState.removed.filter(Boolean).length, 0);
  assert.deepEqual(shuffleState.kinds.slice().sort(), multiset);
  assert.equal(shuffleState.comboCount, 0);
  assert.equal(shuffleState.history.length, 0);
  assert.equal(shuffleState.assists.shuffle, 1);
  assert.ok(E.availableMoves(shuffleState).length > 0);
});

test('solvable shuffle preserves removed tiles and the live multiset across partial games', () => {
  for (const layoutId of Object.keys(E.LAYOUTS)) {
    for (let seed = 1; seed <= 30; seed++) {
      const state = E.createGame({ seed, layoutId, mode: 'classic' });
      const { solution } = E.generateDeal({ seed, layoutId });
      const pairsToRemove = seed % 9;
      for (let offset = 0; offset < pairsToRemove; offset++) {
        assert.equal(E.removePair(state, ...solution[offset]), true);
      }
      const removedBefore = state.removed.slice();
      const removedKinds = state.kinds.filter((_, index) => removedBefore[index]);
      const liveKinds = state.kinds.filter((_, index) => !removedBefore[index]).sort();
      assert.equal(E.shuffleRemaining(state, E.createRng(0x10000 + seed)), true, `${layoutId}/${seed}`);
      assert.deepEqual(state.removed, removedBefore);
      assert.deepEqual(state.kinds.filter((_, index) => removedBefore[index]), removedKinds);
      assert.deepEqual(state.kinds.filter((_, index) => !removedBefore[index]).sort(), liveKinds);
      assert.ok(E.availableMoves(state).length > 0);
      assert.ok(E.restoreGame(E.serializeGame(state)));
    }
  }
});

test('shuffle failure is atomic', () => {
  const state = E.createGame({ seed: 63, layoutId: 'arch', mode: 'classic' });
  const originalKey = E.matchKey(state.kinds[0]);
  state.kinds[0] = ['dot-1', 'bam-1', 'chr-1'].find((kind) => E.matchKey(kind) !== originalKey);
  const before = structuredClone(state);
  assert.equal(E.shuffleRemaining(state, E.createRng(5)), false);
  assert.deepEqual(state, before);
});

test('v2 serialization round-trips independent state and rejects corruption', () => {
  const seed = 3001;
  const state = E.createGame({
    seed,
    layoutId: 'peaks',
    mode: 'tray',
    gameId: '96dcb5b0-8dc8-4cce-a671-167c5ff65652',
    dailyKey: '2026-08-30',
  });
  const [first, second] = E.generateDeal({ seed, layoutId: 'peaks' }).solution[0];
  E.selectTile(state, first);
  E.selectTile(state, second);
  state.elapsedMs = 12_345;
  const payload = E.serializeGame(state);
  const restored = E.restoreGame(payload);
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  assert.notEqual(restored.kinds, state.kinds);
  assert.deepEqual(E.restoreGame(JSON.stringify(payload)), state);
  for (const kind of E.SPECIAL_VARIANT_KINDS) {
    assert.equal(payload.kinds.filter((candidate) => candidate === kind).length, 2);
    assert.equal(restored.kinds.filter((candidate) => candidate === kind).length, 2);
  }

  assert.equal(E.restoreGame('{broken'), null);
  assert.equal(E.restoreGame({ ...payload, version: 99 }), null);
  assert.equal(E.restoreGame({ ...payload, layoutId: 'missing' }), null);
  assert.equal(E.restoreGame({ ...payload, layoutRevision: payload.layoutRevision + 1 }), null);
  for (const layoutRevision of [null, '1', 0]) {
    assert.equal(E.restoreGame({ ...payload, layoutRevision }), null);
  }
  assert.equal(E.restoreGame({ ...payload, removed: payload.removed.slice(1) }), null);
  assert.equal(E.restoreGame({ ...payload, kinds: payload.kinds.map((kind, index) => index === 0 ? 'unknown' : kind) }), null);
  assert.equal(E.restoreGame({ ...payload, tray: [999] }), null);
  assert.equal(E.restoreGame({ ...payload, status: 'rescue' }), null);
  assert.equal(E.restoreGame({ ...payload, completionRecorded: 'yes' }), null);
  assert.equal(E.restoreGame({ ...payload, completionRecorded: true }), null);
  assert.equal(E.restoreGame({ ...payload, comboRemainingMs: 5001 }), null);
  assert.equal(E.restoreGame({ ...payload, comboCount: 2, maxCombo: 1 }), null);

  const legacyTrayPayload = { ...payload, chain: 4 };
  for (const key of ['comboCount', 'maxCombo', 'comboRemainingMs', 'autoClears', 'scoringRevision']) {
    delete legacyTrayPayload[key];
  }
  const restoredLegacyTray = E.restoreGame(legacyTrayPayload);
  assert.equal(restoredLegacyTray.score, payload.score);
  assert.equal(restoredLegacyTray.comboCount, 0);
  assert.equal(restoredLegacyTray.comboRemainingMs, 0);
  assert.equal(restoredLegacyTray.scoringRevision, 1);

  const legacyPeaksPayload = { ...payload };
  delete legacyPeaksPayload.layoutRevision;
  assert.ok(E.restoreGame(legacyPeaksPayload), 'unchanged revision-1 layouts migrate');
  const legacyArchPayload = E.serializeGame(E.createGame({ seed: 9, layoutId: 'arch', mode: 'classic' }));
  delete legacyArchPayload.layoutRevision;
  assert.equal(E.restoreGame(legacyArchPayload), null, 'old Arch coordinates cannot restore into revision 2');

  const legacyKindsPayload = E.serializeGame(E.createGame({ seed: 10, layoutId: 'peaks', mode: 'classic' }));
  for (const [variant, legacy] of [
    ['wind-n-motif', 'wind-n'],
    ['drg-c-motif', 'drg-c'],
  ]) {
    const indices = legacyKindsPayload.kinds
      .map((kind, index) => kind === variant ? index : -1)
      .filter((index) => index >= 0);
    assert.equal(indices.length, 2);
    for (const index of indices) legacyKindsPayload.kinds[index] = legacy;
  }
  const restoredLegacyKinds = E.restoreGame(legacyKindsPayload);
  assert.ok(restoredLegacyKinds, 'unsuffixed V2 winds and dragons remain restorable');
  assert.equal(restoredLegacyKinds.kinds.filter((kind) => kind === 'wind-n').length, 2);
  assert.equal(restoredLegacyKinds.kinds.filter((kind) => kind === 'drg-c').length, 2);
});
