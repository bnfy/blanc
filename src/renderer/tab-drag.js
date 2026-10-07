// Shared drag-to-reorder for the vertical rail (chrome document) and the
// expanded island (overlay document). Main remains the only mutator: this file
// only turns pointer/keyboard input into a proposed intent for tabs:move or
// groups:reorder. Spec: docs/superpowers/specs/2026-10-07-drag-reorder-tabs-groups-design.md
//
// Layers, top to bottom:
//   1. pure resolvers + keyboard helper + describeMove (no DOM; unit-tested)
//   2. createDragSession: pure state machine with injected effects (unit-tested)
//   3. attach: the thin DOM adapter both surfaces use (acceptance-tested)
//
// Model   = { top, bottom, sections: Section[] }
// Section = { kind: 'pinned'|'group'|'loose', groupId, collapsed, top, bottom,
//             header: {top,bottom}|null, rows: {id,pinned,top,bottom}[] }
// Source  = { kind:'tab', id, pinned, groupId, title } | { kind:'group', id, title }
// Intent  = { kind:'tab', id, groupId, beforeId } | { kind:'group', id, beforeGroupId }
(() => {
  'use strict';

  const constants = Object.freeze({
    DRAG_THRESHOLD_PX: 4,
    EDGE_PX: 24,
    MAX_SCROLL_STEP: 12,
  });

  const inside = (y, box) => y >= box.top && y <= box.bottom;

  /** Every gap a tab could land in, with which pinned states may use it. */
  function tabSlots(model, sourceId) {
    const slots = [];
    for (const section of model.sections) {
      if (section.kind === 'group' && section.collapsed) continue;
      const rows = section.rows;
      const pinCount = section.kind === 'group'
        ? rows.filter((r) => r.pinned).length
        : section.kind === 'pinned' ? rows.length : 0;
      const firstOther = (from, to) => {
        for (let i = from; i < to; i += 1) if (rows[i].id !== sourceId) return rows[i].id;
        return null;
      };
      if (!rows.length) {
        slots.push({
          y: (section.top + section.bottom) / 2,
          groupId: section.groupId,
          pinnedBefore: null, unpinnedBefore: null,
          pinned: section.kind !== 'loose', unpinned: section.kind !== 'pinned',
        });
        continue;
      }
      for (let i = 0; i <= rows.length; i += 1) {
        slots.push({
          y: i < rows.length ? rows[i].top : rows[rows.length - 1].bottom,
          groupId: section.groupId,
          pinned: section.kind !== 'loose' && i <= pinCount,
          unpinned: section.kind !== 'pinned' && i >= pinCount,
          pinnedBefore: firstOther(i, pinCount),
          unpinnedBefore: firstOther(Math.max(i, pinCount), rows.length),
        });
      }
    }
    return slots;
  }

  function resolveTabDrop(model, source, y) {
    if (!model || !source || !(y >= model.top && y <= model.bottom)) return null;
    for (const section of model.sections) {
      const h = section.kind === 'group' ? section.header : null;
      if (!h || !inside(y, h)) continue;
      const quarter = (h.bottom - h.top) / 4;
      if (y >= h.top + quarter && y <= h.bottom - quarter) {
        return {
          intent: { kind: 'tab', id: source.id, groupId: section.groupId, beforeId: null },
          indicator: { type: 'header', groupId: section.groupId },
        };
      }
    }
    let best = null;
    for (const slot of tabSlots(model, source.id)) {
      if (!best || Math.abs(slot.y - y) < Math.abs(best.y - y)) best = slot;
    }
    if (!best) return null;
    const allowed = source.pinned ? best.pinned : best.unpinned;
    if (!allowed) return null;
    return {
      intent: {
        kind: 'tab', id: source.id, groupId: best.groupId,
        beforeId: source.pinned ? best.pinnedBefore : best.unpinnedBefore,
      },
      indicator: { type: 'line', y: best.y },
    };
  }

  function resolveGroupDrop(model, groupId, y) {
    if (!model || !(y >= model.top && y <= model.bottom)) return null;
    const groups = model.sections.filter((s) => s.kind === 'group');
    if (!groups.some((s) => s.groupId === groupId)) return null;
    let bestIndex = 0;
    let bestY = groups[0].top;
    for (let i = 1; i <= groups.length; i += 1) {
      const slotY = i < groups.length ? groups[i].top : groups[groups.length - 1].bottom;
      if (Math.abs(slotY - y) < Math.abs(bestY - y)) { bestIndex = i; bestY = slotY; }
    }
    let beforeGroupId = null;
    for (let i = bestIndex; i < groups.length; i += 1) {
      if (groups[i].groupId !== groupId) { beforeGroupId = groups[i].groupId; break; }
    }
    return {
      intent: { kind: 'group', id: groupId, beforeGroupId },
      indicator: { type: 'line', y: bestY },
    };
  }

  /** Eligible buckets for a tab of pinned state `pinned`, in render order. */
  function eligibleBuckets(snapshot, pinned, ownGroupId) {
    const tabs = snapshot.tabs || [];
    const buckets = [];
    if (pinned) buckets.push({ groupId: null, members: tabs.filter((t) => t.pinned && !t.groupId) });
    for (const group of snapshot.groups || []) {
      if (group.collapsed && group.id !== ownGroupId) continue;
      buckets.push({
        groupId: group.id,
        members: tabs.filter((t) => t.groupId === group.id && !!t.pinned === pinned),
      });
    }
    if (!pinned) buckets.push({ groupId: null, members: tabs.filter((t) => !t.pinned && !t.groupId) });
    return buckets;
  }

  function keyboardTabMove(snapshot, id, direction) {
    const tab = (snapshot?.tabs || []).find((t) => t.id === id);
    if (!tab) return null;
    const pinned = !!tab.pinned;
    const buckets = eligibleBuckets(snapshot, pinned, tab.groupId ?? null);
    const bi = buckets.findIndex((b) => b.members.some((t) => t.id === id));
    if (bi === -1) return null;
    const members = buckets[bi].members;
    const mi = members.findIndex((t) => t.id === id);
    const intent = (groupId, beforeId) => ({ intent: { kind: 'tab', id, groupId, beforeId } });
    if (direction === 'down') {
      if (mi < members.length - 1) return intent(buckets[bi].groupId, members[mi + 2]?.id ?? null);
      const next = buckets[bi + 1];
      return next ? intent(next.groupId, next.members[0]?.id ?? null) : { stop: 'bottom' };
    }
    if (mi > 0) return intent(buckets[bi].groupId, members[mi - 1].id);
    const prev = buckets[bi - 1];
    return prev ? intent(prev.groupId, null) : { stop: 'top' };
  }

  function keyboardGroupMove(snapshot, groupId, direction) {
    const groups = snapshot?.groups || [];
    const gi = groups.findIndex((g) => g.id === groupId);
    if (gi === -1) return null;
    const intent = (beforeGroupId) => ({ intent: { kind: 'group', id: groupId, beforeGroupId } });
    if (direction === 'down') {
      return gi === groups.length - 1 ? { stop: 'bottom' } : intent(groups[gi + 2]?.id ?? null);
    }
    return gi === 0 ? { stop: 'top' } : intent(groups[gi - 1].id);
  }

  function describeMove(snapshot, intent) {
    const groups = snapshot?.groups || [];
    const tabs = snapshot?.tabs || [];
    const nameOf = (gid) => groups.find((g) => g.id === gid)?.name ?? '';
    if (intent.kind === 'group') return `Moved group ${nameOf(intent.id)}`;
    const tab = tabs.find((t) => t.id === intent.id);
    const from = tab?.groupId ?? null;
    const to = intent.groupId ?? null;
    if (from === to) return `Moved ${tab?.title || 'tab'}`;
    const base = to ? `Moved to ${nameOf(to)}` : `Moved out of ${nameOf(from)}`;
    const dissolves = from && tabs.filter((t) => t.groupId === from).length === 1;
    return dissolves ? `${base}. Group ${nameOf(from)} removed` : base;
  }

  globalThis.blancTabDrag = {
    constants, resolveTabDrop, resolveGroupDrop, keyboardTabMove, keyboardGroupMove, describeMove,
  };
})();
