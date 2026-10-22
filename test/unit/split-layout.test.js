'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PANE_MIN_HEIGHT,
  PANE_BORDER,
  SPLIT_INSET,
  DEFAULT_PANE_MIN_WIDTH,
  defaultSplitLayout,
  normalizeSplitLayout,
  computeSplitLayout,
  layoutForDivider,
} = require('../../src/main/split-layout');

// The cards sit 8 px in from every edge of the page region and 8 px apart.
// With the default 300 px pane minimum and a 190 px minimum card height, the
// spec §3.2 breakpoints (page width/height, inset included) are:
//   2 columns ≥ 624 wide; 3 columns ≥ 932; 4 columns ≥ 1240
//   2 rows ≥ 404 tall; 3 rows ≥ 602; 4 rows ≥ 800; grid needs 624 × 404
const page = (width, height) => ({ x: 0, y: 68, width, height });
const mode = (w, h, n, layout = defaultSplitLayout(n)) => computeSplitLayout(page(w, h), layout, n, {}).mode;

test('constants match the spec', () => {
  assert.equal(PANE_MIN_HEIGHT, 190);
  assert.equal(PANE_BORDER, 1);
  assert.equal(SPLIT_INSET, 8);
  assert.equal(DEFAULT_PANE_MIN_WIDTH, 300);
});

test('normalize: columns widths below 0.2 or not summing to 1 reset to equal', () => {
  assert.deepEqual(normalizeSplitLayout({ kind: 'columns', widths: [0.9, 0.1] }, 2), { kind: 'columns', widths: [0.5, 0.5] });
  assert.deepEqual(normalizeSplitLayout({ kind: 'columns', widths: [0.5, 0.2] }, 2), { kind: 'columns', widths: [0.5, 0.5] });
  assert.deepEqual(normalizeSplitLayout({ kind: 'columns', widths: [0.6, 0.4] }, 2), { kind: 'columns', widths: [0.6, 0.4] });
  assert.deepEqual(normalizeSplitLayout({ kind: 'columns', widths: ['x', 1] }, 2), { kind: 'columns', widths: [0.5, 0.5] });
  const three = normalizeSplitLayout(null, 3);
  assert.equal(three.widths.length, 3);
  assert.ok(Math.abs(three.widths.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('normalize: grid values clamp to 0.25–0.75', () => {
  assert.deepEqual(normalizeSplitLayout({ kind: 'grid', column: 0.1, row: 0.9 }, 4), { kind: 'grid', column: 0.25, row: 0.75 });
  assert.deepEqual(normalizeSplitLayout({ kind: 'grid', column: 'a', row: null }, 4), { kind: 'grid', column: 0.5, row: 0.5 });
});

test('normalize: wrong kind for the pane count resets to the default', () => {
  assert.deepEqual(normalizeSplitLayout({ kind: 'grid', column: 0.4, row: 0.4 }, 2), defaultSplitLayout(2));
  assert.deepEqual(normalizeSplitLayout({ kind: 'columns', widths: [0.25, 0.25, 0.25, 0.25] }, 4), defaultSplitLayout(4));
  assert.equal(normalizeSplitLayout({ kind: 'columns', widths: [1] }, 1), null);
  assert.equal(normalizeSplitLayout(null, 5), null);
});

test('two panes: saved columns when width ≥ 624; rows below that; focus only when rows do not fit', () => {
  assert.equal(mode(624, 400, 2), 'columns');
  assert.equal(mode(623, 420, 2), 'rows');
  assert.equal(mode(623, 404, 2), 'rows');
  assert.equal(mode(623, 403, 2), 'focus');
});

test('three panes: columns → rows → focus only, at the breakpoints', () => {
  assert.equal(mode(932, 420, 3), 'columns');
  assert.equal(mode(931, 602, 3), 'rows');
  assert.equal(mode(931, 601, 3), 'focus');
});

test('four panes: grid → four columns → four rows → focus only, at the breakpoints', () => {
  assert.equal(mode(624, 404, 4), 'grid');
  assert.equal(mode(1240, 403, 4), 'columns');
  assert.equal(mode(623, 800, 4), 'rows');
  assert.equal(mode(1239, 403, 4), 'focus');
});

test('a measured pane minimum moves the breakpoints', () => {
  const at = (w, min) => computeSplitLayout(page(w, 600), defaultSplitLayout(2), 2, { paneMinWidth: min }).mode;
  assert.equal(at(824, 400), 'columns');
  assert.equal(at(823, 400), 'rows');
});

test('every pane is a card inset from the page region; its page sits inside the 1 px border', () => {
  const result = computeSplitLayout(page(1012, 600), defaultSplitLayout(2), 2, {});
  assert.equal(result.panes.length, 2);
  for (const { frame, content } of result.panes) {
    assert.equal(frame.y, 68 + 8, 'cards start one gap below the strip');
    assert.equal(frame.y + frame.height, 668 - 8, 'one gap above the bottom');
    assert.deepEqual(content, { x: frame.x + 1, y: frame.y + 1, width: frame.width - 2, height: frame.height - 2 });
  }
  const [a, b] = result.panes;
  assert.equal(a.frame.x, 8);
  assert.equal(b.frame.x, a.frame.x + a.frame.width + 8, 'the gap between panes matches the gap under the strip');
  assert.equal(b.frame.x + b.frame.width, 1012 - 8);
});

test('saved column widths are honored and kept above the pane minimum', () => {
  const result = computeSplitLayout(page(1024, 600), { kind: 'columns', widths: [0.7, 0.3] }, 2, {});
  assert.equal(result.panes[0].frame.width, 700);
  assert.equal(result.panes[1].frame.width, 300);
  const squeezed = computeSplitLayout(page(724, 600), { kind: 'columns', widths: [0.8, 0.2] }, 2, {});
  assert.equal(squeezed.panes[1].frame.width, 300, 'a narrow saved share still gets the minimum');
  assert.equal(squeezed.panes[0].frame.width, 400);
});

test('the grid is one shared cross', () => {
  const result = computeSplitLayout(page(1024, 824), { kind: 'grid', column: 0.6, row: 0.5 }, 4, {});
  const [tl, tr, bl, br] = result.panes;
  assert.equal(tl.frame.width, bl.frame.width);
  assert.equal(tr.frame.x, br.frame.x);
  assert.equal(tl.frame.width, 600);
  assert.equal(tl.frame.y + tl.frame.height + 8, bl.frame.y);
  assert.deepEqual(result.dividers.map((d) => [d.axis, d.saved]), [['x', true], ['y', true]]);
});

test('focus only: the focused card takes the whole region and the others are hidden', () => {
  const result = computeSplitLayout(page(500, 300), defaultSplitLayout(3), 3, { focusedIndex: 1 });
  assert.equal(result.mode, 'focus');
  const [a, b, c] = result.panes;
  assert.equal(a.frame, null);
  assert.equal(c.frame, null);
  assert.equal(a.content, null);
  assert.deepEqual(b.frame, { x: 8, y: 76, width: 484, height: 284 });
  assert.deepEqual(result.dividers, []);
});

test('cornerTabBounds sits a tab on the card corner, inside the card', () => {
  const { cornerTabBounds, CORNER_TAB_HEIGHT } = require('../../src/main/split-layout');
  const frame = { x: 6, y: 68, width: 500, height: 400 };
  assert.deepEqual(cornerTabBounds(frame, 120), { x: 6 + 500 - 120, y: 68 + 400 - CORNER_TAB_HEIGHT, width: 120, height: CORNER_TAB_HEIGHT });
  assert.equal(cornerTabBounds(frame, 900).width, 500, 'never wider than its card');
  assert.equal(cornerTabBounds(null, 120), null);
});

test('fallback dividers are marked saved:false and layoutForDivider returns null for them', () => {
  const result = computeSplitLayout(page(600, 500), defaultSplitLayout(2), 2, {});
  assert.equal(result.mode, 'rows');
  assert.deepEqual(result.dividers.map((d) => [d.axis, d.saved]), [['y', false]]);
  assert.equal(layoutForDivider(page(600, 500), defaultSplitLayout(2), 2, { index: 0, axis: 'y' }, { x: 300, y: 300 }, {}), null);
});

test('layoutForDivider moves the shared column of two panes within the 0.2 floor and the minimum', () => {
  const bounds = page(1024, 600);
  const moved = layoutForDivider(bounds, defaultSplitLayout(2), 2, { index: 0, axis: 'x' }, { x: 612, y: 300 }, {});
  assert.deepEqual(moved, { kind: 'columns', widths: [0.6, 0.4] });
  const tooFar = layoutForDivider(bounds, defaultSplitLayout(2), 2, { index: 0, axis: 'x' }, { x: 996, y: 300 }, {});
  assert.deepEqual(tooFar, { kind: 'columns', widths: [0.7, 0.3] }, 'stops where the second pane hits its 300 px minimum');
  assert.equal(layoutForDivider(bounds, defaultSplitLayout(2), 2, { index: 3, axis: 'x' }, { x: 500, y: 0 }, {}), null);
});

test('splitLayoutPayload pairs each pane with its tab and marks the focused one', () => {
  const { splitLayoutPayload } = require('../../src/main/split-layout');
  const geometry = computeSplitLayout(page(1000, 600), defaultSplitLayout(2), 2, {});
  const panes = [
    { tabId: 'a', title: 'Docs', favicon: null, private: false },
    { tabId: 'b', title: 'Preview', favicon: 'data:image/png;base64,AAAA', private: true },
  ];
  const payload = splitLayoutPayload('split-1', geometry, panes, 1);
  assert.equal(payload.splitId, 'split-1');
  assert.equal(payload.mode, 'columns');
  assert.deepEqual(payload.panes.map((p) => [p.tabId, p.focused]), [['a', false], ['b', true]]);
  assert.deepEqual(payload.panes[0].frame, geometry.panes[0].frame);
  assert.equal('header' in payload.panes[0], false);
  assert.equal(payload.panes[1].favicon, 'data:image/png;base64,AAAA');
  assert.equal(payload.dividers.length, 1);
  assert.equal(splitLayoutPayload('x', null, panes, 0), null);
  const unsafe = splitLayoutPayload('s', geometry, [{ ...panes[0], favicon: 'https://evil/icon.png' }, panes[1]], 0);
  assert.equal(unsafe.panes[0].favicon, null, 'only PNG data reaches the chrome');
});

test('cornerTabHit: the × is the tab\'s right end, the fillet band is neither', () => {
  const { cornerTabHit, CORNER_TAB_FILLET, CORNER_TAB_CLOSE_WIDTH } = require('../../src/main/split-layout');
  const size = { width: 160, height: 36 };
  assert.equal(cornerTabHit(size, { x: 160 - 5, y: 20 }), 'close');
  assert.equal(cornerTabHit(size, { x: 160 - CORNER_TAB_CLOSE_WIDTH, y: 20 }), 'close');
  assert.equal(cornerTabHit(size, { x: 160 - CORNER_TAB_CLOSE_WIDTH - 1, y: 20 }), 'tab');
  assert.equal(cornerTabHit(size, { x: CORNER_TAB_FILLET, y: 20 }), 'tab');
  assert.equal(cornerTabHit(size, { x: CORNER_TAB_FILLET - 1, y: 20 }), null, 'left fillet');
  assert.equal(cornerTabHit(size, { x: 100, y: CORNER_TAB_FILLET - 1 }), null, 'top fillet band');
  assert.equal(cornerTabHit(size, { x: 200, y: 20 }), null);
});

test('cornerTabSite: a web page shows its host and port, anything else its title', () => {
  const { cornerTabSite } = require('../../src/main/split-layout');
  assert.equal(cornerTabSite('http://127.0.0.1:9278/right', 'Right'), '127.0.0.1:9278');
  assert.equal(cornerTabSite('https://www.example.com/a', 'A'), 'www.example.com');
  assert.equal(cornerTabSite('blanc://newtab/', 'New Tab'), 'New Tab');
  assert.equal(cornerTabSite('not a url', ''), '');
});

test('the card radius in split-layout.js matches the stylesheet', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { PANE_RADIUS } = require('../../src/main/split-layout');
  const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/styles.css'), 'utf8');
  assert.match(css, new RegExp(`--split-pane-radius: ${PANE_RADIUS}px;`));
});
