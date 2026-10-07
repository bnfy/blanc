'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  acceptOverlayDragState, resetOverlayDragState, overlayDragActive,
} = require('../../src/main/overlay-drag-state');

const contents = (destroyed = false) => ({ isDestroyed: () => destroyed });
function runtime(mode = 'panel') {
  return { overlayMode: mode, overlayDragging: false, overlayView: { webContents: contents() } };
}

test('the runtime\'s own overlay may set and clear the flag', () => {
  const rt = runtime();
  assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, true), true);
  assert.equal(overlayDragActive(rt), true);
  assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, false), true);
  assert.equal(overlayDragActive(rt), false);
});

test('forged or wrong senders change no runtime\'s flag', () => {
  const a = runtime();
  const b = runtime();
  const strip = contents();
  const tab = contents();
  for (const sender of [strip, tab, b.overlayView.webContents, null, undefined]) {
    assert.equal(acceptOverlayDragState(a, sender, true), false);
  }
  assert.equal(overlayDragActive(a), false);
  assert.equal(overlayDragActive(b), false, 'B\'s overlay cannot set B\'s flag through A');
});

test('non-boolean payloads, destroyed overlays and non-panel modes are ignored', () => {
  const rt = runtime();
  for (const value of ['true', 1, null, undefined, {}]) {
    assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, value), false);
  }
  const dead = runtime();
  dead.overlayView.webContents = contents(true);
  assert.equal(acceptOverlayDragState(dead, dead.overlayView.webContents, true), false);
  for (const mode of [null, 'find', 'shield', 'capture']) {
    const other = runtime(mode);
    assert.equal(acceptOverlayDragState(other, other.overlayView.webContents, true), false);
  }
  const palette = runtime('palette');
  assert.equal(acceptOverlayDragState(palette, palette.overlayView.webContents, true), true);
});

test('false is always accepted from the overlay, even after the mode changed', () => {
  const rt = runtime();
  acceptOverlayDragState(rt, rt.overlayView.webContents, true);
  rt.overlayMode = null;
  assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, false), true);
  assert.equal(overlayDragActive(rt), false);
});

test('reset clears the flag and tolerates a missing runtime', () => {
  const rt = runtime();
  acceptOverlayDragState(rt, rt.overlayView.webContents, true);
  resetOverlayDragState(rt);
  assert.equal(overlayDragActive(rt), false);
  assert.doesNotThrow(() => resetOverlayDragState(null));
  assert.equal(overlayDragActive(null), false);
});

test('main resets the drag flag on hide, destroy, render-process-gone and window close', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const hide = src.slice(src.indexOf('function hideOverlay('), src.indexOf('if (!rt().overlayMode) return;', src.indexOf('function hideOverlay(')));
  assert.match(hide, /resetOverlayDragState\(rt\(\)\)/, 'reset runs before hideOverlay can early-return');
  const create = src.slice(src.indexOf('function createOverlay('), src.indexOf("rt().overlayView.setBackgroundColor('#00000000')"));
  assert.match(create, /'render-process-gone'[\s\S]*resetOverlayDragState\(owner\)/);
  assert.match(create, /'destroyed'[\s\S]*resetOverlayDragState\(owner\)/);
  const closedStart = src.indexOf("rt().window.on('closed', bindWindowRuntime(runtime, () => {");
  assert.ok(closedStart !== -1, 'window closed handler moved: update this check');
  const closed = src.slice(closedStart, src.indexOf('\n  }));', closedStart));
  assert.match(closed, /resetOverlayDragState\(runtime\)/, 'window close resets the runtime flag');
});
