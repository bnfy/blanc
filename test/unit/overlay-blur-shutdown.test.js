'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

// Execute the production blur registration. The usual Electron UI harness
// intentionally disables this handler; shutdown must be tested with it on.
const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = main.indexOf("  rt().overlayView.webContents.on('blur', bindWindowRuntime(owner, () => {");
const registration = main.slice(start, main.indexOf('\n  // The address menu', start));
test('lift found the blur registration', () => {
  assert.ok(start !== -1 && registration.includes('overlayDragActive'),
    'lifted the production blur registration including the drag guard');
});
function fixture() {
  const wc = new EventEmitter(), scheduled = [];
  const owner = { overlayView: { webContents: wc }, closing: false, surfaceGeneration: 1,
    overlayMode: 'shield', tabsWantingAddressBarFocus: new Set() };
  let locked = false, hides = 0;
  const context = { owner, isQuitting: false, acceptanceTestMode: false, rt: () => owner,
    bindWindowRuntime: (_owner, fn) => fn, setImmediate: fn => scheduled.push(fn),
    overlayDragActive: (r) => r.overlayDragging === true,
    hasLiveWindow: () => true, hideOverlay: () => {
      assert.equal(locked, false, 'must not mutate a native view tree during its blur callback');
      hides++; owner.overlayMode = null;
    },
  };
  vm.runInNewContext(registration, context);
  return { owner, context, scheduled, hides: () => hides,
    blur() { locked = true; try { wc.emit('blur'); } finally { locked = false; } },
    settle() { while (scheduled.length) scheduled.shift()(); },
  };
}
test('ordinary production blur dismisses after the native callback returns', () => {
  const f = fixture(); f.blur(); assert.equal(f.hides(), 0); f.settle(); assert.equal(f.hides(), 1);
});
for (const state of ['quitting', 'closing', 'window destroyed']) {
  test(`pending blur does not detach after ${state}`, () => {
    const f = fixture(); f.blur();
    if (state === 'quitting') f.context.isQuitting = true;
    else if (state === 'closing') f.owner.closing = true;
    else f.context.hasLiveWindow = () => false;
    f.settle(); assert.equal(f.hides(), 0);
  });
}
test('a stale blur does not dismiss a newly opened overlay', () => {
  const f = fixture(); f.blur(); f.owner.surfaceGeneration++; f.settle(); assert.equal(f.hides(), 0);
});
test('Find and address menu keep their existing production blur exceptions', () => {
  for (const special of ['find', 'address menu']) {
    const f = fixture();
    if (special === 'find') f.owner.overlayMode = 'find'; else f.owner.addressMenuTicket = 1;
    f.blur(); f.settle(); assert.equal(f.hides(), 0);
  }
});

test('blur is not a dismissal while an island drag is active', () => {
  const f = fixture(); f.owner.overlayMode = 'panel'; f.owner.overlayDragging = true;
  f.blur(); f.settle(); assert.equal(f.hides(), 0);
  f.owner.overlayDragging = false;
  f.blur(); f.settle(); assert.equal(f.hides(), 1);
});
