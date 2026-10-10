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

  // Announcements come from the interface catalog: i18n.js publishes
  // blancI18n on every chrome document; tests inject an English translator.
  function describeMove(snapshot, intent) {
    const groups = snapshot?.groups || [];
    const tabs = snapshot?.tabs || [];
    const nameOf = (gid) => groups.find((g) => g.id === gid)?.name ?? '';
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
    constants, resolveTabDrop, resolveGroupDrop, keyboardTabMove, keyboardGroupMove, describeMove,
    createDragSession, attach,
  };
})();
