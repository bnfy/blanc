'use strict';

// Pure geometry for Blanc's temporary second page pane. The selected product
// direction keeps the active page dominant (roughly two thirds) and treats the
// right/lower page as a dismissible reference surface. No Electron imports so
// resize behavior and narrow-window fallbacks stay unit-testable.

const DEFAULT_GLANCE_RATIO = 0.68;
const MIN_GLANCE_RATIO = 0.5;
const MAX_GLANCE_RATIO = 0.78;
const MIN_SIDE_BY_SIDE_WIDTH = 800;
const DIVIDER_SIZE = 8;

const dimension = (value) => (
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
);

function normalizeGlanceRatio(value) {
  if (!Number.isFinite(value)) return DEFAULT_GLANCE_RATIO;
  return Math.max(MIN_GLANCE_RATIO, Math.min(MAX_GLANCE_RATIO, value));
}

function normalizedPageBounds(pageBounds) {
  return {
    x: dimension(pageBounds?.x),
    y: dimension(pageBounds?.y),
    width: dimension(pageBounds?.width),
    height: dimension(pageBounds?.height),
  };
}

/**
 * Split a page region into a dominant active pane, a transparent divider gap,
 * and a secondary Glance pane. Narrow windows stack the reference below the
 * active page so neither becomes an unusable sliver.
 */
function calculateGlanceLayout(pageBounds, ratio = DEFAULT_GLANCE_RATIO) {
  const page = normalizedPageBounds(pageBounds);
  const resolvedRatio = normalizeGlanceRatio(ratio);

  if (page.width >= MIN_SIDE_BY_SIDE_WIDTH) {
    const divider = Math.min(DIVIDER_SIZE, page.width);
    const usable = Math.max(0, page.width - divider);
    const primaryWidth = Math.round(usable * resolvedRatio);
    return {
      direction: 'horizontal',
      ratio: resolvedRatio,
      page,
      primary: { x: page.x, y: page.y, width: primaryWidth, height: page.height },
      divider: {
        x: page.x + primaryWidth,
        y: page.y,
        width: divider,
        height: page.height,
      },
      glance: {
        x: page.x + primaryWidth + divider,
        y: page.y,
        width: Math.max(0, page.width - primaryWidth - divider),
        height: page.height,
      },
    };
  }

  const divider = Math.min(DIVIDER_SIZE, page.height);
  const usable = Math.max(0, page.height - divider);
  const primaryHeight = Math.round(usable * resolvedRatio);
  return {
    direction: 'vertical',
    ratio: resolvedRatio,
    page,
    primary: { x: page.x, y: page.y, width: page.width, height: primaryHeight },
    divider: {
      x: page.x,
      y: page.y + primaryHeight,
      width: page.width,
      height: divider,
    },
    glance: {
      x: page.x,
      y: page.y + primaryHeight + divider,
      width: page.width,
      height: Math.max(0, page.height - primaryHeight - divider),
    },
  };
}

/** Convert a renderer-reported divider coordinate back into a safe ratio. */
function ratioForGlanceDivider(pageBounds, point, direction) {
  const page = normalizedPageBounds(pageBounds);
  const horizontal = direction !== 'vertical';
  const available = horizontal
    ? Math.max(1, page.width - Math.min(DIVIDER_SIZE, page.width))
    : Math.max(1, page.height - Math.min(DIVIDER_SIZE, page.height));
  const coordinate = horizontal ? Number(point?.x) : Number(point?.y);
  const origin = horizontal ? page.x : page.y;
  if (!Number.isFinite(coordinate)) return DEFAULT_GLANCE_RATIO;
  return normalizeGlanceRatio((coordinate - origin) / available);
}

module.exports = {
  DEFAULT_GLANCE_RATIO,
  MIN_GLANCE_RATIO,
  MAX_GLANCE_RATIO,
  MIN_SIDE_BY_SIDE_WIDTH,
  DIVIDER_SIZE,
  normalizeGlanceRatio,
  calculateGlanceLayout,
  ratioForGlanceDivider,
};
