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

/** Where the Ctrl release is proven to reach Blanc with real keys (spec §10,
 * D5): browser-shortcuts-smoke.mjs drives each of these with native input. */
const RECENT_ORDER_PLATFORMS = Object.freeze(['linux', 'win32', 'darwin']);

function recentOrderAvailable(platform) {
  return RECENT_ORDER_PLATFORMS.includes(platform);
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
  return { order, pick: direction > 0 ? 1 : order.length - 1, steps: 1 };
}

/** One more Tab (or Shift+Tab), wrapping through the current tab. */
function stepSwitch(state, direction) {
  const n = state.order.length;
  return { ...state, pick: (state.pick + direction + n) % n, steps: (state.steps ?? 1) + 1 };
}

/** The picked tab was closed (Ctrl+W, D4): it leaves the order and the pick
 * moves one step older, wrapping. null when only the current tab is left. */
function removeFromSwitch(state, id) {
  const index = state.order.indexOf(id);
  if (index < 0) return state;
  const order = state.order.filter((entry) => entry !== id);
  if (order.length < 2) return null;
  let pick = state.pick > index ? state.pick - 1 : state.pick;
  if (pick >= order.length) pick = 0;
  if (state.pick === index && pick === 0) pick = order.length > 1 ? 1 : 0;
  return { ...state, order, pick };
}

/** Where the card draws (spec §3.3): one row of up to eight tiles, centred
 * over the page pane just under the Island, kept inside the window. The view
 * includes room for the card's shadow; the card itself is CARD_HEIGHT tall. */
const SWITCHER_TILE = 56;
const SWITCHER_TILES = 8;
const SWITCHER_GAP = 8;
const SWITCHER_PAD = 12;
const SWITCHER_SHADOW = 24;
const SWITCHER_CARD_HEIGHT = 124;
function switcherBounds({ pageX = 0, pageWidth, windowHeight, top }) {
  const card = SWITCHER_TILES * SWITCHER_TILE + (SWITCHER_TILES - 1) * SWITCHER_GAP + SWITCHER_PAD * 2;
  const width = Math.max(0, Math.min(card + SWITCHER_SHADOW * 2, Math.round(pageWidth)));
  const x = Math.round(pageX + (pageWidth - width) / 2);
  const y = Math.max(0, Math.round(top));
  const height = Math.max(0, Math.min(SWITCHER_CARD_HEIGHT + SWITCHER_SHADOW * 2, Math.round(windowHeight) - y));
  return { x, y, width, height };
}

/**
 * Per-window switch sessions. `orderFor(runtime)` gives switcherOrder's
 * result, `land(runtime, id)` selects a tab, `isLive(runtime, id)` says the
 * tab still belongs to that window, and `onChange(runtime)` runs after every
 * step, removal and end (the card follows it).
 */
function createTabSwitcher({ orderFor, land, isLive, onChange = () => {} }) {
  const sessions = new WeakMap();
  return {
    /** Ctrl+Tab (1) or Ctrl+Shift+Tab (-1). False when there is no switch. */
    step(runtime, direction) {
      const current = sessions.get(runtime);
      const next = current ? stepSwitch(current, direction) : startSwitch(orderFor(runtime), direction);
      if (!next) return false;
      sessions.set(runtime, next);
      onChange(runtime);
      return true;
    },
    /** Ctrl released: land on the pick. Picking the current tab, or a tab
     * that has gone meanwhile, changes nothing. */
    release(runtime) {
      const session = sessions.get(runtime);
      if (!session) return false;
      sessions.delete(runtime);
      const id = session.order[session.pick];
      const lands = session.pick !== 0 && isLive(runtime, id);
      if (lands) land(runtime, id);
      onChange(runtime);
      return lands;
    },
    /** A click on a card entry: land on it at once and end the switch. */
    choose(runtime, id) {
      const session = sessions.get(runtime);
      if (!session || !session.order.includes(id)) return false;
      sessions.delete(runtime);
      const lands = id !== session.order[0] && isLive(runtime, id);
      if (lands) land(runtime, id);
      onChange(runtime);
      return lands;
    },
    /** Esc, a click, another key or the window losing focus. */
    cancel(runtime) {
      if (!sessions.delete(runtime)) return false;
      onChange(runtime);
      return true;
    },
    isSwitching(runtime) {
      return sessions.has(runtime);
    },
    /** The current pick, for tests and diagnostics. */
    pick(runtime) {
      const session = sessions.get(runtime);
      return session ? session.order[session.pick] : null;
    },
    /** The session as the card draws it: `{ order, pick, steps }` or null. */
    session(runtime) {
      return sessions.get(runtime) ?? null;
    },
    /** The picked tab was closed: drop it and move the pick (D4). The
     * session ends when nothing is left to switch to. */
    removed(runtime, id) {
      const session = sessions.get(runtime);
      if (!session) return false;
      const next = removeFromSwitch(session, id);
      if (next) sessions.set(runtime, next);
      else sessions.delete(runtime);
      onChange(runtime);
      return true;
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
  removeFromSwitch,
  switcherBounds,
  SWITCHER_CARD_HEIGHT,
  SWITCHER_SHADOW,
  createTabSwitcher,
};
