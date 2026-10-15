'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  visiblePaneIds, isVisiblePaneId, commandTargetTab, focusedPane, glanceLayoutPayload,
} = require('../../src/main/glance-focus');

const mainWc = { id: 'main-wc' };
const refWc = { id: 'ref-wc' };
const overlayWc = { id: 'overlay-wc' };
const live = { main: mainWc, ref: refWc };
const contentsOf = (id) => live[id] ?? null;
const runtime = (over = {}) => ({ activeTabId: 'main', glanceTabId: 'ref', focusedPaneTabId: null, ...over });

test('the visible panes are the main page and the reference, in that order', () => {
  assert.deepEqual(visiblePaneIds(runtime()), ['main', 'ref']);
  assert.deepEqual(visiblePaneIds(runtime({ glanceTabId: null })), ['main']);
  assert.deepEqual(visiblePaneIds(null), []);
  assert.equal(isVisiblePaneId(runtime(), 'ref'), true);
  assert.equal(isVisiblePaneId(runtime(), 'other'), false);
  assert.equal(isVisiblePaneId(runtime(), null), false);
});

test('rule 1: the pane whose webContents sent the key is the target', () => {
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'main' }), refWc, contentsOf), 'ref');
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), mainWc, contentsOf), 'main');
});

test('rule 2: a menu click or a chrome surface falls back to the focused pane', () => {
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), null, contentsOf), 'ref');
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), overlayWc, contentsOf), 'ref');
});

test('rule 3: a stale or dead focused pane falls back to the main page', () => {
  // The reference was replaced: the old id is no longer a visible pane.
  assert.equal(commandTargetTab(runtime({ glanceTabId: 'new', focusedPaneTabId: 'ref' }), null, contentsOf), 'main');
  // Glance closed.
  assert.equal(commandTargetTab(runtime({ glanceTabId: null, focusedPaneTabId: 'ref' }), null, contentsOf), 'main');
  // The focused pane's renderer is gone.
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), null, () => null), 'main');
  assert.equal(commandTargetTab(runtime(), null, contentsOf), 'main');
  assert.equal(commandTargetTab(null, refWc, contentsOf), null);
});

test('a sender that is a dead pane never matches', () => {
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'main' }), refWc, (id) => (id === 'main' ? mainWc : null)), 'main');
});

test('focusedPane is glance only while the focused id is the current reference', () => {
  assert.equal(focusedPane(runtime({ focusedPaneTabId: 'ref' })), 'glance');
  assert.equal(focusedPane(runtime({ focusedPaneTabId: 'main' })), 'main');
  assert.equal(focusedPane(runtime({ glanceTabId: 'new', focusedPaneTabId: 'ref' })), 'main');
  assert.equal(focusedPane(runtime({ glanceTabId: null, focusedPaneTabId: null })), 'main');
  assert.equal(focusedPane(null), 'main');
});

test('glanceLayoutPayload adds focusedPane to a layout and keeps null as null', () => {
  const layout = { direction: 'horizontal', ratio: 0.62 };
  assert.deepEqual(glanceLayoutPayload(layout, 'glance'), { direction: 'horizontal', ratio: 0.62, focusedPane: 'glance' });
  assert.deepEqual(glanceLayoutPayload(layout, 'anything'), { direction: 'horizontal', ratio: 0.62, focusedPane: 'main' });
  assert.equal(glanceLayoutPayload(null, 'glance'), null);
  assert.equal('focusedPane' in layout, false, 'the geometry object is not mutated');
});
