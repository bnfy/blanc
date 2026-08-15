'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_GLANCE_RATIO,
  calculateGlanceLayout,
  ratioForGlanceDivider,
} = require('../../src/main/glance-layout');

test('Glance gives the active page a dominant 68/32 side-by-side split', () => {
  assert.deepEqual(calculateGlanceLayout({ x: 0, y: 64, width: 1000, height: 700 }), {
    direction: 'horizontal',
    ratio: DEFAULT_GLANCE_RATIO,
    page: { x: 0, y: 64, width: 1000, height: 700 },
    primary: { x: 0, y: 64, width: 675, height: 700 },
    divider: { x: 675, y: 64, width: 8, height: 700 },
    glance: { x: 683, y: 64, width: 317, height: 700 },
  });
});

test('Glance stacks below the main page when the page region is narrow', () => {
  const layout = calculateGlanceLayout({ x: 248, y: 64, width: 392, height: 736 });
  assert.equal(layout.direction, 'vertical');
  assert.deepEqual(layout.primary, { x: 248, y: 64, width: 392, height: 495 });
  assert.deepEqual(layout.divider, { x: 248, y: 559, width: 392, height: 8 });
  assert.deepEqual(layout.glance, { x: 248, y: 567, width: 392, height: 233 });
});

test('divider input clamps the main-page share to the supported range', () => {
  const page = { x: 100, y: 64, width: 1000, height: 700 };
  assert.equal(ratioForGlanceDivider(page, { x: -500 }, 'horizontal'), 0.5);
  assert.equal(ratioForGlanceDivider(page, { x: 5000 }, 'horizontal'), 0.78);
  assert.equal(
    Math.round(ratioForGlanceDivider(page, { x: 100 + 992 * 0.64 }, 'horizontal') * 100),
    64
  );
});

test('transient zero-size bounds never produce negative pane geometry', () => {
  const layout = calculateGlanceLayout({ x: 0, y: 0, width: 0, height: 0 });
  for (const region of [layout.primary, layout.divider, layout.glance]) {
    assert.ok(region.width >= 0);
    assert.ok(region.height >= 0);
  }
});
