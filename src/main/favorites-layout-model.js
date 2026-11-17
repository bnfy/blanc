'use strict';

// The Favorites layout record (F63): the order a person chose inside each
// folder, and the folders that exist with nothing in them. It syncs inside
// the settings payload, where another device's edit to a different folder
// must not be lost, so each folder's entry carries its own clock (the
// device-names.js pattern). Pure: no Electron.

const {
  validPath, pathKey, splitPath, joinPath, parentPath, leafName, isWithin, folderChildKey,
} = require('./favorites-tree');

// The settings blob this rides in is limited to 512 KB.
const LAYOUT_MAX_BYTES = 131072;
// How long a removed folder's marker is kept: the favorites tombstone window.
const GONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TIE = 128;
// settings.js MAX_SYNC_TIMESTAMP: a clock past it would win every merge.
const MAX_CLOCK = Date.UTC(3000, 0, 1);
const MAX_ORDER_KEYS = 20000;
const CHILD_KEY = /^[fu]:.{1,110}$/s;

const EMPTY_LAYOUT = Object.freeze({ version: 1, folders: Object.freeze({}) });

// Folder names are keys here, and a folder may be called "constructor" or
// "__proto__": read entries only as own properties, and build with
// Object.fromEntries or a Map, never by assignment.
const entryAt = (layout, key) => (layout?.folders && Object.hasOwn(layout.folders, key) ? layout.folders[key] : undefined);

/** A folder's entry, or undefined. */
const layoutEntry = (layout, path) => entryAt(layout, pathKey(path));

function normalizeOrder(order) {
  if (!Array.isArray(order)) return null;
  const seen = new Set();
  for (const key of order) {
    if (typeof key === 'string' && CHILD_KEY.test(key)) seen.add(key);
    if (seen.size === MAX_ORDER_KEYS) break;
  }
  return [...seen];
}

function normalizeEntry(key, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const path = key === '' ? null : validPath(raw.path);
  if (key !== '' && (path === null || pathKey(path) !== key)) return null;
  if (!Number.isSafeInteger(raw.at) || raw.at <= 0 || raw.at >= MAX_CLOCK) return null;
  const order = normalizeOrder(raw.order);
  if (!order) return null;
  const tie = typeof raw.tie === 'string' && raw.tie.length <= MAX_TIE ? raw.tie : '';
  const entry = { path, order: raw.gone === true ? [] : order, at: raw.at, tie };
  if (raw.gone === true) entry.gone = true;
  return entry;
}

// Keys in order, so equal layouts serialize alike.
function fromEntries(entries) {
  return { version: 1, folders: Object.fromEntries(entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) };
}

/** A stored or received record with everything unreadable dropped. */
function normalizeLayout(value) {
  const folders = value && typeof value === 'object' && !Array.isArray(value) ? value.folders : null;
  if (!folders || typeof folders !== 'object' || Array.isArray(folders)) return fromEntries([]);
  const entries = [];
  for (const [key, raw] of Object.entries(folders)) {
    const entry = normalizeEntry(key, raw);
    if (entry) entries.push([key, entry]);
  }
  return fromEntries(entries);
}

/** Write one folder's entry. Its clock always passes the entry it replaces,
 * so a local edit is never older than what it edited. */
function writeEntry(layout, path, fields, { at, tie = '' }) {
  const current = normalizeLayout(layout);
  const stored = path === null || path === undefined ? null : validPath(path);
  if (path !== null && path !== undefined && stored === null) return current;
  const key = pathKey(stored);
  const previous = entryAt(current, key);
  const candidate = normalizeEntry(key, {
    path: stored,
    order: [],
    ...fields,
    at: Math.max(at, (previous?.at ?? 0) + 1),
    tie,
  });
  if (!candidate) return current;
  return fromEntries([...Object.entries(current.folders).filter(([k]) => k !== key), [key, candidate]]);
}

function setFolderOrder(layout, path, order, clock) {
  return writeEntry(layout, path, { order }, clock);
}

/** Make sure a folder exists on its own, so it stays when it holds nothing. */
function ensureFolder(layout, path, clock) {
  const entry = layoutEntry(layout, path);
  if (entry && !entry.gone) return layout;
  return writeEntry(layout, path, { order: [] }, clock);
}

/** Mark a folder removed. The marker outlives the folder so a device that
 * still lists it empty doesn't bring it back. */
function removeFolderEntry(layout, path, clock) {
  return writeEntry(layout, path, { order: [], gone: true }, clock);
}

/** A folder renamed or moved: its entry and every descendant's follow it, and
 * the parents' order lists follow too. An entry whose new path would be too
 * long is dropped; its folder then shows in the default order. */
function movePrefix(layout, fromPath, toPath, clock) {
  let next = normalizeLayout(layout);
  const from = validPath(fromPath);
  const to = validPath(toPath);
  if (!from || !to || pathKey(from) === pathKey(to)) return next;
  const depth = splitPath(from).length;

  for (const [key, entry] of Object.entries(next.folders)) {
    if (key === '' || !isWithin(entry.path, from)) continue;
    next = removeFolderEntry(next, entry.path, clock);
    if (entry.gone) continue;
    const moved = joinPath([...splitPath(to), ...splitPath(entry.path).slice(depth)]);
    const target = layoutEntry(next, moved);
    if (target && !target.gone && target.at > entry.at) continue;
    next = writeEntry(next, moved, { order: entry.order }, clock);
  }

  const oldParent = layoutEntry(next, parentPath(from));
  const oldKey = folderChildKey(leafName(from));
  if (oldParent && !oldParent.gone && oldParent.order.includes(oldKey)) {
    const sameParent = pathKey(parentPath(from)) === pathKey(parentPath(to));
    const order = sameParent
      ? oldParent.order.map((key) => (key === oldKey ? folderChildKey(leafName(to)) : key))
      : oldParent.order.filter((key) => key !== oldKey);
    next = writeEntry(next, oldParent.path, { order }, clock);
  }
  return next;
}

// Larger clock, then smaller tie, then smaller serialization: the same
// answer whichever side merges.
function newer(a, b) {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  if (a.tie !== b.tie) return a.tie < b.tie ? a : b;
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

function mergeLayouts(local, remote, { now }) {
  const merged = new Map(Object.entries(normalizeLayout(local).folders));
  for (const [key, entry] of Object.entries(normalizeLayout(remote).folders)) {
    merged.set(key, merged.has(key) ? newer(merged.get(key), entry) : entry);
  }
  return fromEntries([...merged]
    .filter(([, entry]) => !(entry.gone && now - entry.at > GONE_TTL_MS)));
}

/** Keep the record inside its size limit. Order lists are emptied first: the
 * ones changed longest ago, and the longest among equally old ones (one
 * import); those folders show in the default order. A record still too large
 * (thousands of empty folders, or one received from sync) then loses removal
 * markers, and last the oldest empty folders. `dropped` counts emptied lists. */
function boundLayout(layout, maxBytes = LAYOUT_MAX_BYTES) {
  const size = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size(layout) <= maxBytes) return { layout, dropped: 0 };
  const folders = new Map(Object.entries(normalizeLayout(layout).folders));
  const current = () => fromEntries([...folders]);
  const oldestFirst = (a, b) => a[1].at - b[1].at || b[1].order.length - a[1].order.length || (a[0] < b[0] ? -1 : 1);
  let dropped = 0;
  for (const [key, entry] of [...folders].filter(([, e]) => e.order.length).sort(oldestFirst)) {
    if (size(current()) <= maxBytes) break;
    folders.set(key, { ...entry, order: [] });
    dropped += 1;
  }
  // Entries are all nearly the same size here, so remove in batches rather
  // than re-measuring after each one.
  const removable = [
    ...[...folders].filter(([, e]) => e.gone).sort(oldestFirst),
    ...[...folders].filter(([key, e]) => !e.gone && key !== '').sort(oldestFirst),
  ];
  while (removable.length && size(current()) > maxBytes) {
    for (const [key] of removable.splice(0, 64)) folders.delete(key);
  }
  return { layout: current(), dropped };
}

function layoutsEqual(a, b) {
  return JSON.stringify(normalizeLayout(a)) === JSON.stringify(normalizeLayout(b));
}

// --- In the settings sync payload -------------------------------------

const SYNC_KEY = 'favoritesLayout';
// How often a device puts the record back when the remote copy lacks it.
const RESTORE_INTERVAL_MS = 10 * 60 * 1000;

/** The settings payload plus the record, when it has ever changed
 * (`exported` is favorites-layout.exportForSync()). */
function withFavoritesLayout(payload, exported) {
  if (!exported) return payload;
  const out = {
    values: { ...payload.values, [SYNC_KEY]: exported.value },
    meta: { ...payload.meta, [SYNC_KEY]: exported.at },
    tieBreakers: { ...payload.tieBreakers },
  };
  if (exported.tie) out.tieBreakers[SYNC_KEY] = exported.tie;
  return out;
}

function withoutLayout(payload) {
  const strip = (part) => {
    const { [SYNC_KEY]: _dropped, ...rest } = part ?? {};
    return rest;
  };
  return { values: strip(payload.values), meta: strip(payload.meta), tieBreakers: strip(payload.tieBreakers) };
}

/** Whether the remote settings blob already says everything this device
 * would upload. A Blanc that predates the record drops it on every upload,
 * and would trade uploads with this device for as long as both are open; so
 * when the record being absent is the only difference, it is put back at
 * most once per RESTORE_INTERVAL_MS. This device keeps its own copy
 * meanwhile. `baseEquals` is settings.syncPayloadEquals. */
function settingsEqualsWithLayout(exported, remote, { baseEquals, lastRestoreAt, now }) {
  if (baseEquals(exported, remote)) return { equal: true, restoring: false };
  const has = (payload) => payload?.meta?.[SYNC_KEY] !== undefined && payload?.values?.[SYNC_KEY] !== undefined;
  if (!has(exported) || has(remote) || !baseEquals(withoutLayout(exported), remote)) {
    return { equal: false, restoring: false };
  }
  const due = now - lastRestoreAt >= RESTORE_INTERVAL_MS;
  return { equal: !due, restoring: due };
}

module.exports = {
  RESTORE_INTERVAL_MS, withFavoritesLayout, settingsEqualsWithLayout,
  LAYOUT_MAX_BYTES, GONE_TTL_MS, EMPTY_LAYOUT,
  normalizeLayout, layoutEntry, setFolderOrder, ensureFolder, removeFolderEntry, movePrefix,
  mergeLayouts, boundLayout, layoutsEqual,
};
