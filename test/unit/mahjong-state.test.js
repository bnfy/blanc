const assert = require('node:assert/strict');
const test = require('node:test');
const S = require('../../src/renderer/pages/mahjong-state');
const E = require('../../src/renderer/pages/mahjong-engine');

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

function uuid(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

class HookedStorage extends MemoryStorage {
  constructor(entries) { super(entries); this.failKeys = new Set(); this.onSet = null; }
  setItem(key, value) {
    if (this.failKeys.has(key)) throw new Error(`write refused: ${key}`);
    super.setItem(key, value);
    if (this.onSet) { const hook = this.onSet; this.onSet = null; hook(key); }
  }
}

function completion(layoutId, mode, extra = {}) {
  return {
    layoutId, layoutRevision: S.LAYOUT_REVISIONS[layoutId], mode, elapsedMs: 60_000, score: mode === 'tray' ? 1000 : 0,
    scoringRevision: mode === 'tray' ? 2 : 0, completed: true, assists: { undo: 0, hint: 0, shuffle: 0 }, ...extra,
  };
}

function rawEvent(storage, number, result, updatedAt) {
  const eventId = uuid(number);
  storage.setItem(`${S.RECORD_EVENT_PREFIX}${eventId}`, JSON.stringify({ version: 2, eventId, updatedAt, result }));
  return eventId;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('record revisions stay aligned with engine layout revisions', () => {
  assert.deepEqual(
    S.LAYOUT_REVISIONS,
    Object.fromEntries(Object.entries(E.LAYOUTS).map(([id, layout]) => [id, layout.revision]))
  );
});

const engine = {
  serializeGame(state) {
    if (!state || state.unserializable) throw new Error('cannot serialize');
    return clone({ ...state, schema: 2 });
  },
  restoreGame(payload) {
    if (!payload || payload.schema !== 2 || payload.corrupt) throw new Error('cannot restore');
    return clone(payload);
  },
};

test('game ids are strict UUIDs and the storage key is game scoped', () => {
  assert.equal(S.isValidGameId(uuid(1)), true);
  assert.equal(S.isValidGameId('game-one'), false);
  assert.equal(S.gameStorageKey(uuid(1)), `${S.GAME_KEY_PREFIX}${uuid(1)}`);
  assert.equal(S.gameAccessKey(uuid(1)), `${S.GAME_ACCESS_PREFIX}${uuid(1)}`);
  assert.throws(() => S.gameStorageKey('../shared'));
  assert.throws(() => S.gameAccessKey('../shared'));
});

test('ensureGameId adds only an opaque id with replaceState and preserves private state', () => {
  const calls = [];
  const history = {
    state: { page: 'mahjong' },
    replaceState(...args) { calls.push(args); },
  };
  const result = S.ensureGameId({
    href: 'blanc://mahjong/?private=1',
    history,
    uuid: () => uuid(4),
  });
  assert.equal(result.gameId, uuid(4));
  assert.equal(result.changed, true);
  assert.deepEqual(calls, [[{ page: 'mahjong' }, '', `/?private=1&game=${uuid(4)}`]]);
  const url = new URL(result.url);
  assert.equal(url.searchParams.get('private'), '1');
  assert.equal(url.searchParams.get('game'), uuid(4));
  assert.equal(url.searchParams.has('layout'), false);
  assert.equal(url.searchParams.has('mode'), false);

  const existing = S.ensureGameId({ href: result.url, history, uuid: () => uuid(5) });
  assert.deepEqual(existing, { gameId: uuid(4), changed: false, url: result.url });
  assert.equal(calls.length, 1);
});

test('forkGameId always replaces a valid existing id', () => {
  let replacement = null;
  const result = S.forkGameId({
    href: `blanc://mahjong/?game=${uuid(1)}#board`,
    history: { state: null, replaceState(_state, _title, url) { replacement = url; } },
    uuid: () => uuid(2),
  });
  assert.equal(result.gameId, uuid(2));
  assert.equal(replacement, `/?game=${uuid(2)}#board`);
});

test('game store serializes, restores, touches, and discards game-id-scoped saves', () => {
  const storage = new MemoryStorage();
  let clock = 1000;
  const store = S.createGameStore({ storage, engine, now: () => clock });
  const id = uuid(7);
  const original = { gameId: id, layoutId: 'turtle', removed: [false, true] };
  assert.equal(store.save(id, original), true);
  original.removed[0] = true;

  const wrapper = JSON.parse(storage.getItem(S.gameStorageKey(id)));
  assert.equal(wrapper.version, 2);
  assert.equal(wrapper.gameId, id);
  assert.deepEqual(wrapper.payload.removed, [false, true]);
  assert.deepEqual(store.list(), [{ gameId: id, lastAccessAt: 1000 }]);

  clock = 4000;
  const restored = store.load(id);
  assert.deepEqual(restored.removed, [false, true]);
  assert.equal(restored.gameId, id);
  assert.deepEqual(store.list(), [{ gameId: id, lastAccessAt: 4000 }]);

  // A separate access touch extends inactivity without rewriting the game
  // wrapper's older mutation timestamp.
  clock = 1000 + S.GAME_EXPIRY_MS + 1;
  assert.notEqual(store.load(id), null);

  assert.equal(store.discard(id), true);
  assert.equal(storage.getItem(S.gameStorageKey(id)), null);
  assert.deepEqual(store.list(), []);
});

test('load access touches never write a stale payload over a concurrent save', () => {
  const storage = new MemoryStorage();
  let clock = 100;
  const store = S.createGameStore({ storage, engine, now: () => clock });
  const id = uuid(8);
  const key = S.gameStorageKey(id);
  assert.equal(store.save(id, { gameId: id, marker: 'snapshot-a' }), true);

  // Simulate the owner committing snapshot B after this loader has read A but
  // before it writes its access touch.
  const ordinaryGet = storage.getItem.bind(storage);
  let interleave = true;
  storage.getItem = (requestedKey) => {
    const value = ordinaryGet(requestedKey);
    if (interleave && requestedKey === key) {
      interleave = false;
      const newer = JSON.parse(value);
      newer.savedAt = 150;
      newer.lastAccessAt = 150;
      newer.payload.marker = 'snapshot-b';
      storage.setItem(key, JSON.stringify(newer));
    }
    return value;
  };

  clock = 200;
  assert.equal(store.load(id).marker, 'snapshot-a', 'the caller receives the snapshot it actually read');
  const persisted = JSON.parse(ordinaryGet(key));
  assert.equal(persisted.payload.marker, 'snapshot-b', 'the newer owner payload remains authoritative');
  assert.equal(persisted.lastAccessAt, 150, 'load does not rewrite the game wrapper');
  assert.equal(JSON.parse(ordinaryGet(S.gameAccessKey(id))).lastAccessAt, 200);
  assert.deepEqual(store.list(), [{ gameId: id, lastAccessAt: 200 }]);
});

test('game store quietly discards corrupt, incompatible, and expired payloads', () => {
  const storage = new MemoryStorage();
  let clock = 5_000;
  const store = S.createGameStore({ storage, engine, now: () => clock });

  const malformed = uuid(10);
  storage.setItem(S.gameStorageKey(malformed), '{broken');
  storage.setItem(S.GAME_INDEX_KEY, JSON.stringify({
    version: 2,
    entries: [{ gameId: malformed, lastAccessAt: clock }],
  }));
  assert.equal(store.load(malformed), null);
  assert.equal(storage.getItem(S.gameStorageKey(malformed)), null);

  const incompatible = uuid(11);
  storage.setItem(S.gameStorageKey(incompatible), JSON.stringify({
    version: 1,
    gameId: incompatible,
    savedAt: clock,
    lastAccessAt: clock,
    payload: { schema: 2, gameId: incompatible },
  }));
  assert.equal(store.load(incompatible), null);

  const invalidEngineState = uuid(12);
  store.save(invalidEngineState, { gameId: invalidEngineState, corrupt: true });
  assert.equal(store.load(invalidEngineState), null);

  const expired = uuid(13);
  assert.equal(store.save(expired, { gameId: expired }), true);
  clock += S.GAME_EXPIRY_MS + 1;
  assert.equal(store.load(expired), null);
  assert.equal(storage.getItem(S.gameStorageKey(expired)), null);
});

test('game store retains only the 32 most recently active saves', () => {
  const storage = new MemoryStorage();
  let clock = 10_000;
  const store = S.createGameStore({ storage, engine, now: () => clock });
  for (let i = 1; i <= 35; i++) {
    clock += 1;
    assert.equal(store.save(uuid(i), { gameId: uuid(i), marker: i }), true);
  }
  const saved = store.list();
  assert.equal(saved.length, S.MAX_SAVED_GAMES);
  assert.equal(storage.getItem(S.gameStorageKey(uuid(1))), null);
  assert.equal(storage.getItem(S.gameStorageKey(uuid(3))), null);
  assert.notEqual(storage.getItem(S.gameStorageKey(uuid(4))), null);
  assert.equal(saved[0].gameId, uuid(35));
});

test('cleanup rebuilds a corrupt index from wrappers without deleting valid games', () => {
  const storage = new MemoryStorage();
  const first = S.createGameStore({ storage, engine, now: () => 500 });
  const second = S.createGameStore({ storage, engine, now: () => 501 });
  assert.equal(first.save(uuid(36), { gameId: uuid(36), marker: 'first' }), true);
  storage.setItem(S.GAME_INDEX_KEY, '{corrupt');
  assert.equal(second.save(uuid(37), { gameId: uuid(37), marker: 'second' }), true);

  assert.equal(first.load(uuid(36)).marker, 'first');
  assert.equal(second.load(uuid(37)).marker, 'second');
  assert.deepEqual(first.list().map((entry) => entry.gameId).sort(), [uuid(36), uuid(37)]);
});

test('cleanup rejects engine-invalid wrappers before applying the 32-game cap', () => {
  const storage = new MemoryStorage();
  const store = S.createGameStore({ storage, engine, now: () => 10_000 });
  const validId = uuid(60);
  assert.equal(store.save(validId, { gameId: validId, marker: 'keep me' }), true);

  for (let index = 0; index < S.MAX_SAVED_GAMES; index++) {
    const gameId = uuid(100 + index);
    storage.setItem(S.gameStorageKey(gameId), JSON.stringify({
      version: S.STATE_VERSION,
      gameId,
      savedAt: 20_000 + index,
      lastAccessAt: 20_000 + index,
      payload: { schema: 2, gameId, corrupt: true },
    }));
  }

  const kept = store.cleanup(30_000);
  assert.deepEqual(kept, [{ gameId: validId, lastAccessAt: 10_000 }]);
  assert.equal(store.load(validId).marker, 'keep me');
  for (let index = 0; index < S.MAX_SAVED_GAMES; index++) {
    assert.equal(storage.getItem(S.gameStorageKey(uuid(100 + index))), null);
  }
});

test('forkSavedGame copies a validated save without changing its source id', () => {
  const storage = new MemoryStorage();
  const store = S.createGameStore({ storage, engine, now: () => 99 });
  const source = uuid(20);
  const target = uuid(21);
  assert.equal(store.save(source, { gameId: source, score: 250 }), true);
  const forked = store.forkSavedGame(source, target);
  assert.equal(forked.gameId, target);
  assert.equal(forked.score, 250);
  assert.equal(store.load(source).gameId, source);
  assert.equal(store.load(target).gameId, target);
});

test('duplicate-tab forking preserves every stable Mahjong visual variant', () => {
  const storage = new MemoryStorage();
  const store = S.createGameStore({ storage, engine: E, now: () => 101 });
  const source = uuid(22);
  const target = uuid(23);
  const game = E.createGame({ seed: 831, layoutId: 'peaks', mode: 'tray', gameId: source });
  for (let count = 0; count < 5; count++) {
    const [first, second] = E.availableMoves(game).find((move) => move.length === 2);
    assert.equal(E.selectTile(game, first).type, 'tray-park');
    assert.equal(E.selectTile(game, second).type, 'tray-pair');
  }
  assert.equal(store.save(source, game), true);

  const forked = store.forkSavedGame(source, target);
  assert.ok(forked);
  assert.equal(forked.gameId, target);
  for (const kind of E.SPECIAL_VARIANT_KINDS) {
    assert.equal(forked.kinds.filter((candidate) => candidate === kind).length, 2);
  }
  assert.equal(forked.comboCount, game.comboCount);
  assert.equal(forked.maxCombo, game.maxCombo);
  assert.equal(forked.comboRemainingMs, game.comboRemainingMs);
  assert.equal(forked.autoClears, game.autoClears);
  assert.equal(forked.scoringRevision, E.TRAY_SCORING_REVISION);
  assert.deepEqual(forked.history, game.history);
  assert.deepEqual(store.load(source).kinds, game.kinds);
  assert.deepEqual(store.load(target).kinds, game.kinds);
});

test('legacy best migrates to Turtle Classic without touching sound', () => {
  const storage = new MemoryStorage({
    [S.LEGACY_BEST_KEY]: '81234',
    [S.SOUND_KEY]: 'off',
  });
  const records = S.createRecordStore({ storage, now: () => 1234 }).read();
  assert.deepEqual(records.classic.turtle, {
    layoutRevision: S.LAYOUT_REVISIONS.turtle,
    bestTimeMs: 81234,
    updatedAt: 1234,
  });
  assert.equal(storage.getItem(S.LEGACY_BEST_KEY), null);
  assert.equal(storage.getItem(S.SOUND_KEY), 'off');

  // A slower legacy value never replaces an existing v2 record.
  storage.setItem(S.LEGACY_BEST_KEY, '90000');
  const second = S.createRecordStore({ storage, now: () => 2000 }).read();
  assert.equal(second.classic.turtle.bestTimeMs, 81234);
});

test('records keep per-layout Classic time and Tray score with time tie-break', () => {
  let records = S.emptyRecords();
  records = S.applyResult(records, {
    layoutId: 'arch', layoutRevision: 2, mode: 'classic', elapsedMs: 80_000, score: 0,
  }, 1);
  records = S.applyResult(records, {
    layoutId: 'arch', layoutRevision: 2, mode: 'classic', elapsedMs: 90_000, score: 0,
  }, 2);
  records = S.applyResult(records, {
    layoutId: 'peaks', layoutRevision: 1, mode: 'classic', elapsedMs: 30_000, score: 0,
  }, 3);
  assert.equal(records.classic.arch.bestTimeMs, 80_000);
  assert.equal(records.classic.peaks.bestTimeMs, 30_000);

  records = S.applyResult(records, {
    layoutId: 'arch', layoutRevision: 2, mode: 'tray', elapsedMs: 70_000, score: 800,
    scoringRevision: 2, maxCombo: 5, autoClears: 1,
  }, 4);
  records = S.applyResult(records, {
    layoutId: 'arch', layoutRevision: 2, mode: 'tray', elapsedMs: 65_000, score: 800,
    scoringRevision: 2, maxCombo: 7, autoClears: 1,
  }, 5);
  records = S.applyResult(records, {
    layoutId: 'arch', layoutRevision: 2, mode: 'tray', elapsedMs: 40_000, score: 700,
    scoringRevision: 2, maxCombo: 9, autoClears: 2,
  }, 6);
  assert.deepEqual(records.tray.arch, {
    layoutRevision: 2,
    scoringRevision: 2,
    bestScore: 800,
    bestTimeMs: 65_000,
    maxCombo: 7,
    autoClears: 1,
    updatedAt: 5,
  });
});

test('revision-1 Tray records remain preserved but are excluded from current records', () => {
  const normalized = S.normalizeRecords({ version: S.RECORDS_VERSION, classic: {}, tray: {
    turtle: { layoutRevision: 1, bestScore: 99_999, bestTimeMs: 1, updatedAt: 1 },
  }, daily: {} });
  assert.equal(normalized.tray.turtle, undefined);
  assert.equal(normalized.trayLegacy.turtle.bestScore, 99_999);
  const current = S.applyResult(normalized, {
    layoutId: 'turtle', layoutRevision: 1, mode: 'tray', elapsedMs: 60_000, score: 500,
    scoringRevision: 2, maxCombo: 3, autoClears: 0,
  }, 2);
  assert.equal(current.tray.turtle.bestScore, 500);
  assert.equal(current.trayLegacy.turtle.bestScore, 99_999);
});

test('record revisions preserve unchanged layouts and discard retired Arch geometry', () => {
  const legacy = {
    version: S.RECORDS_VERSION,
    classic: {
      turtle: { bestTimeMs: 60_000, updatedAt: 1 },
      arch: { bestTimeMs: 50_000, updatedAt: 2 },
    },
    tray: {
      peaks: { bestScore: 900, bestTimeMs: 70_000, updatedAt: 3 },
      arch: { bestScore: 1_200, bestTimeMs: 80_000, updatedAt: 4 },
    },
    daily: {
      '2026-08-30': {
        classic: {
          layoutId: 'arch', completed: true, elapsedMs: 50_000,
          score: 0, assists: {}, updatedAt: 5,
        },
        tray: {
          layoutId: 'peaks', completed: true, elapsedMs: 70_000,
          score: 900, assists: {}, updatedAt: 6,
        },
      },
    },
  };
  const normalized = S.normalizeRecords(legacy);
  assert.equal(normalized.classic.arch, undefined);
  assert.equal(normalized.tray.arch, undefined);
  assert.equal(normalized.daily['2026-08-30'].classic, undefined);
  assert.equal(normalized.classic.turtle.layoutRevision, 1);
  assert.equal(normalized.tray.peaks, undefined);
  assert.equal(normalized.trayLegacy.peaks.layoutRevision, 1);
  assert.equal(normalized.daily['2026-08-30'].tray.layoutRevision, 1);

  const revised = S.applyResult(normalized, {
    layoutId: 'arch', layoutRevision: 2, mode: 'classic', completed: true,
    elapsedMs: 45_000, score: 0, assists: {}, dailyKey: '2026-08-30',
  }, 7);
  assert.equal(revised.classic.arch.layoutRevision, 2);
  assert.equal(revised.daily['2026-08-30'].classic.layoutRevision, 2);
  assert.equal(S.applyResult(revised, {
    layoutId: 'arch', layoutRevision: 1, mode: 'classic', elapsedMs: 1, score: 0,
  }, 8).classic.arch.bestTimeMs, 45_000);
});

test('daily deal identity is deterministic and rotates through every layout', () => {
  const first = S.dailyDeal('2026-08-30');
  assert.deepEqual(first, S.dailyDeal('2026-08-30'));
  assert.notEqual(first.seed, S.dailySeed('2026-08-31'));
  const days = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'];
  const layouts = days.map((day) => S.dailyLayoutId(day));
  assert.deepEqual([...layouts].sort(), [...S.LAYOUT_IDS].sort(), 'eight consecutive days visit every layout once');
  assert.equal(S.dailyLayoutId('2026-09-15'), layouts[0], 'the ninth day wraps');
  assert.equal(S.LAYOUT_IDS.length, 8);
  assert.deepEqual(S.LAYOUT_IDS, ['turtle', 'arch', 'peaks', 'pyramid', 'fortress', 'butterfly', 'bridge', 'cross']);
  assert.equal(S.dailyKey(new Date(2026, 7, 30, 23, 59)), '2026-08-30');
});

test('daily Classic and Tray results remain separate with sanitized assists', () => {
  let records = S.emptyRecords();
  records = S.applyResult(records, {
    layoutId: 'turtle', layoutRevision: 1, mode: 'classic', dailyKey: '2026-08-30', completed: true,
    elapsedMs: 70_000, score: 0, assists: { hint: 2, undo: 1, shuffle: -4 },
  }, 100);
  records = S.applyResult(records, {
    layoutId: 'turtle', layoutRevision: 1, mode: 'tray', dailyKey: '2026-08-30', completed: true,
    elapsedMs: 90_000, score: 1_250, scoringRevision: 2, maxCombo: 10, autoClears: 2,
    assists: { hint: 0, undo: 3, shuffle: 1 },
  }, 101);
  assert.equal(records.daily['2026-08-30'].classic.elapsedMs, 70_000);
  assert.equal(records.daily['2026-08-30'].tray.score, 1_250);
  assert.equal(records.daily['2026-08-30'].tray.scoringRevision, 2);
  assert.equal(records.daily['2026-08-30'].tray.maxCombo, 10);
  assert.equal(records.daily['2026-08-30'].tray.autoClears, 2);
  assert.deepEqual(records.daily['2026-08-30'].classic.assists, { undo: 1, hint: 2, shuffle: 0 });

  // The better result replaces its own mode only.
  records = S.applyResult(records, {
    layoutId: 'turtle', layoutRevision: 1, mode: 'tray', dailyKey: '2026-08-30', completed: true,
    elapsedMs: 100_000, score: 1_500, scoringRevision: 2, maxCombo: 12, autoClears: 2, assists: {},
  }, 102);
  assert.equal(records.daily['2026-08-30'].tray.score, 1_500);
  assert.equal(records.daily['2026-08-30'].classic.elapsedMs, 70_000);
});

test('immutable record events recover both modes after a stale aggregate write', () => {
  const storage = new MemoryStorage();
  let event = 40;
  const options = { storage, now: () => 900, uuid: () => uuid(event++) };
  const first = S.createRecordStore(options);
  const second = S.createRecordStore(options);
  first.record({
    gameId: uuid(1), layoutId: 'arch', layoutRevision: 2, mode: 'classic', dailyKey: '2026-08-30',
    completed: true, elapsedMs: 70_000, score: 0, assists: {},
  });
  const staleAggregate = storage.getItem(S.RECORDS_KEY);
  second.record({
    gameId: uuid(2), layoutId: 'arch', layoutRevision: 2, mode: 'tray', dailyKey: '2026-08-30',
    completed: true, elapsedMs: 80_000, score: 1_200, assists: {},
  });

  // Simulate a renderer committing an older aggregate after both immutable
  // completion events were written. A fresh read must reconstruct the union.
  storage.setItem(S.RECORDS_KEY, staleAggregate);
  const recovered = first.read();
  assert.equal(recovered.daily['2026-08-30'].classic.elapsedMs, 70_000);
  assert.equal(recovered.daily['2026-08-30'].tray.score, 1_200);
  const eventKeys = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX));
  assert.equal(eventKeys.length, 2);
});

test('record events discard retired Arch revisions and migrate unchanged layouts', () => {
  const staleArchId = uuid(301);
  const legacyTurtleId = uuid(302);
  const staleArchKey = `${S.RECORD_EVENT_PREFIX}${staleArchId}`;
  const legacyTurtleKey = `${S.RECORD_EVENT_PREFIX}${legacyTurtleId}`;
  const storage = new MemoryStorage({
    [staleArchKey]: JSON.stringify({
      version: S.RECORDS_VERSION,
      eventId: staleArchId,
      updatedAt: 1,
      result: {
        layoutId: 'arch', mode: 'classic', completed: true,
        elapsedMs: 10_000, score: 0, assists: {},
      },
    }),
    [legacyTurtleKey]: JSON.stringify({
      version: S.RECORDS_VERSION,
      eventId: legacyTurtleId,
      updatedAt: 2,
      result: {
        layoutId: 'turtle', mode: 'classic', completed: true,
        elapsedMs: 20_000, score: 0, assists: {},
      },
    }),
  });
  const store = S.createRecordStore({ storage, now: () => 3, uuid: () => uuid(303) });
  const records = store.read();
  assert.equal(storage.getItem(staleArchKey), null);
  assert.notEqual(storage.getItem(legacyTurtleKey), null);
  assert.deepEqual(records.classic.turtle, {
    layoutRevision: 1,
    bestTimeMs: 20_000,
    updatedAt: 2,
  });

  assert.equal(store.record({
    layoutId: 'arch', layoutRevision: 1, mode: 'classic', completed: true,
    elapsedMs: 1, score: 0, assists: {},
  }), null);
  assert.equal(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(303)}`), null);
});

test('record-event pruning is bound to the enumerated key and rejects suffix mismatches', () => {
  const storage = new MemoryStorage({ [S.SOUND_KEY]: 'off' });
  const result = {
    gameId: uuid(1), layoutId: 'turtle', layoutRevision: 1, mode: 'classic', completed: true,
    elapsedMs: 80_000, score: 0, assists: {},
  };
  let firstEventKey = null;
  for (let index = 1; index <= S.MAX_RECORD_EVENTS + 1; index++) {
    const eventId = uuid(500 + index);
    const key = `${S.RECORD_EVENT_PREFIX}${eventId}`;
    if (index === 1) firstEventKey = key;
    storage.setItem(key, JSON.stringify({
      version: S.RECORDS_VERSION,
      eventId,
      updatedAt: index,
      result,
      ...(index === 1 ? { key: S.SOUND_KEY } : {}),
    }));
  }

  const records = S.createRecordStore({ storage, now: () => 5000, uuid: () => uuid(900) });
  records.read();
  assert.equal(storage.getItem(S.SOUND_KEY), 'off', 'a wrapper cannot redirect pruning to sound');
  assert.equal(storage.getItem(firstEventKey), null, 'the actual oldest event key is pruned');
  assert.equal(
    [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX)).length,
    S.MAX_RECORD_EVENTS
  );

  const mismatchedKey = `${S.RECORD_EVENT_PREFIX}${uuid(950)}`;
  storage.setItem(mismatchedKey, JSON.stringify({
    version: S.RECORDS_VERSION,
    eventId: uuid(951),
    updatedAt: 6000,
    result,
    key: S.SOUND_KEY,
  }));
  records.read();
  assert.equal(storage.getItem(mismatchedKey), null);
  assert.equal(storage.getItem(S.SOUND_KEY), 'off');
});

test('duplicate claim resolution deterministically keeps the older instance', () => {
  const gameId = uuid(30);
  const older = S.instanceClaim({ gameId, instanceId: uuid(31), startedAt: 100 });
  const newer = S.instanceClaim({ gameId, instanceId: uuid(32), startedAt: 200 });
  const keep = S.resolveInstanceClaim(older, newer);
  assert.equal(keep.action, 'keep');
  assert.equal(keep.response.targetInstanceId, newer.instanceId);
  assert.equal(S.isOccupiedFor(keep.response, newer), true);
  assert.equal(S.resolveInstanceClaim(newer, older).action, 'fork');
  assert.equal(S.resolveInstanceClaim(older, { ...newer, gameId: uuid(33) }).action, 'ignore');
});

test('duplicate guard forks the newer live instance and announces its new id', () => {
  class ChannelHub {
    constructor() { this.channels = []; }
    channel() {
      const listeners = new Set();
      const channel = {
        addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
        postMessage: (data) => {
          for (const other of this.channels) {
            if (other !== channel) for (const listener of other.listeners) listener({ data: clone(data) });
          }
        },
        listeners,
      };
      this.channels.push(channel);
      return channel;
    }
  }

  const hub = new ChannelHub();
  const gameId = uuid(40);
  const first = S.createDuplicateGuard({
    channel: hub.channel(), gameId, instanceId: uuid(41), startedAt: 100,
  });
  const forks = [];
  const second = S.createDuplicateGuard({
    channel: hub.channel(), gameId, instanceId: uuid(42), startedAt: 200,
    now: () => 201,
    uuid: () => uuid(43),
    onFork: (event) => forks.push(event),
  });
  assert.equal(first.getGameId(), gameId);
  assert.equal(second.getGameId(), uuid(43));
  assert.deepEqual(forks, [{ from: gameId, to: uuid(43) }]);
  first.dispose();
  second.dispose();
});

test('game summaries expose resumable saves without touching access times', () => {
  const storage = new MemoryStorage();
  let clock = 1000;
  const store = S.createGameStore({ storage, engine: E, now: () => clock });
  const untouched = E.createGame({ seed: 1, layoutId: 'peaks', mode: 'tray' });
  store.save(uuid(1), untouched);
  clock = 2000;
  const played = E.createGame({ seed: 2, layoutId: 'arch', mode: 'classic', dailyKey: '2026-09-02' });
  const [first, second] = E.generateDeal({ seed: 2, layoutId: 'arch' }).solution[0];
  E.removePair(played, first, second);
  store.save(uuid(2), played);
  clock = 3000;
  const won = E.createGame({ seed: 3, layoutId: 'peaks', mode: 'classic' });
  for (const pair of E.generateDeal({ seed: 3, layoutId: 'peaks' }).solution) E.removePair(won, ...pair);
  store.save(uuid(3), won);

  clock = 9000;
  const summaries = store.summaries();
  assert.deepEqual(summaries.map((entry) => entry.gameId), [uuid(3), uuid(2), uuid(1)]);
  assert.deepEqual(summaries[1], {
    gameId: uuid(2), lastAccessAt: 2000, layoutId: 'arch', mode: 'classic',
    dailyKey: '2026-09-02', status: 'playing', started: true, pairsLeft: 47,
  });
  assert.equal(summaries[0].status, 'won');
  assert.equal(summaries[2].started, false);
  assert.equal(JSON.parse(storage.getItem(S.gameAccessKey(uuid(2)))).lastAccessAt, 2000, 'summaries never touch access');

  assert.equal(S.resumeCandidate(summaries, { excludeGameId: uuid(9) }).gameId, uuid(2));
  assert.equal(S.resumeCandidate(summaries, { excludeGameId: uuid(2) }), null);
  assert.equal(S.resumeCandidate([], {}), null);
});

test('table preferences persist the last layout, mode, and deal source with safe defaults', () => {
  const storage = new MemoryStorage();
  const prefs = S.createPrefsStore({ storage });
  assert.deepEqual(prefs.read(), { layoutId: 'turtle', mode: 'tray', source: 'daily' });
  assert.equal(prefs.write({ layoutId: 'arch', mode: 'classic', source: 'random' }), true);
  assert.deepEqual(prefs.read(), { layoutId: 'arch', mode: 'classic', source: 'random' });
  assert.deepEqual(S.createPrefsStore({ storage }).read(), { layoutId: 'arch', mode: 'classic', source: 'random' });
  storage.setItem(S.PREFS_KEY, JSON.stringify({ version: 1, layoutId: 'castle', mode: 'zen', source: 'random' }));
  assert.deepEqual(prefs.read(), { layoutId: 'turtle', mode: 'tray', source: 'random' });
  storage.setItem(S.PREFS_KEY, '{not json');
  assert.deepEqual(prefs.read(), { layoutId: 'turtle', mode: 'tray', source: 'daily' });
});

test('completion outcome distinguishes a first clear, a new record, and no change', () => {
  const classicBefore = { bestTimeMs: 90_000 };
  assert.equal(S.completionOutcome({ mode: 'classic', before: null, after: null }), 'none');
  assert.equal(S.completionOutcome({ mode: 'classic', before: null, after: { bestTimeMs: 100 } }), 'first');
  assert.equal(S.completionOutcome({ mode: 'classic', before: classicBefore, after: { bestTimeMs: 80_000 } }), 'record');
  assert.equal(S.completionOutcome({ mode: 'classic', before: classicBefore, after: { bestTimeMs: 90_000 } }), 'none');
  const trayBefore = { bestScore: 3000, bestTimeMs: 100_000 };
  assert.equal(S.completionOutcome({ mode: 'tray', before: trayBefore, after: { bestScore: 3100, bestTimeMs: 200_000 } }), 'record');
  assert.equal(S.completionOutcome({ mode: 'tray', before: trayBefore, after: { bestScore: 3000, bestTimeMs: 90_000 } }), 'record');
  assert.equal(S.completionOutcome({ mode: 'tray', before: trayBefore, after: { bestScore: 3000, bestTimeMs: 100_000 } }), 'none');
});

test('daily results describe a cleared day per mode', () => {
  const formatMs = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const records = S.applyResult(S.emptyRecords(), {
    layoutId: 'arch', layoutRevision: 2, mode: 'tray', elapsedMs: 252_000, score: 3450,
    scoringRevision: 2, completed: true, dailyKey: '2026-09-02', assists: {},
  }, 5);
  assert.equal(S.describeDailyResult(records, '2026-09-02', 'tray', formatMs), 'cleared · 3,450 pts · 4:12');
  assert.equal(S.describeDailyResult(records, '2026-09-02', 'classic', formatMs), null);
  const classic = S.applyResult(records, {
    layoutId: 'arch', layoutRevision: 2, mode: 'classic', elapsedMs: 61_000, completed: true, dailyKey: '2026-09-02', assists: {},
  }, 6);
  assert.equal(S.describeDailyResult(classic, '2026-09-02', 'classic', formatMs), 'cleared · 1:01');
  assert.equal(S.describeDailyResult(classic, '2026-09-03', 'classic', formatMs), null);
});

test('totals count each completion once across repeated reads and are normalised safely', () => {
  const storage = new HookedStorage();
  let clock = 1000;
  const store = S.createRecordStore({ storage, now: () => clock, uuid: () => uuid(clock++) });
  store.record(completion('peaks', 'classic'));
  store.record(completion('peaks', 'classic'));
  store.record(completion('arch', 'tray'));
  for (let i = 0; i < 3; i++) store.read();
  const records = store.read();
  assert.deepEqual(records.totals.cleared, { classic: { peaks: 2 }, tray: { arch: 1 } });
  assert.equal(records.totals.countedEvents.length, 3);
  assert.deepEqual(S.emptyRecords().totals, S.emptyTotals());
  const oversized = Array.from({ length: S.MAX_RECORD_EVENTS * 3 }, (_, i) => uuid(10_000 + i));
  assert.equal(
    S.normalizeRecords({ version: 2, totals: { cleared: {}, countedEvents: oversized } }).totals.countedEvents.length,
    oversized.length,
    'normalisation never truncates seen ids; only compaction after a prune bounds them'
  );
  const corrupt = S.normalizeRecords({ version: 2, classic: { peaks: { layoutRevision: 1, bestTimeMs: 5 } }, totals: { cleared: { classic: { peaks: -4, castle: 2 }, tray: 'x' }, countedEvents: 'nope' } });
  assert.deepEqual(corrupt.totals, S.emptyTotals());
  assert.equal(corrupt.classic.peaks.bestTimeMs, 5, 'a corrupt totals block never disturbs best records');
});

test('only completed: true events increment totals; false or missing never do', () => {
  const storage = new HookedStorage();
  rawEvent(storage, 1, completion('peaks', 'classic'), 1);
  rawEvent(storage, 2, completion('peaks', 'classic', { completed: false }), 2);
  const missing = completion('peaks', 'classic');
  delete missing.completed;
  rawEvent(storage, 3, missing, 3);
  const store = S.createRecordStore({ storage, now: () => 10, uuid: () => uuid(99) });
  const records = store.read();
  assert.deepEqual(records.totals.cleared, { classic: { peaks: 1 }, tray: {} });
  assert.equal(records.totals.countedEvents.length, 3, 'non-counting events are still marked seen so they are never re-examined');
  assert.deepEqual(store.read().totals.cleared, { classic: { peaks: 1 }, tray: {} });
});

test('a failed aggregate write leaves every event in place and never prunes', () => {
  const storage = new HookedStorage();
  for (let n = 1; n <= S.MAX_RECORD_EVENTS + 1; n++) rawEvent(storage, n, completion('turtle', 'classic'), n);
  storage.failKeys.add(S.RECORDS_KEY);
  const store = S.createRecordStore({ storage, now: () => 10_000, uuid: () => uuid(9_999) });
  const view = store.read();
  assert.equal(view.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1, 'the in-memory view still counts');
  assert.equal(storage.getItem(S.RECORDS_KEY), null, 'nothing persisted');
  const remaining = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX));
  assert.equal(remaining.length, S.MAX_RECORD_EVENTS + 1, 'no event pruned while the count is unpersisted');
  storage.failKeys.clear();
  const recovered = store.read();
  assert.equal(recovered.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1);
  const afterPrune = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX));
  assert.equal(afterPrune.length, S.MAX_RECORD_EVENTS);
  assert.equal(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(1)}`), null, 'the oldest counted event is the one pruned');
  assert.equal(recovered.totals.countedEvents.length, S.MAX_RECORD_EVENTS, 'countedEvents compacts to retained ids');
  assert.ok(!recovered.totals.countedEvents.includes(uuid(1)));
});

test('an event written between persist and prune is never pruned before it is counted', () => {
  const storage = new HookedStorage();
  for (let n = 1; n <= S.MAX_RECORD_EVENTS + 1; n++) rawEvent(storage, n, completion('turtle', 'classic'), n);
  const late = S.MAX_RECORD_EVENTS + 2;
  // Another tab lands its completion the instant this tab persists its aggregate.
  storage.onSet = (key) => { if (key === S.RECORDS_KEY) rawEvent(storage, late, completion('cross', 'tray'), late); };
  const store = S.createRecordStore({ storage, now: () => 10_000, uuid: () => uuid(9_999) });
  const first = store.read();
  assert.equal(first.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1);
  assert.equal(first.totals.cleared.tray.cross, undefined, 'the late event is not yet counted');
  assert.notEqual(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(late)}`), null, 'the late event survived pruning');
  assert.equal(storage.getItem(`${S.RECORD_EVENT_PREFIX}${uuid(1)}`), null, 'the oldest counted event was pruned instead');
  const second = store.read();
  assert.equal(second.totals.cleared.tray.cross, 1);
  assert.equal(second.totals.cleared.classic.turtle, S.MAX_RECORD_EVENTS + 1, 'no double count');
  const retained = [...storage.values.keys()].filter((key) => key.startsWith(S.RECORD_EVENT_PREFIX)).length;
  assert.equal(retained, S.MAX_RECORD_EVENTS);
  assert.equal(second.totals.countedEvents.length, S.MAX_RECORD_EVENTS);
});

function dailyRecords(entries) {
  let records = S.emptyRecords();
  for (const [dailyKey, mode, layoutId] of entries) {
    records = S.applyResult(records, completion(layoutId, mode, { dailyKey }), 5);
  }
  return records;
}

test('dailyStreak counts consecutive local days with any completed daily', () => {
  assert.deepEqual(S.dailyStreak(S.emptyRecords(), '2026-09-02'), { current: 0, longest: 0, cleared: 0 });
  assert.deepEqual(S.dailyStreak(dailyRecords([['2026-09-02', 'classic', 'arch']]), '2026-09-02'), { current: 1, longest: 1, cleared: 1 });
  // yesterday only: today is not yet broken
  assert.deepEqual(S.dailyStreak(dailyRecords([['2026-09-01', 'tray', 'peaks']]), '2026-09-02'), { current: 1, longest: 1, cleared: 1 });
  // a gap resets current but keeps longest
  const gappy = dailyRecords([
    ['2026-08-20', 'classic', 'turtle'], ['2026-08-21', 'classic', 'turtle'], ['2026-08-22', 'tray', 'turtle'],
    ['2026-09-01', 'classic', 'arch'], ['2026-09-02', 'classic', 'arch'],
  ]);
  assert.deepEqual(S.dailyStreak(gappy, '2026-09-02'), { current: 2, longest: 3, cleared: 5 });
  // both modes on one day count once; two days ago does not extend the streak
  const doubled = dailyRecords([['2026-08-31', 'classic', 'peaks'], ['2026-08-31', 'tray', 'peaks']]);
  assert.deepEqual(S.dailyStreak(doubled, '2026-09-02'), { current: 0, longest: 1, cleared: 1 });
  assert.equal(S.shiftDailyKey('2026-03-01', -1), '2026-02-28');
  assert.equal(S.shiftDailyKey('2026-12-31', 1), '2027-01-01');
});

test('recordsSummary lays out eight rows in order, marks the current board, and ends its strip today', () => {
  const storage = new MemoryStorage();
  let clock = 100;
  const store = S.createRecordStore({ storage, now: () => clock, uuid: () => uuid(clock++) });
  store.record(completion('cross', 'classic', { elapsedMs: 90_000, dailyKey: '2026-09-02' }));
  store.record(completion('cross', 'classic', { elapsedMs: 80_000 }));
  store.record(completion('bridge', 'tray', { elapsedMs: 200_000, score: 4200, dailyKey: '2026-09-01' }));
  const summary = S.recordsSummary(store.read(), { today: '2026-09-02', currentLayoutId: 'bridge' });
  assert.deepEqual(summary.overview, { cleared: 3, streak: 2, longest: 2, dailies: 2 });
  assert.deepEqual(summary.rows.map((row) => row.layoutId), [...S.LAYOUT_IDS]);
  assert.deepEqual(summary.rows.find((row) => row.layoutId === 'cross'), {
    layoutId: 'cross', classicBestMs: 80_000, trayBestScore: null, trayBestMs: null, cleared: 2, current: false,
  });
  assert.deepEqual(summary.rows.find((row) => row.layoutId === 'bridge'), {
    layoutId: 'bridge', classicBestMs: null, trayBestScore: 4200, trayBestMs: 200_000, cleared: 1, current: true,
  });
  assert.equal(summary.rows.filter((row) => row.current).length, 1);
  assert.equal(summary.days.length, 28);
  assert.deepEqual(summary.days.at(-1), { key: '2026-09-02', cleared: true, today: true });
  assert.deepEqual(summary.days.at(-2), { key: '2026-09-01', cleared: true, today: false });
  assert.equal(summary.days[0].key, '2026-08-06');
  assert.equal(summary.days.filter((day) => day.cleared).length, 2);
  const empty = S.recordsSummary(S.emptyRecords(), { today: '2026-09-02' });
  assert.deepEqual(empty.overview, { cleared: 0, streak: 0, longest: 0, dailies: 0 });
  assert.ok(empty.rows.every((row) => row.classicBestMs === null && row.trayBestScore === null && row.cleared === 0 && !row.current));
});
