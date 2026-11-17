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
  const previous = current.folders[key];
  const candidate = normalizeEntry(key, {
    path: stored,
    order: [],
    ...fields,
    at: Math.max(at, (previous?.at ?? 0) + 1),
    tie,
  });
  if (!candidate) return current;
  return fromEntries(Object.entries({ ...current.folders, [key]: candidate }));
}

function setFolderOrder(layout, path, order, clock) {
  return writeEntry(layout, path, { order }, clock);
}

/** Make sure a folder exists on its own, so it stays when it holds nothing. */
function ensureFolder(layout, path, clock) {
  const entry = layout?.folders?.[pathKey(path)];
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
    const target = next.folders[pathKey(moved)];
    if (target && !target.gone && target.at > entry.at) continue;
    next = writeEntry(next, moved, { order: entry.order }, clock);
  }

  const oldParent = next.folders[pathKey(parentPath(from))];
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
  const merged = { ...normalizeLayout(local).folders };
  for (const [key, entry] of Object.entries(normalizeLayout(remote).folders)) {
    merged[key] = Object.hasOwn(merged, key) ? newer(merged[key], entry) : entry;
  }
  return fromEntries(Object.entries(merged)
    .filter(([, entry]) => !(entry.gone && now - entry.at > GONE_TTL_MS)));
}

/** Keep the record inside its size limit by emptying order lists: the ones
 * changed longest ago first, and the longest first among equally old ones
 * (one import). Entries stay, so no folder disappears. */
function boundLayout(layout, maxBytes = LAYOUT_MAX_BYTES) {
  const size = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size(layout) <= maxBytes) return { layout, dropped: 0 };
  const folders = { ...normalizeLayout(layout).folders };
  const candidates = Object.entries(folders)
    .filter(([, entry]) => entry.order.length)
    .sort((a, b) => a[1].at - b[1].at || b[1].order.length - a[1].order.length || (a[0] < b[0] ? -1 : 1));
  let dropped = 0;
  for (const [key, entry] of candidates) {
    if (size({ version: 1, folders }) <= maxBytes) break;
    folders[key] = { ...entry, order: [] };
    dropped += 1;
  }
  return { layout: fromEntries(Object.entries(folders)), dropped };
}

function layoutsEqual(a, b) {
  return JSON.stringify(normalizeLayout(a)) === JSON.stringify(normalizeLayout(b));
}

module.exports = {
  LAYOUT_MAX_BYTES, GONE_TTL_MS, EMPTY_LAYOUT,
  normalizeLayout, setFolderOrder, ensureFolder, removeFolderEntry, movePrefix,
  mergeLayouts, boundLayout, layoutsEqual,
};
