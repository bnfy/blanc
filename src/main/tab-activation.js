'use strict';

/**
 * Activation history — which tab to return to when the active tab closes.
 *
 * Each window runtime keeps tab ids in activation order, most recent last,
 * one occurrence per id. Closing the active tab walks the history backward
 * to the most recent surviving tab; the right-neighbor rule in closeTab is
 * the fallback once history is exhausted (e.g. right after session restore,
 * where only the selected tab was ever activated).
 *
 * Pure functions, no Electron. The survivor predicate is a callback so the
 * caller can also require the tab to still belong to its window.
 */

/** New history with `id` as the most recent activation. */
function recordActivation(history, id) {
  const base = Array.isArray(history) ? history : [];
  if (!id) return base.slice();
  const next = base.filter((tid) => tid !== id);
  next.push(id);
  return next;
}

/** Most recent id that passes `isAlive`; null when history is exhausted. */
function previousSurvivor(history, isAlive) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (isAlive(history[i])) return history[i];
  }
  return null;
}

module.exports = { recordActivation, previousSurvivor };
