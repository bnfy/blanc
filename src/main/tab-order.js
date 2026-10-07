// Pure drag-order validation for the vertical rail. The main process remains
// the sole mutator of tabOrder; this helper only returns a proposed order.

function tabFor(tabs, id) {
  if (tabs instanceof Map) return tabs.get(id);
  return tabs?.[id];
}

function sameBucket(a, b) {
  return !!a && !!b
    && (a.groupId ?? null) === (b.groupId ?? null)
    && !!a.pinned === !!b.pinned;
}

/**
 * Move `id` before `beforeId`, but only inside the source tab's exact
 * {groupId,pinned} bucket. A null beforeId means the end of that bucket.
 *
 * Returns a fresh order for an accepted request (including an accepted
 * no-op), or null when the request is invalid.
 *
 * @param {string[]} order
 * @param {Map<string, object>|Record<string, object>} tabs
 * @param {string} id
 * @param {string|null} beforeId
 * @returns {string[]|null}
 */
function reorderWithinBucket(order, tabs, id, beforeId) {
  if (!Array.isArray(order)) return null;
  const sourceIndex = order.indexOf(id);
  const source = tabFor(tabs, id);
  if (sourceIndex === -1 || !source) return null;

  if (beforeId === id) return [...order];

  if (beforeId !== null) {
    const target = tabFor(tabs, beforeId);
    if (order.indexOf(beforeId) === -1 || !sameBucket(source, target)) return null;
  }

  const next = [...order];
  next.splice(sourceIndex, 1);

  if (beforeId !== null) {
    next.splice(next.indexOf(beforeId), 0, id);
    return next;
  }

  // The source is the bucket's only member: there is no meaningful "end"
  // to move to, so preserve its position instead of crossing other buckets.
  let lastBucketIndex = -1;
  for (let i = 0; i < next.length; i += 1) {
    if (sameBucket(source, tabFor(tabs, next[i]))) lastBucketIndex = i;
  }
  if (lastBucketIndex === -1) return [...order];

  next.splice(lastBucketIndex + 1, 0, id);
  return next;
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
  const groupId = target.groupId ?? null;
  if (groupId !== null && !(Array.isArray(groups) && groups.some((g) => g.id === groupId))) return null;
  const { beforeId } = target;
  if (beforeId !== null && typeof beforeId !== 'string') return null;

  const pinned = !!source.pinned;
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

module.exports = { sameBucket, reorderWithinBucket, moveTab, reorderGroup };
