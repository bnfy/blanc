'use strict';

// Auto-hide Island: pure policy. No require('electron') here — main.js owns
// the timers, the cursor sampling and the child-view bounds.
//
// With the setting on, the page fills the window and the Island strip sits
// underneath it. Touching the window's top edge reveals the strip (pages move
// down to make room, as they do with the setting off); it hides again once the
// pointer has left the strip. Anything that is drawn from the Island (the
// command bar, find, the shield and Spaces menus, Glance) keeps it revealed.

/** How a revealed Island makes room: float over the page (the default), or
 * push the page down as v1.39.0 did. */
const AUTO_HIDE_STYLES = Object.freeze(['float', 'push']);

function normalizeAutoHideStyle(value) {
  return value === 'push' ? 'push' : 'float';
}

/** The band at the top of the window that reveals the Island, in px. */
const REVEAL_EDGE_PX = 10;
/** How far above a floating window's top edge the pointer still counts, in
 * px: an upward move usually overshoots the window's border. */
const REACH_ABOVE_PX = 16;
/** Below that edge, resting this far from the window's top also reveals the
 * Island, after REVEAL_DWELL_MS. A quick reach for a website's own top links
 * passes through without revealing it (the page would move down under the
 * pointer); pausing near the top does. */
const REVEAL_DWELL_BAND_PX = 40;
/** How long the pointer must rest in that band, in ms. */
const REVEAL_DWELL_MS = 300;
/** How far the pointer may drift and still count as resting, in px. */
const REVEAL_DWELL_DRIFT_PX = 8;
/** How often a hidden Island in the focused window samples the cursor. The
 * page's own mouse moves can't be relied on: the pointer may be outside the
 * window, or over a band the platform keeps for itself. */
const REVEAL_WATCH_MS = 120;
/** How far below the strip the pointer may wander before it hides, in px. */
const HIDE_SLACK_PX = 24;
/** How often a revealed Island checks whether the pointer has left it. */
const HIDE_CHECK_MS = 450;
/** The same, while it floats: it covers the page, so it leaves at once. */
const FLOAT_HIDE_CHECK_MS = 120;

function hideCheckDelay(floating) {
  return floating === true ? FLOAT_HIDE_CHECK_MS : HIDE_CHECK_MS;
}
/** How long turning the setting on shows the Island with its how-to tip. */
const INTRO_MS = 5000;

function finite(value) {
  return Number.isFinite(value);
}

/**
 * Whether a pointer position (window content coordinates) reveals the Island
 * or keeps it revealed. A position outside the window holds it only in the
 * `reachAbove` px directly above the window's top edge. The bands start at
 * `left`, the page pane's left edge: the vertical rail's column is its own.
 * A floating Island covers the page, so it gets no slack below the strip.
 * @param {{x: number, y: number}|null} point
 * @param {{revealed: boolean, chromeHeight: number, width: number, height: number, reachAbove?: number, left?: number, floating?: boolean}} state
 */
function pointHoldsIsland(point, { revealed, chromeHeight, width, height, reachAbove = 0, left = 0, floating = false }) {
  if (!point || !finite(point.x) || !finite(point.y)) return false;
  const above = finite(reachAbove) ? Math.max(0, reachAbove) : 0;
  const from = finite(left) ? Math.max(0, left) : 0;
  if (point.x < from || point.y < -above || point.x > width || point.y > height) return false;
  if (point.y <= REVEAL_EDGE_PX) return true;
  const slack = floating === true ? 0 : HIDE_SLACK_PX;
  return revealed === true && point.y < Math.max(0, chromeHeight) + slack;
}

/**
 * One cursor sample for the dwell band. `dwell` is the rest in progress
 * ({anchor, since}) or null; the result carries the next one and whether the
 * rest has lasted long enough to reveal the Island. The instant edge band is
 * pointHoldsIsland's; this covers the band below it. A floating Island has
 * no dwell band: a site's own header sits there (YouTube's search box), and
 * the Island would land on it.
 * @param {{anchor: {x: number, y: number}, since: number}|null} dwell
 * @param {{x: number, y: number}|null} point window content coordinates
 * @param {number} now ms
 * @param {{width: number, left?: number, floating?: boolean}} window `left` is the page pane's left edge
 */
function revealDwellStep(dwell, point, now, { width, left = 0, floating = false }) {
  const from = finite(left) ? Math.max(0, left) : 0;
  const inBand = floating !== true && !!point && finite(point.x) && finite(point.y) &&
    point.x >= from && point.x <= width &&
    point.y > REVEAL_EDGE_PX && point.y <= REVEAL_DWELL_BAND_PX;
  if (!inBand) return { dwell: null, reveal: false };
  const resting = !!dwell && Math.abs(point.x - dwell.anchor.x) <= REVEAL_DWELL_DRIFT_PX &&
    Math.abs(point.y - dwell.anchor.y) <= REVEAL_DWELL_DRIFT_PX;
  if (!resting) return { dwell: { anchor: { x: point.x, y: point.y }, since: now }, reveal: false };
  return { dwell, reveal: now - dwell.since >= REVEAL_DWELL_MS };
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

/** How long the page takes to slide down for the Island, and back up. */
const SLIDE_IN_MS = 160;
const SLIDE_OUT_MS = 200;

/** Ease-out cubic over 0..1: quick to start, settling softly. */
function easeOutCubic(t) {
  const clamped = Math.min(1, Math.max(0, finite(t) ? t : 1));
  return 1 - (1 - clamped) ** 3;
}

/**
 * Where a page-pane view sits while the strip slides in or out. The view only
 * moves: it keeps the taller of its two heights (its bottom runs off the
 * window, which clips it), so the page lays out once at the end instead of on
 * every frame.
 * @param {{x: number, y: number, width: number, height: number}} bounds the view's final bounds
 * @param {{stripTop: number, animatedTop: number}} slide the final and the current strip height
 */
function slidingBounds(bounds, { stripTop, animatedTop }) {
  return {
    x: bounds.x,
    y: Math.round(bounds.y - stripTop + animatedTop),
    width: bounds.width,
    height: bounds.height + stripTop,
  };
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

/* ---- Floating Island ----------------------------------------------------
 * In float mode the page keeps the whole window and small transparent views
 * draw the pill (and, on Windows and Linux, the window controls and the
 * main-menu button) over it. Each view is tight around its element: a
 * transparent pixel still takes clicks, so anything wider would steal them
 * from the page beside the pill. */

/** The invisible band along the top of the page pane that drags the window. */
const DRAG_BAND_PX = 6;
/** Room around the floating pill for its shadow, in px. */
const FLOAT_SIDE_PX = 20;
const FLOAT_BOTTOM_PX = 24;
/** Room around the floating window controls and menu button, in px. */
const FLOAT_CHROME_PAD_PX = 8;

/** How much of the strip stays uncovered while the page covers it. Chromium
 * on Linux treats the window document as occluded once an opaque page view
 * covers it whole: it reports visibilityState 'hidden' and no longer syncs
 * its size, so the island-rect and window-controls reports that place the
 * floating Island go stale after a resize (the pill came back off-centre and
 * the controls sat beside their buttons in the 2026-10-20 VM check). One row
 * left showing keeps it laid out; it paints the page's sampled top colour.
 * macOS and Windows keep a covered document visible and give the page all. */
const COVERED_STRIP_ROW_PX = 1;

function coveredStripHeight(platform) {
  return platform === 'linux' ? COVERED_STRIP_ROW_PX : 0;
}

/** Whether the page ignores the strip because the Island floats over it.
 * Glance draws its header and divider in the strip, so it lays out as push. */
function floatingLayout({ autoHide, style, glanceOpen }) {
  return autoHide === true && style === 'float' && glanceOpen !== true;
}

/** Which float views a window needs at all. macOS has native traffic lights
 * and a menu bar, so only the pill. */
function floatViewsWanted({ autoHide, style, platform }) {
  const pill = autoHide === true && style === 'float';
  const ownChrome = pill && platform !== 'darwin';
  return { pill, controls: ownChrome, menu: ownChrome };
}

/** Which float views are on screen: the window controls whenever the Island
 * floats, the pill and the menu button only while the Island is visible. */
function floatViewsShown({ floating, islandVisible, platform }) {
  const pill = floating === true && islandVisible === true;
  const ownChrome = floating === true && platform !== 'darwin';
  return { pill, controls: ownChrome, menu: ownChrome && pill };
}

/**
 * A float view's bounds: the element's rect (window coordinates) plus room on
 * the sides and below, from the window's top edge so the element can slide in
 * from above it, clamped to the window. Null for a rect it cannot use.
 * @param {{x: number, y: number, width: number, height: number}|null} rect
 * @param {{windowWidth: number, windowHeight: number, side: number, bottom: number}} room
 */
function floatViewBounds(rect, { windowWidth, windowHeight, side, bottom }) {
  if (!rect || !['x', 'y', 'width', 'height'].every((key) => finite(rect[key])) || rect.width <= 0) return null;
  const x = Math.max(0, Math.floor(rect.x - side));
  const right = Math.min(windowWidth, Math.ceil(rect.x + rect.width + side));
  const height = Math.min(windowHeight, Math.ceil(rect.y + rect.height + bottom));
  if (right <= x || height <= 0) return null;
  return { x, y: 0, width: right - x, height };
}

module.exports = {
  DRAG_BAND_PX,
  FLOAT_SIDE_PX,
  FLOAT_BOTTOM_PX,
  FLOAT_CHROME_PAD_PX,
  COVERED_STRIP_ROW_PX,
  coveredStripHeight,
  floatingLayout,
  floatViewsWanted,
  floatViewsShown,
  floatViewBounds,
  AUTO_HIDE_STYLES,
  normalizeAutoHideStyle,
  REVEAL_EDGE_PX,
  HIDE_SLACK_PX,
  HIDE_CHECK_MS,
  FLOAT_HIDE_CHECK_MS,
  hideCheckDelay,
  INTRO_MS,
  REACH_ABOVE_PX,
  REVEAL_WATCH_MS,
  REVEAL_DWELL_BAND_PX,
  REVEAL_DWELL_MS,
  REVEAL_DWELL_DRIFT_PX,
  revealDwellStep,
  SLIDE_IN_MS,
  SLIDE_OUT_MS,
  easeOutCubic,
  slidingBounds,
  pointHoldsIsland,
  reachAboveWindow,
  islandPinned,
  stripHidden,
};
