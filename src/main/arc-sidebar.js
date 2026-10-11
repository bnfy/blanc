'use strict';

// Pure reader and planner for F45 Arc Spaces import. Arc keeps every Space,
// its pinned and Today tabs, its folders and the top-row Favorites in one
// JSON file, StorableSidebar.json. This module turns that file into bounded
// Space records and then into Named Workspace capture columns. No electron,
// no fs: discovery, the Patron check and every write stay in main.
//
// The format is undocumented. What this relies on (cross-checked against the
// open-source arc-export and arc-export-windows readers):
//   sidebar.containers[]  — one entry carries both `spaces` and `items`
//   spaces / items        — flat arrays alternating string ids and objects
//   space.newContainerIDs — [{pinned:{}}, id, {unpinned:{…}}, id] (older
//                           builds: containerIDs ['pinned', id, …])
//   item                  — {id, parentID, childrenIds, title, data}
//   item.data.tab         — {savedURL, savedTitle}; data.list is a folder;
//                           data.splitView holds tabs; data.itemContainer
//                           with containerType.topApps is the Favorites row
// Anything else (notes, Easels, documents, unknown kinds) is counted and
// skipped, never guessed at.

const MAX_ARC_SIDEBAR_BYTES = 32 * 1024 * 1024;
const MAX_ARC_ITEMS = 100_000;
const MAX_ARC_DEPTH = 32;
const MAX_ARC_SPACES = 100;
const MAX_ARC_FAVORITES = 500;
const MAX_SPACE_TABS = 500;
const MAX_SPACE_GROUPS = 50;
const MAX_SPACE_NAME = 60;
const MAX_GROUP_NAME = 40;
const MAX_TAB_TITLE = 200;

function boundedText(value, maxCodePoints) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, maxCodePoints).join('').trim();
}

function normalHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const has = (object, key) => isRecord(object) && Object.prototype.hasOwnProperty.call(object, key);

/** The ordered pinned and Today container ids of one Space. */
function spaceContainerIds(space) {
  const list = Array.isArray(space.newContainerIDs) ? space.newContainerIDs
    : Array.isArray(space.containerIDs) ? space.containerIDs : [];
  const pinned = [];
  const today = [];
  for (let index = 0; index + 1 < list.length; index += 1) {
    const marker = list[index];
    const id = list[index + 1];
    if (typeof id !== 'string' || !id) continue;
    const kind = marker === 'pinned' || has(marker, 'pinned') ? pinned
      : marker === 'unpinned' || has(marker, 'unpinned') ? today : null;
    if (kind && !kind.includes(id)) kind.push(id);
  }
  return { pinned, today };
}

function arcProfileKind(space) {
  if (!has(space, 'profile')) return 'default';
  return space.profile?.default === true ? 'default' : 'custom';
}

/**
 * Parses StorableSidebar.json into Spaces and top-row Favorites.
 * Returns { ok: true, spaces, favorites, skippedCount } or { error }.
 * Space and folder names are bounded user text; every URL is http(s).
 */
function parseArcSidebar(input, {
  maxItems = MAX_ARC_ITEMS,
  maxDepth = MAX_ARC_DEPTH,
} = {}) {
  let data;
  try {
    data = typeof input === 'string' || Buffer.isBuffer(input)
      ? JSON.parse(String(input))
      : input;
  } catch {
    return { error: 'unreadable' };
  }
  const containers = data?.sidebar?.containers;
  if (!Array.isArray(containers)) return { error: 'not-arc' };
  const container = containers.find((entry) =>
    isRecord(entry) && Array.isArray(entry.spaces) && Array.isArray(entry.items));
  if (!container) return { error: 'not-arc' };
  if (container.items.length > maxItems * 2) return { error: 'too-complex' };

  const items = new Map();
  const childrenByParent = new Map();
  for (const item of container.items) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || items.has(item.id)) continue;
    items.set(item.id, item);
    if (typeof item.parentID === 'string') {
      if (!childrenByParent.has(item.parentID)) childrenByParent.set(item.parentID, []);
      childrenByParent.get(item.parentID).push(item.id);
    }
  }

  // childrenIds carries Arc's sidebar order; a child that only names its
  // parent through parentID still belongs, after the ordered ones.
  const childIds = (item) => {
    const ordered = Array.isArray(item.childrenIds)
      ? item.childrenIds.filter((id) => typeof id === 'string' && items.has(id)) : [];
    const seen = new Set(ordered);
    for (const id of childrenByParent.get(item.id) ?? []) {
      if (!seen.has(id)) { seen.add(id); ordered.push(id); }
    }
    return ordered;
  };

  let visited = 0;
  let skippedCount = 0;

  // Flattens one sidebar subtree into tab entries. Only a folder directly in
  // a section becomes a group; deeper folders and split views fold into it.
  function collect(rootId, section, out, folders, claimed) {
    const visit = (id, depth, folderKey) => {
      if (claimed.has(id)) return;
      claimed.add(id);
      visited += 1;
      if (visited > maxItems || depth > maxDepth) throw new Error('too-complex');
      const item = items.get(id);
      const kind = isRecord(item.data) ? item.data : {};
      if (has(kind, 'tab')) {
        const url = normalHttpUrl(kind.tab?.savedURL);
        if (!url) { skippedCount += 1; return; }
        const title = boundedText(item.title, MAX_TAB_TITLE)
          || boundedText(kind.tab?.savedTitle, MAX_TAB_TITLE)
          || url;
        out.push({ url, title, section, folderKey });
        return;
      }
      if (has(kind, 'list') || has(kind, 'splitView')) {
        let key = folderKey;
        if (key === null && has(kind, 'list')) {
          key = id;
          folders.push({ key, name: boundedText(item.title, MAX_GROUP_NAME) });
        }
        for (const child of childIds(item)) visit(child, depth + 1, key);
        return;
      }
      skippedCount += 1;
    };
    const root = items.get(rootId);
    if (!root) return;
    claimed.add(rootId);
    for (const child of childIds(root)) visit(child, 1, null);
  }

  const spaces = [];
  const claimed = new Set();
  try {
    for (const space of container.spaces) {
      if (!isRecord(space) || typeof space.id !== 'string' || !space.id) continue;
      if (spaces.length >= MAX_ARC_SPACES) break;
      const { pinned, today } = spaceContainerIds(space);
      const tabs = [];
      const folders = [];
      for (const id of pinned) collect(id, 'pinned', tabs, folders, claimed);
      for (const id of today) collect(id, 'today', tabs, folders, claimed);
      spaces.push({
        sourceSpaceId: space.id,
        name: boundedText(space.title, MAX_SPACE_NAME) || null,
        arcProfile: arcProfileKind(space),
        tabs,
        folders,
      });
    }

    const favorites = [];
    const favoriteUrls = new Set();
    for (const item of items.values()) {
      if (!has(item.data?.itemContainer?.containerType, 'topApps')) continue;
      const entries = [];
      collect(item.id, 'favorite', entries, [], claimed);
      for (const entry of entries) {
        if (favorites.length >= MAX_ARC_FAVORITES) break;
        if (favoriteUrls.has(entry.url)) continue;
        favoriteUrls.add(entry.url);
        favorites.push({ url: entry.url, title: entry.title });
      }
    }
    return { ok: true, spaces, favorites, skippedCount };
  } catch (err) {
    if (err?.message === 'too-complex') return { error: 'too-complex' };
    throw err;
  }
}

const normalizeGroupName = (value) => boundedText(value, MAX_GROUP_NAME).toLowerCase();

/** A workspace name not already used in this profile (case-insensitive). */
function uniqueWorkspaceName(base, taken) {
  const fits = (suffix) =>
    `${Array.from(base).slice(0, MAX_SPACE_NAME - suffix.length).join('').trim()}${suffix}`;
  for (let n = 1; n < 1000; n += 1) {
    const candidate = fits(n === 1 ? '' : n === 2 ? ' (Arc)' : ` (Arc ${n - 1})`);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return null;
}

/**
 * Turns one parsed Space into Named Workspace capture columns: loose pinned
 * tabs lead as pinned tabs, each top-level folder becomes a lowercase group
 * (same-named folders share one), Today tabs follow ungrouped. Tabs past the
 * per-Space cap are counted, not silently lost.
 */
function planSpaceCapture(space, { randomId }) {
  const loosePinned = space.tabs.filter((tab) => tab.section === 'pinned' && tab.folderKey === null);
  const foldered = space.tabs.filter((tab) => tab.folderKey !== null);
  const today = space.tabs.filter((tab) => tab.section === 'today' && tab.folderKey === null);

  const groupByFolder = new Map();
  const groupByName = new Map();
  const groups = [];
  for (const folder of space.folders) {
    const name = normalizeGroupName(folder.name) || 'folder';
    let group = groupByName.get(name);
    if (!group && groups.length < MAX_SPACE_GROUPS) {
      group = { id: randomId(), name, collapsed: false };
      groupByName.set(name, group);
      groups.push(group);
    }
    if (group) groupByFolder.set(folder.key, group.id);
  }

  const ordered = [
    ...loosePinned.map((tab) => ({ tab, groupId: null, pinned: true })),
    ...foldered.map((tab) => ({ tab, groupId: groupByFolder.get(tab.folderKey) ?? null, pinned: false })),
    ...today.map((tab) => ({ tab, groupId: null, pinned: false })),
  ];
  const kept = ordered.slice(0, MAX_SPACE_TABS);
  const usedGroups = new Set(kept.map((entry) => entry.groupId).filter(Boolean));
  return {
    capture: {
      urls: kept.map((entry) => entry.tab.url),
      activeIndex: 0,
      groups: groups.filter((group) => usedGroups.has(group.id)),
      groupIds: kept.map((entry) => entry.groupId),
      pinned: kept.map((entry) => entry.pinned),
      meta: kept.map((entry) => ({ title: entry.tab.title, favicon: null })),
    },
    droppedCount: ordered.length - kept.length,
  };
}

/**
 * Plans the selected Spaces, in Arc's order. Each gets a unique workspace
 * name; Spaces beyond the free workspace slots are reported as `noRoom`
 * rather than partially created. Empty Spaces are skipped.
 */
function planArcSpacesImport({
  spaces,
  selectedSpaceIds,
  existingWorkspaceNames = [],
  remainingSlots = Infinity,
  untitledName = (n) => `Space ${n}`,
  randomId,
} = {}) {
  if (!Array.isArray(spaces) || typeof randomId !== 'function') return { error: 'invalid-plan' };
  const selected = new Set(Array.isArray(selectedSpaceIds) ? selectedSpaceIds : []);
  const taken = new Set(existingWorkspaceNames
    .filter((name) => typeof name === 'string')
    .map((name) => name.toLowerCase()));
  const planned = [];
  const noRoom = [];
  const empty = [];
  let untitled = 0;
  for (const space of spaces) {
    const base = space.name ?? untitledName(untitled += 1);
    if (!selected.has(space.sourceSpaceId)) continue;
    if (!space.tabs.length) { empty.push(space.sourceSpaceId); continue; }
    if (planned.length >= remainingSlots) { noRoom.push(space.sourceSpaceId); continue; }
    const name = uniqueWorkspaceName(base, taken);
    if (!name) { noRoom.push(space.sourceSpaceId); continue; }
    taken.add(name.toLowerCase());
    planned.push({ sourceSpaceId: space.sourceSpaceId, name, ...planSpaceCapture(space, { randomId }) });
  }
  return { planned, noRoom, empty };
}

module.exports = {
  MAX_ARC_SIDEBAR_BYTES,
  MAX_SPACE_TABS,
  MAX_SPACE_GROUPS,
  parseArcSidebar,
  planSpaceCapture,
  planArcSpacesImport,
  uniqueWorkspaceName,
};
