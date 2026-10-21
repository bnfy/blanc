// Start Page pins: the few pages a person keeps at the front of every Start
// Page layout, whether pinned from a Start Page tile, the Favorites page or a
// tab's right-click menu. One per local profile, like bookmarks.json, never
// sent to telemetry, and kept when history is cleared, the way Favorites are.
// Private tabs never pin. Profile Sync carries the Personal profile's list
// inside the settings payload (sync.js), as one value with one clock: the
// newest change wins, the way a synced setting does.
// See docs/superpowers/specs/2026-10-21-start-page-pinning-design.md.

const crypto = require('node:crypto');
const { JsonStore } = require('./store');
const { syncClock } = require('./settings');

// Shelf, the roomiest layout, shows eight tiles; nothing would draw a ninth.
const MAX_PINS = 8;
const MAX_URL_LENGTH = 4096;
const MAX_TITLE_LENGTH = 200;

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'start-page-pins', { version: 1, pins: [], clock: 0, tie: '' }, { scope: 'profile' }
));

const listeners = new Set();
const onChanged = (fn) => listeners.add(fn);
const notifyChanged = () => { for (const fn of listeners) fn(); };

/** A pin as stored: an http(s) page and the name to show for it. Anything
 * else (another scheme, an oversized value, a non-string) is refused. */
function sanitizePin(value) {
  if (!value || typeof value.url !== 'string' || value.url.length > MAX_URL_LENGTH) return null;
  let parsed;
  try {
    parsed = new URL(value.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const url = parsed.href;
  if (url.length > MAX_URL_LENGTH) return null;
  const title = (typeof value.title === 'string' ? value.title.trim() : '').slice(0, MAX_TITLE_LENGTH);
  return { url, title: title || parsed.hostname.replace(/^www\./, '') };
}

/** Saved pins, re-sanitized: repeats and anything past the cap are dropped. */
function sanitizePins(saved) {
  const pins = [];
  for (const entry of Array.isArray(saved) ? saved : []) {
    const pin = sanitizePin(entry);
    if (!pin || pins.some((existing) => existing.url === pin.url)) continue;
    pins.push(pin);
    if (pins.length === MAX_PINS) break;
  }
  return pins;
}

// Each profile's saved list is sanitized once, when first read; every write
// and merge stores an already-sanitized list.
const sanitized = new WeakSet();
function pinsOf() {
  const d = ensureStore().data;
  if (!sanitized.has(d)) {
    d.pins = sanitizePins(d.pins);
    sanitized.add(d);
  }
  return d.pins;
}

function listPins() {
  return pinsOf().map((pin) => ({ ...pin }));
}

/** Whether a page is pinned and whether a new pin would fit, in one read
 * (the tab menu asks both on every right-click). */
function pinState(url) {
  const pins = pinsOf();
  const target = sanitizePin({ url });
  return {
    pinned: !!target && pins.some((existing) => existing.url === target.url),
    full: pins.length >= MAX_PINS,
  };
}

function isPinned(url) {
  return pinState(url).pinned;
}

function isFull() {
  return pinState('').full;
}

/** Pin a page first, so it shows on every layout, however few tiles it has.
 * Pinning a page that is already pinned changes nothing. Returns
 * { ok, reason? } with reason 'invalid' or 'full'. */
function pin(value) {
  const next = sanitizePin(value);
  if (!next) return { ok: false, reason: 'invalid' };
  const pins = pinsOf();
  if (pins.some((existing) => existing.url === next.url)) return { ok: true };
  if (pins.length >= MAX_PINS) return { ok: false, reason: 'full' };
  write([next, ...pins]);
  return { ok: true };
}

function unpin(url) {
  const target = sanitizePin({ url });
  if (!target) return false;
  const pins = pinsOf();
  if (!pins.some((existing) => existing.url === target.url)) return false;
  write(pins.filter((existing) => existing.url !== target.url));
  return true;
}

/** A local change: stamp a clock past any seen, so it wins its next sync. */
function write(pins) {
  ensureStore().update((d) => {
    d.version = 1;
    d.pins = pins;
    d.clock = syncClock.nextSyncWriteTimestamp(d.clock);
    d.tie = crypto.randomUUID();
  });
  notifyChanged();
}

/** What Sync sends: the list with its clock, or null before the first change
 * (an unstamped list tells peers nothing, like an unstamped setting). */
function exportForSync() {
  const d = ensureStore().data;
  if (!syncClock.validSyncTimestamp(d.clock) || d.clock === 0) return null;
  return { value: pinsOf(), at: d.clock, tie: syncClock.normalizeSyncTieBreaker(d.tie) };
}

/** Adopt a peer's list when its clock beats ours. The value is re-sanitized;
 * a newer value this version can't read still advances the clock, so it
 * can't re-win every pass. */
function mergeFromSync(remote) {
  if (!remote || !syncClock.validSyncTimestamp(remote.at) || remote.at === 0) return false;
  const d = ensureStore().data;
  const localAt = syncClock.validSyncTimestamp(d.clock) ? d.clock : 0;
  const remoteTie = syncClock.normalizeSyncTieBreaker(remote.tie);
  const localTie = syncClock.normalizeSyncTieBreaker(d.tie);
  const incoming = sanitizePins(remote.value);
  const current = pinsOf();
  const wins = remote.at > localAt || (remote.at === localAt
    && syncClock.remoteWinsSyncTie(remoteTie, localTie, incoming, current));
  if (!wins) return false;
  const readable = Array.isArray(remote.value);
  const changed = readable && JSON.stringify(incoming) !== JSON.stringify(current);
  ensureStore().update((data) => {
    data.version = 1;
    if (readable) data.pins = incoming;
    data.clock = remote.at;
    data.tie = remoteTie;
  });
  if (changed) notifyChanged();
  return changed;
}

function flushPins() {
  ensureStore().flush();
}

module.exports = {
  MAX_PINS,
  sanitizePin,
  sanitizePins,
  listPins,
  isPinned,
  isFull,
  pin,
  unpin,
  flushPins,
  onChanged,
  pinState,
  exportForSync,
  mergeFromSync,
};
