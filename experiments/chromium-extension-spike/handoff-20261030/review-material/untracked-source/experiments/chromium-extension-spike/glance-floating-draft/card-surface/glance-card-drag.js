'use strict';

// Floating Glance: the card's drag lifecycle (spec
// docs/superpowers/specs/2026-10-20-floating-glance-design.md), shared by the
// strip document's header, ring edges and Move or resize control. Pure: the
// caller passes `send` (the bridge call, resolving to the frame main applied
// or null) and `schedule` (requestAnimationFrame).
//
// Each update asks for the frame the pointer wants (start frame plus the whole
// drag) as a step from the last frame main returned, so a card held at the
// page's edge doesn't jump when the pointer comes back. Steps are IPC round
// trips, so a release can arrive while one is in flight: the drag is then
// marked ended, its last position still lands, and nothing after it moves
// the card.
(function (root) {
  function createCardDrag({ send, schedule }) {
    let drag = null;

    function step(current) {
      const dx = current.pointerX - current.startX;
      const dy = current.pointerY - current.startY;
      const start = current.startFrame;
      const last = current.lastFrame;
      if (!current.edge) return { kind: 'move', dx: start.x + dx - last.x, dy: start.y + dy - last.y };
      let stepX = 0;
      let stepY = 0;
      if (current.edge.includes('w')) stepX = start.x + dx - last.x;
      if (current.edge.includes('e')) stepX = start.x + start.width + dx - (last.x + last.width);
      if (current.edge.includes('n')) stepY = start.y + dy - last.y;
      if (current.edge.includes('s')) stepY = start.y + start.height + dy - (last.y + last.height);
      return { kind: 'resize', dx: stepX, dy: stepY };
    }

    function finishIfDone(current) {
      if (drag === current && current.ended && !current.queued && !current.inFlight) drag = null;
    }

    async function flush() {
      const current = drag;
      if (!current || current.inFlight) return;
      current.queued = false;
      const next = step(current);
      if (!next.dx && !next.dy) { finishIfDone(current); return; }
      current.inFlight = true;
      const input = next.kind === 'move'
        ? { generation: current.generation, dx: next.dx, dy: next.dy }
        : { edge: current.edge, generation: current.generation, dx: next.dx, dy: next.dy };
      const frame = await send(next.kind, input);
      current.inFlight = false;
      if (drag !== current) return;
      if (!frame) { drag = null; return; }
      current.lastFrame = frame;
      if (current.queued) schedule(() => flush());
      else finishIfDone(current);
    }

    function queue(current) {
      if (current.queued) return;
      current.queued = true;
      if (!current.inFlight) schedule(() => flush());
    }

    return {
      start({ pointerId, edge, generation, x, y, frame }) {
        drag = {
          pointerId, edge: edge ?? null, generation,
          startX: x, startY: y, pointerX: x, pointerY: y,
          startFrame: frame, lastFrame: frame,
          inFlight: false, queued: false, ended: false,
        };
      },
      move(pointerId, x, y) {
        const current = drag;
        if (!current || current.ended || current.pointerId !== pointerId) return;
        current.pointerX = x;
        current.pointerY = y;
        queue(current);
      },
      end(pointerId, x, y) {
        const current = drag;
        if (!current || current.ended || current.pointerId !== pointerId) return;
        current.pointerX = x;
        current.pointerY = y;
        current.ended = true;
        queue(current);
      },
      /** A layout for a different card generation ends the drag. */
      cancelUnless(generation) {
        if (drag && drag.generation !== generation) drag = null;
      },
      cancel() { drag = null; },
      active() { return !!drag; },
    };
  }

  const api = { createCardDrag };
  if (typeof module !== 'undefined') module.exports = api;
  else root.GlanceCardDrag = api;
})(typeof window !== 'undefined' ? window : globalThis);
