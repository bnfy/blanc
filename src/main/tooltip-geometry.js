'use strict';

// The resting pill's tooltip view (main.js showPillTooltip): which requests
// from the strip it draws, and where the view goes. No require('electron'),
// so it is unit-tested directly.

const MAX_TEXT = 200;
const MAX_WIDTH = 280;
const MAX_HEIGHT = 48;
const GAP = 6;
const EDGE = 4;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** The strip's request, cleaned, or null when it is not one we draw. The
 * strip measures the tip itself (it has the same stylesheet and fonts); the
 * size is capped so a bad report can't cover the page. */
function tooltipRequest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text || text.length > MAX_TEXT) return null;
  const anchor = raw.anchor;
  if (!anchor || !['x', 'y', 'width', 'height'].every((field) => finite(anchor[field]))) return null;
  if (anchor.width < 0 || anchor.height < 0) return null;
  if (!finite(raw.width) || !finite(raw.height) || raw.width <= 0 || raw.height <= 0) return null;
  return {
    text,
    anchor: { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height },
    width: Math.min(MAX_WIDTH, Math.ceil(raw.width)),
    height: Math.min(MAX_HEIGHT, Math.ceil(raw.height)),
    privateTheme: raw.privateTheme === true,
  };
}

/** Centered under the anchor and kept inside the window; above the anchor
 * when there is no room below. */
function tooltipBounds({ anchor, width, height }, { windowWidth, windowHeight }) {
  const centered = anchor.x + anchor.width / 2 - width / 2;
  const x = Math.round(Math.max(EDGE, Math.min(windowWidth - width - EDGE, centered)));
  let y = Math.round(anchor.y + anchor.height + GAP);
  if (y + height > windowHeight - EDGE) y = Math.round(anchor.y - height - GAP);
  return { x, y: Math.max(0, y), width, height };
}

module.exports = { tooltipRequest, tooltipBounds, MAX_TEXT, MAX_WIDTH, MAX_HEIGHT };
