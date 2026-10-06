'use strict';
// #594: on Linux (Electron 44 / Wayland) a utility sheet detached on close and
// re-attached on the next open keeps a hidden renderer that still takes focus
// and clicks — Settings never appears the second time and the page goes dead.
// The sheet must share the overlay's Linux lifecycle (overlay-view-lifecycle.js):
// stay window-owned and toggle visibility instead of detaching.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

function functionBody(name) {
  const start = main.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, `${name} not found in main.js`);
  const next = main.indexOf('\nfunction ', start + 1);
  return main.slice(start, next === -1 ? undefined : next);
}

test('opening a utility sheet attaches it through the shared overlay lifecycle', () => {
  const body = functionBody('showUtilityPage');
  assert.match(body, /showOverlayView\(runtime\.window, sheet\.view\)/);
  assert.doesNotMatch(body, /addChildView\(sheet\.view\)/);
});

test('closing a utility sheet never detaches it directly', () => {
  const body = functionBody('hideUtilitySheet');
  assert.match(body, /hideOverlayView\(runtime\.window, sheet\.view\)/);
  assert.doesNotMatch(body, /removeChildView/);
});

test('a discarded or crashed sheet view never stays attached after its contents die', () => {
  const body = functionBody('retireUtilitySheetView');
  assert.match(body, /once\('destroyed'/);
  assert.match(body, /removeChildView\(view\)/);
  assert.match(functionBody('discardFailedUtilitySheet'), /retireUtilitySheetView\(runtime, sheet\.view\)/);
  const create = functionBody('createUtilitySheet');
  const crash = create.slice(create.indexOf("'render-process-gone'"), create.indexOf("'destroyed'"));
  assert.match(crash, /retireUtilitySheetView\(runtime, view\)/);
});
