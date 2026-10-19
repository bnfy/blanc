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
const REVEAL_EDGE_PX = 6;
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
 * or keeps it revealed. A position outside the window never holds it.
 * @param {{x: number, y: number}|null} point
 * @param {{revealed: boolean, chromeHeight: number, width: number, height: number}} state
 */
function pointHoldsIsland(point, { revealed, chromeHeight, width, height }) {
  if (!point || !finite(point.x) || !finite(point.y)) return false;
  if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) return false;
  if (point.y <= REVEAL_EDGE_PX) return true;
  return revealed === true && point.y < Math.max(0, chromeHeight) + HIDE_SLACK_PX;
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
  pointHoldsIsland,
  islandPinned,
  stripHidden,
};
