const assert = require('node:assert/strict');
const test = require('node:test');
const { splitPageBounds } = require('../../src/main/split-view-layout');

test('Glance splits ordinary page panes side by side without overlap', () => {
  assert.deepEqual(splitPageBounds({ x: 0, y: 64, width: 1000, height: 700 }), {
    direction: 'horizontal',
    primary: { x: 0, y: 64, width: 499, height: 700 },
    glance: { x: 500, y: 64, width: 500, height: 700 },
  });
});

test('Glance stacks vertically when a vertical-tabs pane is too narrow', () => {
  assert.deepEqual(splitPageBounds({ x: 248, y: 64, width: 392, height: 736 }), {
    direction: 'vertical',
    primary: { x: 248, y: 64, width: 392, height: 367 },
    glance: { x: 248, y: 432, width: 392, height: 368 },
  });
});

test('Glance never produces negative bounds during a transient zero-height resize', () => {
  assert.deepEqual(splitPageBounds({ x: 248, y: 64, width: 392, height: 0 }), {
    direction: 'vertical',
    primary: { x: 248, y: 64, width: 392, height: 0 },
    glance: { x: 248, y: 64, width: 392, height: 0 },
  });
});
