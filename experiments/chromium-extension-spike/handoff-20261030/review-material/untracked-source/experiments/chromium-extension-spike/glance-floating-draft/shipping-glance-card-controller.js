'use strict';

// Floating Glance: the one place the card's frame changes (spec
// docs/superpowers/specs/2026-10-20-floating-glance-design.md). Pure apart
// from what main injects. Every move, resize and reset carries the open
// card's generation; main bumps it on every Glance open and close, so a
// message still in flight from a card that has gone (or been replaced) is
// refused. The live frame is held here while a save is pending; the save is
// debounced and a close flushes it, so the next card never inherits a timer.

const {
  EDGES, fractionsToFrame, frameToFractions, moveCardFrame, resizeCardFrame,
} = require('./glance-card');

const SAVE_DELAY_MS = 250;

/**
 * @param {{
 *   isOpen: () => boolean,
 *   generation: () => number,
 *   pageArea: () => {x: number, y: number, width: number, height: number},
 *   readFrame: () => object|null,        the remembered fractions, or null
 *   writeFrame: (fractions: object|null) => boolean,
 *   relayout: () => void,
 *   setTimer?: (fn: Function, ms: number) => any,
 *   clearTimer?: (timer: any) => void,
 * }} deps
 */
function createGlanceCardController(deps) {
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  /** Fractions changed but not yet saved, or undefined. */
  let pending;
  let timer = null;

  const fractions = () => (pending !== undefined ? pending : deps.readFrame());
  const frame = () => fractionsToFrame(fractions(), deps.pageArea());

  function flush() {
    if (timer) clearTimer(timer);
    timer = null;
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    deps.writeFrame(value);
  }

  function current(input) {
    return deps.isOpen() && Number(input?.generation) === deps.generation();
  }

  function apply(next) {
    pending = frameToFractions(next, deps.pageArea());
    if (timer) clearTimer(timer);
    timer = setTimer(flush, SAVE_DELAY_MS);
    deps.relayout();
    return frame();
  }

  return {
    frame,
    flush,
    move(input) {
      if (!current(input)) return null;
      const dx = Number(input.dx);
      const dy = Number(input.dy);
      return apply(moveCardFrame(frame(), Number.isFinite(dx) ? dx : 0, Number.isFinite(dy) ? dy : 0, deps.pageArea()));
    },
    resize(input) {
      if (!current(input)) return null;
      if (!EDGES.includes(input.edge)) return frame();
      const dx = Number(input.dx);
      const dy = Number(input.dy);
      return apply(resizeCardFrame(frame(), input.edge, Number.isFinite(dx) ? dx : 0, Number.isFinite(dy) ? dy : 0, deps.pageArea()));
    },
    reset(input) {
      if (!current(input)) return null;
      if (timer) clearTimer(timer);
      timer = null;
      pending = undefined;
      deps.writeFrame(null);
      deps.relayout();
      return frame();
    },
  };
}

module.exports = { createGlanceCardController, SAVE_DELAY_MS };
