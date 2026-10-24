// Pure Send to device logic (M7b addendum,
// docs/superpowers/specs/2026-10-24-ios-m7b-send-to-device-design.md):
// sanitizing, own-entry presence, adding an item, merging, budget, inbox and
// targets. No electron and no ./store import, so all of this runs under
// node --test and the iOS port is checked against vectors generated from it.

const { canonical, winner } = require('./tabsync-model');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 20;                 // per sender, newest kept (§3)
const ITEM_TTL_MS = 7 * DAY_MS;       // an item expires 7 days after sentAt
const ENTRY_TTL_MS = 30 * DAY_MS;     // other devices' entries age out
const HEARTBEAT_MS = DAY_MS;          // presence refresh at most once a day
const DISMISS_TTL_MS = 8 * DAY_MS;    // outlives every item it could hide
const BUDGET_BYTES = 64 * 1024;       // canonical UTF-8 bytes, far below 512 KiB
const MAX_URL = 2048;
const MAX_TITLE = 200;
const MAX_NAME = 80;
const MAX_ID = 64;
const PLATFORMS = new Set(['darwin', 'win32', 'linux', 'ios']);

const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;
const expired = (item, now) => now - item.sentAt >= ITEM_TTL_MS;

function httpUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** A remote or local item, or null. Titles truncate in UTF-16 units, as
 * tab sync's sanitizeTab does; a URL over the limit is refused, not cut. */
function sanitizeItem(raw, now) {
  if (!raw || !isId(raw.id) || !isId(raw.to)) return null;
  const url = httpUrl(raw.url);
  if (!url || !Number.isFinite(raw.sentAt) || raw.sentAt <= 0) return null;
  const item = {
    id: raw.id,
    to: raw.to,
    url,
    title: typeof raw.title === 'string' ? raw.title.slice(0, MAX_TITLE) : '',
    sentAt: raw.sentAt,
  };
  return expired(item, now) ? null : item;
}

/** Newest first by sentAt, ties by id, one item per id, at most MAX_ITEMS. */
function normalizeItems(items, now) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((raw) => sanitizeItem(raw, now))
    .filter(Boolean)
    .sort((a, b) => b.sentAt - a.sentAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)))
    .slice(0, MAX_ITEMS);
}

function sanitizeEntry(raw, now) {
  if (!raw || !Number.isFinite(raw.updatedAt) || raw.updatedAt <= 0) return null;
  return {
    name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, MAX_NAME) : 'unknown device',
    platform: PLATFORMS.has(raw.platform) ? raw.platform : '',
    updatedAt: raw.updatedAt,
    items: normalizeItems(raw.items, now),
  };
}

/** This device's entry, rebuilt before every write. The clock moves only
 * when forced (a send), when the name or platform changed, or when the daily
 * presence heartbeat is due; expired items drop either way. */
function ownEntry(previous, { name, platform }, now, { force = false } = {}) {
  const prev = previous ? sanitizeEntry(previous, now) : null;
  const next = {
    name: String(name ?? '').slice(0, MAX_NAME) || 'unknown device',
    platform: PLATFORMS.has(platform) ? platform : '',
    updatedAt: now,
    items: prev ? prev.items : [],
  };
  const due = force || !prev || prev.name !== next.name || prev.platform !== next.platform ||
    now - prev.updatedAt >= HEARTBEAT_MS;
  const entry = due ? next : { ...next, updatedAt: prev.updatedAt };
  return { entry, changed: canonical(entry) !== canonical(previous ?? null) };
}

/** Add one item to our own entry (always bumps the clock). */
function addItem(entry, { url, title, to }, ownId, now, makeId) {
  if (to === ownId) return { error: 'self' };
  const item = sanitizeItem({ id: makeId(), to, url, title, sentAt: now }, now);
  if (!item) return { error: 'invalid' };
  const base = entry ? sanitizeEntry(entry, now) : null;
  const items = normalizeItems([item, ...(base ? base.items : [])], now);
  return { entry: { ...(base ?? { name: 'unknown device', platform: '' }), updatedAt: now, items }, item };
}

/** Union by device id, last writer wins per entry with tab sync's tie rule
 * (own entry wins on this device, then the smaller canonical form). Other
 * devices' entries older than ENTRY_TTL_MS are pruned; our own never is. */
function mergeDevices(local, remote, ownId, now) {
  const out = {};
  for (const [id, raw] of Object.entries(local ?? {})) {
    const entry = sanitizeEntry(raw, now);
    if (entry) out[id] = entry;
  }
  for (const [id, raw] of Object.entries(remote ?? {})) {
    const entry = sanitizeEntry(raw, now);
    if (!entry) continue;
    out[id] = out[id] ? winner(out[id], entry, id === ownId) : entry;
  }
  for (const [id, entry] of Object.entries(out)) {
    if (id !== ownId && now - entry.updatedAt >= ENTRY_TTL_MS) delete out[id];
  }
  return out;
}

/** Keep the whole store under BUDGET_BYTES by dropping the stalest other
 * entries first, never our own. Input is not mutated. */
function applyBudget(devices, ownId, { maxBytes = BUDGET_BYTES } = {}) {
  const out = { ...devices };
  const over = () => Buffer.byteLength(canonical(out), 'utf8') > maxBytes;
  const others = Object.entries(out)
    .filter(([id]) => id !== ownId)
    .sort(([ia, a], [ib, b]) => a.updatedAt - b.updatedAt || (ia < ib ? -1 : ia > ib ? 1 : 0));
  for (const [id] of others) {
    if (!over()) break;
    delete out[id];
  }
  return out;
}

/** Items waiting for this device: unexpired, addressed here, not opened or
 * dismissed, newest first, at most MAX_ITEMS. */
function inbox(devices, ownId, dismissed, now) {
  const hidden = dismissed ?? {};
  const rows = [];
  for (const [fromId, raw] of Object.entries(devices ?? {})) {
    if (fromId === ownId) continue;
    const entry = sanitizeEntry(raw, now);
    if (!entry) continue;
    for (const item of entry.items) {
      if (item.to !== ownId || Object.hasOwn(hidden, item.id)) continue;
      rows.push({ id: item.id, url: item.url, title: item.title, sentAt: item.sentAt, fromId, fromName: entry.name });
    }
  }
  return rows
    .sort((a, b) => b.sentAt - a.sentAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_ITEMS);
}

/** Every other device found in the sends store (presence) or the tab-sync
 * store, newest first, named by the account's synced device names. */
function targets(sendsDevices, sessionDevices, ownId, deviceNames) {
  const found = new Map();
  const consider = (id, entry) => {
    if (id === ownId || !entry || entry.retracted || !Number.isFinite(entry.updatedAt)) return;
    const prev = found.get(id);
    if (prev && prev.updatedAt >= entry.updatedAt) return;
    found.set(id, {
      id,
      name: typeof entry.name === 'string' && entry.name ? entry.name.slice(0, MAX_NAME) : 'unknown device',
      platform: typeof entry.platform === 'string' ? entry.platform : '',
      updatedAt: entry.updatedAt,
    });
  };
  for (const [id, entry] of Object.entries(sessionDevices ?? {})) consider(id, entry);
  for (const [id, entry] of Object.entries(sendsDevices ?? {})) consider(id, entry);
  return [...found.values()]
    .map((t) => {
      const chosen = deviceNames?.[t.id]?.name;
      return typeof chosen === 'string' && chosen ? { ...t, name: chosen.slice(0, MAX_NAME) } : t;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `{id: dismissedAt}`, older than DISMISS_TTL_MS dropped. */
function pruneDismissed(dismissed, now) {
  const out = {};
  for (const [id, at] of Object.entries(dismissed ?? {})) {
    if (isId(id) && Number.isFinite(at) && now - at < DISMISS_TTL_MS) out[id] = at;
  }
  return out;
}

module.exports = {
  MAX_ITEMS, ITEM_TTL_MS, ENTRY_TTL_MS, HEARTBEAT_MS, DISMISS_TTL_MS,
  BUDGET_BYTES, MAX_URL, MAX_TITLE, MAX_NAME,
  sanitizeItem, sanitizeEntry, ownEntry, addItem,
  mergeDevices, applyBudget, inbox, targets, pruneDismissed,
};
