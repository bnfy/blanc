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
  assert.equal(ratioForGlanceDivider(page, { x: 5000 }, 'horizontal'), 0.78);
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
