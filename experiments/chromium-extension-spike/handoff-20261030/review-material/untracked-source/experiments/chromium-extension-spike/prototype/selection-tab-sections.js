'use strict';

// One window's tab order as the ⌘L panel and the rail draw it: tab groups and
// runs of ungrouped tabs, in the order of the window's tab list. A group sits
// where its first member is and holds all its members, pins first; ungrouped
// tabs between groups form runs. Ungrouped pins live in the Pinned shelf and
// belong to no section. Pure and DOM-free — the strip and overlay documents
// load it as window.TabSections; main and Node tests require it.
// Spec: docs/superpowers/specs/2026-10-17-ungrouped-tab-placement-design.md
//
// `list` is always [{ id, groupId|null, pinned, splitId? }] in the window's tab order.
(function (root) {
  const isLoose = (tab) => !tab.groupId && !tab.pinned;
  const isShelfPin = (tab) => !tab.groupId && !!tab.pinned;

  /** Groups and runs, top to bottom: [{ key, groupId|null, tabIds }]. A run's
   * key is 'run:' + its first tab id; a group's is its id. */
  function sectionsOf(list) {
    const sections = [];
    const groups = new Map();
    let run = null;
    for (const tab of list) {
      if (isShelfPin(tab)) continue;
      if (isLoose(tab)) {
        if (!run) {
          run = { key: `run:${tab.id}`, groupId: null, tabIds: [] };
          sections.push(run);
        }
        run.tabIds.push(tab.id);
        continue;
      }
      let group = groups.get(tab.groupId);
      if (!group) {
        group = { key: tab.groupId, groupId: tab.groupId, tabIds: [], pins: [] };
        groups.set(tab.groupId, group);
        sections.push(group);
        run = null;
      }
      (tab.pinned ? group.pins : group.tabIds).push(tab.id);
    }
    return sections.map(({ pins, ...section }) => (
      pins ? { ...section, tabIds: [...pins, ...section.tabIds] } : section
    ));
  }

  /** The order sections draw: ungrouped pins first, then every section. */
  function normalizeOrder(list) {
    return [
      ...list.filter(isShelfPin).map((tab) => tab.id),
      ...sectionsOf(list).flatMap((section) => section.tabIds),
    ];
  }

  /** Top-level items: one per group (its id) and one per ungrouped tab. */
  function itemsOf(list) {
    const items = [];
    for (const section of sectionsOf(list)) {
      if (section.groupId) items.push({ id: section.groupId, groupId: section.groupId });
      else for (const id of section.tabIds) items.push({ id, groupId: null });
    }
    return items;
  }

  /** Tab order for items in `itemIds` order. Unknown ids are skipped; items
   * missing from `itemIds` follow in their current order. */
  function layoutItems(itemIds, list) {
    const sections = sectionsOf(list);
    const expand = new Map();
    for (const section of sections) {
      if (section.groupId) expand.set(section.groupId, section.tabIds);
      else for (const id of section.tabIds) expand.set(id, [id]);
    }
    const order = list.filter(isShelfPin).map((tab) => tab.id);
    const placed = new Set();
    const place = (id) => {
      if (placed.has(id) || !expand.has(id)) return;
      placed.add(id);
      order.push(...expand.get(id));
    };
    for (const id of itemIds) place(id);
    for (const item of itemsOf(list)) place(item.id);
    return order;
  }

  /** How builds before sections drew a window: ungrouped pins, groups in
   * `groupIds` order (then any other group by first appearance), then every
   * ungrouped tab. Used once, for a window saved without `sectionOrder`. */
  function legacyOrder(list, groupIds = []) {
    const sections = sectionsOf(list);
    const groupSections = sections.filter((section) => section.groupId);
    const rank = (groupId) => {
      const at = groupIds.indexOf(groupId);
      return at === -1 ? groupIds.length : at;
    };
    const ordered = groupSections
      .map((section, index) => ({ section, index }))
      .sort((a, b) => rank(a.section.groupId) - rank(b.section.groupId) || a.index - b.index)
      .map(({ section }) => section);
    return [
      ...list.filter(isShelfPin).map((tab) => tab.id),
      ...ordered.flatMap((section) => section.tabIds),
      ...list.filter(isLoose).map((tab) => tab.id),
    ];
  }

  /** The first tab drawn for a group, or null. */
  function firstTabOf(sections, groupId) {
    return sections.find((section) => section.groupId === groupId)?.tabIds[0] ?? null;
  }

  /** `order` with `id` moved to just after the last other member of
   * `groupId`; unchanged when it has no other member. */
  function placeInGroup(order, list, id, groupId) {
    const byId = new Map(list.map((tab) => [tab.id, tab]));
    const others = order.filter((tabId) => tabId !== id && byId.get(tabId)?.groupId === groupId);
    if (!others.length || !order.includes(id)) return [...order];
    const next = order.filter((tabId) => tabId !== id);
    next.splice(next.indexOf(others[others.length - 1]) + 1, 0, id);
    return next;
  }

  /** Mark an element with a group's color (spec 2026-10-17-tab-group-colors-
   * design.md): `className` plus the --group-color custom property, which the
   * stylesheet turns into the tint, dot or dot fill. An uncolored group (or
   * none) leaves the element untouched. Main only ever sends a preset hex. */
  function paintGroup(el, group, className) {
    const color = group?.color;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/.test(color)) return;
    el.classList.add(className);
    el.style.setProperty('--group-color', color);
  }

  /** Rows for `tabIds` as the panel and the rail draw them (Split View, F53):
   * a split's consecutive tabs collapse into one row. Unknown ids are skipped. */
  function rowsOf(tabIds, list) {
    const byId = new Map(list.map((tab) => [tab.id, tab]));
    const rows = [];
    for (const id of tabIds) {
      const tab = byId.get(id);
      if (!tab) continue;
      const last = rows[rows.length - 1];
      if (tab.splitId && last?.kind === 'split' && last.splitId === tab.splitId) last.tabIds.push(id);
      else if (tab.splitId) rows.push({ kind: 'split', splitId: tab.splitId, tabIds: [id] });
      else rows.push({ kind: 'tab', id });
    }
    return rows;
  }

  /** Cmd/Ctrl+1–9 targets when a window has no groups: every tab in order,
   * with a split counted once, at its first tab. */
  function numberedTabIds(list) {
    return rowsOf(list.map((tab) => tab.id), list).map((row) => (row.kind === 'split' ? row.tabIds[0] : row.id));
  }

  const api = { sectionsOf, normalizeOrder, itemsOf, layoutItems, legacyOrder, firstTabOf, placeInGroup, paintGroup, rowsOf, numberedTabIds };
  if (typeof module !== 'undefined') module.exports = api;
  else root.TabSections = api;
})(typeof window !== 'undefined' ? window : globalThis);
