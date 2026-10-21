// Pure tab/group order policy for drag and keyboard moves. The main process
// remains the sole mutator; these helpers only return a proposed order.

const { sectionsOf } = require('../renderer/tab-sections');
const { reorderGroupsWithClosed } = require('./closed-slot');

function tabFor(tabs, id) {
  if (tabs instanceof Map) return tabs.get(id);
  return tabs?.[id];
}

/**
 * Move `id` into the bucket {target.groupId, source.pinned}, before
 * target.beforeId (null = end of that bucket). A drag may change position and
 * group, never pinned state. Returns { order, groupId } (fresh array) or null
 * for an invalid request. Never mutates its inputs.
 */
function moveTab(order, tabs, groups, id, target) {
  if (!Array.isArray(order) || !target || typeof target !== 'object') return null;
  const source = tabFor(tabs, id);
  if (!source || !order.includes(id)) return null;
  // groupId is required: null means loose/standalone pins, a string names a
  // group. A missing or malformed one must never silently ungroup the tab.
  const { groupId } = target;
  if (groupId !== null && typeof groupId !== 'string') return null;
  if (groupId !== null && !(Array.isArray(groups) && groups.some((g) => g.id === groupId))) return null;
  const { beforeId } = target;
  if (beforeId !== null && typeof beforeId !== 'string') return null;

  const pinned = !!source.pinned;
  if (groupId === null && !pinned) return moveLoose(order, tabs, id, beforeId);
  const inTarget = (tabId) => {
    const tab = tabFor(tabs, tabId);
    return !!tab && (tab.groupId ?? null) === groupId && !!tab.pinned === pinned;
  };
  const sameGroup = (source.groupId ?? null) === groupId;

  // Self-target: only meaningful inside the bucket the tab already occupies.
  if (beforeId === id) return sameGroup ? { order: [...order], groupId } : null;
  if (beforeId !== null && (!order.includes(beforeId) || !inTarget(beforeId))) return null;

  const next = order.filter((tabId) => tabId !== id);
  if (beforeId !== null) {
    next.splice(next.indexOf(beforeId), 0, id);
    return { order: next, groupId };
  }
  let last = -1;
  for (let i = 0; i < next.length; i += 1) if (inTarget(next[i])) last = i;
  if (last === -1) {
    // Sole member of its own bucket: no meaningful "end" — keep its slot.
    if (sameGroup) return { order: [...order], groupId };
    // Empty target bucket: rendering filters by group and leads with pins,
    // so only order relative to bucket members matters.
    next.push(id);
    return { order: next, groupId };
  }
  next.splice(last + 1, 0, id);
  return { order: next, groupId };
}

/**
 * An unpinned tab becoming (or staying) ungrouped can land anywhere between
 * groups (spec 2026-10-17): before a loose tab, before a group's first drawn
 * tab (above that group), at its own place (ungrouping in place), or at the
 * end (null). Any other beforeId would split a group, so it is refused.
 */
function moveLoose(order, tabs, id, beforeId) {
  if (beforeId === id) return { order: [...order], groupId: null };
  const next = order.filter((tabId) => tabId !== id);
  if (beforeId === null) {
    next.push(id);
    return { order: next, groupId: null };
  }
  const target = tabFor(tabs, beforeId);
  if (!target || !next.includes(beforeId)) return null;
  let at;
  if (!target.groupId && !target.pinned) {
    at = next.indexOf(beforeId);
  } else if (target.groupId) {
    const list = order.map((tabId) => tabFor(tabs, tabId)).filter(Boolean)
      .map((tab) => ({ id: tab.id, groupId: tab.groupId ?? null, pinned: !!tab.pinned }));
    const section = sectionsOf(list).find((candidate) => candidate.groupId === target.groupId);
    if (section?.tabIds[0] !== beforeId) return null;
    at = next.findIndex((tabId) => tabFor(tabs, tabId)?.groupId === target.groupId);
  } else {
    return null;
  }
  next.splice(at, 0, id);
  return { order: next, groupId: null };
}

/** Move one top-level item (a group id, a loose tab id or the Recently closed
 * band) before another item, or to the end with null. `slot` is the band's
 * item index. Returns { order, slot } or null for an unknown id. */
function reorderItems(itemIds, slot, id, beforeId) {
  return reorderGroupsWithClosed(itemIds, slot, id, beforeId);
}

/** Move group `id` before `beforeGroupId` (null = end). Returns a fresh array
 * holding the same group records, or null for an invalid request. */
function reorderGroup(groups, id, beforeGroupId) {
  if (!Array.isArray(groups)) return null;
  const from = groups.findIndex((g) => g.id === id);
  if (from === -1) return null;
  if (beforeGroupId !== null && typeof beforeGroupId !== 'string') return null;
  if (beforeGroupId === id) return [...groups];
  if (beforeGroupId !== null && !groups.some((g) => g.id === beforeGroupId)) return null;
  const next = groups.filter((g) => g.id !== id);
  const at = beforeGroupId === null ? next.length : next.findIndex((g) => g.id === beforeGroupId);
  next.splice(at, 0, groups[from]);
  return next;
}

module.exports = { moveTab, reorderGroup, reorderItems };
