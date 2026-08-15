'use strict';

// Pure geometry for Blanc's temporary second page pane. The selected product
// direction keeps the active page dominant and gives the reference an explicit
// owned header. No Electron imports so resize behavior, header reservation, and
// narrow-window fallbacks stay unit-testable.

const DEFAULT_GLANCE_RATIO = 0.62;
const MIN_GLANCE_RATIO = 0.5;
const MAX_GLANCE_RATIO = 0.78;
const MIN_SIDE_BY_SIDE_WIDTH = 800;
const DIVIDER_SIZE = 12;
const STACKED_HEADER_HEIGHT = 44;

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
 * Split a page region into a dominant active pane, an owned divider gap, a
 * labelled Glance header, and the reference content. Horizontal layouts use
 * the existing chrome strip for the header; narrow windows reserve a compact
 * header between the divider and lower page so ownership remains clear.
 */
function calculateGlanceLayout(pageBounds, ratio = DEFAULT_GLANCE_RATIO) {
  const page = normalizedPageBounds(pageBounds);
  const resolvedRatio = normalizeGlanceRatio(ratio);

  if (page.width >= MIN_SIDE_BY_SIDE_WIDTH) {
    const divider = Math.min(DIVIDER_SIZE, page.width);
    const usable = Math.max(0, page.width - divider);
    const primaryWidth = Math.round(usable * resolvedRatio);
    const glanceContent = {
      x: page.x + primaryWidth + divider,
      y: page.y,
      width: Math.max(0, page.width - primaryWidth - divider),
      height: page.height,
    };
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
      glanceHeader: {
        // Begin at the pane seam so the flat header covers the divider gap in
        // the top strip; the reference WebContentsView still begins after it.
        x: page.x + primaryWidth,
        y: 0,
        width: Math.max(0, page.width - primaryWidth),
        height: page.y,
      },
      glanceContent,
      // Compatibility alias for main/test-hook consumers while the explicit
      // content name documents what receives the WebContentsView bounds.
      glance: glanceContent,
    };
  }

  const divider = Math.min(DIVIDER_SIZE, page.height);
  const availableAfterDivider = Math.max(0, page.height - divider);
  const headerHeight = Math.min(STACKED_HEADER_HEIGHT, availableAfterDivider);
  const usable = Math.max(0, availableAfterDivider - headerHeight);
  const primaryHeight = Math.round(usable * resolvedRatio);
  const dividerRegion = {
    x: page.x,
    y: page.y + primaryHeight,
    width: page.width,
    height: divider,
  };
  const glanceHeader = {
    x: page.x,
    y: dividerRegion.y + dividerRegion.height,
    width: page.width,
    height: headerHeight,
  };
  const glanceContent = {
    x: page.x,
    y: glanceHeader.y + glanceHeader.height,
    width: page.width,
    height: Math.max(0, page.height - primaryHeight - divider - headerHeight),
  };
  return {
    direction: 'vertical',
    ratio: resolvedRatio,
    page,
    primary: { x: page.x, y: page.y, width: page.width, height: primaryHeight },
    divider: dividerRegion,
    glanceHeader,
    glanceContent,
    glance: glanceContent,
  };
}

/** Convert a renderer-reported divider coordinate back into a safe ratio. */
function ratioForGlanceDivider(pageBounds, point, direction) {
  const page = normalizedPageBounds(pageBounds);
  const horizontal = direction !== 'vertical';
  const divider = horizontal
    ? Math.min(DIVIDER_SIZE, page.width)
    : Math.min(DIVIDER_SIZE, page.height);
  const header = horizontal
    ? 0
    : Math.min(STACKED_HEADER_HEIGHT, Math.max(0, page.height - divider));
  const available = horizontal
    ? Math.max(1, page.width - divider)
    : Math.max(1, page.height - divider - header);
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
  STACKED_HEADER_HEIGHT,
  normalizeGlanceRatio,
  calculateGlanceLayout,
  ratioForGlanceDivider,
};
