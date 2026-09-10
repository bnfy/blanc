'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { showOverlayView, hideOverlayView } = require('../../src/main/overlay-view-lifecycle');

function harness() {
  const children = [];
  const detached = [];
  const view = { visible: true, setVisible(value) { this.visible = value; } };
  const window = { contentView: {
    addChildView(child) {
      const index = children.indexOf(child);
      if (index !== -1) children.splice(index, 1);
      children.push(child);
    },
    removeChildView(child) {
      detached.push(child);
      children.splice(children.indexOf(child), 1);
    },
  } };
  return { window, view, children, detached };
}

test('Linux Cancel and reopen retain one window-owned overlay and restore visibility', () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    showOverlayView(h.window, h.view, 'linux');
    assert.equal(h.view.visible, true);
    assert.deepEqual(h.children, [h.view]);
    hideOverlayView(h.window, h.view, 'linux');
    assert.equal(h.view.visible, false, 'closed overlay must not paint or intercept input');
    assert.deepEqual(h.children, [h.view], 'native view must never detach between opens');
  }
  assert.deepEqual(h.detached, []);
});

test('Linux reopen raises the retained overlay above a newly attached tab', () => {
  const h = harness();
  showOverlayView(h.window, h.view, 'linux');
  hideOverlayView(h.window, h.view, 'linux');
  const tab = {};
  h.window.contentView.addChildView(tab);
  showOverlayView(h.window, h.view, 'linux');
  assert.deepEqual(h.children, [tab, h.view]);
  assert.equal(h.view.visible, true);
  assert.equal(h.detached.length, 0);
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} preserves overlay detach and reattach behavior`, () => {
    const h = harness();
    showOverlayView(h.window, h.view, platform);
    hideOverlayView(h.window, h.view, platform);
    assert.deepEqual(h.children, []);
    assert.deepEqual(h.detached, [h.view]);
    showOverlayView(h.window, h.view, platform);
    assert.deepEqual(h.children, [h.view]);
  });
}
