// Start Page pins: the few pages a person keeps at the front of every Start
// Page layout, whether pinned from a Start Page tile, the Favorites page or a
// tab's right-click menu. One per local profile, like bookmarks.json, and
// device-local: never synced, never sent to telemetry, and kept when history
// is cleared, the way Favorites are. Private tabs never pin.
// See docs/superpowers/specs/2026-10-21-start-page-pinning-design.md.

const { JsonStore } = require('./store');

// Shelf, the roomiest layout, shows eight tiles; nothing would draw a ninth.
const MAX_PINS = 8;
const MAX_URL_LENGTH = 4096;
const MAX_TITLE_LENGTH = 200;

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'start-page-pins', { version: 1, pins: [] }, { scope: 'profile' }
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

const pinsOf = () => sanitizePins(ensureStore().data.pins);

function listPins() {
  return pinsOf().map((pin) => ({ ...pin }));
}

function isPinned(url) {
  const pin = sanitizePin({ url });
  return !!pin && pinsOf().some((existing) => existing.url === pin.url);
}

function isFull() {
  return pinsOf().length >= MAX_PINS;
}

/** Pin a page last. Pinning a page that is already pinned changes nothing.
 * Returns { ok, reason? } with reason 'invalid' or 'full'. */
function pin(value) {
  const next = sanitizePin(value);
  if (!next) return { ok: false, reason: 'invalid' };
  const pins = pinsOf();
  if (pins.some((existing) => existing.url === next.url)) return { ok: true };
  if (pins.length >= MAX_PINS) return { ok: false, reason: 'full' };
  ensureStore().update((d) => {
    d.version = 1;
    d.pins = [...pins, next];
  });
  notifyChanged();
  return { ok: true };
}

function unpin(url) {
  const target = sanitizePin({ url });
  if (!target) return false;
  const pins = pinsOf();
  if (!pins.some((existing) => existing.url === target.url)) return false;
  ensureStore().update((d) => {
    d.version = 1;
    d.pins = pins.filter((existing) => existing.url !== target.url);
  });
  notifyChanged();
  return true;
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
};
