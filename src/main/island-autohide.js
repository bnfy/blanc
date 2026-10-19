'use strict';

// Auto-hide Island: pure policy. No require('electron') here — main.js owns
// the timers, the cursor sampling and the child-view bounds.
//
// With the setting on, the page fills the window and the Island strip sits
// underneath it. Touching the window's top edge reveals the strip (pages move
// down to make room, as they do with the setting off); it hides again once the
// pointer has left the strip. Anything that is drawn from the Island (the
// command bar, find, the shield and Spaces menus, Glance) keeps it revealed.

/** The band at the top of the window that reveals the Island, in px. */
const REVEAL_EDGE_PX = 10;
/** How far above a floating window's top edge the pointer still counts, in
 * px: an upward move usually overshoots the window's border. */
const REACH_ABOVE_PX = 16;
/** How often a hidden Island in the focused window samples the cursor. The
 * page's own mouse moves can't be relied on: the pointer may be outside the
 * window, or over a band the platform keeps for itself. */
const REVEAL_WATCH_MS = 120;
/** How far below the strip the pointer may wander before it hides, in px. */
const HIDE_SLACK_PX = 24;
/** How often a revealed Island checks whether the pointer has left it. */
const HIDE_CHECK_MS = 450;
/** How long turning the setting on shows the Island with its how-to tip. */
const INTRO_MS = 5000;

function finite(value) {
  return Number.isFinite(value);
}

/**
 * Whether a pointer position (window content coordinates) reveals the Island
 * or keeps it revealed. A position outside the window holds it only in the
 * `reachAbove` px directly above the window's top edge.
 * @param {{x: number, y: number}|null} point
 * @param {{revealed: boolean, chromeHeight: number, width: number, height: number, reachAbove?: number}} state
 */
function pointHoldsIsland(point, { revealed, chromeHeight, width, height, reachAbove = 0 }) {
  if (!point || !finite(point.x) || !finite(point.y)) return false;
  const above = finite(reachAbove) ? Math.max(0, reachAbove) : 0;
  if (point.x < 0 || point.y < -above || point.x > width || point.y > height) return false;
  if (point.y <= REVEAL_EDGE_PX) return true;
  return revealed === true && point.y < Math.max(0, chromeHeight) + HIDE_SLACK_PX;
}

/**
 * How far above the window the pointer may be and still count as at its top
 * edge. A window pushed up against the top of the work area (under the macOS
 * menu bar) reaches up to the top of the screen; a floating window gets a
 * short band for overshoot. Screen coordinates throughout.
 * @param {{contentTop: number, workAreaTop: number, displayTop: number}} geometry
 */
function reachAboveWindow({ contentTop, workAreaTop, displayTop }) {
  if (![contentTop, workAreaTop, displayTop].every(finite)) return 0;
  if (contentTop <= workAreaTop + 2) return Math.max(0, contentTop - displayTop);
  return REACH_ABOVE_PX;
}

/**
 * Surfaces that are drawn from, or anchored to, the Island keep it revealed
 * whatever the pointer does.
 * So does the how-to tip shown when the setting is turned on.
 * @param {{overlayMode?: string|null, glanceOpen?: boolean, popupOpen?: boolean, introducing?: boolean}} state
 */
function islandPinned({ overlayMode = null, glanceOpen = false, popupOpen = false, introducing = false } = {}) {
  return !!overlayMode || glanceOpen === true || popupOpen === true || introducing === true;
}

/**
 * Whether the child-view layout should leave the strip out: only with
 * auto-hide on, the Island not revealed and nothing pinning it.
 */
function stripHidden({ autoHide, revealed, pinned }) {
  return autoHide === true && revealed !== true && pinned !== true;
}

module.exports = {
  REVEAL_EDGE_PX,
  HIDE_SLACK_PX,
  HIDE_CHECK_MS,
  INTRO_MS,
  REACH_ABOVE_PX,
  REVEAL_WATCH_MS,
  pointHoldsIsland,
  reachAboveWindow,
  islandPinned,
  stripHidden,
};
