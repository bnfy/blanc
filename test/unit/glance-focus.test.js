'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  visiblePaneIds, isVisiblePaneId, commandTargetTab, focusedPane, glanceLayoutPayload, foregroundOpenRole, livePaneId,
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

test('a pane that really holds keyboard focus wins over a stale record', () => {
  // Attaching the reference view can fire a transient focus on it and then
  // hand focus back to the main page without a focus event for the main page.
  const focusedMain = { id: 'main-wc', isFocused: () => true };
  const blurredRef = { id: 'ref-wc', isFocused: () => false };
  const lookup = (id) => ({ main: focusedMain, ref: blurredRef }[id] ?? null);
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), null, lookup), 'main');
  // With neither pane focused (a chrome surface holds focus), the record decides.
  const neither = (id) => ({ main: { isFocused: () => false }, ref: { isFocused: () => false } }[id] ?? null);
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), null, neither), 'ref');
  // A sending pane still wins over everything.
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), blurredRef, lookup), 'ref');
});

test('a foreground tab the reference opens becomes the reference; any other opener makes it the main page', () => {
  // Links, window.open, Search for…, View Page Source: one rule for every path.
  assert.equal(foregroundOpenRole(runtime(), 'ref'), 'glance');
  assert.equal(foregroundOpenRole(runtime(), 'main'), 'main');
  assert.equal(foregroundOpenRole(runtime(), 'other'), 'main');
  assert.equal(foregroundOpenRole(runtime({ glanceTabId: null }), 'ref'), 'main');
  assert.equal(foregroundOpenRole(null, 'ref'), 'main');
});

test('livePaneId names the visible pane that really holds keyboard focus, else null', () => {
  // Focus can land on a pane without a webContents focus event (Linux
  // restores focus to the last focused view when the window is activated),
  // so the record is re-read from live focus at those moments.
  const focused = (which) => (id) => ({ main: { isFocused: () => which === 'main' }, ref: { isFocused: () => which === 'ref' } }[id] ?? null);
  assert.equal(livePaneId(runtime(), focused('ref')), 'ref');
  assert.equal(livePaneId(runtime(), focused('main')), 'main');
  assert.equal(livePaneId(runtime(), focused('none')), null);
  assert.equal(livePaneId(runtime({ glanceTabId: null }), focused('ref')), null, 'a pane that is not visible never counts');
  assert.equal(livePaneId(runtime(), () => null), null);
  assert.equal(livePaneId(null, focused('ref')), null);
});
