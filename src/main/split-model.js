'use strict';

// Pure Split View (F53) state: making, shrinking and dissolving a split, where
// its tabs sit in the window's order, and what of it is saved. No Electron
// imports; main.js owns the tabs and views. A split is
// { id, tabIds, layout, focusedIndex }, and each member tab carries splitId.
// See docs/superpowers/specs/2026-10-19-split-view-design.md.

const { normalizeSplitLayout, defaultSplitLayout } = require('./split-layout');

const MAX_SPLIT_PANES = 4;
/** PR 1 builds two-pane splits only; the data shapes already allow four. */
const PR1_MAX_PANES = 2;

let splitSeq = 0;
const newSplitId = () => `split-${Date.now().toString(36)}-${++splitSeq}`;

/** A tab may join a split when it is a real, unpinned tab not already in one. */
function splitEligible(tab) {
  return !!tab?.id && !tab.pinned && !tab.splitId;
}

/**
 * A new split led by `initiator`. `groupId` is the group every member must
 * take: the initiator's, or none (spec §3.1, "Which group wins").
 */
function createSplit({ initiator, others, layout = null }) {
  const tabIds = [initiator.id, ...others.map((o) => o.id)];
  return {
    split: {
      id: newSplitId(),
      tabIds,
      layout: normalizeSplitLayout(layout, tabIds.length) ?? defaultSplitLayout(tabIds.length),
      focusedIndex: 0,
    },
    groupId: initiator.groupId ?? null,
  };
}

/**
 * The split without `tabId`. When one tab would remain the split dissolves:
 * `split` is null and `dissolved` names the tab that becomes ordinary again.
 */
function removeFromSplit(split, tabId) {
  if (!split?.tabIds.includes(tabId)) return { split, dissolved: [] };
  const tabIds = split.tabIds.filter((id) => id !== tabId);
  if (tabIds.length < 2) return { split: null, dissolved: tabIds };
  const focused = split.tabIds[split.focusedIndex];
  const focusedIndex = tabIds.includes(focused) ? tabIds.indexOf(focused) : Math.min(split.focusedIndex, tabIds.length - 1);
  return {
    split: { ...split, tabIds, layout: normalizeSplitLayout(split.layout, tabIds.length), focusedIndex },
    dissolved: [],
  };
}

/** `order` with `tabId` moved directly after the split's last member (D8). */
function placeAfterSplit(order, splitTabIds, tabId) {
  const rest = order.filter((id) => id !== tabId);
  const members = new Set(splitTabIds.filter((id) => id !== tabId));
  let last = -1;
  rest.forEach((id, i) => { if (members.has(id)) last = i; });
  rest.splice(last + 1, 0, tabId);
  return rest;
}

/** Each split's members contiguous, in its tabIds order, where its first
 *  member in `order` sits. Idempotent. */
function normalizeSplitOrder(order, splits) {
  let out = [...order];
  for (const split of splits ?? []) {
    const members = split.tabIds.filter((id) => out.includes(id));
    if (members.length < 2) continue;
    const at = out.findIndex((id) => members.includes(id));
    const without = out.filter((id) => !members.includes(id));
    const insertAt = out.slice(0, at).filter((id) => !members.includes(id)).length;
    without.splice(insertAt, 0, ...members);
    out = without;
  }
  return out;
}

function splitForTab(splits, tabId) {
  return (splits ?? []).find((s) => s.tabIds.includes(tabId)) ?? null;
}

/**
 * What session.json and Spaces keep: `splits` and a `splitIds` column
 * parallel to the persisted tabs. Private (unpersisted) members drop out; a
 * split left with fewer than two persisted members is saved as plain tabs.
 */
function captureSplits(splits, persistedTabIds) {
  const persisted = new Set(persistedTabIds);
  const kept = [];
  const idOf = new Map();
  for (const split of splits ?? []) {
    const members = split.tabIds.filter((id) => persisted.has(id));
    if (members.length < 2) continue;
    const focusedTab = split.tabIds[split.focusedIndex];
    kept.push({
      id: split.id,
      layout: normalizeSplitLayout(split.layout, members.length),
      focusedIndex: members.includes(focusedTab) ? members.indexOf(focusedTab) : 0,
    });
    for (const id of members) idOf.set(id, split.id);
  }
  return { splits: kept, splitIds: persistedTabIds.map((id) => idOf.get(id) ?? null) };
}

/**
 * Splits rebuilt after restore. `restoredTabIds` is parallel to `splitIds`
 * (null where a tab could not be created); a split with fewer than two
 * restored members is dropped.
 */
function restoreSplits(savedSplits, splitIds, restoredTabIds) {
  if (!Array.isArray(savedSplits) || !Array.isArray(splitIds) || !Array.isArray(restoredTabIds)) return [];
  const members = new Map();
  splitIds.forEach((splitId, i) => {
    const tabId = restoredTabIds[i];
    if (typeof splitId !== 'string' || !tabId) return;
    if (!members.has(splitId)) members.set(splitId, []);
    members.get(splitId).push(tabId);
  });
  const out = [];
  for (const saved of savedSplits) {
    const tabIds = members.get(saved?.id);
    if (!tabIds || tabIds.length < 2 || tabIds.length > MAX_SPLIT_PANES) continue;
    const focusedIndex = Number.isInteger(saved.focusedIndex)
      ? Math.min(Math.max(saved.focusedIndex, 0), tabIds.length - 1)
      : 0;
    out.push({ id: saved.id, tabIds, layout: normalizeSplitLayout(saved.layout, tabIds.length), focusedIndex });
  }
  return out;
}

/**
 * The `splits` and `splitIds` columns of a saved window or Space, kept only
 * when they still line up with its `urls` (a writer that moved the URL column
 * leaves them out, and the window restores as plain tabs). Restore normalizes
 * each layout again (restoreSplits).
 */
function savedSplitColumns(source, urlCount) {
  const splitIds = source?.splitIds;
  const splits = source?.splits;
  if (!Array.isArray(splitIds) || splitIds.length !== urlCount || !Array.isArray(splits)) return {};
  const kept = splits
    .filter((s) => s && typeof s.id === 'string' && s.id)
    .map((s) => ({
      id: s.id,
      layout: s.layout && typeof s.layout === 'object' ? s.layout : null,
      focusedIndex: Number.isInteger(s.focusedIndex) ? s.focusedIndex : 0,
    }));
  if (!kept.length) return {};
  return { splits: kept, splitIds: splitIds.map((id) => (typeof id === 'string' && id ? id : null)) };
}

module.exports = {
  savedSplitColumns,
  MAX_SPLIT_PANES,
  PR1_MAX_PANES,
  newSplitId,
  splitEligible,
  createSplit,
  removeFromSplit,
  placeAfterSplit,
  normalizeSplitOrder,
  splitForTab,
  captureSplits,
  restoreSplits,
};
