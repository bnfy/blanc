// Pure child-view geometry for Blanc's two desktop tab layouts. Keeping this
// outside main.js makes the 640px minimum-window edge case testable without
// Electron and gives the renderer one authoritative rail-width constant.

const VERTICAL_TABS_DEFAULT_WIDTH = 248;
const VERTICAL_TABS_MIN_WIDTH = 200;
const VERTICAL_TABS_MAX_WIDTH = 360;
const VERTICAL_TABS_MIN_PAGE_WIDTH = 392;
const FIND_OVERLAY_MAX_WIDTH = 560;
const FIND_OVERLAY_HEIGHT = 160;
// #findBar is 480px wide and uses max-width: calc(100vw - 24px). Exposing the
// resulting visible maximum in the geometry result lets tests cover the
// narrow vertical pane without duplicating that arithmetic at call sites.
const FIND_CAPSULE_WIDTH = 480;
const FIND_CAPSULE_HORIZONTAL_GUTTER = 24;

const TAB_LAYOUTS = new Set(['island', 'vertical']);

function normalizeTabLayout(value) {
  return TAB_LAYOUTS.has(value) ? value : 'island';
}

function dimension(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeVerticalTabsWidth(value) {
  if (!Number.isFinite(value)) return VERTICAL_TABS_DEFAULT_WIDTH;
  return Math.max(
    VERTICAL_TABS_MIN_WIDTH,
    Math.min(VERTICAL_TABS_MAX_WIDTH, Math.round(value))
  );
}

/**
 * @param {{
 *   width: number,
 *   height: number,
 *   chromeHeight: number,
 *   tabLayout?: string,
 *   verticalTabsWidth?: number,
 * }} input
 */
function calculateChromeLayout({
  width,
  height,
  chromeHeight,
  tabLayout = 'island',
  verticalTabsWidth = VERTICAL_TABS_DEFAULT_WIDTH,
}) {
  const windowWidth = dimension(width);
  const windowHeight = dimension(height);
  const stripHeight = Math.min(dimension(chromeHeight), windowHeight);
  const layout = normalizeTabLayout(tabLayout);
  const preferredRailWidth = normalizeVerticalTabsWidth(verticalTabsWidth);
  // BrowserWindow enforces a 640px minimum width, so production can honor the
  // 200px rail minimum while still preserving at least 392px for the website.
  // The outer max is window-aware: a wider saved preference temporarily
  // compresses at a narrow window and returns when room is available again.
  const verticalTabsMaxWidth = Math.min(
    VERTICAL_TABS_MAX_WIDTH,
    Math.max(0, windowWidth - VERTICAL_TABS_MIN_PAGE_WIDTH)
  );
  const effectiveRailWidth = Math.min(preferredRailWidth, verticalTabsMaxWidth);
  const railWidth = layout === 'vertical'
    ? effectiveRailWidth
    : 0;
  const pageWidth = Math.max(0, windowWidth - railWidth);
  const pageHeight = Math.max(0, windowHeight - stripHeight);

  const pageBounds = {
    x: railWidth,
    y: stripHeight,
    width: pageWidth,
    height: pageHeight,
  };
  // In vertical mode the website pane becomes the visual frame. Keep resting
  // and expanded Island states on that pane's centerline; find is page-scoped
  // below the sampled safe-area gutter as well.
  const panelBounds = {
    x: railWidth,
    y: 0,
    width: pageWidth,
    height: windowHeight,
  };
  const findWidth = Math.min(FIND_OVERLAY_MAX_WIDTH, pageWidth);
  const findBounds = {
    x: railWidth + Math.round((pageWidth - findWidth) / 2),
    y: stripHeight,
    width: findWidth,
    height: Math.min(FIND_OVERLAY_HEIGHT, pageHeight),
  };

  return {
    tabLayout: layout,
    verticalTabsWidth: effectiveRailWidth,
    verticalTabsPreferredWidth: preferredRailWidth,
    verticalTabsMinWidth: Math.min(VERTICAL_TABS_MIN_WIDTH, verticalTabsMaxWidth),
    verticalTabsMaxWidth,
    verticalTabsDefaultWidth: Math.min(VERTICAL_TABS_DEFAULT_WIDTH, verticalTabsMaxWidth),
    railWidth,
    // Unlike the page pane, the vertical rail owns the complete left edge.
    // Its chrome background extends behind the macOS traffic-light safe area
    // while website content retains the sampled 64px gutter below the Island.
    railBounds: {
      x: 0,
      y: 0,
      width: railWidth,
      height: windowHeight,
    },
    // Guest tabs and the utility sheet intentionally share exact bounds.
    pageBounds,
    utilityBounds: { ...pageBounds },
    // Panel and palette both retain y=0 so the Island expands in place.
    panelBounds,
    paletteBounds: { ...panelBounds },
    findBounds,
    // The root chrome renderer mirrors these bounds so the resting Island
    // centers over the same website pane as its expanded states.
    islandBounds: {
      x: railWidth,
      y: 0,
      width: pageWidth,
      height: stripHeight,
    },
    findCapsuleMaxWidth: Math.max(
      0,
      Math.min(FIND_CAPSULE_WIDTH, findWidth - FIND_CAPSULE_HORIZONTAL_GUTTER)
    ),
  };
}

module.exports = {
  VERTICAL_TABS_DEFAULT_WIDTH,
  VERTICAL_TABS_MIN_WIDTH,
  VERTICAL_TABS_MAX_WIDTH,
  VERTICAL_TABS_MIN_PAGE_WIDTH,
  FIND_OVERLAY_MAX_WIDTH,
  FIND_OVERLAY_HEIGHT,
  FIND_CAPSULE_WIDTH,
  FIND_CAPSULE_HORIZONTAL_GUTTER,
  normalizeTabLayout,
  normalizeVerticalTabsWidth,
  calculateChromeLayout,
};
