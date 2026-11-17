'use strict';

// Favorites folder paths and the tree drawn from them (F63, spec
// docs/superpowers/specs/2026-11-16-favorites-manager-design.md). A favorite's
// `folder` string holds a whole path, its segments joined by SEP, so clients
// that know only flat folders keep it intact. Pure: no Electron.

const crypto = require('node:crypto');

const SEP = ' › ';
// The limit every client enforces on a `folder` string, in UTF-16 code units.
const MAX_PATH = 100;

/** One folder name as stored: trimmed, 1–100 characters, never holding the
 * separator's character. Anything else is null. */
function cleanSegment(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name.replaceAll('›', '>').trim();
  return cleaned.length >= 1 && cleaned.length <= MAX_PATH ? cleaned : null;
}

function splitPath(path) {
  if (typeof path !== 'string' || !path.trim()) return [];
  return path.split(SEP).map((segment) => segment.trim());
}

function joinPath(segments) {
  return segments.length ? segments.join(SEP) : null;
}

/** A storable path, or null. null from a non-null input means "refuse",
 * never "top level" (the rule validFolder has for flat names). */
function validPath(path) {
  const segments = splitPath(path);
  if (!segments.length) return null;
  const cleaned = segments.map(cleanSegment);
  if (cleaned.includes(null)) return null;
  const joined = joinPath(cleaned);
  return joined.length <= MAX_PATH ? joined : null;
}

/** Folder identity: the path without regard to case. '' is the top level. */
function pathKey(path) {
  return splitPath(path).map((segment) => segment.toLowerCase()).join(SEP);
}

function parentPath(path) {
  return joinPath(splitPath(path).slice(0, -1));
}

function leafName(path) {
  return splitPath(path).at(-1) ?? '';
}

/** Whether `path` is `ancestor` itself or a folder inside it. */
function isWithin(path, ancestor) {
  const key = pathKey(path);
  const base = pathKey(ancestor);
  return base === '' || key === base || key.startsWith(base + SEP);
}

/** The deepest folder of a source's nesting that fits the path limit.
 * Unusable names are skipped. */
function fitSegments(segments) {
  const cleaned = (Array.isArray(segments) ? segments : []).map(cleanSegment).filter(Boolean);
  const kept = [...cleaned];
  while (kept.length && joinPath(kept).length > MAX_PATH) kept.pop();
  return { path: joinPath(kept), shortened: kept.length < cleaned.length };
}

/** A path as typed in a command: names separated by > or ›. */
function parseTypedPath(input) {
  if (typeof input !== 'string') return null;
  return validPath(input.split(/[>›]/).map((segment) => segment.trim()).join(SEP));
}

const folderChildKey = (name) => `f:${String(name).trim().toLowerCase()}`;

/** A favorite's place in an order list. Sync merges favorites by address and
 * ids differ between devices, so the address is the identity. */
function favoriteChildKey(url) {
  return `u:${crypto.createHash('sha256').update(String(url)).digest().subarray(0, 6).toString('base64url')}`;
}

/** A stored folder string read as a path: each name cleaned, unusable names
 * skipped. Names saved before paths existed may hold a bare › or an empty
 * segment; reading every stored string this one way keeps them editable. */
function storedPath(folder) {
  return joinPath(splitPath(folder).map(cleanSegment).filter(Boolean));
}

const itemSegments = (item) => splitPath(storedPath(item?.folder));

/** For every folder key in use, its name as spelled by the oldest favorite
 * at or under it (ties: the smaller id), the rule buildCanonMap has. Stored
 * strings are never rewritten to match. */
function spellings(items) {
  const best = new Map(); // folder key -> { name, addedAt, id }
  for (const item of items ?? []) {
    const segments = itemSegments(item);
    const addedAt = item.addedAt ?? 0;
    const id = item.id ?? '';
    const keyParts = [];
    for (const segment of segments) {
      keyParts.push(segment.toLowerCase());
      const key = keyParts.join(SEP);
      const current = best.get(key);
      if (!current || addedAt < current.addedAt || (addedAt === current.addedAt && id < current.id)) {
        best.set(key, { name: segment, addedAt, id });
      }
    }
  }
  return best;
}

/** A speller for many paths in a row (an import): each call returns the path
 * as the tree shows it, and a folder first seen in a call keeps the spelling
 * that call gave it. */
function createSpeller(items) {
  const known = new Map([...spellings(items)].map(([key, { name }]) => [key, name]));
  return (path) => {
    const keyParts = [];
    return joinPath(splitPath(path).map((segment) => {
      keyParts.push(segment.toLowerCase());
      const key = keyParts.join(SEP);
      if (!known.has(key)) known.set(key, segment);
      return known.get(key);
    }));
  };
}

/** `path` spelled the way the tree shows it; folders nobody uses yet keep
 * the spelling given. */
function shownPath(items, path) {
  const known = spellings(items);
  const keyParts = [];
  return joinPath(splitPath(path).map((segment) => {
    keyParts.push(segment.toLowerCase());
    return known.get(keyParts.join(SEP))?.name ?? segment;
  }));
}

const liveEntries = (layout) => Object.entries(layout?.folders ?? {})
  .filter(([, entry]) => entry && typeof entry === 'object');

const byName = (a, b) => a.folder.name.localeCompare(b.folder.name, undefined, { sensitivity: 'base' })
  || (a.folder.key < b.folder.key ? -1 : 1);
const newestFirst = (a, b) => (b.item.addedAt ?? 0) - (a.item.addedAt ?? 0);

/** The folder tree in display order. Children a folder's order list doesn't
 * name come first (sub-folders A–Z, then favorites newest first), so a
 * profile that never reordered anything reads as it always did; named
 * children follow in list order. */
function buildTree(items, layout) {
  const known = spellings(items);
  const root = { path: null, name: '', key: '', children: [] };
  const nodes = new Map([['', root]]);

  const ensure = (segments) => {
    let node = root;
    const keyParts = [];
    const shown = [];
    for (const segment of segments) {
      keyParts.push(segment.toLowerCase());
      const key = keyParts.join(SEP);
      shown.push(known.get(key)?.name ?? segment);
      let child = nodes.get(key);
      if (!child) {
        child = { path: joinPath(shown), name: shown.at(-1), key, children: [] };
        nodes.set(key, child);
        node.children.push({ kind: 'folder', folder: child });
      }
      node = child;
    }
    return node;
  };

  for (const item of items ?? []) ensure(itemSegments(item)).children.push({ kind: 'favorite', item });
  for (const [key, entry] of liveEntries(layout)) {
    if (entry.gone || key === '') continue;
    const segments = splitPath(entry.path).map(cleanSegment);
    if (segments.length && !segments.includes(null)) ensure(segments);
  }

  const orders = new Map(liveEntries(layout)
    .filter(([, entry]) => !entry.gone && Array.isArray(entry.order))
    .map(([key, entry]) => [key, entry.order]));
  for (const node of nodes.values()) {
    const keyed = new Map(node.children.map((child) => [
      child.kind === 'folder' ? folderChildKey(child.folder.name) : favoriteChildKey(child.item.url),
      child,
    ]));
    const listed = new Set();
    for (const key of orders.get(node.key) ?? []) {
      const child = keyed.get(key);
      if (child) listed.add(child);
    }
    const unlisted = node.children.filter((child) => !listed.has(child));
    node.children = [
      ...unlisted.filter((child) => child.kind === 'folder').sort(byName),
      ...unlisted.filter((child) => child.kind === 'favorite').sort(newestFirst),
      ...listed,
    ];
  }
  return root;
}

/** Every folder's path, parents before their children. */
function listFolderPaths(tree) {
  const paths = [];
  const walk = (node) => {
    for (const child of node.children) {
      if (child.kind !== 'folder') continue;
      paths.push(child.folder.path);
      walk(child.folder);
    }
  };
  walk(tree);
  return paths;
}

module.exports = {
  SEP, MAX_PATH,
  cleanSegment, splitPath, joinPath, validPath, pathKey, parentPath, leafName, isWithin,
  fitSegments, parseTypedPath, folderChildKey, favoriteChildKey,
  storedPath, buildTree, shownPath, createSpeller, listFolderPaths,
};
