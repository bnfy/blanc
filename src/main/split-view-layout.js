// Geometry for two local WebContentsViews in one Blanc window. A narrow
// vertical-tabs pane stacks Glance below the active tab rather than making two
// unusable slivers; the decision is pure so resize behavior stays testable.

const MIN_SIDE_BY_SIDE_WIDTH = 560;
const DIVIDER_SIZE = 1;

function splitPageBounds(pageBounds) {
  const page = {
    x: Math.max(0, Math.round(pageBounds?.x ?? 0)),
    y: Math.max(0, Math.round(pageBounds?.y ?? 0)),
    width: Math.max(0, Math.round(pageBounds?.width ?? 0)),
    height: Math.max(0, Math.round(pageBounds?.height ?? 0)),
  };
  if (page.width >= MIN_SIDE_BY_SIDE_WIDTH) {
    const primaryWidth = Math.floor((page.width - DIVIDER_SIZE) / 2);
    return {
      direction: 'horizontal',
      primary: { x: page.x, y: page.y, width: primaryWidth, height: page.height },
      glance: {
        x: page.x + primaryWidth + DIVIDER_SIZE,
        y: page.y,
        width: page.width - primaryWidth - DIVIDER_SIZE,
        height: page.height,
      },
    };
  }
  // Electron can report a transient zero-height content region while a window
  // is minimizing or being resized. Do not turn the visual divider into a
  // negative pane height in that state.
  const divider = page.height > 0 ? DIVIDER_SIZE : 0;
  const primaryHeight = Math.floor((page.height - divider) / 2);
  return {
    direction: 'vertical',
    primary: { x: page.x, y: page.y, width: page.width, height: primaryHeight },
    glance: {
      x: page.x,
      y: page.y + primaryHeight + divider,
      width: page.width,
      height: page.height - primaryHeight - divider,
    },
  };
}

module.exports = { MIN_SIDE_BY_SIDE_WIDTH, DIVIDER_SIZE, splitPageBounds };
