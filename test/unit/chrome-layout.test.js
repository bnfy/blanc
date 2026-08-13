const assert = require('node:assert/strict');
const test = require('node:test');

const {
  VERTICAL_TABS_DEFAULT_WIDTH,
  VERTICAL_TABS_MIN_WIDTH,
  VERTICAL_TABS_MAX_WIDTH,
  VERTICAL_TABS_MIN_PAGE_WIDTH,
  CAPTURE_POPOVER_CHROME,
  CAPTURE_ROW_HEIGHT,
  normalizeTabLayout,
  normalizeVerticalTabsWidth,
  calculateChromeLayout,
  calculateShieldBounds,
  calculateCaptureBounds,
} = require('../../src/main/chrome-layout');

test('invalid or missing layout values preserve Island as the default', () => {
  assert.equal(normalizeTabLayout(), 'island');
  assert.equal(normalizeTabLayout('horizontal'), 'island');
  assert.equal(normalizeTabLayout('vertical'), 'vertical');
});

test('vertical width normalizes to the supported persisted range', () => {
  assert.equal(VERTICAL_TABS_DEFAULT_WIDTH, 248);
  assert.equal(VERTICAL_TABS_MIN_WIDTH, 200);
  assert.equal(VERTICAL_TABS_MAX_WIDTH, 360);
  assert.equal(VERTICAL_TABS_MIN_PAGE_WIDTH, 392);
  assert.equal(normalizeVerticalTabsWidth(), 248);
  assert.equal(normalizeVerticalTabsWidth(199), 200);
  assert.equal(normalizeVerticalTabsWidth(278.6), 279);
  assert.equal(normalizeVerticalTabsWidth(361), 360);
});

test('Island uses the full page width for tabs, sheets, overlays, and pill centering', () => {
  const layout = calculateChromeLayout({
    width: 1280,
    height: 800,
    chromeHeight: 64,
    tabLayout: 'island',
  });

  assert.equal(layout.verticalTabsWidth, 248);
  assert.equal(layout.verticalTabsPreferredWidth, 248);
  assert.equal(layout.verticalTabsMinWidth, 200);
  assert.equal(layout.verticalTabsMaxWidth, 360);
  assert.equal(layout.verticalTabsDefaultWidth, 248);
  assert.equal(layout.railWidth, 0);
  assert.deepEqual(layout.pageBounds, { x: 0, y: 64, width: 1280, height: 736 });
  assert.deepEqual(layout.utilityBounds, layout.pageBounds);
  assert.deepEqual(layout.panelBounds, { x: 0, y: 0, width: 1280, height: 800 });
  assert.deepEqual(layout.paletteBounds, layout.panelBounds);
  assert.deepEqual(layout.findBounds, { x: 360, y: 64, width: 560, height: 160 });
  assert.deepEqual(layout.islandBounds, { x: 0, y: 0, width: 1280, height: 64 });
});

test('vertical layout reserves the rail and centers Island surfaces over the website pane', () => {
  const layout = calculateChromeLayout({
    width: 1280,
    height: 800,
    chromeHeight: 64,
    tabLayout: 'vertical',
  });

  assert.equal(layout.railWidth, 248);
  assert.deepEqual(layout.railBounds, { x: 0, y: 0, width: 248, height: 800 });
  assert.deepEqual(layout.pageBounds, { x: 248, y: 64, width: 1032, height: 736 });
  assert.deepEqual(layout.utilityBounds, layout.pageBounds);
  assert.deepEqual(layout.panelBounds, { x: 248, y: 0, width: 1032, height: 800 });
  assert.deepEqual(layout.paletteBounds, layout.panelBounds);
  assert.deepEqual(layout.findBounds, { x: 484, y: 64, width: 560, height: 160 });
  assert.deepEqual(layout.islandBounds, { x: 248, y: 0, width: 1032, height: 64 });
});

test('640x480 vertical layout clamps find to the 392px page pane and 368px visible capsule', () => {
  const layout = calculateChromeLayout({
    width: 640,
    height: 480,
    chromeHeight: 64,
    tabLayout: 'vertical',
  });

  assert.deepEqual(layout.pageBounds, { x: 248, y: 64, width: 392, height: 416 });
  assert.equal(layout.verticalTabsMaxWidth, 248);
  assert.deepEqual(layout.findBounds, { x: 248, y: 64, width: 392, height: 160 });
  assert.equal(layout.findCapsuleMaxWidth, 368);
});

test('resizable vertical rail clamps to 200–360px and preserves a 392px page pane', () => {
  const wide = calculateChromeLayout({
    width: 1280,
    height: 800,
    chromeHeight: 64,
    tabLayout: 'vertical',
    verticalTabsWidth: 400,
  });
  assert.equal(wide.verticalTabsPreferredWidth, 360);
  assert.equal(wide.verticalTabsWidth, 360);
  assert.deepEqual(wide.pageBounds, { x: 360, y: 64, width: 920, height: 736 });

  const narrow = calculateChromeLayout({
    width: 640,
    height: 480,
    chromeHeight: 64,
    tabLayout: 'vertical',
    verticalTabsWidth: 360,
  });
  assert.equal(narrow.verticalTabsPreferredWidth, 360);
  assert.equal(narrow.verticalTabsWidth, 248);
  assert.equal(narrow.verticalTabsMaxWidth, 248);
  assert.deepEqual(narrow.pageBounds, { x: 248, y: 64, width: 392, height: 416 });

  const minimum = calculateChromeLayout({
    width: 1280,
    height: 800,
    chromeHeight: 64,
    tabLayout: 'vertical',
    verticalTabsWidth: 120,
  });
  assert.equal(minimum.verticalTabsPreferredWidth, 200);
  assert.equal(minimum.verticalTabsWidth, 200);
  assert.deepEqual(minimum.pageBounds, { x: 200, y: 64, width: 1080, height: 736 });
});

test('dimensions clamp safely during transient zero or undersized window bounds', () => {
  const layout = calculateChromeLayout({
    width: 200,
    height: 40,
    chromeHeight: 64,
    tabLayout: 'vertical',
  });

  assert.deepEqual(layout.pageBounds, { x: 0, y: 40, width: 200, height: 0 });
  assert.deepEqual(layout.findBounds, { x: 0, y: 40, width: 200, height: 0 });
  assert.equal(layout.findCapsuleMaxWidth, 176);
});

test('shield bounds sit below the strip, right-aligned to the anchor', () => {
  const b = calculateShieldBounds({ windowWidth: 1280, stripHeight: 64, anchorRight: 900 });
  assert.deepEqual(b, { x: 580, y: 64, width: 320, height: 232 });
});

test('shield bounds clamp to the window with a margin on both sides', () => {
  const left = calculateShieldBounds({ windowWidth: 1280, stripHeight: 64, anchorRight: 100 });
  assert.equal(left.x, 12);
  const right = calculateShieldBounds({ windowWidth: 1280, stripHeight: 64, anchorRight: 5000 });
  assert.equal(right.x, 1280 - 320 - 12);
});

test('shield bounds shrink on a window narrower than width + margins', () => {
  const b = calculateShieldBounds({ windowWidth: 300, stripHeight: 64, anchorRight: 200 });
  assert.equal(b.width, 300 - 24);
  assert.equal(b.x, 12);
});

test('shield bounds center under the window without an anchor', () => {
  const b = calculateShieldBounds({ windowWidth: 1000, stripHeight: 64, anchorRight: null });
  assert.equal(b.x, Math.round((1000 - 320) / 2));
});

test('calculateCaptureBounds grows per row and caps at 5 rows', () => {
  const base = { windowWidth: 1200, stripHeight: 64, anchorRight: 900 };
  const one = calculateCaptureBounds({ ...base, rowCount: 1 });
  const three = calculateCaptureBounds({ ...base, rowCount: 3 });
  const nine = calculateCaptureBounds({ ...base, rowCount: 9 });
  assert.equal(one.height, CAPTURE_POPOVER_CHROME + CAPTURE_ROW_HEIGHT);
  assert.equal(three.height, CAPTURE_POPOVER_CHROME + 3 * CAPTURE_ROW_HEIGHT);
  assert.equal(nine.height, CAPTURE_POPOVER_CHROME + 5 * CAPTURE_ROW_HEIGHT,
    'more than 5 rows scroll inside a capped card');
  assert.equal(one.y, 64);
  assert.equal(one.x + one.width, 900, 'right edge aligns to the chip anchor');
});

test('calculateCaptureBounds clamps inside the window like the shield popover', () => {
  const b = calculateCaptureBounds({ windowWidth: 300, stripHeight: 64, anchorRight: 900, rowCount: 1 });
  assert.ok(b.x >= 0 && b.x + b.width <= 300);
});
