'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SPLIT_HEADER_HEIGHT,
  PANE_MIN_CONTENT_HEIGHT,
  DEFAULT_PANE_MIN_WIDTH,
  defaultSplitLayout,
  normalizeSplitLayout,
  computeSplitLayout,
  layoutForDivider,
} = require('../../src/main/split-layout');

// With the default 300 px pane minimum, a 12 px divider and 30 + 160 px of
// minimum pane height, the spec §3.2 breakpoints are:
//   2 columns ≥ 612 wide; 3 columns ≥ 924; 4 columns ≥ 1236
//   2 rows ≥ 392 tall; 3 rows ≥ 594; 4 rows ≥ 796; grid needs 612 × 392
const page = (width, height) => ({ x: 0, y: 68, width, height });
const mode = (w, h, n, layout = defaultSplitLayout(n)) => computeSplitLayout(page(w, h), layout, n, {}).mode;

test('constants match the spec', () => {
  assert.equal(SPLIT_HEADER_HEIGHT, 30);
  assert.equal(PANE_MIN_CONTENT_HEIGHT, 160);
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

test('two panes: saved columns when width ≥ 612; rows below that; focus only when rows do not fit', () => {
  assert.equal(mode(612, 400, 2), 'columns');
  assert.equal(mode(611, 400, 2), 'rows');
  assert.equal(mode(611, 392, 2), 'rows');
  assert.equal(mode(611, 391, 2), 'focus');
});

test('three panes: columns → rows → focus only, at the breakpoints', () => {
  assert.equal(mode(924, 400, 3), 'columns');
  assert.equal(mode(923, 594, 3), 'rows');
  assert.equal(mode(923, 593, 3), 'focus');
});

test('four panes: grid → four columns → four rows → focus only, at the breakpoints', () => {
  assert.equal(mode(612, 392, 4), 'grid');
  assert.equal(mode(1236, 391, 4), 'columns');
  assert.equal(mode(611, 796, 4), 'rows');
  assert.equal(mode(1235, 391, 4), 'focus');
});

test('a measured pane minimum moves the breakpoints', () => {
  const at = (w, min) => computeSplitLayout(page(w, 600), defaultSplitLayout(2), 2, { paneMinWidth: min }).mode;
  assert.equal(at(812, 400), 'columns');
  assert.equal(at(811, 400), 'rows');
});

test('every pane has a 30 px header band at its top and content below it', () => {
  const result = computeSplitLayout(page(1000, 600), defaultSplitLayout(2), 2, {});
  assert.equal(result.panes.length, 2);
  for (const { header, content } of result.panes) {
    assert.equal(header.height, 30);
    assert.equal(content.y, header.y + 30);
    assert.equal(content.x, header.x);
    assert.equal(content.width, header.width);
    assert.equal(header.y, 68);
    assert.equal(content.y + content.height, 668);
  }
  const [a, b] = result.panes;
  assert.equal(a.header.x, 0);
  assert.equal(b.header.x, a.header.width + 12);
  assert.equal(b.header.x + b.header.width, 1000);
});

test('saved column widths are honored and kept above the pane minimum', () => {
  const result = computeSplitLayout(page(1012, 600), { kind: 'columns', widths: [0.7, 0.3] }, 2, {});
  assert.equal(result.panes[0].header.width, 700);
  assert.equal(result.panes[1].header.width, 300);
  const squeezed = computeSplitLayout(page(712, 600), { kind: 'columns', widths: [0.8, 0.2] }, 2, {});
  assert.equal(squeezed.panes[1].header.width, 300, 'a narrow saved share still gets the minimum');
  assert.equal(squeezed.panes[0].header.width, 400);
});

test('the grid is one shared cross', () => {
  const result = computeSplitLayout(page(1012, 812), { kind: 'grid', column: 0.6, row: 0.5 }, 4, {});
  const [tl, tr, bl, br] = result.panes;
  assert.equal(tl.header.width, bl.header.width);
  assert.equal(tr.header.x, br.header.x);
  assert.equal(tl.header.width, 600);
  assert.equal(tl.content.y + tl.content.height + 12, bl.header.y);
  assert.deepEqual(result.dividers.map((d) => [d.axis, d.saved]), [['x', true], ['y', true]]);
});

test('focus only: non-focused panes are header bands, stacked; focused content fills the rest', () => {
  const result = computeSplitLayout(page(500, 300), defaultSplitLayout(3), 3, { focusedIndex: 1 });
  assert.equal(result.mode, 'focus');
  const [a, b, c] = result.panes;
  assert.equal(a.header.y, 68);
  assert.equal(c.header.y, 98);
  assert.equal(a.content.height, 0);
  assert.equal(c.content.height, 0);
  assert.equal(b.header.y, 128);
  assert.equal(b.content.y, 158);
  assert.equal(b.content.y + b.content.height, 368);
  assert.deepEqual(result.dividers, []);
});

test('fallback dividers are marked saved:false and layoutForDivider returns null for them', () => {
  const result = computeSplitLayout(page(600, 500), defaultSplitLayout(2), 2, {});
  assert.equal(result.mode, 'rows');
  assert.deepEqual(result.dividers.map((d) => [d.axis, d.saved]), [['y', false]]);
  assert.equal(layoutForDivider(page(600, 500), defaultSplitLayout(2), 2, { index: 0, axis: 'y' }, { x: 300, y: 300 }, {}), null);
});

test('layoutForDivider moves the shared column of two panes within the 0.2 floor and the minimum', () => {
  const bounds = page(1012, 600);
  const moved = layoutForDivider(bounds, defaultSplitLayout(2), 2, { index: 0, axis: 'x' }, { x: 606, y: 300 }, {});
  assert.deepEqual(moved, { kind: 'columns', widths: [0.6, 0.4] });
  const tooFar = layoutForDivider(bounds, defaultSplitLayout(2), 2, { index: 0, axis: 'x' }, { x: 990, y: 300 }, {});
  assert.deepEqual(tooFar, { kind: 'columns', widths: [0.7, 0.3] }, 'stops where the second pane hits its 300 px minimum');
  assert.equal(layoutForDivider(bounds, defaultSplitLayout(2), 2, { index: 3, axis: 'x' }, { x: 500, y: 0 }, {}), null);
});

test('splitLayoutPayload pairs each pane with its tab and marks the focused one', () => {
  const { splitLayoutPayload } = require('../../src/main/split-layout');
  const geometry = computeSplitLayout(page(1000, 600), defaultSplitLayout(2), 2, {});
  const panes = [
    { tabId: 'a', title: 'Docs', favicon: null, private: false, canGoBack: true, loading: false },
    { tabId: 'b', title: 'Preview', favicon: 'data:image/png;base64,AAAA', private: true, canGoBack: false, loading: true },
  ];
  const payload = splitLayoutPayload('split-1', geometry, panes, 1);
  assert.equal(payload.splitId, 'split-1');
  assert.equal(payload.mode, 'columns');
  assert.deepEqual(payload.panes.map((p) => [p.tabId, p.focused]), [['a', false], ['b', true]]);
  assert.deepEqual(payload.panes[0].header, geometry.panes[0].header);
  assert.equal(payload.panes[1].favicon, 'data:image/png;base64,AAAA');
  assert.equal(payload.dividers.length, 1);
  assert.equal(splitLayoutPayload('x', null, panes, 0), null);
  const unsafe = splitLayoutPayload('s', geometry, [{ ...panes[0], favicon: 'https://evil/icon.png' }, panes[1]], 0);
  assert.equal(unsafe.panes[0].favicon, null, 'only PNG data reaches the chrome');
});
