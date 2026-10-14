'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { attachTabView, releaseTabView } = require('../../src/main/tab-view-lifecycle');

function harness() {
  const children = [];
  const removed = [];
  const deferred = [];
  const created = [];
  let destroyed = false;
  const window = {
    isDestroyed: () => destroyed,
    contentView: {
      get children() { return [...children]; },
      addChildView(child, index) {
        const at = children.indexOf(child);
        if (at !== -1) children.splice(at, 1);
        children.splice(index ?? children.length, 0, child);
      },
      removeChildView(child) {
        removed.push(child);
        children.splice(children.indexOf(child), 1);
      },
    },
  };
  const createView = () => {
    const view = {
      setBackgroundColor(color) { this.background = color; },
      setBounds(bounds) { this.bounds = bounds; },
    };
    created.push(view);
    return view;
  };
  const options = (platform) => ({ platform, createView, defer: (task) => deferred.push(task) });
  return {
    window, children, removed, created, options,
    flush: () => { for (const task of deferred.splice(0)) task(); },
    destroy: () => { destroyed = true; },
  };
}

test('Linux hides a switched-away tab view without ever removing it', () => {
  const h = harness();
  const tab = {};
  attachTabView(h.window, tab, h.options('linux'));
  h.flush();
  for (let i = 0; i < 3; i++) {
    assert.equal(releaseTabView(h.window, tab, 'linux'), false);
    assert.equal(attachTabView(h.window, tab, h.options('linux')), false, 'a window-owned view is only re-raised');
  }
  assert.equal(h.removed.includes(tab), false);
  assert.deepEqual(h.children, [tab]);
});

test('Linux adds a fresh 1x1 transparent View beneath a view arriving from another window, then removes it', () => {
  const source = harness();
  const destination = harness();
  const tab = {};
  attachTabView(source.window, tab, source.options('linux'));
  source.flush();
  assert.equal(attachTabView(destination.window, tab, destination.options('linux')), true);
  const [nudge] = destination.created;
  assert.ok(nudge, 'the arriving view must nudge its new window');
  assert.deepEqual(nudge.bounds, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(nudge.background, '#00000000');
  assert.deepEqual(destination.children, [nudge, tab], 'the nudge sits beneath the tab view');
  destination.flush();
  assert.deepEqual(destination.children, [tab]);
  assert.deepEqual(destination.removed, [nudge]);
});

test('Linux adds a new nudge for every arriving view and none for a re-raised one', () => {
  const h = harness();
  const first = {};
  const second = {};
  attachTabView(h.window, first, h.options('linux'));
  h.flush();
  attachTabView(h.window, first, h.options('linux'));
  attachTabView(h.window, second, h.options('linux'));
  h.flush();
  assert.equal(h.created.length, 2, 'showing an existing view again does not revive a page');
  assert.deepEqual(h.children, [first, second]);
});

test('a window destroyed before the tick is left alone', () => {
  const h = harness();
  attachTabView(h.window, {}, h.options('linux'));
  h.destroy();
  h.flush();
  assert.deepEqual(h.removed, []);
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} keeps removing switched-away tab views and never nudges`, () => {
    const h = harness();
    const tab = {};
    attachTabView(h.window, tab, h.options(platform));
    assert.equal(releaseTabView(h.window, tab, platform), true);
    assert.deepEqual(h.removed, [tab]);
    assert.equal(attachTabView(h.window, tab, h.options(platform)), true);
    h.flush();
    assert.deepEqual(h.created, []);
    assert.deepEqual(h.children, [tab]);
  });
}
