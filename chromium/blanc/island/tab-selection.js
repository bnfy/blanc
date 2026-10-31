// Ported from shipping v1.44.1 src/main/tab-selection.js (3b0c000b).
'use strict';
(function (root) {
const { rowsOf, normalizeOrder } = root.TabSections;

const emptySelection = () => ({ selectedTabIds: [], selectionAnchorId: null, selectionSplits: {} });
const rowIds = row => row.kind === 'split' ? row.tabIds : [row.id];
function selectionRows(list, groups = []) {
  const hidden = new Set(groups.filter(g => g.collapsed).map(g => g.id));
  const visible = list.filter(tab => !hidden.has(tab.groupId));
  return rowsOf(normalizeOrder(visible), visible).map(rowIds);
}
function selectionState(ids, anchor, list) {
  const wanted = new Set(ids);
  // Membership always expands to every pane, even when a collapsed group
  // hides the active row that joins the selection implicitly.
  for (const tab of list) if (wanted.has(tab.id) && tab.splitId) {
    for (const member of list) if (member.splitId === tab.splitId) wanted.add(member.id);
  }
  const selectedTabIds = list.filter(tab => wanted.has(tab.id)).map(tab => tab.id);
  return { selectedTabIds, selectionAnchorId: anchor,
    selectionSplits: Object.fromEntries(list.filter(tab => wanted.has(tab.id)).map(tab => [tab.id, tab.splitId ?? null])) };
}
function pruneSelection(state, list) {
  const byId = new Map(list.map(tab => [tab.id, tab]));
  for (const id of state.selectedTabIds ?? []) {
    const before = state.selectionSplits?.[id] ?? null;
    const after = byId.get(id)?.splitId ?? null;
    if (before !== after) return emptySelection();
  }
  return selectionState(state.selectedTabIds ?? [], byId.has(state.selectionAnchorId) ? state.selectionAnchorId : null, list);
}
function selectTabs(state, list, groups, activeId, id, mode) {
  if (mode === 'clear') return { ...emptySelection(), focusId: null };
  const clean = pruneSelection(state, list);
  const rows = selectionRows(list, groups);
  const at = rows.findIndex(row => row.includes(id));
  if (at < 0) return { ...clean, focusId: null };
  const selected = new Set(clean.selectedTabIds);
  let anchor = clean.selectionAnchorId ?? activeId ?? id;
  let focus = at;
  if (mode === 'toggle') {
    const remove = rows[at].every(member => selected.has(member));
    rows[at].forEach(member => remove ? selected.delete(member) : selected.add(member));
    anchor = id;
  } else if (['range', 'extend-up', 'extend-down'].includes(mode)) {
    if (mode !== 'range') focus = Math.max(0, Math.min(rows.length - 1, at + (mode === 'extend-up' ? -1 : 1)));
    const anchorAt = rows.findIndex(row => row.includes(anchor));
    const from = anchorAt < 0 ? at : anchorAt;
    selected.clear();
    for (const row of rows.slice(Math.min(from, focus), Math.max(from, focus) + 1)) row.forEach(member => selected.add(member));
  } else return { ...clean, focusId: null };
  if (selected.size) selected.add(activeId);
  return { ...selectionState([...selected], anchor, list), focusId: rows[focus][0] };
}
root.BlancTabSelection = { emptySelection, selectionRows, selectionState, pruneSelection, selectTabs };
})(globalThis);
