'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_GLANCE_RATIO,
  calculateGlanceLayout,
  ratioForGlanceDivider,
} = require('../../src/main/glance-layout');

const CHROME_HEIGHT = 68;

test('Glance gives the active page a dominant 62/38 side-by-side split and 68px strip header', () => {
  assert.deepEqual(calculateGlanceLayout({ x: 0, y: CHROME_HEIGHT, width: 1000, height: 700 }), {
    direction: 'horizontal',
    ratio: DEFAULT_GLANCE_RATIO,
    minRatio: 0.5,
    maxRatio: 688 / 988,
    page: { x: 0, y: 68, width: 1000, height: 700 },
    primary: { x: 0, y: 68, width: 613, height: 700 },
    divider: { x: 613, y: 68, width: 12, height: 700 },
    glanceHeader: { x: 613, y: 0, width: 387, height: 68 },
    glanceContent: { x: 625, y: 68, width: 375, height: 700 },
    glance: { x: 625, y: 68, width: 375, height: 700 },
  });
});

test('Glance stacks below the main page with an owned reference header when narrow', () => {
  const layout = calculateGlanceLayout({ x: 248, y: CHROME_HEIGHT, width: 392, height: 732 });
  assert.equal(layout.direction, 'vertical');
  assert.deepEqual(layout.primary, { x: 248, y: 68, width: 392, height: 419 });
  assert.deepEqual(layout.divider, { x: 248, y: 487, width: 392, height: 12 });
  assert.deepEqual(layout.glanceHeader, { x: 248, y: 499, width: 392, height: 44 });
  assert.deepEqual(layout.glanceContent, { x: 248, y: 543, width: 392, height: 257 });
  assert.deepEqual(layout.glance, layout.glanceContent);
});

test('divider input clamps the main-page share to the supported range', () => {
  const page = { x: 100, y: CHROME_HEIGHT, width: 1000, height: 700 };
  assert.equal(ratioForGlanceDivider(page, { x: -500 }, 'horizontal'), 0.5);
  // usable 988: the reference keeps 300px, so the share stops at 688/988.
  assert.equal(ratioForGlanceDivider(page, { x: 5000 }, 'horizontal'), 688 / 988);
  assert.equal(ratioForGlanceDivider(page, { x: Number.NaN }, 'horizontal'), null, 'a malformed point is ignored, not reset');
  assert.equal(ratioForGlanceDivider(page, undefined, 'vertical'), null);
  assert.equal(
    Math.round(ratioForGlanceDivider(page, { x: 100 + 988 * 0.64 }, 'horizontal') * 100),
    64
  );
  assert.equal(
    Math.round(ratioForGlanceDivider(page, { y: CHROME_HEIGHT + 644 * 0.61 }, 'vertical') * 100),
    61
  );
});

test('transient zero-size bounds never produce negative pane geometry', () => {
  const layout = calculateGlanceLayout({ x: 0, y: 0, width: 0, height: 0 });
  for (const region of [
    layout.primary,
    layout.divider,
    layout.glanceHeader,
    layout.glanceContent,
  ]) {
    assert.ok(region.width >= 0);
    assert.ok(region.height >= 0);
  }
});

test('a minimum main-pane width stops the divider before the Island runs out of room', () => {
  const page = { x: 0, y: CHROME_HEIGHT, width: 820, height: 700 };
  // usable = 820 - 12 = 808; 480 / 808 ≈ 0.594 is the new floor.
  const layout = calculateGlanceLayout(page, 0.5, 480);
  assert.equal(layout.direction, 'horizontal');
  assert.equal(layout.primary.width, 480);
  assert.equal(layout.minRatio, 480 / 808);
  assert.equal(layout.ratio, 480 / 808);
  // A choice inside the range is kept as it is (the reference's 300px caps
  // this 820px page at 508 / 808).
  assert.equal(calculateGlanceLayout(page, 0.6, 480).ratio, 0.6);
  // The divider follows the same floor.
  assert.equal(ratioForGlanceDivider(page, { x: 0 }, 'horizontal', 480), 480 / 808);
  assert.equal(Math.round(ratioForGlanceDivider(page, { x: 500 }, 'horizontal', 480) * 808), 500);
});

test('the main-pane minimum never pushes past the maximum share, and stacked ignores it', () => {
  // usable 2000, minimum 1600 (0.8): capped at the 0.78 maximum share.
  const wide = { x: 0, y: CHROME_HEIGHT, width: 2012, height: 700 };
  assert.equal(calculateGlanceLayout(wide, 0.5, 1600).direction, 'horizontal');
  assert.equal(calculateGlanceLayout(wide, 0.5, 1600).ratio, 0.78);
  assert.equal(calculateGlanceLayout(wide, 0.5, 1600).minRatio, 0.78);
  const stacked = calculateGlanceLayout({ x: 0, y: CHROME_HEIGHT, width: 700, height: 700 }, 0.5, 480);
  assert.equal(stacked.direction, 'vertical');
  assert.equal(stacked.minRatio, 0.5, 'stacked, the divider sets heights, not the main pane width');
  assert.equal(ratioForGlanceDivider({ x: 0, y: CHROME_HEIGHT, width: 700, height: 700 }, { y: 0 }, 'vertical', 480), 0.5);
});


test('Glance stacks when the main-pane minimum would leave the reference too narrow to use', () => {
  const page = (width) => ({ x: 0, y: CHROME_HEIGHT, width, height: 700 });
  // Without a minimum, 800px is still the side-by-side threshold.
  assert.equal(calculateGlanceLayout(page(800), 0.62, 0).direction, 'horizontal');
  // A 600px main pane at an 850px page would leave the reference 238px.
  assert.equal(calculateGlanceLayout(page(850), 0.62, 600).direction, 'vertical');
  // 600 + 12 + 300 = 912: from there the reference gets at least 300px.
  assert.equal(calculateGlanceLayout(page(911), 0.62, 600).direction, 'vertical');
  const wide = calculateGlanceLayout(page(912), 0.5, 600);
  assert.equal(wide.direction, 'horizontal');
  assert.equal(wide.glanceContent.width, 300);
});

test('the divider stops before the reference is narrower than 300px', () => {
  const page = (width) => ({ x: 0, y: CHROME_HEIGHT, width, height: 700 });
  // 1000px page: usable 988, the reference keeps 300px.
  const narrow = calculateGlanceLayout(page(1000), 0.78);
  assert.equal(narrow.maxRatio, 688 / 988);
  assert.equal(narrow.glanceContent.width, 300);
  // Wide pages keep the 0.78 maximum share.
  assert.equal(calculateGlanceLayout(page(2000), 0.78).maxRatio, 0.78);
  assert.equal(calculateGlanceLayout(page(2000), 0.78).ratio, 0.78);
  // An 800px page with no main-pane minimum: the default split already gives 300px.
  assert.equal(calculateGlanceLayout(page(800), 0.78).glanceContent.width, 300);
  // Stacked layouts keep their own range.
  assert.equal(calculateGlanceLayout(page(700), 0.78).maxRatio, 0.78);
});

test('a measured reference minimum replaces the 300px default', () => {
  const page = (width) => ({ x: 0, y: CHROME_HEIGHT, width, height: 700 });
  // Windows/Linux: the compact header plus the window-control space needs 380px.
  const capped = calculateGlanceLayout(page(1200), 0.78, 0, 380);
  assert.equal(capped.maxRatio, (1188 - 380) / 1188);
  assert.equal(capped.glanceContent.width, 380);
  assert.equal(ratioForGlanceDivider(page(1200), { x: 5000 }, 'horizontal', 0, 380), (1188 - 380) / 1188);
  // Side by side needs the main pane's minimum plus the reference's: 1000 - 12
  // - 600 leaves 388px, short of a 400px reference.
  assert.equal(calculateGlanceLayout(page(1000), 0.62, 600, 400).direction, 'vertical');
  assert.equal(calculateGlanceLayout(page(1000), 0.62, 600, 300).direction, 'horizontal');
  // A smaller measured need (macOS) lets the reference go narrower than 300px.
  assert.equal(calculateGlanceLayout(page(1000), 0.78, 0, 240).glanceContent.width, 240);
  // Unmeasured or invalid falls back to the 300px default.
  assert.equal(calculateGlanceLayout(page(1000), 0.78, 0, Number.NaN).glanceContent.width, 300);
});
