'use strict';

/**
 * Activation history — which tab to return to or toggle back to.
 *
 * Each window runtime keeps tab ids in activation order, most recent last,
 * one occurrence per id. Closing the active tab walks the history backward
 * to the most recent surviving tab; the right-neighbor rule in closeTab is
 * the fallback once history is exhausted (e.g. right after session restore,
 * where only the selected tab was ever activated). The same history powers
 * the last-active-tab shortcut: selecting the previous entry moves it to the
 * end, so invoking the shortcut again naturally returns to the original tab.
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

/** Most recent live id other than the current selection. */
function previousActiveSurvivor(history, currentId, isAlive) {
  return previousSurvivor(
    history,
    (id) => id !== currentId && isAlive(id)
  );
}

module.exports = { recordActivation, previousSurvivor, previousActiveSurvivor };
