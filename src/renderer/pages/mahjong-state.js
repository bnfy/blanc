// Local-only Mahjong v2 persistence, records, daily-deal identity, and
// duplicate-instance coordination. This module deliberately has no Electron
// or DOM dependency so the storage contract can be exercised under node.
(() => {
  'use strict';

  const STATE_VERSION = 2;
  const RECORDS_VERSION = 2;
  const GAME_ID_PARAM = 'game';
  const GAME_KEY_PREFIX = 'mahjong.game.v2.';
  const GAME_ACCESS_PREFIX = 'mahjong.game-access.v2.';
  const GAME_INDEX_KEY = 'mahjong.game-index.v2';
  const RECORDS_KEY = 'mahjong.records.v2';
  const RECORD_EVENT_PREFIX = 'mahjong.record-event.v2.';
  const PREFS_KEY = 'mahjong.prefs.v2';
  const LEGACY_BEST_KEY = 'mahjong.best';
  const SOUND_KEY = 'mahjong.sound';
  const MAX_SAVED_GAMES = 32;
  const MAX_RECORD_EVENTS = 128;
  const GAME_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
  const LAYOUT_IDS = Object.freeze(['turtle', 'arch', 'peaks', 'pyramid', 'fortress', 'butterfly', 'bridge', 'cross']);
  // Record revisions deliberately mirror the pure engine's layout revisions.
  // A missing revision is legacy revision 1, which keeps unchanged Turtle and
  // Peaks results while preventing the retired portrait Arch from replaying
  // into the wider revision-2 board.
  const LAYOUT_REVISIONS = Object.freeze({
    turtle: 1, arch: 2, peaks: 1, pyramid: 1, fortress: 1, butterfly: 1, bridge: 1, cross: 1,
  });
  const MODES = Object.freeze(['classic', 'tray']);
  const SOURCES = Object.freeze(['random', 'daily']);
  const DEFAULT_PREFS = Object.freeze({ layoutId: 'turtle', mode: 'tray', source: 'daily' });
  const TRAY_SCORING_REVISION = 2;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DAILY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteInteger(value, minimum = 0) {
    return Number.isSafeInteger(value) && value >= minimum;
  }

  function isValidGameId(value) {
    return typeof value === 'string' && UUID_RE.test(value);
  }

  function defaultUuid() {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoApi || typeof cryptoApi.randomUUID !== 'function') {
      throw new Error('mahjong: crypto.randomUUID is unavailable');
    }
    return cryptoApi.randomUUID();
  }

  function mintGameId(uuid = defaultUuid) {
    const gameId = uuid();
    if (!isValidGameId(gameId)) throw new Error('mahjong: UUID provider returned an invalid game id');
    return gameId.toLowerCase();
  }

  function currentHref(explicitHref) {
    if (typeof explicitHref === 'string' && explicitHref) return explicitHref;
    if (typeof location !== 'undefined' && location && typeof location.href === 'string') return location.href;
    throw new Error('mahjong: no URL supplied');
  }

  function replaceGameId({ href, history: historyApi, uuid = defaultUuid, force = false } = {}) {
    const original = currentHref(href);
    const url = new URL(original);
    const existing = url.searchParams.get(GAME_ID_PARAM);
    if (!force && isValidGameId(existing)) {
      return { gameId: existing.toLowerCase(), changed: false, url: url.href };
    }

    const gameId = mintGameId(uuid);
    url.searchParams.set(GAME_ID_PARAM, gameId);
    const api = historyApi || (typeof history !== 'undefined' ? history : null);
    if (!api || typeof api.replaceState !== 'function') throw new Error('mahjong: history.replaceState is unavailable');
    // Keep existing benign page parameters (notably `private=1`), while the
    // only Mahjong state represented in the URL is the opaque instance id.
    api.replaceState(api.state ?? null, '', `${url.pathname}${url.search}${url.hash}`);
    return { gameId, changed: true, url: url.href };
  }

  function ensureGameId(options) {
    return replaceGameId({ ...options, force: false });
  }

  function forkGameId(options) {
    return replaceGameId({ ...options, force: true });
  }

  function gameStorageKey(gameId) {
    if (!isValidGameId(gameId)) throw new Error('mahjong: invalid game id');
    return `${GAME_KEY_PREFIX}${gameId.toLowerCase()}`;
  }

  function gameAccessKey(gameId) {
    if (!isValidGameId(gameId)) throw new Error('mahjong: invalid game id');
    return `${GAME_ACCESS_PREFIX}${gameId.toLowerCase()}`;
  }

  function defaultStorage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  function safeGet(storage, key) {
    try { return storage && storage.getItem(key); } catch { return null; }
  }

  function safeSet(storage, key, value) {
    try {
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeRemove(storage, key) {
    try {
      if (!storage) return false;
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function storedKeysWithPrefix(storage, prefix) {
    const keys = [];
    try {
      if (!storage || !finiteInteger(storage.length)) return keys;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key);
      }
    } catch { /* storage enumeration is best effort */ }
    return keys;
  }

  function storedGameKeys(storage) {
    return storedKeysWithPrefix(storage, GAME_KEY_PREFIX);
  }

  function storedAccessKeys(storage) {
    return storedKeysWithPrefix(storage, GAME_ACCESS_PREFIX);
  }

  function writeIndex(storage, entries) {
    return safeSet(storage, GAME_INDEX_KEY, JSON.stringify({ version: STATE_VERSION, entries }));
  }

  function createGameStore({ storage = defaultStorage(), engine, now = Date.now } = {}) {
    if (!engine || typeof engine.serializeGame !== 'function' || typeof engine.restoreGame !== 'function') {
      throw new Error('mahjong: persistence requires serializeGame and restoreGame');
    }
    if (typeof now !== 'function') throw new Error('mahjong: now must be a function');

    function discard(gameId) {
      if (!isValidGameId(gameId)) return false;
      const id = gameId.toLowerCase();
      safeRemove(storage, gameStorageKey(id));
      safeRemove(storage, gameAccessKey(id));
      cleanup(now());
      return true;
    }

    function readAccess(gameId) {
      const key = gameAccessKey(gameId);
      const raw = safeGet(storage, key);
      if (!raw) return null;
      let access;
      try { access = JSON.parse(raw); } catch { access = null; }
      if (!isObject(access) || access.version !== STATE_VERSION || access.gameId !== gameId ||
          !finiteInteger(access.lastAccessAt)) {
        safeRemove(storage, key);
        return null;
      }
      return access.lastAccessAt;
    }

    function writeAccess(gameId, lastAccessAt) {
      return safeSet(storage, gameAccessKey(gameId), JSON.stringify({
        version: STATE_VERSION,
        gameId,
        lastAccessAt,
      }));
    }

    function validPayload(wrapper, gameId) {
      try {
        const restored = engine.restoreGame(wrapper.payload);
        return isObject(restored) && (restored.gameId === undefined || restored.gameId === gameId);
      } catch {
        return false;
      }
    }

    function cleanup(at = now()) {
      const cutoff = at - GAME_EXPIRY_MS;
      const entries = [];
      for (const key of storedGameKeys(storage)) {
        const gameId = key.slice(GAME_KEY_PREFIX.length).toLowerCase();
        let wrapper;
        try { wrapper = JSON.parse(safeGet(storage, key)); } catch { wrapper = null; }
        if (
          !isValidGameId(gameId) || !isObject(wrapper) || wrapper.version !== STATE_VERSION ||
          wrapper.gameId !== gameId || !finiteInteger(wrapper.savedAt) ||
          !finiteInteger(wrapper.lastAccessAt) ||
          !isObject(wrapper.payload) ||
          (wrapper.payload.gameId !== undefined && wrapper.payload.gameId !== gameId) ||
          !validPayload(wrapper, gameId)
        ) {
          safeRemove(storage, key);
          if (isValidGameId(gameId)) safeRemove(storage, gameAccessKey(gameId));
          continue;
        }
        const separateAccess = readAccess(gameId);
        const lastAccessAt = Math.max(wrapper.lastAccessAt, separateAccess ?? 0);
        if (lastAccessAt < cutoff) {
          safeRemove(storage, key);
          safeRemove(storage, gameAccessKey(gameId));
          continue;
        }
        entries.push({ gameId, lastAccessAt });
      }
      entries.sort((a, b) => b.lastAccessAt - a.lastAccessAt || a.gameId.localeCompare(b.gameId));
      const kept = entries.slice(0, MAX_SAVED_GAMES);
      for (const entry of entries.slice(MAX_SAVED_GAMES)) {
        safeRemove(storage, gameStorageKey(entry.gameId));
        safeRemove(storage, gameAccessKey(entry.gameId));
      }
      const keptIds = new Set(kept.map((entry) => entry.gameId));
      for (const key of storedAccessKeys(storage)) {
        const gameId = key.slice(GAME_ACCESS_PREFIX.length).toLowerCase();
        if (!isValidGameId(gameId) || !keptIds.has(gameId)) safeRemove(storage, key);
      }
      // The index is a rebuildable cache only. Retention is derived from the
      // wrappers themselves, so a missing/corrupt/stale index can never wipe
      // another renderer's just-written save.
      writeIndex(storage, kept);
      return kept.map((entry) => ({ ...entry }));
    }

    function save(gameId, state) {
      if (!isValidGameId(gameId)) return false;
      const id = gameId.toLowerCase();
      const timestamp = now();
      let payload;
      try {
        payload = engine.serializeGame(state);
        if (!isObject(payload)) return false;
        // Decouple the stored value from mutable engine state and bind the
        // serialized state to the same opaque id as its localStorage key.
        payload = JSON.parse(JSON.stringify(payload));
        payload.gameId = id;
      } catch {
        return false;
      }
      const wrapper = {
        version: STATE_VERSION,
        gameId: id,
        savedAt: timestamp,
        lastAccessAt: timestamp,
        payload,
      };
      if (!safeSet(storage, gameStorageKey(id), JSON.stringify(wrapper))) return false;
      writeAccess(id, timestamp);
      cleanup(timestamp);
      return true;
    }

    function load(gameId) {
      if (!isValidGameId(gameId)) return null;
      const id = gameId.toLowerCase();
      const raw = safeGet(storage, gameStorageKey(id));
      if (!raw) return null;
      const timestamp = now();
      let wrapper;
      try { wrapper = JSON.parse(raw); } catch {
        discard(id);
        return null;
      }
      if (
        !isObject(wrapper) || wrapper.version !== STATE_VERSION || wrapper.gameId !== id ||
        !finiteInteger(wrapper.savedAt) || !finiteInteger(wrapper.lastAccessAt) ||
        Math.max(wrapper.lastAccessAt, readAccess(id) ?? 0) < timestamp - GAME_EXPIRY_MS ||
        !isObject(wrapper.payload) ||
        (wrapper.payload.gameId !== undefined && wrapper.payload.gameId !== id)
      ) {
        discard(id);
        return null;
      }
      try {
        const state = engine.restoreGame(wrapper.payload);
        if (!isObject(state)) throw new Error('invalid restored state');
        if (state.gameId !== undefined && state.gameId !== id) throw new Error('game id mismatch');
        state.gameId = id;
        // Access time is separate from the serialized payload. A duplicate
        // renderer can therefore touch a save it read without writing that
        // stale payload over a newer mutation committed by the owner.
        writeAccess(id, timestamp);
        cleanup(timestamp);
        return state;
      } catch {
        discard(id);
        return null;
      }
    }

    function forkSavedGame(sourceGameId, targetGameId) {
      if (!isValidGameId(sourceGameId) || !isValidGameId(targetGameId)) return null;
      if (sourceGameId.toLowerCase() === targetGameId.toLowerCase()) return null;
      const state = load(sourceGameId);
      if (!state) return null;
      let payload;
      try {
        payload = engine.serializeGame(state);
        if (!isObject(payload)) return null;
        payload = JSON.parse(JSON.stringify(payload));
        payload.gameId = targetGameId.toLowerCase();
        const forked = engine.restoreGame(payload);
        if (!isObject(forked)) return null;
        forked.gameId = targetGameId.toLowerCase();
        return save(targetGameId, forked) ? forked : null;
      } catch {
        return null;
      }
    }

    function list() {
      return cleanup(now());
    }

    // Read-only projection of every retained save for "continue last game".
    // Wrappers were validated by cleanup; nothing here writes access times,
    // so peeking never promotes a stale save above the one being played.
    function summaries() {
      const result = [];
      for (const entry of cleanup(now())) {
        let wrapper;
        try { wrapper = JSON.parse(safeGet(storage, gameStorageKey(entry.gameId))); } catch { wrapper = null; }
        const payload = wrapper && wrapper.payload;
        if (!isObject(payload) || !Array.isArray(payload.kinds) || !Array.isArray(payload.removed)) continue;
        const tray = Array.isArray(payload.tray) ? payload.tray : [];
        const history = Array.isArray(payload.history) ? payload.history : [];
        const removedCount = payload.removed.filter(Boolean).length;
        result.push({
          gameId: entry.gameId,
          lastAccessAt: entry.lastAccessAt,
          layoutId: payload.layoutId,
          mode: payload.mode,
          dailyKey: payload.dailyKey == null ? null : payload.dailyKey,
          status: payload.status,
          started: history.length > 0 || tray.length > 0 || payload.selected != null
            || (Number(payload.elapsedMs) || 0) > 0,
          pairsLeft: Math.max(0, Math.floor((payload.kinds.length - removedCount + tray.length) / 2)),
        });
      }
      return result;
    }

    return Object.freeze({ save, load, discard, cleanup, list, summaries, forkSavedGame });
  }

  function resumeCandidate(summaries, { excludeGameId } = {}) {
    if (!Array.isArray(summaries)) return null;
    const excluded = typeof excludeGameId === 'string' ? excludeGameId.toLowerCase() : null;
    return summaries.find((entry) => entry && entry.started && entry.status !== 'won'
      && isValidGameId(entry.gameId) && entry.gameId.toLowerCase() !== excluded) || null;
  }

  function normalizePrefs(value) {
    const source = isObject(value) ? value : {};
    return {
      layoutId: LAYOUT_IDS.includes(source.layoutId) ? source.layoutId : DEFAULT_PREFS.layoutId,
      mode: MODES.includes(source.mode) ? source.mode : DEFAULT_PREFS.mode,
      source: SOURCES.includes(source.source) ? source.source : DEFAULT_PREFS.source,
    };
  }

  // The last chosen table (layout, mode, deal source). Device-local like the
  // sound and free-highlight preferences; a fresh tab starts from it instead
  // of always dealing Daily Burst.
  function createPrefsStore({ storage = defaultStorage() } = {}) {
    function read() {
      const raw = safeGet(storage, PREFS_KEY);
      if (!raw) return { ...DEFAULT_PREFS };
      try { return normalizePrefs(JSON.parse(raw)); } catch { return { ...DEFAULT_PREFS }; }
    }
    function write(prefs) {
      return safeSet(storage, PREFS_KEY, JSON.stringify({ version: 1, ...normalizePrefs(prefs) }));
    }
    return Object.freeze({ read, write });
  }

  // 'first' when a layout gains its first record, 'record' when an existing
  // record improved, 'none' when nothing was stored (or nothing changed).
  function completionOutcome({ mode, before, after } = {}) {
    if (!isObject(after)) return 'none';
    if (!isObject(before)) return 'first';
    if (mode === 'classic') return after.bestTimeMs < before.bestTimeMs ? 'record' : 'none';
    if (after.bestScore > before.bestScore) return 'record';
    if (after.bestScore === before.bestScore && after.bestTimeMs < before.bestTimeMs) return 'record';
    return 'none';
  }

  function describeDailyResult(records, key, mode, formatMs) {
    if (!isDailyKey(key) || !MODES.includes(mode) || typeof formatMs !== 'function') return null;
    const day = normalizeRecords(records).daily[key];
    const result = day && day[mode];
    if (!result || !result.completed) return null;
    const time = formatMs(result.elapsedMs);
    return mode === 'tray'
      ? `cleared · ${result.score.toLocaleString()} pts · ${time}`
      : `cleared · ${time}`;
  }

  function shiftDailyKey(key, days) {
    const [year, month, day] = dailyKey(key).split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  }

  function clearedDailyKeys(records) {
    const clean = normalizeRecords(records);
    return new Set(Object.entries(clean.daily)
      .filter(([, modes]) => MODES.some((mode) => modes[mode] && modes[mode].completed))
      .map(([key]) => key));
  }

  // Derived, never stored. A day counts when either mode's daily is complete.
  // `current` counts back from today, or from yesterday while today is still
  // open, so a streak is not shown as broken before the day is over.
  function dailyStreak(records, today = new Date()) {
    const days = clearedDailyKeys(records);
    const todayKey = dailyKey(today);
    let cursor = days.has(todayKey) ? todayKey : shiftDailyKey(todayKey, -1);
    let current = 0;
    while (days.has(cursor)) {
      current += 1;
      cursor = shiftDailyKey(cursor, -1);
    }
    let longest = 0;
    let run = 0;
    let previous = null;
    for (const key of [...days].sort()) {
      run = previous !== null && shiftDailyKey(previous, 1) === key ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = key;
    }
    return { current, longest, cleared: days.size };
  }

  function recordsSummary(records, { today = new Date(), layoutIds = LAYOUT_IDS, currentLayoutId = null, days = 28 } = {}) {
    const clean = normalizeRecords(records);
    const streak = dailyStreak(clean, today);
    const rows = layoutIds.map((layoutId) => {
      const classic = clean.classic[layoutId] || null;
      const tray = clean.tray[layoutId] || null;
      return {
        layoutId,
        classicBestMs: classic ? classic.bestTimeMs : null,
        trayBestScore: tray ? tray.bestScore : null,
        trayBestMs: tray ? tray.bestTimeMs : null,
        cleared: (clean.totals.cleared.classic[layoutId] || 0) + (clean.totals.cleared.tray[layoutId] || 0),
        current: layoutId === currentLayoutId,
      };
    });
    const cleared = rows.reduce((sum, row) => sum + row.cleared, 0);
    const clearedDays = clearedDailyKeys(clean);
    const todayKey = dailyKey(today);
    const strip = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const key = shiftDailyKey(todayKey, -offset);
      strip.push({ key, cleared: clearedDays.has(key), today: offset === 0 });
    }
    return {
      overview: { cleared, streak: streak.current, longest: streak.longest, dailies: streak.cleared },
      rows,
      days: strip,
    };
  }

  function emptyTotals() {
    return { cleared: { classic: {}, tray: {} }, countedEvents: [] };
  }

  function emptyRecords() {
    return { version: RECORDS_VERSION, classic: {}, tray: {}, trayLegacy: {}, daily: {}, totals: emptyTotals() };
  }

  function normalizeTotals(value) {
    const clean = emptyTotals();
    if (!isObject(value)) return clean;
    const cleared = isObject(value.cleared) ? value.cleared : {};
    for (const mode of MODES) {
      const bucket = isObject(cleared[mode]) ? cleared[mode] : {};
      for (const layoutId of LAYOUT_IDS) {
        const count = bucket[layoutId];
        if (finiteInteger(count, 1)) clean.cleared[mode][layoutId] = Math.min(count, 1_000_000);
      }
    }
    // Never truncate here: phase 1 of mergeEvents must persist every seen id.
    // The list is bounded only by post-prune compaction (phase 3).
    if (Array.isArray(value.countedEvents)) {
      clean.countedEvents = [...new Set(
        value.countedEvents.filter(isValidGameId).map((id) => id.toLowerCase())
      )];
    }
    return clean;
  }

  function normalizeAssists(value) {
    const source = isObject(value) ? value : {};
    const clean = {};
    for (const key of ['undo', 'hint', 'shuffle']) {
      const count = Number(source[key]);
      clean[key] = finiteInteger(count) ? Math.min(count, 1_000_000) : 0;
    }
    return clean;
  }

  function normalizedLayoutRevision(layoutId, value) {
    const revision = value === undefined ? 1 : value;
    return finiteInteger(revision, 1) && revision === LAYOUT_REVISIONS[layoutId]
      ? revision
      : null;
  }

  function normalizeRecords(value) {
    const clean = emptyRecords();
    if (!isObject(value) || value.version !== RECORDS_VERSION) return clean;
    clean.totals = normalizeTotals(value.totals);
    for (const layoutId of LAYOUT_IDS) {
      const classic = value.classic && value.classic[layoutId];
      const classicRevision = isObject(classic)
        ? normalizedLayoutRevision(layoutId, classic.layoutRevision)
        : null;
      if (classicRevision !== null && finiteInteger(classic.bestTimeMs, 1)) {
        clean.classic[layoutId] = {
          layoutRevision: classicRevision,
          bestTimeMs: classic.bestTimeMs,
          updatedAt: finiteInteger(classic.updatedAt) ? classic.updatedAt : 0,
        };
      }
      const tray = value.tray && value.tray[layoutId];
      const trayRevision = isObject(tray)
        ? normalizedLayoutRevision(layoutId, tray.layoutRevision)
        : null;
      if (trayRevision !== null && finiteInteger(tray.bestScore) && finiteInteger(tray.bestTimeMs, 1)) {
        const scoringRevision = tray.scoringRevision === undefined ? 1 : tray.scoringRevision;
        const target = scoringRevision === TRAY_SCORING_REVISION ? clean.tray : clean.trayLegacy;
        target[layoutId] = {
          layoutRevision: trayRevision,
          scoringRevision,
          bestScore: tray.bestScore,
          bestTimeMs: tray.bestTimeMs,
          maxCombo: finiteInteger(tray.maxCombo) ? tray.maxCombo : 0,
          autoClears: finiteInteger(tray.autoClears) ? tray.autoClears : 0,
          updatedAt: finiteInteger(tray.updatedAt) ? tray.updatedAt : 0,
        };
      }
      const legacyTray = value.trayLegacy && value.trayLegacy[layoutId];
      const legacyRevision = isObject(legacyTray)
        ? normalizedLayoutRevision(layoutId, legacyTray.layoutRevision)
        : null;
      if (legacyRevision !== null && finiteInteger(legacyTray.bestScore) && finiteInteger(legacyTray.bestTimeMs, 1)) {
        clean.trayLegacy[layoutId] = {
          layoutRevision: legacyRevision,
          scoringRevision: 1,
          bestScore: legacyTray.bestScore,
          bestTimeMs: legacyTray.bestTimeMs,
          maxCombo: 0,
          autoClears: 0,
          updatedAt: finiteInteger(legacyTray.updatedAt) ? legacyTray.updatedAt : 0,
        };
      }
    }
    if (isObject(value.daily)) {
      for (const [key, modes] of Object.entries(value.daily)) {
        if (!isDailyKey(key) || !isObject(modes)) continue;
        const entry = {};
        for (const mode of MODES) {
          const result = modes[mode];
          if (!isObject(result) || !LAYOUT_IDS.includes(result.layoutId)) continue;
          const layoutRevision = normalizedLayoutRevision(result.layoutId, result.layoutRevision);
          if (layoutRevision === null) continue;
          if (typeof result.completed !== 'boolean' || !finiteInteger(result.elapsedMs)) continue;
          entry[mode] = {
            layoutId: result.layoutId,
            layoutRevision,
            completed: result.completed,
            elapsedMs: result.elapsedMs,
            score: finiteInteger(result.score) ? result.score : 0,
            scoringRevision: mode === 'tray'
              ? (finiteInteger(result.scoringRevision, 1) ? result.scoringRevision : 1)
              : 0,
            maxCombo: mode === 'tray' && finiteInteger(result.maxCombo) ? result.maxCombo : 0,
            autoClears: mode === 'tray' && finiteInteger(result.autoClears) ? result.autoClears : 0,
            assists: normalizeAssists(result.assists),
            updatedAt: finiteInteger(result.updatedAt) ? result.updatedAt : 0,
          };
        }
        if (Object.keys(entry).length) clean.daily[key] = entry;
      }
    }
    return clean;
  }

  function betterDailyResult(candidate, current, mode) {
    if (!current) return true;
    if (candidate.completed !== current.completed) return candidate.completed;
    if (!candidate.completed) return candidate.updatedAt >= current.updatedAt;
    if (mode === 'classic') return candidate.elapsedMs < current.elapsedMs;
    if (candidate.scoringRevision !== current.scoringRevision) {
      return candidate.scoringRevision === TRAY_SCORING_REVISION;
    }
    if (candidate.score !== current.score) return candidate.score > current.score;
    return candidate.elapsedMs < current.elapsedMs;
  }

  function applyResult(records, result, timestamp = Date.now()) {
    const next = normalizeRecords(records);
    if (!isObject(result) || !LAYOUT_IDS.includes(result.layoutId) || !MODES.includes(result.mode)) return next;
    const layoutRevision = normalizedLayoutRevision(result.layoutId, result.layoutRevision);
    if (layoutRevision === null) return next;
    if (!finiteInteger(result.elapsedMs) || !finiteInteger(result.score || 0)) return next;
    const completed = result.completed !== false;
    const elapsedMs = result.elapsedMs;
    const score = result.score || 0;
    const scoringRevision = result.mode === 'tray'
      ? (finiteInteger(result.scoringRevision, 1) ? result.scoringRevision : 1)
      : 0;
    const maxCombo = result.mode === 'tray' && finiteInteger(result.maxCombo) ? result.maxCombo : 0;
    const autoClears = result.mode === 'tray' && finiteInteger(result.autoClears) ? result.autoClears : 0;
    if (completed && elapsedMs > 0) {
      if (result.mode === 'classic') {
        const current = next.classic[result.layoutId];
        if (!current || elapsedMs < current.bestTimeMs) {
          next.classic[result.layoutId] = { layoutRevision, bestTimeMs: elapsedMs, updatedAt: timestamp };
        }
      } else {
        const current = next.tray[result.layoutId];
        if (scoringRevision === TRAY_SCORING_REVISION && (!current || score > current.bestScore || (score === current.bestScore && elapsedMs < current.bestTimeMs))) {
          next.tray[result.layoutId] = {
            layoutRevision, scoringRevision, bestScore: score, bestTimeMs: elapsedMs,
            maxCombo, autoClears, updatedAt: timestamp,
          };
        }
      }
    }
    if (isDailyKey(result.dailyKey)) {
      const candidate = {
        layoutId: result.layoutId,
        layoutRevision,
        completed,
        elapsedMs,
        score,
        scoringRevision,
        maxCombo,
        autoClears,
        assists: normalizeAssists(result.assists),
        updatedAt: timestamp,
      };
      const day = next.daily[result.dailyKey] || {};
      if (betterDailyResult(candidate, day[result.mode], result.mode)) day[result.mode] = candidate;
      next.daily[result.dailyKey] = day;
    }
    return next;
  }

  function storedRecordEvents(storage) {
    const events = [];
    try {
      if (!storage || !finiteInteger(storage.length)) return events;
      // Snapshot keys before validating. Removing one corrupt event from a
      // live Storage index shifts later entries and would otherwise skip the
      // immediately following valid completion.
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const key of keys) {
        if (typeof key !== 'string' || !key.startsWith(RECORD_EVENT_PREFIX)) continue;
        let wrapper;
        try { wrapper = JSON.parse(safeGet(storage, key)); } catch { wrapper = null; }
        if (!isObject(wrapper) || wrapper.version !== RECORDS_VERSION ||
            !isValidGameId(wrapper.eventId) || !finiteInteger(wrapper.updatedAt) ||
            !isObject(wrapper.result)) {
          safeRemove(storage, key);
          continue;
        }
        const suffix = key.slice(RECORD_EVENT_PREFIX.length).toLowerCase();
        if (!isValidGameId(suffix) || wrapper.eventId.toLowerCase() !== suffix) {
          safeRemove(storage, key);
          continue;
        }
        const layoutRevision = normalizedLayoutRevision(
          wrapper.result.layoutId,
          wrapper.result.layoutRevision
        );
        if (layoutRevision === null) {
          safeRemove(storage, key);
          continue;
        }
        // The enumerated key is authoritative. Never let a corrupt wrapper's
        // own `key` field redirect bounded-event pruning to another local key.
        events.push({
          ...wrapper,
          eventId: suffix,
          key,
          result: { ...wrapper.result, layoutRevision },
        });
      }
    } catch { /* record recovery is best effort */ }
    return events.sort((a, b) => a.updatedAt - b.updatedAt || a.eventId.localeCompare(b.eventId));
  }

  function createRecordStore({ storage = defaultStorage(), now = Date.now, uuid = defaultUuid } = {}) {
    if (typeof now !== 'function') throw new Error('mahjong: now must be a function');

    function readRaw() {
      const raw = safeGet(storage, RECORDS_KEY);
      if (!raw) return emptyRecords();
      try { return normalizeRecords(JSON.parse(raw)); } catch { return emptyRecords(); }
    }

    function write(records) {
      return safeSet(storage, RECORDS_KEY, JSON.stringify(normalizeRecords(records)));
    }

    function migrateLegacy(records = readRaw()) {
      const raw = safeGet(storage, LEGACY_BEST_KEY);
      if (raw === null) return records;
      const bestTimeMs = Number(raw);
      if (!finiteInteger(bestTimeMs, 1)) {
        safeRemove(storage, LEGACY_BEST_KEY);
        return records;
      }
      const migrated = normalizeRecords(records);
      const current = migrated.classic.turtle;
      if (!current || bestTimeMs < current.bestTimeMs) {
        migrated.classic.turtle = {
          layoutRevision: LAYOUT_REVISIONS.turtle,
          bestTimeMs,
          updatedAt: now(),
        };
      }
      // Only retire the legacy key after the v2 record has been written. No
      // other preference is read or rewritten, so `mahjong.sound` survives.
      if (write(migrated)) safeRemove(storage, LEGACY_BEST_KEY);
      return migrated;
    }

    // Best-of records are rebuilt from retained events, so re-applying them
    // on every read is harmless. Counts are not: once an event is pruned it
    // is gone, so `totals` is a durable aggregate. The order below is the
    // contract: count, persist, then prune only what was persisted, then
    // compact the counted list.
    function mergeEvents(records) {
      const events = storedRecordEvents(storage);
      let merged = normalizeRecords(records);
      const counted = new Set(merged.totals.countedEvents);
      for (const event of events) {
        merged = applyResult(merged, event.result, event.updatedAt);
        if (counted.has(event.eventId)) continue;
        const { mode, layoutId } = event.result;
        if (event.result.completed === true && MODES.includes(mode) && LAYOUT_IDS.includes(layoutId)) {
          const bucket = merged.totals.cleared[mode];
          bucket[layoutId] = (bucket[layoutId] || 0) + 1;
        }
        counted.add(event.eventId);
      }
      merged.totals.countedEvents = [...counted];
      // Phase 1: persist counts for every seen event before anything is pruned.
      if (!write(merged)) return merged;
      // Phase 2: prune only counted events beyond the cap, oldest first. An
      // event another tab wrote after our snapshot is never in `counted`.
      const pruned = new Set();
      if (events.length > MAX_RECORD_EVENTS) {
        const excess = events.length - MAX_RECORD_EVENTS;
        for (const event of events.filter((entry) => counted.has(entry.eventId)).slice(0, excess)) {
          // An event that survives a failed removal must stay counted, or
          // the next read would count it a second time.
          if (safeRemove(storage, event.key)) pruned.add(event.eventId);
        }
      }
      // Phase 3: compact to ids still retained. This is the only place the
      // list is bounded (retained events never exceed MAX_RECORD_EVENTS). Best
      // effort: a failed write here only leaves extra ids until a later read.
      const retained = new Set(events.filter((entry) => !pruned.has(entry.eventId)).map((entry) => entry.eventId));
      const compacted = merged.totals.countedEvents.filter((id) => retained.has(id));
      if (compacted.length !== merged.totals.countedEvents.length) {
        merged.totals.countedEvents = compacted;
        write(merged);
      }
      return merged;
    }

    function read() {
      return mergeEvents(migrateLegacy(readRaw()));
    }

    function record(result) {
      const updatedAt = now();
      let eventId;
      let clonedResult;
      try { eventId = mintGameId(uuid); } catch { return null; }
      try { clonedResult = JSON.parse(JSON.stringify(result)); } catch { return null; }
      if (!isObject(clonedResult)) return null;
      const layoutRevision = normalizedLayoutRevision(clonedResult.layoutId, clonedResult.layoutRevision);
      if (layoutRevision === null) return null;
      clonedResult.layoutRevision = layoutRevision;
      const key = `${RECORD_EVENT_PREFIX}${eventId}`;
      if (!safeSet(storage, key, JSON.stringify({
        version: RECORDS_VERSION,
        eventId,
        updatedAt,
        result: clonedResult,
      }))) return null;
      return read();
    }

    return Object.freeze({ read, write, record, migrateLegacy });
  }

  function isDailyKey(value) {
    if (typeof value !== 'string' || !DAILY_KEY_RE.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function dailyKey(input = new Date()) {
    if (typeof input === 'string') {
      if (!isDailyKey(input)) throw new Error('mahjong: invalid daily date');
      return input;
    }
    const date = input instanceof Date ? input : new Date(input);
    if (!Number.isFinite(date.getTime())) throw new Error('mahjong: invalid daily date');
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dailySeed(key) {
    const normalized = dailyKey(key);
    let hash = 0x811c9dc5;
    const source = `blanc-mahjong-v2:${normalized}`;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function dailyLayoutId(key) {
    const normalized = dailyKey(key);
    const [year, month, day] = normalized.split('-').map(Number);
    const epochDay = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
    return LAYOUT_IDS[((epochDay % LAYOUT_IDS.length) + LAYOUT_IDS.length) % LAYOUT_IDS.length];
  }

  function dailyDeal(input = new Date()) {
    const key = dailyKey(input);
    return { dailyKey: key, seed: dailySeed(key), layoutId: dailyLayoutId(key) };
  }

  function instanceClaim({ gameId, instanceId, startedAt }) {
    if (!isValidGameId(gameId) || !isValidGameId(instanceId) || !finiteInteger(startedAt)) {
      throw new Error('mahjong: invalid instance claim');
    }
    return {
      type: 'mahjong:claim',
      gameId: gameId.toLowerCase(),
      instanceId: instanceId.toLowerCase(),
      startedAt,
    };
  }

  function isClaim(value) {
    return isObject(value) && value.type === 'mahjong:claim' && isValidGameId(value.gameId) &&
      isValidGameId(value.instanceId) && finiteInteger(value.startedAt);
  }

  function compareClaims(a, b) {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
    return a.instanceId.localeCompare(b.instanceId);
  }

  function resolveInstanceClaim(self, incoming) {
    if (!isClaim(self) || !isClaim(incoming) || self.gameId !== incoming.gameId || self.instanceId === incoming.instanceId) {
      return { action: 'ignore', response: null };
    }
    if (compareClaims(self, incoming) <= 0) {
      return {
        action: 'keep',
        response: {
          type: 'mahjong:occupied',
          gameId: self.gameId,
          ownerInstanceId: self.instanceId,
          targetInstanceId: incoming.instanceId,
        },
      };
    }
    return { action: 'fork', response: null };
  }

  function isOccupiedFor(message, claim) {
    return isObject(message) && message.type === 'mahjong:occupied' && message.gameId === claim.gameId &&
      message.targetInstanceId === claim.instanceId && isValidGameId(message.ownerInstanceId);
  }

  function createDuplicateGuard({
    channel,
    gameId,
    instanceId,
    startedAt,
    now = Date.now,
    uuid = defaultUuid,
    onFork = () => {},
  } = {}) {
    if (!channel || typeof channel.postMessage !== 'function' || typeof channel.addEventListener !== 'function') {
      throw new Error('mahjong: duplicate guard requires a BroadcastChannel-like object');
    }
    const initialStartedAt = startedAt === undefined ? now() : startedAt;
    const resolvedInstanceId = instanceId === undefined ? mintGameId(uuid) : instanceId;
    let current = instanceClaim({ gameId, instanceId: resolvedInstanceId, startedAt: initialStartedAt });
    let disposed = false;

    function announce() {
      if (!disposed) channel.postMessage({ ...current });
    }

    function fork() {
      const from = current.gameId;
      const to = mintGameId(uuid);
      onFork({ from, to });
      current = instanceClaim({ gameId: to, instanceId: current.instanceId, startedAt: now() });
      announce();
      return to;
    }

    function handle(event) {
      if (disposed) return;
      const message = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
      if (isClaim(message)) {
        const resolution = resolveInstanceClaim(current, message);
        if (resolution.action === 'keep') channel.postMessage(resolution.response);
        else if (resolution.action === 'fork') fork();
      } else if (isOccupiedFor(message, current)) {
        fork();
      }
    }

    channel.addEventListener('message', handle);
    announce();
    return Object.freeze({
      announce,
      dispose() {
        if (disposed) return;
        disposed = true;
        if (typeof channel.removeEventListener === 'function') channel.removeEventListener('message', handle);
      },
      getGameId: () => current.gameId,
      getClaim: () => ({ ...current }),
    });
  }

  const MahjongState = {
    STATE_VERSION,
    RECORDS_VERSION,
    GAME_ID_PARAM,
    GAME_KEY_PREFIX,
    GAME_ACCESS_PREFIX,
    GAME_INDEX_KEY,
    RECORDS_KEY,
    RECORD_EVENT_PREFIX,
    PREFS_KEY,
    LEGACY_BEST_KEY,
    SOUND_KEY,
    MAX_SAVED_GAMES,
    MAX_RECORD_EVENTS,
    GAME_EXPIRY_MS,
    LAYOUT_IDS,
    LAYOUT_REVISIONS,
    MODES,
    TRAY_SCORING_REVISION,
    isValidGameId,
    mintGameId,
    ensureGameId,
    forkGameId,
    gameStorageKey,
    gameAccessKey,
    createGameStore,
    resumeCandidate,
    createPrefsStore,
    completionOutcome,
    describeDailyResult,
    shiftDailyKey,
    dailyStreak,
    recordsSummary,
    emptyRecords,
    emptyTotals,
    normalizeAssists,
    normalizeRecords,
    applyResult,
    createRecordStore,
    isDailyKey,
    dailyKey,
    dailySeed,
    dailyLayoutId,
    dailyDeal,
    instanceClaim,
    resolveInstanceClaim,
    isOccupiedFor,
    createDuplicateGuard,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MahjongState;
  else window.MahjongState = MahjongState;
})();
