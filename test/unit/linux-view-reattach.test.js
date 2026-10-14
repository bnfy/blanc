'use strict';
// #594: on Linux (Electron 44 / Wayland) a utility sheet detached on close and
// re-attached on the next open keeps a hidden renderer that still takes focus
// and clicks — Settings never appears the second time and the page goes dead.
// Reused child views must share the overlay's Linux lifecycle
// (overlay-view-lifecycle.js): stay window-owned and toggle visibility instead
// of detaching.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

function functionBody(name) {
  const start = main.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `${name} not found in main.js`);
  const next = main.slice(start + 1).search(/\n(?:async )?function /);
  return main.slice(start, next === -1 ? undefined : start + 1 + next);
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

// The permission prompt is reused for every request. Re-attached on Linux, it
// stopped drawing: later prompts showed the previous question (or nothing)
// while Allow/Block answered the new one.
test('the permission prompt shares the overlay lifecycle and never detaches directly', () => {
  assert.match(functionBody('attachPermissionView'), /showOverlayView\(rt\(\)\.window, view\)/);
  const detach = functionBody('detachPermissionView');
  assert.match(detach, /hideOverlayView\(rt\(\)\.window, rt\(\)\.permissionView\)/);
  assert.doesNotMatch(detach, /removeChildView/);
  const ensure = functionBody('ensurePermissionView');
  assert.match(ensure.slice(ensure.indexOf("once('destroyed'")), /removeChildView\(view\)/);
});

// #692: the 1Password fill capsule is reused for every message. Re-attached on
// Linux, it drew only once per launch: later errors, confirmations and the
// success notice were invisible while the fill itself kept running.
test('the 1Password fill capsule shares the overlay lifecycle and never detaches directly', () => {
  const attach = functionBody('attachFillStatusView');
  assert.match(attach, /showOverlayView\(rt\(\)\.window, view\)/);
  assert.doesNotMatch(attach, /addChildView\(view\)/);
  const detach = functionBody('detachFillStatusView');
  assert.match(detach, /hideOverlayView\(rt\(\)\.window, rt\(\)\.fillStatusView\)/);
  assert.doesNotMatch(detach, /removeChildView/);
  const ensure = functionBody('ensureFillStatusView');
  assert.match(ensure.slice(ensure.indexOf("once('destroyed'")), /removeChildView\(view\)/);
});

// Tab views had the same failure on Linux (Wayland, X11 and xvfb): after
// switching back, Glance, Reopen Closed Tab or returning to a space the page
// drew few or no frames and barely scrolled, a storage-bearing quiet tab woke
// dead, and a tab moved to a new window stayed stuck. Tab views must go through
// tab-view-lifecycle.js: hidden but window-owned, and nudged on arrival.
test('switching away hides a tab view through the tab lifecycle and never removes it directly', () => {
  const body = functionBody('detachTabView');
  assert.match(body, /releaseTabView\(rt\(\)\.window, tab\.view\)/);
  assert.doesNotMatch(body, /removeChildView/);
});

test('showing a tab view goes through the tab lifecycle so an arriving view is nudged', () => {
  assert.match(functionBody('attachTabViewToWindow'), /attachTabView\(rt\(\)\.window, tab\.view, \{ createView: \(\) => new View\(\) \}\)/);
  for (const name of ['setActiveTab', 'setGlanceTab']) {
    const body = functionBody(name);
    assert.match(body, /attachTabViewToWindow\(/, `${name} must attach through the tab lifecycle`);
    assert.doesNotMatch(body, /addChildView\((?:next|tab|glanceTab)\.view\)/, `${name} must not attach a tab view directly`);
  }
});
