'use strict';

// Floating Glance (spec docs/superpowers/specs/2026-10-20-floating-glance-design.md):
// where the card sits, how it moves and resizes, and the remembered frame.
// Pure: no Electron. Rects are {x, y, width, height} in window coordinates.
// The page area is the window's content area below the Island's resting
// band, whatever the Auto-hide state; the remembered frame is measured
// against it as fractions, so it fits windows of any size.

const CARD_MAX_DEFAULT_WIDTH = 1100;
const CARD_DEFAULT_WIDTH_SHARE = 0.8;
/** Gaps from the Island's resting band and from the window's bottom edge. */
const CARD_TOP_GAP = 16;
const CARD_BOTTOM_GAP = 32;
const CARD_MIN_WIDTH = 360;
const CARD_MIN_HEIGHT = 280;
/** How much of the header must stay on screen (the card stays wholly inside
 * the page area, which keeps all of it). */
const CARD_HEADER_VISIBLE = 48;
/** The resize ring just outside the border; it also holds the shadow. */
const CARD_RING = 8;
/** The header, top border included. */
const CARD_HEADER_HEIGHT = 40;
const CARD_BORDER = 1;
/** A page area smaller than the minimum card: the card fills it less this. */
const CARD_TINY_MARGIN = 8;
/** Keyboard move and resize steps. */
const CARD_KEY_STEP = 16;
const CARD_KEY_STEP_LARGE = 64;

const EDGES = Object.freeze(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

function finite(value) {
  return Number.isFinite(value);
}

function rect(x, y, width, height) {
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function areaOf(pageArea) {
  return {
    x: finite(pageArea?.x) ? pageArea.x : 0,
    y: finite(pageArea?.y) ? pageArea.y : 0,
    width: finite(pageArea?.width) ? Math.max(0, pageArea.width) : 0,
    height: finite(pageArea?.height) ? Math.max(0, pageArea.height) : 0,
  };
}

function tooSmall(area) {
  return area.width < CARD_MIN_WIDTH || area.height < CARD_MIN_HEIGHT;
}

function tinyFrame(area) {
  return rect(area.x + CARD_TINY_MARGIN, area.y + CARD_TINY_MARGIN,
    Math.max(0, area.width - 2 * CARD_TINY_MARGIN), Math.max(0, area.height - 2 * CARD_TINY_MARGIN));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** The first-open card: large and centered, below the Island. */
function defaultCardFrame(pageArea) {
  const area = areaOf(pageArea);
  const width = Math.min(CARD_MAX_DEFAULT_WIDTH, Math.round(area.width * CARD_DEFAULT_WIDTH_SHARE));
  const height = area.height - CARD_TOP_GAP - CARD_BOTTOM_GAP;
  return clampCardFrame({ x: area.x + (area.width - width) / 2, y: area.y + CARD_TOP_GAP, width, height }, area);
}

/** At least the minimum size and wholly inside the page area. */
function clampCardFrame(frame, pageArea) {
  const area = areaOf(pageArea);
  if (tooSmall(area)) return tinyFrame(area);
  const width = clampNumber(finite(frame?.width) ? frame.width : CARD_MIN_WIDTH, CARD_MIN_WIDTH, area.width);
  const height = clampNumber(finite(frame?.height) ? frame.height : CARD_MIN_HEIGHT, CARD_MIN_HEIGHT, area.height);
  const x = clampNumber(finite(frame?.x) ? frame.x : area.x, area.x, area.x + area.width - width);
  const y = clampNumber(finite(frame?.y) ? frame.y : area.y, area.y, area.y + area.height - height);
  return rect(x, y, width, height);
}

function frameToFractions(frame, pageArea) {
  const area = areaOf(pageArea);
  const share = (value, size) => (size > 0 ? clampNumber(value / size, 0, 1) : 0);
  return {
    x: share(frame.x - area.x, area.width),
    y: share(frame.y - area.y, area.height),
    width: share(frame.width, area.width),
    height: share(frame.height, area.height),
  };
}

function fractionsToFrame(fractions, pageArea) {
  const area = areaOf(pageArea);
  if (!fractions) return defaultCardFrame(area);
  return clampCardFrame({
    x: area.x + fractions.x * area.width,
    y: area.y + fractions.y * area.height,
    width: fractions.width * area.width,
    height: fractions.height * area.height,
  }, area);
}

function moveCardFrame(frame, dx, dy, pageArea) {
  return clampCardFrame({ ...frame, x: frame.x + (finite(dx) ? dx : 0), y: frame.y + (finite(dy) ? dy : 0) }, pageArea);
}

/** Drag one edge or corner; the opposite edges stay where they are. */
function resizeCardFrame(frame, edge, dx, dy, pageArea) {
  const area = areaOf(pageArea);
  if (!EDGES.includes(edge) || tooSmall(area)) return clampCardFrame(frame, area);
  const moveX = finite(dx) ? dx : 0;
  const moveY = finite(dy) ? dy : 0;
  let left = frame.x;
  let top = frame.y;
  let right = frame.x + frame.width;
  let bottom = frame.y + frame.height;
  if (edge.includes('w')) left = clampNumber(left + moveX, area.x, right - CARD_MIN_WIDTH);
  if (edge.includes('e')) right = clampNumber(right + moveX, left + CARD_MIN_WIDTH, area.x + area.width);
  if (edge.includes('n')) top = clampNumber(top + moveY, area.y, bottom - CARD_MIN_HEIGHT);
  if (edge.includes('s')) bottom = clampNumber(bottom + moveY, top + CARD_MIN_HEIGHT, area.y + area.height);
  return clampCardFrame({ x: left, y: top, width: right - left, height: bottom - top }, area);
}

/** The views' bounds for a card frame: the chrome view (the frame plus its
 * ring), the header, and the page inside the side and bottom borders. */
function cardGeometry(frame) {
  return {
    chrome: rect(frame.x - CARD_RING, frame.y - CARD_RING, frame.width + 2 * CARD_RING, frame.height + 2 * CARD_RING),
    header: rect(frame.x, frame.y, frame.width, CARD_HEADER_HEIGHT),
    page: rect(frame.x + CARD_BORDER, frame.y + CARD_HEADER_HEIGHT,
      frame.width - 2 * CARD_BORDER, frame.height - CARD_HEADER_HEIGHT - CARD_BORDER),
  };
}

module.exports = {
  CARD_MAX_DEFAULT_WIDTH,
  CARD_DEFAULT_WIDTH_SHARE,
  CARD_TOP_GAP,
  CARD_BOTTOM_GAP,
  CARD_MIN_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_HEADER_VISIBLE,
  CARD_RING,
  CARD_HEADER_HEIGHT,
  CARD_BORDER,
  CARD_TINY_MARGIN,
  CARD_KEY_STEP,
  CARD_KEY_STEP_LARGE,
  EDGES,
  defaultCardFrame,
  clampCardFrame,
  frameToFractions,
  fractionsToFrame,
  moveCardFrame,
  resizeCardFrame,
  cardGeometry,
};
