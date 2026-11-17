'use strict';

// The Favorites manager's rules that need no page (F63): finding folders,
// selection, the order after a drag or a Move up, and search. The page loads
// it as a script; unit tests require it. Paths use favorites-tree.js's form
// (names joined by " › ", compared without regard to case).

(function attach(root) {
  const SEP = ' › ';
  const MAX_RESULTS = 500;

  const segments = (path) => (typeof path === 'string' && path ? path.split(SEP) : []);
  const keyOf = (path) => segments(path).map((name) => name.toLowerCase()).join(SEP);

  /** Whether `path` is `ancestor` or a folder inside it (null: the top level). */
  function isWithinPath(path, ancestor) {
    const base = keyOf(ancestor);
    const key = keyOf(path);
    return base === '' || key === base || key.startsWith(base + SEP);
  }

  function parentOf(path) {
    const parts = segments(path).slice(0, -1);
    return parts.length ? parts.join(SEP) : null;
  }

  /** The tree node for a folder path, or null; the root for null. */
  function findFolder(tree, path) {
    let node = tree;
    for (const name of segments(path)) {
      const child = node.children.find((c) => c.kind === 'folder' && c.folder.name.toLowerCase() === name.toLowerCase());
      if (!child) return null;
      node = child.folder;
    }
    return node;
  }

  /** Each folder from the top down to `path`, as { name, path }. */
  function breadcrumb(tree, path) {
    const crumbs = [];
    let node = tree;
    for (const name of segments(path)) {
      const child = node?.children.find((c) => c.kind === 'folder' && c.folder.name.toLowerCase() === name.toLowerCase());
      if (!child) break;
      node = child.folder;
      crumbs.push({ name: node.name, path: node.path });
    }
    return crumbs;
  }

  /** Every folder, parents first, with its depth (0 at the top level). */
  function listFolders(tree) {
    const out = [];
    const walk = (node, depth) => {
      for (const child of node.children) {
        if (child.kind !== 'folder') continue;
        out.push({ path: child.folder.path, name: child.folder.name, depth });
        walk(child.folder, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }

  /** Favorites whose title or address holds the query, with their folder. */
  function searchFavorites(tree, query) {
    const needle = String(query ?? '').trim().toLowerCase();
    if (!needle) return [];
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (out.length >= MAX_RESULTS) return;
        if (child.kind === 'folder') walk(child.folder);
        else if (`${child.item.title ?? ''}\n${child.item.url}`.toLowerCase().includes(needle)) {
          out.push({ item: child.item, path: node.path });
        }
      }
    };
    walk(tree);
    return out;
  }

  /** The selection after a click: Shift selects from the anchor, Ctrl or
   * Command adds or removes one, a plain click selects just the one. */
  function selectionAfterClick(orderedKeys, selected, key, { toggle = false, range = false, anchor = null } = {}) {
    if (range && anchor !== null && orderedKeys.includes(anchor)) {
      const from = orderedKeys.indexOf(anchor);
      const to = orderedKeys.indexOf(key);
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      return { selected: new Set(orderedKeys.slice(lo, hi + 1)), anchor };
    }
    if (toggle) {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { selected: next, anchor: key };
    }
    return { selected: new Set([key]), anchor: key };
  }

  /** The order after dropping `movedKeys` before `beforeKey` (null: at the
   * end). Moved rows keep their order among themselves. */
  function orderAfterDrop(orderedKeys, movedKeys, beforeKey) {
    const moving = new Set(movedKeys);
    const kept = orderedKeys.filter((key) => !moving.has(key));
    const moved = orderedKeys.filter((key) => moving.has(key));
    let at = kept.length;
    if (beforeKey !== null) {
      if (moving.has(beforeKey)) {
        // Dropped onto itself: the first row after the moved block that stays.
        const after = orderedKeys.slice(orderedKeys.indexOf(beforeKey)).find((key) => !moving.has(key));
        at = after === undefined ? kept.length : kept.indexOf(after);
      } else {
        at = kept.indexOf(beforeKey);
      }
    }
    return [...kept.slice(0, at), ...moved, ...kept.slice(at)];
  }

  /** Move one row up (-1) or down (1); unchanged at either end. */
  function orderAfterStep(orderedKeys, key, direction) {
    const from = orderedKeys.indexOf(key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= orderedKeys.length) return [...orderedKeys];
    const next = [...orderedKeys];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  }

  /** Whether folders can go into `folderPath`: never into one of themselves. */
  function canDropInto(folderPath, movedFolderPaths) {
    return !movedFolderPaths.some((moved) => isWithinPath(folderPath, moved));
  }

  function joinPath(parent, name) {
    return parent ? `${parent}${SEP}${name}` : name;
  }

  const leafOf = (path) => segments(path).at(-1) ?? '';

  /** `path` after the folder `from` became `to` (same if not inside it). */
  function remapPath(path, from, to) {
    if (!isWithinPath(path, from)) return path;
    const rest = segments(path).slice(segments(from).length);
    return [...segments(to), ...rest].join(SEP);
  }

  /** One folder's whole order after one kind's rows were rearranged.
   * Folders are always drawn first, so they are saved first. */
  function combineOrder(children, kind, kindOrder) {
    const folders = children.filter((c) => c.kind === 'folder').map((c) => c.key);
    const favorites = children.filter((c) => c.kind === 'favorite').map((c) => c.key);
    return kind === 'folder' ? [...kindOrder, ...favorites] : [...folders, ...kindOrder];
  }

  const api = {
    SEP, findFolder, joinPath, leafOf, remapPath, combineOrder, breadcrumb, listFolders, searchFavorites, selectionAfterClick,
    orderAfterDrop, orderAfterStep, canDropInto, isWithinPath, parentOf,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FavoritesManagerModel = api;
})(typeof globalThis === 'object' ? globalThis : this);
