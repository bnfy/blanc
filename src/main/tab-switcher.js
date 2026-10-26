'use strict';

/**
 * Ctrl-Tab by most recent use
 * (docs/superpowers/specs/2026-10-24-mru-tab-switcher-design.md).
 *
 * Holding Ctrl and pressing Tab steps back through the window's tabs in the
 * order they were last used; releasing Ctrl lands on the pick, Esc cancels.
 * Nothing changes until the release, so stepping never moves focus or wakes a
 * quiet tab. This module is the order, the per-window session and the
 * platform gate; main.js feeds it keys. Pure, no Electron.
 */

/** Settings → Switch tabs with Ctrl+Tab. Device-local, never synced. */
const TAB_SWITCH_ORDERS = Object.freeze(['recent', 'list']);

function normalizeTabSwitchOrder(value) {
  return TAB_SWITCH_ORDERS.includes(value) ? value : 'recent';
}

/** Where the Ctrl release is proven to reach Blanc (spec §10, D5). Other
 * platforms keep switching by position until the manual probe clears them. */
function recentOrderAvailable(platform) {
  return platform === 'linux';
}

/** The candidates, most recent first: the current tab, then the activation
 * history newest-first, then tabs never activated, in tab-list order. Ids
 * not in `tabOrder` (closed, moved, another space) are skipped, and a split
 * is one entry: its most recently active pane (spec §3.2). */
function switcherOrder({ activeTabId = null, history = [], tabOrder = [], splitOf = () => null }) {
  const inWindow = new Set(tabOrder);
  const seen = new Set();
  const seenSplits = new Set();
  const order = [];
  const add = (id) => {
    if (!inWindow.has(id) || seen.has(id)) return;
    seen.add(id);
    const split = splitOf(id);
    if (split != null) {
      if (seenSplits.has(split)) return;
      seenSplits.add(split);
    }
    order.push(id);
  };
  if (activeTabId != null) add(activeTabId);
  for (let i = history.length - 1; i >= 0; i--) add(history[i]);
  for (const id of tabOrder) add(id);
  return order;
}

/** A new switch: Ctrl+Tab picks the previous tab, Ctrl+Shift+Tab the
 * oldest. null when there is nothing to switch to. */
function startSwitch(order, direction) {
  if (order.length < 2) return null;
  return { order, pick: direction > 0 ? 1 : order.length - 1 };
}

/** One more Tab (or Shift+Tab), wrapping through the current tab. */
function stepSwitch(state, direction) {
  const n = state.order.length;
  return { ...state, pick: (state.pick + direction + n) % n };
}

/**
 * Per-window switch sessions. `orderFor(runtime)` gives switcherOrder's
 * result, `land(runtime, id)` selects a tab, `isLive(runtime, id)` says the
 * tab still belongs to that window.
 */
function createTabSwitcher({ orderFor, land, isLive }) {
  const sessions = new WeakMap();
  return {
    /** Ctrl+Tab (1) or Ctrl+Shift+Tab (-1). False when there is no switch. */
    step(runtime, direction) {
      const current = sessions.get(runtime);
      const next = current ? stepSwitch(current, direction) : startSwitch(orderFor(runtime), direction);
      if (!next) return false;
      sessions.set(runtime, next);
      return true;
    },
    /** Ctrl released: land on the pick. Picking the current tab, or a tab
     * that has gone meanwhile, changes nothing. */
    release(runtime) {
      const session = sessions.get(runtime);
      if (!session) return false;
      sessions.delete(runtime);
      const id = session.order[session.pick];
      if (session.pick === 0 || !isLive(runtime, id)) return false;
      land(runtime, id);
      return true;
    },
    /** Esc, a click, another key or the window losing focus. */
    cancel(runtime) {
      return sessions.delete(runtime);
    },
    isSwitching(runtime) {
      return sessions.has(runtime);
    },
    /** The current pick, for tests and diagnostics. */
    pick(runtime) {
      const session = sessions.get(runtime);
      return session ? session.order[session.pick] : null;
    },
  };
}

module.exports = {
  TAB_SWITCH_ORDERS,
  normalizeTabSwitchOrder,
  recentOrderAvailable,
  switcherOrder,
  startSwitch,
  stepSwitch,
  createTabSwitcher,
};
