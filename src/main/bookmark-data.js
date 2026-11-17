// Pure, non-mutating transforms over a { items, tombstones } snapshot. Each
// returns new arrays and a `changed` flag; bookmarks.js writes only when
// changed. All folder identity/canonicalization rules live here.
const { validFavicon, validFolder, folderKey } = require('./bookmark-validate');
const {
  MAX_PATH, cleanSegment, splitPath, joinPath, validPath, pathKey, parentPath, leafName, isWithin, shownPath, storedPath,
  createSpeller, buildTree, folderChildKey, favoriteChildKey,
} = require('./favorites-tree');
const {
  EMPTY_LAYOUT, LAYOUT_MAX_BYTES, layoutEntry, setFolderOrder, setFolderOrders, boundLayout, ensureFolder, removeFolderEntry, movePrefix, layoutsEqual,
} = require('./favorites-layout-model');

/** Map folderKey -> canonical spelling, chosen from the item with the oldest
 * addedAt (tie: smallest id) — fully deterministic so independent devices
 * converge on the same spelling. Ungrouped items are ignored. */
function buildCanonMap(items) {
  const map = new Map(); // key -> { folder, addedAt, id }
  for (const it of items) {
    if (it.folder == null) continue;
    const key = folderKey(it.folder);
    const cur = map.get(key);
    const addedAt = Number.isFinite(it.addedAt) ? it.addedAt : 0;
    const id = String(it.id ?? '');
    if (!cur || addedAt < cur.addedAt || (addedAt === cur.addedAt && id < cur.id)) {
      map.set(key, { folder: it.folder, addedAt, id });
    }
  }
  return map;
}

const oldestFirst = (a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0);

// --- Folders as paths (F63) ---------------------------------------------
// Each operation takes { items, tombstones, layout } and returns the same
// three plus `changed`, and `error` when it refused. A refused operation
// changes nothing. Callers that predate the layout record may leave it out.

const layoutOf = (state) => state.layout ?? EMPTY_LAYOUT;
const clockOf = ({ now, tie = '' }) => ({ at: now, tie });
const unchanged = (state, extra = {}) => ({
  items: state.items, tombstones: state.tombstones ?? [], layout: layoutOf(state), changed: false, ...extra,
});

// A favorite's folder read as a path (favorites-tree.storedPath).
const folderOf = (it) => storedPath(it.folder);

/** A folder exists while a favorite sits in or under it, or the layout
 * record lists it (an empty folder). */
function folderExists(items, layout, path) {
  if (pathKey(path) === '') return true;
  return items.some((it) => folderOf(it) !== null && isWithin(folderOf(it), path))
    || Object.values(layout.folders).some((entry) => !entry.gone && entry.path !== null && isWithin(entry.path, path));
}

/** A folder never disappears as a side effect: when favorites leaving (moved
 * or removed) empty a folder, it gets its own layout entry. Renaming, moving
 * and deleting a folder empty its old path on purpose and don't call this. */
function keepEmptiedFolders(beforeItems, afterItems, layout, ctx) {
  if (ctx.keepEmptied === false) return layout; // bookmarks.js KEEPS_EMPTIED_FOLDERS
  const used = (items) => {
    const paths = new Map(); // folder key -> path
    for (const it of items) {
      const segments = splitPath(folderOf(it));
      for (let depth = 1; depth <= segments.length; depth += 1) {
        const path = joinPath(segments.slice(0, depth));
        if (!paths.has(pathKey(path))) paths.set(pathKey(path), path);
      }
    }
    return paths;
  };
  const after = used(afterItems);
  let next = layout;
  for (const [key, path] of used(beforeItems)) {
    if (!after.has(key)) next = ensureFolder(next, shownPath(beforeItems, path), clockOf(ctx));
  }
  return next;
}

/** Move every favorite in or under `from` to the same place under
 * `toSegments`, dropping `dropDepth` leading segments of its own path. */
function rewritePrefix(items, from, toSegments, dropDepth, now) {
  let changed = false;
  let tooLong = false;
  const next = items.map((it) => {
    const stored = folderOf(it);
    if (stored === null || !isWithin(stored, from)) return it;
    const target = joinPath([...toSegments, ...splitPath(stored).slice(dropDepth)]);
    if (target !== null && target.length > MAX_PATH) tooLong = true;
    if ((it.folder ?? null) === target) return it;
    changed = true;
    return { ...it, folder: target, updatedAt: now };
  });
  return { items: next, changed, tooLong };
}

/** A folder and everything under it, to a new path. */
function relocateFolder(state, from, to, ctx) {
  const layout = layoutOf(state);
  const moved = rewritePrefix(state.items, from, splitPath(to), splitPath(from).length, ctx.now);
  // An empty folder underneath must be able to follow, or nothing moves.
  const depth = splitPath(from).length;
  const stranded = Object.values(layout.folders).some((entry) => !entry.gone && entry.path !== null
    && isWithin(entry.path, from)
    && joinPath([...splitPath(to), ...splitPath(entry.path).slice(depth)]).length > MAX_PATH);
  if (moved.tooLong || stranded) return unchanged(state, { error: 'too-long' });
  const nextLayout = movePrefix(layout, from, to, clockOf(ctx));
  const changed = moved.changed || !layoutsEqual(nextLayout, layout);
  if (!changed) return unchanged(state);
  return { items: moved.changed ? moved.items : state.items, tombstones: state.tombstones ?? [], layout: nextLayout, changed: true };
}

/** Import as it worked before folders could nest, unchanged: one flat folder
 * name per favorite (`folder`), spelled like an existing folder of that whole
 * name. Used until the Favorites manager ships (`ctx.paths === false`). */
function addImportedFlat({ items, tombstones }, entries, { now, makeId }) {
  const seen = new Set(items.map((it) => it.url));
  const canon = buildCanonMap(items); // key -> { folder }
  const added = [];
  let skipped = 0;
  for (const e of entries || []) {
    if (typeof e.url !== 'string' || seen.has(e.url)) { skipped++; continue; }
    seen.add(e.url);
    let folder = validFolder(e.folder);
    if (folder != null) {
      const key = folderKey(folder);
      const existing = canon.get(key);
      if (existing) folder = existing.folder;      // first-existing spelling wins
      else canon.set(key, { folder });             // new folder: first-in-file spelling
    }
    added.push({
      id: makeId(),
      url: e.url,
      title: typeof e.title === 'string' && e.title ? e.title : e.url,
      favicon: validFavicon(e.favicon),
      addedAt: Number.isFinite(e.addedAt) ? e.addedAt : now,
      updatedAt: now,
      folder,
    });
  }
  if (added.length === 0) return { items, tombstones, added: 0, skipped, changed: false };
  const addedUrls = new Set(added.map((it) => it.url));
  return {
    items: [...items, ...added].sort(oldestFirst),
    tombstones: tombstones.filter((t) => !addedUrls.has(t.url)),
    added: added.length,
    skipped,
    changed: true,
  };
}

/** Import parsed entries. An entry's `folder` is a whole folder path, and
 * entries arrive in the source's order.
 *
 * - A new address is added under its path, spelled the way an existing
 *   folder is.
 * - An address already saved is skipped, with one exception that repairs
 *   imports made before folders could nest: those kept only the last folder
 *   name, so a saved favorite still sitting in a folder of that name moves to
 *   the full path. One the person has since moved anywhere else stays put.
 * - Each folder that gains something keeps what it had, in the order it
 *   showed, followed by what arrived, in source order.
 *
 * The repair applies only to a favorite not changed since the manager
 * arrived on this device (`ctx.repairBefore`), so one the person then put in
 * a folder of that name is not moved again.
 *
 * `ctx.paths === false` is the behavior from before the manager
 * (addImportedFlat): a parser's `flatFolder` when it gives one, else
 * `folder` as written; no repair, and no order written. */
function addImported(state, entries, ctx) {
  const { items } = state;
  const tombstones = state.tombstones ?? [];
  const layout = layoutOf(state);
  if (ctx.paths === false) {
    const flat = (entries || []).map((e) => (e && Object.hasOwn(e, 'flatFolder') ? { ...e, folder: e.flatFolder } : e));
    const res = addImportedFlat({ items, tombstones }, flat, ctx);
    return { ...res, layout, moved: 0, shortened: 0, orderDropped: 0 };
  }
  const spell = createSpeller(items);
  const byUrl = new Map(items.map((it, index) => [it.url, index]));
  const seen = new Set();
  const next = items.slice();
  const added = [];
  const arrivals = new Map(); // folder key -> { path, keys: Set of child keys, in arrival order }
  let skipped = 0;
  let moved = 0;
  let shortened = 0;

  const arrive = (path, childKey) => {
    const key = pathKey(path);
    if (!arrivals.has(key)) arrivals.set(key, { path, keys: new Set() });
    arrivals.get(key).keys.add(childKey);
  };
  // The favorite arrives in its folder, and each folder along the way in its parent.
  const place = (path, url) => {
    const segments = splitPath(path);
    for (let depth = 0; depth < segments.length; depth += 1) {
      arrive(joinPath(segments.slice(0, depth)), folderChildKey(segments[depth]));
    }
    arrive(path, favoriteChildKey(url));
  };

  for (const e of entries || []) {
    if (typeof e.url !== 'string' || seen.has(e.url)) { skipped += 1; continue; }
    seen.add(e.url);
    const full = e.folder == null ? null : validPath(e.folder);
    const folder = full === null ? null : spell(full);
    const index = byUrl.get(e.url);
    if (index !== undefined) {
      const saved = next[index];
      const savedKey = pathKey(folderOf(saved));
      const untouched = ctx.repairBefore === undefined || (saved.updatedAt ?? saved.addedAt ?? 0) < ctx.repairBefore;
      const flattened = untouched && folder !== null && savedKey !== pathKey(folder)
        && savedKey !== '' && savedKey === pathKey(leafName(folder));
      if (!flattened) { skipped += 1; continue; }
      next[index] = { ...saved, folder, updatedAt: ctx.now };
      moved += 1;
    } else {
      added.push({
        id: ctx.makeId(),
        url: e.url,
        title: typeof e.title === 'string' && e.title ? e.title : e.url,
        favicon: validFavicon(e.favicon),
        addedAt: Number.isFinite(e.addedAt) ? e.addedAt : ctx.now,
        updatedAt: ctx.now,
        folder,
      });
    }
    if (e.shortened === true) shortened += 1;
    place(folder, e.url);
  }

  if (added.length === 0 && moved === 0) {
    return { items, tombstones, layout, added: 0, skipped, moved: 0, shortened: 0, orderDropped: 0, changed: false };
  }

  let nextLayout = layout;
  let orderDropped = 0;
  {
    const before = new Map(); // folder key -> the child keys it showed, in order
    const walk = (node) => {
      before.set(node.key, node.children.map((child) => (child.kind === 'folder'
        ? folderChildKey(child.folder.name) : favoriteChildKey(child.item.url))));
      for (const child of node.children) if (child.kind === 'folder') walk(child.folder);
    };
    walk(buildTree(items, layout));
    const orders = [];
    for (const [key, { path, keys }] of arrivals) {
      const had = before.get(key) ?? [];
      const hadKeys = new Set(had);
      const fresh = [...keys].filter((childKey) => !hadKeys.has(childKey));
      if (fresh.length) orders.push({ path, order: [...had, ...fresh] });
    }
    // The record has a size limit. An import too large for it gives up its
    // own orders, longest first (those folders show in the default order),
    // and never an order the person already chose.
    const cost = ({ path, order }) => order.reduce((sum, key) => sum + Buffer.byteLength(key, 'utf8') + 3, 0)
      + 2 * Buffer.byteLength(path ?? '', 'utf8') + 96;
    let room = LAYOUT_MAX_BYTES - Buffer.byteLength(JSON.stringify(layout), 'utf8');
    const kept = [];
    for (const entry of [...orders].sort((x, y) => cost(x) - cost(y))) {
      if (cost(entry) > room) { orderDropped += 1; continue; }
      room -= cost(entry);
      kept.push(entry);
    }
    nextLayout = boundLayout(setFolderOrders(layout, kept, clockOf(ctx))).layout;
  }

  const addedUrls = new Set(added.map((it) => it.url));
  return {
    items: [...next, ...added].sort(oldestFirst),
    tombstones: added.length ? tombstones.filter((t) => !addedUrls.has(t.url)) : tombstones,
    layout: nextLayout,
    added: added.length,
    skipped,
    moved,
    shortened,
    orderDropped,
    changed: true,
  };
}

function applyCreateFolder(state, parentPath, name, ctx) {
  const layout = layoutOf(state);
  const segment = cleanSegment(name);
  const parent = parentPath == null ? null : validPath(parentPath);
  if (segment === null || (parentPath != null && parent === null)) return unchanged(state, { error: 'invalid' });
  const path = validPath(joinPath([...splitPath(shownPath(state.items, parent)), segment]));
  if (path === null) return unchanged(state, { error: 'too-long' });
  const shown = shownPath(state.items, path);
  if (folderExists(state.items, layout, shown)) {
    const entry = layoutEntry(layout, shown);
    return unchanged(state, { path: entry && !entry.gone ? entry.path : shown });
  }
  return { items: state.items, tombstones: state.tombstones ?? [], layout: ensureFolder(layout, shown, clockOf(ctx)), changed: true, path: shown };
}

/** Rename one folder: the last segment of `path` becomes `newName`. A
 * case-only rename takes the new spelling as typed; a name a sibling already
 * has merges the two folders under the sibling's spelling. */
function applyRenameFolder(state, path, newName, ctx) {
  const from = storedPath(path);
  const segment = cleanSegment(newName);
  if (from === null || segment === null) return unchanged(state, { error: 'invalid' });
  if (!folderExists(state.items, layoutOf(state), from)) return unchanged(state, { error: 'missing' });
  const parent = splitPath(shownPath(state.items, parentPath(from)));
  const typed = joinPath([...parent, segment]);
  const to = pathKey(typed) === pathKey(from) ? typed : shownPath(state.items, typed);
  if (to.length > MAX_PATH) return unchanged(state, { error: 'too-long' });
  return relocateFolder(state, from, to, ctx);
}

function applyMoveFolder(state, path, newParentPath, ctx) {
  const from = storedPath(path);
  const parent = newParentPath == null ? null : validPath(newParentPath);
  if (from === null || (newParentPath != null && parent === null)) return unchanged(state, { error: 'invalid' });
  if (!folderExists(state.items, layoutOf(state), from)) return unchanged(state, { error: 'missing' });
  if (parent !== null && isWithin(parent, from)) return unchanged(state, { error: 'cycle' });
  const shownFrom = shownPath(state.items, from);
  const to = shownPath(state.items, joinPath([...splitPath(shownPath(state.items, parent)), leafName(shownFrom)]));
  if (to.length > MAX_PATH) return unchanged(state, { error: 'too-long' });
  if (pathKey(to) === pathKey(from)) return unchanged(state);
  return relocateFolder(state, from, to, ctx);
}

/** Delete a folder: its favorites and sub-folders move up one level (to the
 * top level from a top-level folder, as before paths). Nothing is deleted
 * with it. */
function applyRemoveFolder(state, path, ctx) {
  const from = storedPath(path);
  if (from === null) return unchanged(state, { error: 'invalid' });
  const layout = layoutOf(state);
  if (!folderExists(state.items, layout, from)) return unchanged(state, { error: 'missing' });
  const parent = splitPath(shownPath(state.items, parentPath(from)));
  const depth = splitPath(from).length;
  const moved = rewritePrefix(state.items, from, parent, depth, ctx.now);
  let nextLayout = layout;
  const subfolders = new Map(); // key -> path of each direct sub-folder
  const note = (folder) => {
    const segments = splitPath(folder);
    if (segments.length > depth && isWithin(folder, from)) {
      const sub = joinPath(segments.slice(0, depth + 1));
      subfolders.set(pathKey(sub), sub);
    }
  };
  for (const it of state.items) if (folderOf(it) !== null) note(folderOf(it));
  for (const entry of Object.values(layout.folders)) if (!entry.gone && entry.path !== null) note(entry.path);
  // A sub-folder with the deleted folder's own name moves onto its path and
  // must not then be marked removed.
  let replaced = false;
  for (const sub of subfolders.values()) {
    const target = joinPath([...parent, leafName(sub)]);
    if (pathKey(target) === pathKey(from)) replaced = true;
    nextLayout = movePrefix(nextLayout, sub, target, clockOf(ctx));
  }
  if (!replaced) nextLayout = removeFolderEntry(nextLayout, from, clockOf(ctx));
  return { items: moved.changed ? moved.items : state.items, tombstones: state.tombstones ?? [], layout: nextLayout, changed: true };
}

/** Move favorites into a folder, or to the top level with null. */
function applyMoveFavorites(state, ids, path, ctx) {
  let target = null;
  if (path != null) {
    const valid = validPath(path);
    if (valid === null) return unchanged(state, { error: 'invalid' }); // never a silent move to the top
    target = shownPath(state.items, valid);
  }
  const wanted = new Set(ids);
  let changed = false;
  const next = state.items.map((it) => {
    if (!wanted.has(it.id) || (it.folder ?? null) === target) return it;
    changed = true;
    return { ...it, folder: target, updatedAt: ctx.now };
  });
  if (!changed) return unchanged(state);
  return {
    items: next,
    tombstones: state.tombstones ?? [],
    layout: keepEmptiedFolders(state.items, next, layoutOf(state), ctx),
    changed: true,
  };
}

function applySetFolder(state, id, folder, ctx) {
  if (folder === undefined) return unchanged(state); // only an explicit null is the top level
  return applyMoveFavorites(state, [id], folder, ctx);
}

function applyRemoveFavorites(state, ids, ctx) {
  const wanted = new Set(ids);
  const removed = state.items.filter((it) => wanted.has(it.id));
  if (!removed.length) return unchanged(state);
  const next = state.items.filter((it) => !wanted.has(it.id));
  return {
    items: next,
    tombstones: [...(state.tombstones ?? []), ...removed.map((it) => ({ url: it.url, deletedAt: ctx.now }))],
    layout: keepEmptiedFolders(state.items, next, layoutOf(state), ctx),
    changed: true,
  };
}

/** Save the order a person chose for one folder's children (null: the top level). */
function applyReorder(state, path, orderKeys, ctx) {
  const layout = layoutOf(state);
  const folder = path == null ? null : validPath(path);
  if (path != null && folder === null) return unchanged(state, { error: 'invalid' });
  if (!folderExists(state.items, layout, folder)) return unchanged(state, { error: 'missing' });
  const shown = shownPath(state.items, folder);
  const current = layoutEntry(layout, shown);
  const proposed = setFolderOrder(layout, shown, orderKeys, clockOf(ctx));
  const order = layoutEntry(proposed, shown)?.order;
  if (!order || (current && !current.gone && JSON.stringify(current.order) === JSON.stringify(order))) return unchanged(state);
  return { items: state.items, tombstones: state.tombstones ?? [], layout: proposed, changed: true };
}

/** Save a favorite — add-only and idempotent. `folder`: null = save at / keep
 * at top level; a non-null candidate is a folder path, validated (blank or
 * over-long → reject, NEVER a silent top-level save) and spelled the way an
 * existing folder is. On an already-saved url, only an explicitly named
 * folder moves it (a bare save leaves it untouched). */
function applySaveFavorite(state, { url, title, favicon, folder }, ctx) {
  const { items } = state;
  const tombstones = state.tombstones ?? [];
  let target = null;
  if (folder != null) {
    const valid = validPath(folder);
    if (valid === null) return unchanged(state, { error: 'invalid' }); // reject before any add
    target = shownPath(items, valid);
  }
  const existing = items.find((it) => it.url === url);
  if (existing) {
    if (folder == null) return unchanged(state);
    return applyMoveFavorites(state, [existing.id], target, ctx);
  }
  const item = { id: ctx.makeId(), url, title: title || url, favicon: validFavicon(favicon), addedAt: ctx.now, updatedAt: ctx.now, folder: target };
  return {
    items: [...items, item],
    tombstones: tombstones.filter((t) => t.url !== url), // re-favoriting clears a prior delete
    layout: layoutOf(state),
    changed: true,
  };
}

/** Collapse every folderKey group to one spelling. Rewrites folder spelling
 * ONLY — never touches updatedAt (cosmetic, must not outrank a real edit under
 * LWW or trigger sync ping-pong). */
function canonicalizeFolders(items) {
  const canon = buildCanonMap(items);
  return items.map((it) => {
    if (it.folder == null) return it;
    const target = canon.get(folderKey(it.folder))?.folder;
    return target && target !== it.folder ? { ...it, folder: target } : it;
  });
}

/** Group favorites for the native Favorites menu: folders first (alphabetical,
 * case-insensitive), each folder's items newest-first, then ungrouped items
 * newest-first — mirroring the Favorites page. Pure: the menu builder wires
 * click handlers onto the returned bookmarks.
 *
 * Ordering is intentionally identical to `group()` in
 * src/renderer/pages/bookmarks.js (the page can't share this — different
 * runtime); keep the two in sync so the menu and page never disagree. */
function groupFavoritesForMenu(items) {
  const newestFirst = (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0);
  const byKey = new Map(); // folderKey -> { name, items }
  const ungrouped = [];
  for (const b of items) {
    if (b.folder == null) { ungrouped.push(b); continue; }
    const key = folderKey(b.folder);
    if (!byKey.has(key)) byKey.set(key, { name: b.folder, items: [] });
    byKey.get(key).items.push(b);
  }
  const folders = [...byKey.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  for (const f of folders) f.items.sort(newestFirst);
  ungrouped.sort(newestFirst);
  return { folders, ungrouped };
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

/** Which favorites a resolved favicon may write to, and why the two rules are
 * asymmetric.
 *
 * Exact URL is authoritative: it sets OR clears, because that record is
 * unambiguously about this page.
 *
 * Same origin is FILL-ONLY, and only onto a favorite that currently has no
 * icon. Dashboards redirect — you favorite the short URL, the icon resolves on
 * the redirect target, and an exact-match-only rule never fires, so the
 * favorite keeps its letter with nothing left to heal it. Fill-only means a
 * page in the origin that declares no favicon can never erase an icon another
 * page already earned, and a good icon is never silently replaced.
 *
 * Returns the next items array plus `changed`, in the shape the other
 * apply* helpers use. */
function applyFaviconUpdate(items, { url, favicon }) {
  const origin = favicon == null ? null : originOf(url);
  const matches = (b) => b.url === url
    || (origin !== null && b.favicon == null && originOf(b.url) === origin);
  if (!items.some((b) => matches(b) && b.favicon !== favicon)) {
    return { items, changed: false };
  }
  return {
    items: items.map((b) => (matches(b) ? { ...b, favicon } : b)),
    changed: true,
  };
}

/** Whether a tab's newly sanitized favicon may write into Favorites.
 * Bookmarked is deliberately NOT required — the redirect heal fills a
 * different URL on the same origin, where the tab's own flag is false.
 * Private is required: Favorites sync-exports, and private browsing must
 * never drive that store. */
function mayWriteFavoriteFavicon(tab, sanitized) {
  return !!sanitized && !tab?.private;
}

module.exports = {
  addImported, applySaveFavorite, applyFaviconUpdate, mayWriteFavoriteFavicon,
  applySetFolder, applyRenameFolder, applyRemoveFolder, canonicalizeFolders,
  applyCreateFolder, applyMoveFolder, applyMoveFavorites, applyRemoveFavorites, applyReorder, keepEmptiedFolders,
  groupFavoritesForMenu,
};
