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
// Section = { kind: 'pinned'|'group'|'loose'|'closed', groupId, firstTabId?, collapsed,
//             top, bottom, header: {top,bottom}|null, rows: {id,pinned,top,bottom}[] }
// Ungrouped tabs can sit above, between and below groups (spec 2026-10-17):
// several 'loose' sections may appear, and every gap between groups takes an
// unpinned tab. A loose target's beforeId is a loose tab, a group's first
// drawn tab (above that group), or null (the end of the list).
// Source  = { kind:'tab', id, pinned, groupId, title } | { kind:'group', id, title }
// Intent  = { kind:'tab', id, groupId, beforeId } | { kind:'group', id, beforeGroupId }
(() => {
  'use strict';

  const constants = Object.freeze({
    DRAG_THRESHOLD_PX: 4,
    EDGE_PX: 24,
    MAX_SCROLL_STEP: 12,
    // The ⌘L panel's Recently closed band; main's closed-slot.js owns the
    // same id (a unit test keeps them equal).
    CLOSED_SECTION_ID: 'recently-closed',
  });

  const sections = () => globalThis.TabSections;

  /** Where the Recently closed band sits: the number of top-level items
   * (groups and ungrouped tabs) above it, clamped like main's clampClosedSlot. */
  function closedSlotIndex(snapshot) {
    const count = sections().itemsOf(snapshot?.tabs || []).length;
    const slot = snapshot?.closedSlot;
    return Number.isInteger(slot) && slot > 0 ? Math.min(slot, count) : 0;
  }

  const inside = (y, box) => y >= box.top && y <= box.bottom;

  /** The first tab drawn in a section, for a gap directly above it. */
  const leadOf = (section) => section.firstTabId ?? section.rows[0]?.id ?? null;

  /** Every gap a tab could land in, with which pinned states may use it. */
  function tabSlots(model, sourceId) {
    const slots = [];
    const listed = model.sections;
    for (const [index, section] of listed.entries()) {
      const next = listed[index + 1];
      // What a loose tab dropped at the end of this section sits above: the
      // Recently closed band says so by its id (main keeps the tab above it).
      const nextLead = !next || next.kind === 'pinned' ? null
        : next.kind === 'closed' ? constants.CLOSED_SECTION_ID : leadOf(next);
      if (section.kind === 'closed') {
        // The band never takes tabs, but the places directly above and below
        // it do, ungrouped.
        slots.push({
          y: section.top, groupId: null, pinned: false, unpinned: true,
          pinnedBefore: null, unpinnedBefore: constants.CLOSED_SECTION_ID,
        });
        if (!next) slots.push(gapBelow(section));
        continue;
      }
      if (section.kind === 'group') {
        // The gap directly above a group takes an unpinned tab, ungrouped.
        const lead = leadOf(section);
        if (lead) {
          slots.push({
            y: section.top, groupId: null, pinned: false, unpinned: true,
            pinnedBefore: null, unpinnedBefore: lead,
          });
        }
        if (section.collapsed) {
          if (!next) slots.push(gapBelow(section));
          continue;
        }
      }
      const rows = section.rows;
      const pinCount = section.kind === 'group'
        ? rows.filter((r) => r.pinned).length
        : section.kind === 'pinned' ? rows.length : 0;
      const firstOther = (from, to) => {
        for (let i = from; i < to; i += 1) if (rows[i].id !== sourceId) return rows[i].id;
        return null;
      };
      const looseEnd = section.kind === 'loose' ? nextLead : null;
      if (!rows.length) {
        slots.push({
          y: (section.top + section.bottom) / 2,
          groupId: section.groupId,
          pinnedBefore: null, unpinnedBefore: looseEnd,
          pinned: section.kind !== 'loose', unpinned: section.kind !== 'pinned',
        });
        continue;
      }
      // A heading above a shelf's or run's rows (the rail draws one) is the
      // top of that section, so hovering it never means the section above.
      if (section.kind !== 'group' && section.top < rows[0].top) {
        slots.push({
          y: section.top,
          groupId: section.groupId,
          pinned: section.kind === 'pinned',
          unpinned: section.kind === 'loose',
          pinnedBefore: firstOther(0, pinCount),
          unpinnedBefore: firstOther(0, rows.length) ?? looseEnd,
        });
      }
      for (let i = 0; i <= rows.length; i += 1) {
        slots.push({
          y: i < rows.length ? rows[i].top : rows[rows.length - 1].bottom,
          groupId: section.groupId,
          pinned: section.kind !== 'loose' && i <= pinCount,
          unpinned: section.kind !== 'pinned' && i >= pinCount,
          pinnedBefore: firstOther(i, pinCount),
          unpinnedBefore: firstOther(Math.max(i, pinCount), rows.length) ?? looseEnd,
        });
      }
      // Below the last group: the end of the list, ungrouped.
      if (section.kind === 'group' && !next) slots.push(gapBelow(section));
    }
    return slots;
  }

  function gapBelow(section) {
    return { y: section.bottom, groupId: null, pinned: false, unpinned: true, pinnedBefore: null, unpinnedBefore: null };
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
      const allowed = source.pinned ? slot.pinned : slot.unpinned;
      const bestAllowed = best && (source.pinned ? best.pinned : best.unpinned);
      if (!best || Math.abs(slot.y - y) < Math.abs(best.y - y) ||
          (slot.y === best.y && allowed && !bestAllowed)) best = slot;
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
    // Top-level items, top to bottom: groups, the Recently closed band (which
    // also moves like a group) and each ungrouped tab. A group can land
    // directly above any of them.
    const items = [];
    for (const section of model.sections) {
      if (section.kind === 'group' || section.kind === 'closed') {
        items.push({ id: section.groupId, top: section.top, bottom: section.bottom });
      } else if (section.kind === 'loose') {
        for (const r of section.rows) items.push({ id: r.id, top: r.top, bottom: r.bottom });
      }
    }
    if (!items.some((item) => item.id === groupId)) return null;
    let bestIndex = 0;
    let bestY = items[0].top;
    for (let i = 1; i <= items.length; i += 1) {
      const slotY = i < items.length ? items[i].top : items[items.length - 1].bottom;
      if (Math.abs(slotY - y) < Math.abs(bestY - y)) { bestIndex = i; bestY = slotY; }
    }
    let beforeGroupId = null;
    for (let i = bestIndex; i < items.length; i += 1) {
      if (items[i].id !== groupId) { beforeGroupId = items[i].id; break; }
    }
    return {
      intent: { kind: 'group', id: groupId, beforeGroupId },
      indicator: { type: 'line', y: bestY },
    };
  }

  /** Eligible buckets for a tab of pinned state `pinned`, in render order.
   * Unpinned tabs also get every run of ungrouped tabs and an empty bucket
   * for each gap between groups with no run in it; a loose bucket's
   * `endBefore` is what a tab at its end sits above. Collapsed groups (other
   * than the tab's own) are skipped, but the gaps around them are not. */
  function eligibleBuckets(snapshot, pinned, ownGroupId, withClosed = false) {
    const tabs = snapshot.tabs || [];
    const groups = snapshot.groups || [];
    const collapsed = (groupId) => !!groups.find((g) => g.id === groupId)?.collapsed && groupId !== ownGroupId;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const list = sections().sectionsOf(tabs);
    const buckets = [];
    if (pinned) {
      buckets.push({ groupId: null, members: tabs.filter((t) => t.pinned && !t.groupId) });
      for (const section of list) {
        if (!section.groupId || collapsed(section.groupId)) continue;
        buckets.push({ groupId: section.groupId, members: section.tabIds.map((id) => byId.get(id)).filter((t) => t.pinned) });
      }
      return buckets;
    }
    // Top-level units in order: each ungrouped tab, each group, and (in the
    // island) the Recently closed band at its item index.
    const units = [];
    for (const section of list) {
      if (section.groupId) units.push({ section });
      else for (const tabId of section.tabIds) units.push({ tab: byId.get(tabId) });
    }
    if (withClosed && snapshot.closed?.length) units.splice(closedSlotIndex(snapshot), 0, { band: true });
    let run = null;
    let needGap = true;
    for (const unit of units) {
      if (unit.tab) {
        if (!run) {
          run = { groupId: null, members: [], endBefore: null };
          buckets.push(run);
        }
        run.members.push(unit.tab);
        needGap = false;
        continue;
      }
      const lead = unit.band ? constants.CLOSED_SECTION_ID : unit.section.tabIds[0];
      if (run) run.endBefore = lead;
      else if (needGap) buckets.push({ groupId: null, members: [], endBefore: lead });
      run = null;
      needGap = true;
      if (unit.band || collapsed(unit.section.groupId)) continue;
      buckets.push({
        groupId: unit.section.groupId,
        members: unit.section.tabIds.map((tabId) => byId.get(tabId)).filter((t) => !t.pinned),
      });
    }
    if (needGap) buckets.push({ groupId: null, members: [], endBefore: null });
    return buckets;
  }

  /** `withClosed`: the island, where the Recently closed band splits a run
   * and a tab steps across it one place at a time. */
  function keyboardTabMove(snapshot, id, direction, { withClosed = false } = {}) {
    const tab = (snapshot?.tabs || []).find((t) => t.id === id);
    if (!tab) return null;
    const pinned = !!tab.pinned;
    const buckets = eligibleBuckets(snapshot, pinned, tab.groupId ?? null, withClosed);
    const bi = buckets.findIndex((b) => b.members.some((t) => t.id === id));
    if (bi === -1) return null;
    const members = buckets[bi].members;
    const mi = members.findIndex((t) => t.id === id);
    const intent = (groupId, beforeId) => ({ intent: { kind: 'tab', id, groupId, beforeId } });
    // The end of a bucket: null for a group, what follows the run for a loose one.
    const end = (bucket) => bucket.endBefore ?? null;
    if (direction === 'down') {
      if (mi < members.length - 1) return intent(buckets[bi].groupId, members[mi + 2]?.id ?? end(buckets[bi]));
      const next = buckets[bi + 1];
      return next ? intent(next.groupId, next.members[0]?.id ?? end(next)) : { stop: 'bottom' };
    }
    if (mi > 0) return intent(buckets[bi].groupId, members[mi - 1].id);
    const prev = buckets[bi - 1];
    return prev ? intent(prev.groupId, end(prev)) : { stop: 'top' };
  }

  /** `withClosed`: the island, where the Recently closed band sits among the
   * items (while it has entries) and can be stepped past or moved itself. A
   * run of ungrouped tabs counts as one place. */
  function keyboardGroupMove(snapshot, groupId, direction, { withClosed = false } = {}) {
    const items = sections().itemsOf(snapshot?.tabs || []);
    if (withClosed && snapshot?.closed?.length) {
      items.splice(closedSlotIndex(snapshot), 0, { id: constants.CLOSED_SECTION_ID, groupId: constants.CLOSED_SECTION_ID });
    }
    const order = [];
    for (const [index, item] of items.entries()) {
      const loose = !item.groupId;
      if (loose && index > 0 && !items[index - 1].groupId) continue; // inside a run
      order.push(item.id);
    }
    const gi = order.indexOf(groupId);
    if (gi === -1) return null;
    const intent = (beforeGroupId) => ({ intent: { kind: 'group', id: groupId, beforeGroupId } });
    if (direction === 'down') {
      return gi === order.length - 1 ? { stop: 'bottom' } : intent(order[gi + 2] ?? null);
    }
    return gi === 0 ? { stop: 'top' } : intent(order[gi - 1]);
  }

  // Announcements come from the interface catalog: i18n.js publishes
  // blancI18n on every chrome document; tests inject an English translator.
  function describeMove(snapshot, intent) {
    const groups = snapshot?.groups || [];
    const tabs = snapshot?.tabs || [];
    const nameOf = (gid) => groups.find((g) => g.id === gid)?.name ?? '';
    if (intent.kind === 'group' && intent.id === constants.CLOSED_SECTION_ID) return globalThis.blancI18n.t('drag.movedClosed');
    if (intent.kind === 'group') return globalThis.blancI18n.t('drag.movedGroup', { group: nameOf(intent.id) });
    const tab = tabs.find((t) => t.id === intent.id);
    const from = tab?.groupId ?? null;
    const to = intent.groupId ?? null;
    if (from === to) {
      return tab?.title
        ? globalThis.blancI18n.t('drag.movedTab', { title: tab.title })
        : globalThis.blancI18n.t('drag.movedTabUntitled');
    }
    const dissolves = from && tabs.filter((t) => t.groupId === from).length === 1;
    if (to) {
      return dissolves
        ? globalThis.blancI18n.t('drag.movedToRemoved', { group: nameOf(to), from: nameOf(from) })
        : globalThis.blancI18n.t('drag.movedTo', { group: nameOf(to) });
    }
    return dissolves
      ? globalThis.blancI18n.t('drag.movedOutOfRemoved', { from: nameOf(from) })
      : globalThis.blancI18n.t('drag.movedOutOf', { group: nameOf(from) });
  }

  function createDragSession(fx) {
    let phase = 'idle';
    let pointerId = null;
    let source = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let model = null;
    let hit = null;
    let frame = 0;
    // Bumped by every end(); a drop result only counts for the drop that
    // issued it. There is deliberately no timeout: the IPC cannot be
    // cancelled, so a renderer timeout could announce a failure main later
    // turns into a success. Main's broadcast stays the source of truth.
    let generation = 0;

    // Beside the list (over page content) is never a target, whatever the y.
    const besideList = () => model
      && Number.isFinite(model.left) && Number.isFinite(model.right)
      && (lastX < model.left || lastX > model.right);

    const resolve = () => {
      if (besideList()) { hit = null; fx.setIndicator(null); return; }
      hit = source.kind === 'group'
        ? resolveGroupDrop(model, source.id, lastY)
        : resolveTabDrop(model, source, lastY);
      fx.setIndicator(hit ? hit.indicator : null);
    };

    const edgeSpeed = () => {
      if (!model) return 0;
      const { EDGE_PX, MAX_SCROLL_STEP } = constants;
      if (lastY < model.top + EDGE_PX) {
        return -Math.ceil(((model.top + EDGE_PX - lastY) / EDGE_PX) * MAX_SCROLL_STEP);
      }
      if (lastY > model.bottom - EDGE_PX) {
        return Math.ceil(((lastY - (model.bottom - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_STEP);
      }
      return 0;
    };

    const tick = () => {
      frame = 0;
      if (phase !== 'dragging') return;
      const speed = edgeSpeed();
      if (!speed) return;
      fx.scrollBy(Math.max(-constants.MAX_SCROLL_STEP, Math.min(constants.MAX_SCROLL_STEP, speed)));
      model = fx.readModel();
      resolve();
      frame = fx.requestFrame(tick);
    };

    const scheduleScroll = () => {
      if (!frame && edgeSpeed()) frame = fx.requestFrame(tick);
    };

    /** The single teardown every exit path uses (spec §2, endDrag). */
    function end() {
      const wasActive = phase === 'dragging' || phase === 'settling';
      const wasDragging = phase === 'dragging';
      generation += 1;
      if (frame) fx.cancelFrame(frame);
      frame = 0;
      const id = pointerId;
      phase = 'idle';
      pointerId = null;
      hit = null;
      if (!wasActive) { source = null; return; }
      if (wasDragging) fx.release(id);
      fx.removeGhost();
      fx.setIndicator(null);
      fx.setSourceDim(false);
      fx.setDragging(false);
      source = null;
      model = null;
      fx.onActiveChange(false);
    }

    function start() {
      phase = 'dragging';
      fx.capture(pointerId);
      fx.setDragging(true);
      model = fx.readModel();
      fx.setSourceDim(true);
      fx.showGhost(source, lastY);
      fx.suppressClick();
      fx.onActiveChange(true);
    }

    function drop() {
      const intent = hit?.intent;
      if (!intent) { end(); return; }
      const failedMessage = source.title ? globalThis.blancI18n.t('drag.failed', { title: source.title })
        : source.kind === 'group' ? globalThis.blancI18n.t('drag.failedGroup') : globalThis.blancI18n.t('drag.failedTab');
      // Settling first: releasing capture can fire lostpointercapture
      // synchronously, and that must not cancel the drop being committed.
      phase = 'settling';
      fx.release(pointerId);
      fx.removeGhost();
      fx.setIndicator(null);
      if (frame) { fx.cancelFrame(frame); frame = 0; }
      const mine = generation;
      const finish = (ok) => {
        if (mine !== generation || phase !== 'settling') return; // aborted or already ended
        if (ok !== true) fx.announce(failedMessage);
        end();
      };
      let result;
      try { result = fx.onDrop(intent); } catch { finish(false); return; }
      Promise.resolve(result).then(finish, () => finish(false));
    }

    function sourceStillValid(payload) {
      if (source.kind === 'group' && source.id === constants.CLOSED_SECTION_ID) return !!payload?.closed?.length;
      if (source.kind === 'group') return (payload?.groups || []).some((g) => g.id === source.id);
      const tab = (payload?.tabs || []).find((t) => t.id === source.id);
      if (!tab) return false;
      if (!!tab.pinned !== !!source.pinned) return false;
      const original = source.groupId ?? null;
      if ((tab.groupId ?? null) !== original) return false;
      if (original !== null && !(payload?.groups || []).some((g) => g.id === original)) return false;
      return true;
    }

    return {
      phase: () => phase,
      isActive: () => phase === 'dragging' || phase === 'settling',
      pointerDown(event) {
        if (phase !== 'idle' || !event.source) return;
        phase = 'pending';
        pointerId = event.pointerId;
        source = event.source;
        startX = event.x;
        startY = event.y;
        lastX = event.x;
        lastY = event.y;
      },
      pointerMove(event) {
        if (event.pointerId !== pointerId) return;
        lastX = event.x;
        lastY = event.y;
        if (phase === 'pending') {
          // Total distance from the press point (Euclidean), per the spec.
          if (Math.hypot(event.x - startX, event.y - startY) < constants.DRAG_THRESHOLD_PX) return;
          start();
        }
        if (phase !== 'dragging') return;
        fx.moveGhost(lastY);
        resolve();
        scheduleScroll();
      },
      pointerUp(event) {
        if (event.pointerId !== pointerId) return;
        if (phase === 'pending') { end(); return; }
        if (phase === 'dragging') drop();
      },
      pointerCancel(event) {
        if (event.pointerId === pointerId && (phase === 'pending' || phase === 'dragging')) end();
      },
      lostCapture(event) {
        if (event.pointerId === pointerId && phase === 'dragging') end();
      },
      escape() {
        if (phase === 'dragging') { end(); return true; }
        // Consume, but never cancel a move that has already been sent.
        return phase === 'settling';
      },
      scrolled() {
        if (phase !== 'dragging') return;
        model = fx.readModel();
        resolve();
      },
      notePayload(payload) {
        // While settling, payloads are expected to reflect the move itself.
        if (phase !== 'dragging' || !source) return;
        if (!sourceStillValid(payload)) end();
      },
      /** Forced end for pagehide, overlay hide, list-mode and layout changes:
       * works in every phase and invalidates a pending drop result. */
      cancel() {
        end();
      },
    };
  }

  function attach({ list, document: doc, window: win, enabled = () => true, onDrop, onActiveChange, announce }) {
    list.dataset.dragRoot = '';
    let ghost = null;
    let grabOffset = 0;
    let sourceEl = null;
    let headerTarget = null;
    let suppressClickArmed = false;
    const line = doc.createElement('div');
    line.className = 'tab-drag-line';
    line.hidden = true;
    line.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(line);

    const rectOf = (el) => el.getBoundingClientRect();
    const visible = (r) => r.height > 0;

    function readModel() {
      const listRect = rectOf(list);
      const sections = [];
      for (const el of list.querySelectorAll('[data-drag-section]')) {
        let r = rectOf(el);
        if (!visible(r)) {
          // An empty zone takes no layout space (revealing it would shift every
          // row under the pointer); it is a drop slot exactly where it sits.
          if (!el.classList.contains('drag-empty-zone') || !el.getClientRects().length) continue;
          r = { top: r.top, bottom: r.top };
        }
        const headerEl = el.querySelector('[data-drag-header]');
        const hr = headerEl ? rectOf(headerEl) : null;
        sections.push({
          kind: el.dataset.dragSection,
          groupId: el.dataset.groupId || null,
          firstTabId: el.dataset.firstTabId || null,
          collapsed: el.dataset.collapsed === 'true',
          top: r.top, bottom: r.bottom,
          header: hr && visible(hr) ? { top: hr.top, bottom: hr.bottom } : null,
          rows: [...el.querySelectorAll('[data-drag-tab]')]
            .map((row) => ({ row, r: rectOf(row) }))
            .filter(({ r: rr }) => visible(rr))
            .map(({ row, r: rr }) => ({
              id: row.dataset.tabId, pinned: row.dataset.pinned === 'true', top: rr.top, bottom: rr.bottom,
            })),
        });
      }
      return { top: listRect.top, bottom: listRect.bottom, left: listRect.left, right: listRect.right, sections };
    }

    function sourceFor(target) {
      if (!target?.closest || target.closest('[data-no-drag]')) return null;
      const header = target.closest('[data-drag-header]');
      if (header && list.contains(header)) {
        return { el: header.closest('[data-drag-section]') || header, grab: header,
          source: { kind: 'group', id: header.dataset.groupId, title: header.dataset.dragTitle || '' } };
      }
      const row = target.closest('[data-drag-tab]');
      if (row && list.contains(row)) {
        return { el: row, grab: row, source: {
          kind: 'tab', id: row.dataset.tabId, pinned: row.dataset.pinned === 'true',
          groupId: row.dataset.groupId || null, title: row.dataset.dragTitle || '',
        } };
      }
      return null;
    }

    const session = createDragSession({
      readModel,
      capture: (id) => { try { list.setPointerCapture(id); } catch {} },
      release: (id) => { try { if (list.hasPointerCapture(id)) list.releasePointerCapture(id); } catch {} },
      setDragging: (on) => { if (on) list.dataset.tabDragging = 'true'; else delete list.dataset.tabDragging; },
      setSourceDim: (on) => sourceEl?.classList.toggle('tab-drag-source', on),
      showGhost: (_source, y) => {
        const grab = sourceEl.matches('[data-drag-section]') ? sourceEl.querySelector('[data-drag-header]') : sourceEl;
        const r = rectOf(grab);
        grabOffset = y - r.top;
        ghost = grab.cloneNode(true);
        ghost.classList.add('tab-drag-ghost');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.setProperty('--drag-left', `${r.left}px`);
        ghost.style.setProperty('--drag-width', `${r.width}px`);
        ghost.style.setProperty('--drag-y', `${y - grabOffset}px`);
        doc.body.appendChild(ghost);
      },
      moveGhost: (y) => ghost?.style.setProperty('--drag-y', `${y - grabOffset}px`),
      removeGhost: () => { ghost?.remove(); ghost = null; },
      setIndicator: (indicator) => {
        headerTarget?.classList.remove('tab-drag-target');
        headerTarget = null;
        line.hidden = !(indicator && indicator.type === 'line');
        if (indicator?.type === 'line') {
          const r = rectOf(list);
          line.style.setProperty('--drag-left', `${r.left + 7}px`);
          line.style.setProperty('--drag-width', `${Math.max(0, r.width - 14)}px`);
          line.style.setProperty('--drag-y', `${indicator.y - 1}px`);
        } else if (indicator?.type === 'header') {
          headerTarget = list.querySelector(`[data-drag-header][data-group-id="${CSS.escape(indicator.groupId)}"]`);
          headerTarget?.classList.add('tab-drag-target');
        }
      },
      scrollBy: (dy) => { list.scrollTop += dy; },
      onDrop,
      onActiveChange: (active) => {
        if (!active) sourceEl = null;
        onActiveChange?.(active);
      },
      announce,
      requestFrame: (fn) => win.requestAnimationFrame(fn),
      cancelFrame: (h) => win.cancelAnimationFrame(h),
      suppressClick: () => { suppressClickArmed = true; },
    });

    list.addEventListener('pointerdown', (event) => {
      suppressClickArmed = false;
      if (event.button !== 0 || !event.isPrimary || !enabled()) return;
      const found = sourceFor(event.target);
      if (!found) return;
      sourceEl = found.el;
      session.pointerDown({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, source: found.source });
    });
    list.addEventListener('pointermove', (event) => {
      session.pointerMove({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    });
    list.addEventListener('pointerup', (event) => session.pointerUp({ pointerId: event.pointerId }));
    list.addEventListener('pointercancel', (event) => session.pointerCancel({ pointerId: event.pointerId }));
    list.addEventListener('lostpointercapture', (event) => session.lostCapture({ pointerId: event.pointerId }));
    list.addEventListener('scroll', () => session.scrolled(), { passive: true });
    // A completed drag must not also activate the row or fold the header the
    // press started on.
    doc.addEventListener('click', (event) => {
      if (!suppressClickArmed) return;
      suppressClickArmed = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    // window capture runs before any document-level key handler.
    win.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && session.escape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    win.addEventListener('pagehide', () => session.cancel());

    return {
      isActive: () => session.isActive(),
      cancel: () => session.cancel(),
      notePayload: (payload) => session.notePayload(payload),
    };
  }

  globalThis.blancTabDrag = {
    constants, closedSlotIndex, resolveTabDrop, resolveGroupDrop, keyboardTabMove, keyboardGroupMove, describeMove,
    createDragSession, attach,
  };
})();
