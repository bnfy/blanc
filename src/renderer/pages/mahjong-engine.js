// Pure Mahjong-solitaire logic. This module deliberately has no DOM or
// Electron dependency: it is shared by the blanc://mahjong renderer and the
// Node unit suite.
(() => {
  'use strict';

  const GAME_STATE_VERSION = 2;
  const MODES = Object.freeze({ CLASSIC: 'classic', TRAY: 'tray' });
  const STATUSES = Object.freeze({ PLAYING: 'playing', RESCUE: 'rescue', WON: 'won' });
  const TRAY_SIZE = 4;
  const MAX_HISTORY = 160;
  const SPECIAL_VARIANT_KINDS = Object.freeze([
    'wind-n-motif', 'wind-n-seal',
    'wind-e-motif', 'wind-e-seal',
    'wind-s-motif', 'wind-s-seal',
    'wind-w-motif', 'wind-w-seal',
    'drg-c-motif', 'drg-c-seal',
    'drg-f-motif', 'drg-f-seal',
    'drg-p-motif', 'drg-p-seal',
  ]);

  // Coordinates are in half-tile units. A tile occupies [x,x+2) x [y,y+2)
  // on one layer. Integer half-units let a raised tile bridge four tiles.
  function buildTurtleLayout() {
    const positions = [];
    const rows = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
    rows.forEach(([from, to], row) => {
      for (let col = from; col <= to; col++) positions.push({ x: col * 2, y: row * 2, z: 0 });
    });
    positions.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
    for (let col = 4; col <= 9; col++) {
      for (let row = 1; row <= 6; row++) positions.push({ x: col * 2, y: row * 2, z: 1 });
    }
    for (let col = 5; col <= 8; col++) {
      for (let row = 2; row <= 5; row++) positions.push({ x: col * 2, y: row * 2, z: 2 });
    }
    for (let col = 6; col <= 7; col++) {
      for (let row = 3; row <= 4; row++) positions.push({ x: col * 2, y: row * 2, z: 3 });
    }
    positions.push({ x: 13, y: 7, z: 4 });
    return positions;
  }

  // A broad, approachable three-layer arch. The half-offset middle deck and
  // crest bridge their supports while the long base ends stay mechanically
  // open. Its 2:1 logical footprint keeps tiles large in a landscape table.
  function buildArchLayout() {
    const positions = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 12; col++) positions.push({ x: col * 2, y: row * 2, z: 0 });
    }
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 9; col++) positions.push({ x: 3 + col * 2, y: 4 + row * 2, z: 1 });
    }
    for (let col = 0; col < 6; col++) positions.push({ x: 6 + col * 2, y: 5, z: 2 });
    return positions;
  }

  // Two compact four-layer peaks. The shorter deal is intentionally roomy
  // so its rendered tiles can be larger than Turtle's.
  function buildPeaksLayout() {
    const positions = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) positions.push({ x: col * 2, y: row * 2, z: 0 });
    }
    for (const startX of [2, 10]) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) positions.push({ x: startX + col * 2, y: 2 + row * 2, z: 1 });
      }
    }
    for (const x of [3, 11]) {
      for (let row = 0; row < 3; row++) positions.push({ x, y: 3 + row * 2, z: 2 });
    }
    positions.push({ x: 3, y: 5, z: 3 }, { x: 11, y: 5, z: 3 });
    return positions;
  }

  function freezePositions(positions) {
    positions.forEach(Object.freeze);
    return Object.freeze(positions);
  }

  const TURTLE_LAYOUT = freezePositions(buildTurtleLayout());
  const ARCH_LAYOUT = freezePositions(buildArchLayout());
  const PEAKS_LAYOUT = freezePositions(buildPeaksLayout());
  const LAYOUTS = Object.freeze({
    turtle: Object.freeze({ id: 'turtle', name: 'Turtle', revision: 1, positions: TURTLE_LAYOUT, tileCount: 144, layers: 5 }),
    arch: Object.freeze({ id: 'arch', name: 'Arch', revision: 2, positions: ARCH_LAYOUT, tileCount: 96, layers: 3 }),
    peaks: Object.freeze({ id: 'peaks', name: 'Peaks', revision: 1, positions: PEAKS_LAYOUT, tileCount: 72, layers: 4 }),
  });

  function layoutFor(layoutId) {
    return LAYOUTS[layoutId] || null;
  }

  // mulberry32: deterministic, compact, and adequate for local deal shuffles.
  function createRng(seed) {
    let a = Number(seed) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function matchKey(kind) {
    if (typeof kind !== 'string') return '';
    if (kind.startsWith('flower-')) return 'flower';
    if (kind.startsWith('season-')) return 'season';
    return kind;
  }

  function isFreeAt(layout, index, present) {
    const position = layout[index];
    if (!position || !present(index)) return false;
    let leftOpen = true;
    let rightOpen = true;
    for (let other = 0; other < layout.length; other++) {
      if (other === index || !present(other)) continue;
      const candidate = layout[other];
      if (candidate.z === position.z + 1
        && Math.abs(candidate.x - position.x) < 2
        && Math.abs(candidate.y - position.y) < 2) return false;
      if (candidate.z === position.z && Math.abs(candidate.y - position.y) < 2) {
        if (candidate.x === position.x - 2) leftOpen = false;
        if (candidate.x === position.x + 2) rightOpen = false;
      }
    }
    return leftOpen || rightOpen;
  }

  function shuffled(values, rng) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(rng() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function standardPairs(rng, pairCount) {
    const ordinaryPairs = [];
    for (const suit of ['dot', 'bam', 'chr']) {
      for (let value = 1; value <= 9; value++) {
        ordinaryPairs.push([`${suit}-${value}`, `${suit}-${value}`]);
        ordinaryPairs.push([`${suit}-${value}`, `${suit}-${value}`]);
      }
    }
    const flowers = shuffled(['flower-1', 'flower-2', 'flower-3', 'flower-4'], rng);
    ordinaryPairs.push([flowers[0], flowers[1]], [flowers[2], flowers[3]]);
    const seasons = shuffled(['season-1', 'season-2', 'season-3', 'season-4'], rng);
    ordinaryPairs.push([seasons[0], seasons[1]], [seasons[2], seasons[3]]);

    if (!Number.isInteger(pairCount) || pairCount < SPECIAL_VARIANT_KINDS.length) {
      throw new TypeError('mahjong: deal cannot contain the complete special collection');
    }
    const specialPairs = SPECIAL_VARIANT_KINDS.map((kind) => [kind, kind]);
    const selectedOrdinaryPairs = shuffled(ordinaryPairs, rng)
      .slice(0, pairCount - specialPairs.length);
    return shuffled([...specialPairs, ...selectedOrdinaryPairs], rng);
  }

  const KNOWN_KINDS = (() => {
    const kinds = new Set();
    for (const suit of ['dot', 'bam', 'chr']) {
      for (let value = 1; value <= 9; value++) kinds.add(`${suit}-${value}`);
    }
    // Unsuffixed winds and dragons are kept for V2 saves created before the
    // unified visual-pair theme. New deals exclusively use stable variants.
    for (const wind of ['e', 's', 'w', 'n']) kinds.add(`wind-${wind}`);
    for (const dragon of ['c', 'f', 'p']) kinds.add(`drg-${dragon}`);
    for (const kind of SPECIAL_VARIANT_KINDS) kinds.add(kind);
    for (let value = 1; value <= 4; value++) {
      kinds.add(`flower-${value}`);
      kinds.add(`season-${value}`);
    }
    return kinds;
  })();

  function freeIndices(layout, occupied) {
    const present = (index) => occupied[index];
    const result = [];
    for (let index = 0; index < layout.length; index++) {
      if (occupied[index] && isFreeAt(layout, index, present)) result.push(index);
    }
    return result;
  }

  // Produce a legal removal order for an arbitrary current board shape. The
  // RNG only selects among currently free tiles; validation below replays the
  // plan before any caller commits an assignment.
  function constructRemovalPlan(layout, initialOccupied, rng, maxAttempts = 1200) {
    const targetCount = initialOccupied.filter(Boolean).length;
    if (targetCount % 2 !== 0) return null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const occupied = initialOccupied.slice();
      const plan = [];
      let failed = false;
      for (let remaining = targetCount; remaining > 0; remaining -= 2) {
        const free = freeIndices(layout, occupied);
        if (free.length < 2) {
          failed = true;
          break;
        }
        const first = free.splice(Math.floor(rng() * free.length), 1)[0];
        const second = free.splice(Math.floor(rng() * free.length), 1)[0];
        occupied[first] = false;
        occupied[second] = false;
        plan.push([first, second]);
      }
      if (!failed && validateRemovalPlan(layout, initialOccupied, plan)) return plan;
    }
    return null;
  }

  function validateRemovalPlan(layout, initialOccupied, plan) {
    const occupied = initialOccupied.slice();
    let removedCount = 0;
    for (const pair of plan) {
      if (!Array.isArray(pair) || pair.length !== 2) return false;
      const [first, second] = pair;
      if (first === second || !occupied[first] || !occupied[second]) return false;
      const present = (index) => occupied[index];
      if (!isFreeAt(layout, first, present) || !isFreeAt(layout, second, present)) return false;
      occupied[first] = occupied[second] = false;
      removedCount += 2;
    }
    return removedCount === initialOccupied.filter(Boolean).length
      && occupied.every((value, index) => !initialOccupied[index] || !value);
  }

  function normalizeDealArguments(seedOrOptions, maybeLayoutId) {
    if (seedOrOptions && typeof seedOrOptions === 'object') {
      return { seed: Number(seedOrOptions.seed) >>> 0, layoutId: seedOrOptions.layoutId || 'turtle' };
    }
    return { seed: Number(seedOrOptions) >>> 0, layoutId: maybeLayoutId || 'turtle' };
  }

  function generateDeal(seedOrOptions, maybeLayoutId) {
    const { seed, layoutId } = normalizeDealArguments(seedOrOptions, maybeLayoutId);
    const layoutDefinition = layoutFor(layoutId);
    if (!layoutDefinition) throw new TypeError(`mahjong: unknown layout ${layoutId}`);
    const layout = layoutDefinition.positions;
    const rng = createRng(seed);
    const occupied = new Array(layout.length).fill(true);
    const plan = constructRemovalPlan(layout, occupied, rng);
    if (!plan) throw new Error(`mahjong: deal generation failed for ${layoutId}`);
    const pairs = standardPairs(rng, layout.length / 2);
    const kinds = new Array(layout.length).fill(null);
    for (let index = 0; index < plan.length; index++) {
      const [first, second] = plan[index];
      const [firstKind, secondKind] = pairs[index];
      kinds[first] = firstKind;
      kinds[second] = secondKind;
    }
    return { kinds, solution: plan, seed, layoutId };
  }

  function normalizeCreateOptions(seedOrOptions) {
    if (typeof seedOrOptions === 'number') {
      return { seed: seedOrOptions, layoutId: 'turtle', mode: MODES.CLASSIC, gameId: null, dailyKey: null };
    }
    const options = seedOrOptions && typeof seedOrOptions === 'object' ? seedOrOptions : {};
    return {
      seed: options.seed == null ? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) : options.seed,
      layoutId: options.layoutId || 'turtle',
      mode: options.mode || MODES.CLASSIC,
      gameId: options.gameId || null,
      dailyKey: options.dailyKey || null,
    };
  }

  function createGame(seedOrOptions) {
    const options = normalizeCreateOptions(seedOrOptions);
    const seed = Number(options.seed) >>> 0;
    if (!layoutFor(options.layoutId)) throw new TypeError(`mahjong: unknown layout ${options.layoutId}`);
    if (![MODES.CLASSIC, MODES.TRAY].includes(options.mode)) throw new TypeError(`mahjong: unknown mode ${options.mode}`);
    const { kinds } = generateDeal({ seed, layoutId: options.layoutId });
    const definition = layoutFor(options.layoutId);
    return {
      version: GAME_STATE_VERSION,
      gameId: options.gameId,
      mode: options.mode,
      layoutId: options.layoutId,
      layoutRevision: definition.revision,
      seed,
      kinds,
      removed: new Array(kinds.length).fill(false),
      tray: [],
      selected: null,
      history: [],
      score: 0,
      chain: 0,
      elapsedMs: 0,
      dailyKey: options.dailyKey,
      status: STATUSES.PLAYING,
      completionRecorded: false,
      assists: { undo: 0, hint: 0, shuffle: 0 },
      updatedAt: Date.now(),
    };
  }

  function stateLayout(state) {
    return state && layoutFor(state.layoutId || 'turtle');
  }

  function isFree(state, index) {
    const definition = stateLayout(state);
    if (!definition || !Number.isInteger(index) || index < 0 || index >= definition.positions.length) return false;
    if (!Array.isArray(state.removed) || state.removed[index]) return false;
    return isFreeAt(definition.positions, index, (other) => !state.removed[other]);
  }

  function availableMoves(state) {
    const definition = stateLayout(state);
    if (!definition) return [];
    const byKey = new Map();
    for (let index = 0; index < definition.positions.length; index++) {
      if (!isFree(state, index)) continue;
      const key = matchKey(state.kinds[index]);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(index);
    }
    const moves = [];
    for (const indices of byKey.values()) {
      for (let first = 0; first < indices.length; first++) {
        for (let second = first + 1; second < indices.length; second++) moves.push([indices[first], indices[second]]);
      }
    }
    moves.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (state.mode !== MODES.TRAY) return moves;

    // A parked tile and a free board mate are the strongest Tray move. Keep
    // the tray index in the tuple so hints can name the match while only
    // highlighting the still-visible board tile.
    const trayMatches = [];
    for (const trayIndex of state.tray || []) {
      const key = matchKey(state.kinds[trayIndex]);
      const free = byKey.get(key) || [];
      for (const boardIndex of free) trayMatches.push([trayIndex, boardIndex]);
    }
    if (trayMatches.length) return trayMatches;

    // With fewer than three parked tiles a free board pair can be taken
    // without filling the tray. At three slots, or when no pair is currently
    // exposed, a single free tile is still a legal move (and may deliberately
    // lead to Rescue), so Tray never claims the board is stuck while the user
    // can act.
    if ((state.tray || []).length < TRAY_SIZE - 1 && moves.length) return moves;
    const singles = [];
    for (const indices of byKey.values()) for (const index of indices) singles.push([index]);
    singles.sort((a, b) => a[0] - b[0]);
    return singles;
  }

  // Kept for the v1 renderer and tests while v2 callers adopt availableMoves.
  const movesAvailable = availableMoves;

  function touch(state) {
    state.updatedAt = Date.now();
  }

  function pushHistory(state, action) {
    state.history.push(action);
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
  }

  function cleanEligibilitySnapshot(state, tray) {
    const snapshot = [];
    for (const trayIndex of tray) {
      const action = state.history.findLast(
        (entry) => entry.type === 'tray-park' && entry.index === trayIndex
      );
      if (action) snapshot.push([trayIndex, action.cleanEligible === true]);
    }
    return snapshot;
  }

  function restoreCleanEligibility(state, snapshot) {
    for (const [trayIndex, eligible] of snapshot || []) {
      const action = state.history.findLast(
        (entry) => entry.type === 'tray-park' && entry.index === trayIndex
      );
      if (action) action.cleanEligible = eligible;
    }
  }

  function updateWonStatus(state) {
    if (state.removed.every(Boolean) && state.tray.length === 0) state.status = STATUSES.WON;
    else if (state.status === STATUSES.WON) state.status = STATUSES.PLAYING;
  }

  function removePair(state, first, second) {
    if (!state || state.mode === MODES.TRAY || state.status !== STATUSES.PLAYING) return false;
    if (first === second || !isFree(state, first) || !isFree(state, second)) return false;
    if (matchKey(state.kinds[first]) !== matchKey(state.kinds[second])) return false;
    state.removed[first] = state.removed[second] = true;
    state.selected = null;
    pushHistory(state, { type: 'classic-pair', indices: [first, second] });
    updateWonStatus(state);
    touch(state);
    return true;
  }

  function selectClassicTile(state, index) {
    if (!isFree(state, index)) return { ok: false, type: 'blocked', index };
    if (state.selected == null) {
      state.selected = index;
      touch(state);
      return { ok: true, type: 'selected', index };
    }
    if (state.selected === index) {
      state.selected = null;
      touch(state);
      return { ok: true, type: 'deselected', index };
    }
    const first = state.selected;
    if (isFree(state, first) && matchKey(state.kinds[first]) === matchKey(state.kinds[index])) {
      removePair(state, first, index);
      return { ok: true, type: 'pair', indices: [first, index], won: state.status === STATUSES.WON };
    }
    state.selected = index;
    touch(state);
    return { ok: true, type: 'mismatch', previous: first, index };
  }

  function selectTrayTile(state, index) {
    if (!isFree(state, index)) return { ok: false, type: 'blocked', index };
    const priorTray = state.tray.slice();
    const priorScore = state.score;
    const priorCleanEligibility = cleanEligibilitySnapshot(state, priorTray);
    const key = matchKey(state.kinds[index]);
    const matchOffset = priorTray.findIndex((trayIndex) => matchKey(state.kinds[trayIndex]) === key);
    state.removed[index] = true;
    if (matchOffset >= 0) {
      const matchedIndex = priorTray[matchOffset];
      state.tray.splice(matchOffset, 1);
      // The parked tile and this pick become one undoable pair. Remove the
      // older park action, and rebase later tray snapshots so a subsequent
      // sequence of undos never puts the restored tile back into the tray.
      const parkedAction = state.history.findLastIndex(
        (action) => action.type === 'tray-park' && action.index === matchedIndex
      );
      const clean = priorTray.length === 1 && parkedAction >= 0 &&
        state.history[parkedAction].cleanEligible === true;
      if (parkedAction >= 0) {
        state.history.splice(parkedAction, 1);
        for (const action of state.history) {
          if (Array.isArray(action.priorTray)) {
            action.priorTray = action.priorTray.filter((trayIndex) => trayIndex !== matchedIndex);
          }
          if (Array.isArray(action.priorCleanEligibility)) {
            action.priorCleanEligibility = action.priorCleanEligibility.filter(
              ([trayIndex]) => trayIndex !== matchedIndex
            );
          }
        }
      }
      if (clean) {
        state.chain = Math.min(5, state.chain + 1);
        state.score += 100 + (state.chain - 1) * 25;
      } else {
        state.chain = 0;
        state.score += 100;
      }
      state.status = STATUSES.PLAYING;
      pushHistory(state, {
        type: 'tray-pair',
        indices: [matchedIndex, index],
        priorTray: state.tray.slice(),
        priorScore,
        priorStatus: STATUSES.PLAYING,
      });
      updateWonStatus(state);
      touch(state);
      return {
        ok: true,
        type: 'tray-pair',
        indices: [matchedIndex, index],
        clean,
        points: state.score - priorScore,
        score: state.score,
        chain: state.chain,
        won: state.status === STATUSES.WON,
      };
    }

    if (priorTray.length > 0) {
      state.chain = 0;
      // Parking any additional unmatched tile breaks the clean opportunity
      // for every tile already waiting in the tray.
      for (const action of state.history) {
        if (action.type === 'tray-park' && state.tray.includes(action.index)) {
          action.cleanEligible = false;
        }
      }
    }
    state.tray.push(index);
    if (state.tray.length === TRAY_SIZE) state.status = STATUSES.RESCUE;
    pushHistory(state, {
      type: 'tray-park',
      index,
      priorTray,
      priorScore,
      priorStatus: STATUSES.PLAYING,
      cleanEligible: priorTray.length === 0,
      priorCleanEligibility,
    });
    touch(state);
    return {
      ok: true,
      type: state.status === STATUSES.RESCUE ? 'rescue' : 'tray-park',
      index,
      tray: state.tray.slice(),
    };
  }

  function selectTile(state, index) {
    if (!state || state.status !== STATUSES.PLAYING) return { ok: false, type: state && state.status || 'invalid', index };
    if (!Number.isInteger(index)) return { ok: false, type: 'invalid', index };
    return state.mode === MODES.TRAY ? selectTrayTile(state, index) : selectClassicTile(state, index);
  }

  function undo(state) {
    if (!state || !Array.isArray(state.history)) return false;
    const action = state.history.pop();
    if (!action) return false;
    if (action.type === 'classic-pair') {
      state.removed[action.indices[0]] = false;
      state.removed[action.indices[1]] = false;
      state.selected = null;
    } else if (action.type === 'tray-park') {
      state.removed[action.index] = false;
      state.tray = action.priorTray.slice();
      state.score = action.priorScore;
      state.selected = null;
      restoreCleanEligibility(state, action.priorCleanEligibility);
    } else if (action.type === 'tray-pair') {
      state.removed[action.indices[0]] = false;
      state.removed[action.indices[1]] = false;
      state.tray = action.priorTray.slice();
      state.score = action.priorScore;
      state.selected = null;
    } else {
      return false;
    }
    state.chain = 0;
    state.status = STATUSES.PLAYING;
    state.completionRecorded = false;
    if (!state.assists) state.assists = { undo: 0, hint: 0, shuffle: 0 };
    state.assists.undo += 1;
    touch(state);
    return true;
  }

  function pairKindsForActiveTiles(state, activeIndices, rng) {
    const groups = new Map();
    for (const index of activeIndices) {
      const kind = state.kinds[index];
      const key = matchKey(kind);
      if (!key) return null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(kind);
    }
    const pairs = [];
    for (const kinds of groups.values()) {
      if (kinds.length % 2 !== 0) return null;
      const randomizedKinds = shuffled(kinds, rng);
      for (let index = 0; index < randomizedKinds.length; index += 2) pairs.push([randomizedKinds[index], randomizedKinds[index + 1]]);
    }
    return shuffled(pairs, rng);
  }

  function normalizeShuffleRng(state, rng) {
    if (typeof rng === 'function') return rng;
    if (Number.isFinite(rng)) return createRng(rng);
    const count = state.assists && Number.isInteger(state.assists.shuffle) ? state.assists.shuffle : 0;
    return createRng((state.seed ^ 0x9e3779b9 ^ count) >>> 0);
  }

  function shuffleRemaining(state, rng) {
    const definition = stateLayout(state);
    if (!definition || state.status === STATUSES.WON) return false;
    const random = normalizeShuffleRng(state, rng);
    const nextRemoved = state.removed.slice();
    for (const index of state.tray || []) nextRemoved[index] = false;
    const activeIndices = [];
    for (let index = 0; index < nextRemoved.length; index++) if (!nextRemoved[index]) activeIndices.push(index);
    if (activeIndices.length < 2 || activeIndices.length % 2 !== 0) return false;
    const kindPairs = pairKindsForActiveTiles(state, activeIndices, random);
    if (!kindPairs || kindPairs.length !== activeIndices.length / 2) return false;
    const plan = constructRemovalPlan(definition.positions, nextRemoved.map((value) => !value), random);
    if (!plan || plan.length !== kindPairs.length) return false;
    const nextKinds = state.kinds.slice();
    for (let offset = 0; offset < plan.length; offset++) {
      const [first, second] = plan[offset];
      const [firstKind, secondKind] = kindPairs[offset];
      nextKinds[first] = firstKind;
      nextKinds[second] = secondKind;
    }
    for (const [first, second] of plan) {
      if (matchKey(nextKinds[first]) !== matchKey(nextKinds[second])) return false;
    }
    // Commit only after construction and replay validation both succeeded.
    state.kinds = nextKinds;
    state.removed = nextRemoved;
    state.tray = [];
    state.selected = null;
    state.history = [];
    state.chain = 0;
    state.status = STATUSES.PLAYING;
    if (!state.assists) state.assists = { undo: 0, hint: 0, shuffle: 0 };
    state.assists.shuffle += 1;
    touch(state);
    return true;
  }

  function isWon(state) {
    return Boolean(state && Array.isArray(state.removed)
      && state.removed.length > 0
      && state.removed.every(Boolean)
      && (!state.tray || state.tray.length === 0));
  }

  function validIndex(value, length) {
    return Number.isInteger(value) && value >= 0 && value < length;
  }

  function cloneHistory(history, length) {
    if (!Array.isArray(history) || history.length > MAX_HISTORY) return null;
    const result = [];
    for (const raw of history) {
      if (!raw || typeof raw !== 'object') return null;
      if (raw.type === 'classic-pair') {
        if (!Array.isArray(raw.indices) || raw.indices.length !== 2
          || raw.indices[0] === raw.indices[1]
          || !raw.indices.every((index) => validIndex(index, length))) return null;
        result.push({ type: 'classic-pair', indices: raw.indices.slice() });
      } else if (raw.type === 'tray-park') {
        if (!validIndex(raw.index, length) || !Array.isArray(raw.priorTray)
          || raw.priorTray.length > TRAY_SIZE - 1
          || new Set(raw.priorTray).size !== raw.priorTray.length
          || !raw.priorTray.every((index) => validIndex(index, length))
          || !Number.isInteger(raw.priorScore) || raw.priorScore < 0
          || !Object.values(STATUSES).includes(raw.priorStatus)) return null;
        const priorCleanEligibility = raw.priorCleanEligibility === undefined
          ? []
          : raw.priorCleanEligibility;
        if (!Array.isArray(priorCleanEligibility)
          || new Set(priorCleanEligibility.map((entry) => Array.isArray(entry) ? entry[0] : -1)).size !== priorCleanEligibility.length
          || !priorCleanEligibility.every((entry) => Array.isArray(entry) && entry.length === 2
            && validIndex(entry[0], length) && raw.priorTray.includes(entry[0])
            && typeof entry[1] === 'boolean')) return null;
        if (raw.matchedIndex != null && !validIndex(raw.matchedIndex, length)) return null;
        const action = {
          type: 'tray-park',
          index: raw.index,
          priorTray: raw.priorTray.slice(),
          priorScore: raw.priorScore,
          priorStatus: raw.priorStatus,
          // Saves from an interrupted pre-release v2 build did not carry
          // provenance. Defaulting those to false avoids awarding a chain the
          // user may already have broken.
          cleanEligible: raw.cleanEligible === true,
          priorCleanEligibility: priorCleanEligibility.map(([index, eligible]) => [index, eligible]),
        };
        result.push(action);
      } else if (raw.type === 'tray-pair') {
        if (!Array.isArray(raw.indices) || raw.indices.length !== 2
          || raw.indices[0] === raw.indices[1]
          || !raw.indices.every((index) => validIndex(index, length))
          || !Array.isArray(raw.priorTray) || raw.priorTray.length > TRAY_SIZE - 1
          || new Set(raw.priorTray).size !== raw.priorTray.length
          || !raw.priorTray.every((index) => validIndex(index, length))
          || !Number.isInteger(raw.priorScore) || raw.priorScore < 0
          || !Object.values(STATUSES).includes(raw.priorStatus)) return null;
        result.push({
          type: 'tray-pair',
          indices: raw.indices.slice(),
          priorTray: raw.priorTray.slice(),
          priorScore: raw.priorScore,
          priorStatus: raw.priorStatus,
        });
      } else return null;
    }
    return result;
  }

  function serializeGame(state) {
    const restored = restoreGame(state);
    if (!restored) throw new TypeError('mahjong: cannot serialize invalid game state');
    return {
      version: GAME_STATE_VERSION,
      gameId: restored.gameId,
      mode: restored.mode,
      layoutId: restored.layoutId,
      layoutRevision: restored.layoutRevision,
      seed: restored.seed,
      kinds: restored.kinds.slice(),
      removed: restored.removed.slice(),
      tray: restored.tray.slice(),
      selected: restored.selected,
      history: restored.history.map((action) => ({
        ...action,
        ...(action.indices ? { indices: action.indices.slice() } : {}),
        ...(action.priorTray ? { priorTray: action.priorTray.slice() } : {}),
      })),
      score: restored.score,
      chain: restored.chain,
      elapsedMs: restored.elapsedMs,
      dailyKey: restored.dailyKey,
      status: restored.status,
      completionRecorded: restored.completionRecorded,
      assists: { ...restored.assists },
      updatedAt: restored.updatedAt,
    };
  }

  function restoreGame(payload) {
    let raw = payload;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return null; }
    }
    if (!raw || typeof raw !== 'object' || raw.version !== GAME_STATE_VERSION) return null;
    const definition = layoutFor(raw.layoutId);
    if (!definition || ![MODES.CLASSIC, MODES.TRAY].includes(raw.mode)) return null;
    // V2 saves created before per-layout revisions implicitly used revision 1.
    // This preserves unchanged Turtle/Peaks games while invalidating the old,
    // portrait Arch assignment after its coordinates changed.
    const layoutRevision = raw.layoutRevision === undefined ? 1 : raw.layoutRevision;
    if (!Number.isInteger(layoutRevision) || layoutRevision !== definition.revision) return null;
    const length = definition.positions.length;
    if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) return null;
    if (!Array.isArray(raw.kinds) || raw.kinds.length !== length
      || !raw.kinds.every((kind) => typeof kind === 'string' && KNOWN_KINDS.has(kind))) return null;
    if (!Array.isArray(raw.removed) || raw.removed.length !== length
      || !raw.removed.every((value) => typeof value === 'boolean')) return null;
    if (!Array.isArray(raw.tray) || raw.tray.length > TRAY_SIZE
      || new Set(raw.tray).size !== raw.tray.length
      || !raw.tray.every((index) => validIndex(index, length) && raw.removed[index])) return null;
    if (raw.mode === MODES.CLASSIC && raw.tray.length !== 0) return null;
    if (raw.selected != null && (!validIndex(raw.selected, length) || raw.removed[raw.selected])) return null;
    if (raw.mode === MODES.TRAY && raw.selected != null) return null;
    if (!Number.isInteger(raw.score) || raw.score < 0
      || !Number.isInteger(raw.chain) || raw.chain < 0 || raw.chain > 5
      || !Number.isFinite(raw.elapsedMs) || raw.elapsedMs < 0
      || !Object.values(STATUSES).includes(raw.status)
      || (raw.completionRecorded !== undefined && typeof raw.completionRecorded !== 'boolean')
      || !Number.isInteger(raw.updatedAt) || raw.updatedAt < 0) return null;
    if (raw.dailyKey != null && (typeof raw.dailyKey !== 'string' || raw.dailyKey.length > 32)) return null;
    if (raw.gameId != null && (typeof raw.gameId !== 'string' || raw.gameId.length < 1 || raw.gameId.length > 128)) return null;
    if (!raw.assists || !['undo', 'hint', 'shuffle'].every(
      (key) => Number.isInteger(raw.assists[key]) && raw.assists[key] >= 0
    )) return null;
    const history = cloneHistory(raw.history, length);
    if (!history) return null;
    if (raw.status === STATUSES.RESCUE && (raw.mode !== MODES.TRAY || raw.tray.length !== TRAY_SIZE)) return null;
    if (raw.status !== STATUSES.RESCUE && raw.tray.length === TRAY_SIZE) return null;
    const won = raw.removed.every(Boolean) && raw.tray.length === 0;
    if ((raw.status === STATUSES.WON) !== won) return null;
    if (raw.completionRecorded === true && !won) return null;

    // Cleared pairs disappear from this accounting; board + parked tray must
    // still contain an even count of every match class.
    const liveCounts = new Map();
    for (let index = 0; index < length; index++) {
      if (!raw.removed[index] || raw.tray.includes(index)) {
        const key = matchKey(raw.kinds[index]);
        liveCounts.set(key, (liveCounts.get(key) || 0) + 1);
      }
    }
    if ([...liveCounts.values()].some((count) => count % 2 !== 0)) return null;

    const restored = {
      version: GAME_STATE_VERSION,
      gameId: raw.gameId,
      mode: raw.mode,
      layoutId: raw.layoutId,
      layoutRevision,
      seed: raw.seed >>> 0,
      kinds: raw.kinds.slice(),
      removed: raw.removed.slice(),
      tray: raw.tray.slice(),
      selected: raw.selected == null ? null : raw.selected,
      history,
      score: raw.score,
      chain: raw.chain,
      elapsedMs: Math.floor(raw.elapsedMs),
      dailyKey: raw.dailyKey == null ? null : raw.dailyKey,
      status: raw.status,
      completionRecorded: raw.completionRecorded === true,
      assists: { undo: raw.assists.undo, hint: raw.assists.hint, shuffle: raw.assists.shuffle },
      updatedAt: raw.updatedAt,
    };
    if (restored.selected != null && !isFree(restored, restored.selected)) return null;
    return restored;
  }

  const MahjongEngine = {
    GAME_STATE_VERSION,
    MODES,
    STATUSES,
    TRAY_SIZE,
    SPECIAL_VARIANT_KINDS,
    LAYOUTS,
    TURTLE_LAYOUT,
    ARCH_LAYOUT,
    PEAKS_LAYOUT,
    createRng,
    matchKey,
    isFreeAt,
    generateDeal,
    createGame,
    isFree,
    availableMoves,
    movesAvailable,
    selectTile,
    removePair,
    undo,
    shuffleRemaining,
    serializeGame,
    restoreGame,
    isWon,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MahjongEngine;
  else window.MahjongEngine = MahjongEngine;
})();
