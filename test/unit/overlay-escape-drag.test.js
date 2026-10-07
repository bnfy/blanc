'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = main.indexOf("  rt().overlayView.webContents.on('before-input-event', bindWindowRuntime(owner, (event, input) => {");
const end = main.indexOf('\n  // Losing focus', start);
const registration = main.slice(start, end);

test('lift found the overlay Escape registration with its drag guard', () => {
  assert.ok(start !== -1 && end !== -1, 'Escape registration moved: update this lift');
  assert.match(registration, /overlayDragActive\(rt\(\)\)/);
});

function fixture(dragging) {
  const wc = new EventEmitter();
  const sent = [];
  wc.isDestroyed = () => false;
  wc.send = (channel) => sent.push(channel);
  const owner = { overlayView: { webContents: wc }, overlayMode: 'panel', overlayDragging: dragging,
    workspaceSwitcherOpen: false };
  let hides = 0;
  vm.runInNewContext(registration, {
    owner, rt: () => owner, bindWindowRuntime: (_o, fn) => fn,
    overlayDragActive: (r) => r.overlayDragging === true,
    hideOverlay: () => { hides += 1; },
  });
  const press = () => {
    let prevented = false;
    wc.emit('before-input-event', { preventDefault: () => { prevented = true; } },
      { type: 'keyDown', key: 'Escape' });
    return prevented;
  };
  return { press, hides: () => hides, sent };
}

test('Escape during an island drag reaches the overlay and keeps the panel', () => {
  const f = fixture(true);
  assert.equal(f.press(), false, 'not swallowed by main');
  assert.equal(f.hides(), 0);
});

test('Escape without a drag still dismisses', () => {
  const f = fixture(false);
  assert.equal(f.press(), true);
  assert.equal(f.hides(), 1);
});
