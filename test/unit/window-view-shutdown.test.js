'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWindowViewShutdown } = require('../../src/main/window-view-shutdown');

function fixture({ synchronous = false } = {}) {
  const queued = [];
  const events = [];
  const makeView = () => {
    const wc = new EventEmitter();
    wc.dead = false;
    wc.isDestroyed = () => wc.dead;
    wc.finish = () => { wc.dead = true; wc.emit('destroyed'); };
    wc.close = () => { events.push('close'); if (synchronous) wc.finish(); };
    return { webContents: wc, setVisible: (value) => assert.equal(value, false) };
  };
  const a = makeView(); const b = makeView();
  const window = {
    dead: false, isDestroyed() { return this.dead; },
    webContents: { isDestroyed: () => false, focus: () => events.push('focus') },
    contentView: { children: [], addChildView(view) { this.children.push(view); } },
  };
  let resumed = 0; let prevented = 0;
  const drain = createWindowViewShutdown({ window, getViews: () => [a, b, a, null],
    defer: (fn) => queued.push(fn), resume: () => resumed++ });
  const event = { preventDefault: () => prevented++ };
  return { a, b, window, drain, event, queued, events, get resumed() { return resumed; }, get prevented() { return prevented; } };
}

test('close waits for all detached contents and exits native destruction stack before resume', () => {
  const f = fixture();
  assert.equal(f.drain(f.event), true);
  assert.equal(f.window.contentView.children.length, 2);
  assert.deepEqual(f.events, ['focus', 'close', 'close']);
  f.a.webContents.finish();
  assert.equal(f.queued.length, 0);
  f.drain(f.event);
  assert.equal(f.events.filter((v) => v === 'close').length, 2);
  f.b.webContents.finish();
  assert.equal(f.resumed, 0);
  f.queued.shift()();
  assert.equal(f.resumed, 1);
  assert.equal(f.drain(f.event), false);
});
test('synchronous destruction does not resume early or close a duplicate twice', () => {
  const f = fixture({ synchronous: true });
  f.drain(f.event);
  assert.equal(f.queued.length, 1);
  assert.equal(f.resumed, 0);
  f.queued.shift()();
  assert.equal(f.resumed, 1);
});
test('external window destruction prevents deferred resume', () => {
  const f = fixture({ synchronous: true });
  f.drain(f.event);
  f.window.dead = true;
  f.queued.shift()();
  assert.equal(f.resumed, 0);
});
