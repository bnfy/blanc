'use strict';

// Pure geometry for Split View (F53): 2–4 panes, each with a header band at
// its top that the chrome document paints in space the page views leave
// free. No Electron imports, so every breakpoint and fallback stays
// unit-testable. See docs/superpowers/specs/2026-10-19-split-view-design.md §3.2.

const { DIVIDER_SIZE } = require('./glance-layout');

const SPLIT_HEADER_HEIGHT = 30;
const PANE_MIN_CONTENT_HEIGHT = 160;
/** Until the strip has measured a pane header's compact width. */
const DEFAULT_PANE_MIN_WIDTH = 300;
const MIN_COLUMN_SHARE = 0.2;
const MIN_GRID_SHARE = 0.25;
const MAX_GRID_SHARE = 0.75;

const dimension = (value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
const bounds = (b) => ({ x: dimension(b?.x), y: dimension(b?.y), width: dimension(b?.width), height: dimension(b?.height) });
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const equalWidths = (n) => Array.from({ length: n }, () => 1 / n);

/** The default saved layout for a pane count, or null outside 2–4. */
function defaultSplitLayout(paneCount) {
  if (paneCount === 2 || paneCount === 3) return { kind: 'columns', widths: equalWidths(paneCount) };
  if (paneCount === 4) return { kind: 'grid', column: 0.5, row: 0.5 };
  return null;
}

/** The §3.2 schema, normalized; malformed input becomes the default. */
function normalizeSplitLayout(layout, paneCount) {
  const fallback = defaultSplitLayout(paneCount);
  if (!fallback) return null;
  if (fallback.kind === 'grid') {
    if (layout?.kind !== 'grid') return fallback;
    const share = (v) => (Number.isFinite(v) ? clamp(v, MIN_GRID_SHARE, MAX_GRID_SHARE) : 0.5);
    return { kind: 'grid', column: share(layout.column), row: share(layout.row) };
  }
  const widths = layout?.kind === 'columns' && Array.isArray(layout.widths) ? layout.widths : null;
  if (!widths || widths.length !== paneCount) return fallback;
  if (!widths.every((w) => Number.isFinite(w) && w >= MIN_COLUMN_SHARE)) return fallback;
  const sum = widths.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-6) return fallback;
  return { kind: 'columns', widths: widths.map((w) => w / sum) };
}

/** Pixel sizes from shares, rounded, with the remainder on the last. */
function pixels(shares, total) {
  const out = shares.map((s) => Math.round(s * total));
  out[out.length - 1] = total - out.slice(0, -1).reduce((a, b) => a + b, 0);
  return out;
}

/** Raise any size below `min` to it, taking the difference from the others'
 *  room above `min`, in proportion. The caller has checked the total fits. */
function withMinimum(sizes, min) {
  const out = [...sizes];
  const deficit = out.reduce((sum, s) => sum + Math.max(0, min - s), 0);
  if (deficit <= 0) return out;
  const room = out.reduce((sum, s) => sum + Math.max(0, s - min), 0);
  let taken = 0;
  const donors = out.map((s, i) => (s > min ? i : -1)).filter((i) => i >= 0);
  donors.forEach((i, k) => {
    const share = k === donors.length - 1 ? deficit - taken : Math.round(deficit * ((out[i] - min) / room));
    out[i] -= share;
    taken += share;
  });
  return out.map((s) => Math.max(s, min));
}

const pane = (x, y, width, height) => ({
  header: { x, y, width, height: Math.min(SPLIT_HEADER_HEIGHT, height) },
  content: { x, y: y + Math.min(SPLIT_HEADER_HEIGHT, height), width, height: Math.max(0, height - SPLIT_HEADER_HEIGHT) },
});

function columns(page, widths) {
  const panes = [];
  const dividers = [];
  let x = page.x;
  widths.forEach((w, i) => {
    panes.push(pane(x, page.y, w, page.height));
    x += w;
    if (i < widths.length - 1) {
      dividers.push({ index: i, axis: 'x', rect: { x, y: page.y, width: DIVIDER_SIZE, height: page.height } });
      x += DIVIDER_SIZE;
    }
  });
  return { panes, dividers };
}

function rows(page, heights) {
  const panes = [];
  const dividers = [];
  let y = page.y;
  heights.forEach((h, i) => {
    panes.push(pane(page.x, y, page.width, h));
    y += h;
    if (i < heights.length - 1) {
      dividers.push({ index: i, axis: 'y', rect: { x: page.x, y, width: page.width, height: DIVIDER_SIZE } });
      y += DIVIDER_SIZE;
    }
  });
  return { panes, dividers };
}

/**
 * What to draw for a split: the first entry of the §3.2 fallback table that
 * fits. Panes are in pane order; `saved` marks dividers that change the
 * saved layout.
 */
function computeSplitLayout(pageBounds, layout, paneCount, { paneMinWidth, focusedIndex = 0 } = {}) {
  const page = bounds(pageBounds);
  const n = paneCount;
  const saved = normalizeSplitLayout(layout, n);
  if (!saved) return { mode: 'focus', panes: [], dividers: [] };
  const minW = Number.isFinite(paneMinWidth) && paneMinWidth > 0 ? paneMinWidth : DEFAULT_PANE_MIN_WIDTH;
  const minH = SPLIT_HEADER_HEIGHT + PANE_MIN_CONTENT_HEIGHT;
  const fitsColumns = (k) => page.width >= k * minW + (k - 1) * DIVIDER_SIZE;
  const fitsRows = (k) => page.height >= k * minH + (k - 1) * DIVIDER_SIZE;
  const mark = (result, modeName, isSaved) => ({
    mode: modeName,
    panes: result.panes,
    dividers: result.dividers.map((d) => ({ ...d, saved: isSaved })),
  });

  if (saved.kind === 'columns' && fitsColumns(n)) {
    const usable = page.width - (n - 1) * DIVIDER_SIZE;
    return mark(columns(page, withMinimum(pixels(saved.widths, usable), minW)), 'columns', true);
  }
  if (saved.kind === 'grid' && fitsColumns(2) && fitsRows(2)) {
    const [left, right] = withMinimum(pixels([saved.column, 1 - saved.column], page.width - DIVIDER_SIZE), minW);
    const [top, bottom] = withMinimum(pixels([saved.row, 1 - saved.row], page.height - DIVIDER_SIZE), minH);
    const x2 = page.x + left + DIVIDER_SIZE;
    const y2 = page.y + top + DIVIDER_SIZE;
    return {
      mode: 'grid',
      panes: [pane(page.x, page.y, left, top), pane(x2, page.y, right, top), pane(page.x, y2, left, bottom), pane(x2, y2, right, bottom)],
      dividers: [
        { index: 0, axis: 'x', rect: { x: page.x + left, y: page.y, width: DIVIDER_SIZE, height: page.height }, saved: true },
        { index: 1, axis: 'y', rect: { x: page.x, y: page.y + top, width: page.width, height: DIVIDER_SIZE }, saved: true },
      ],
    };
  }
  if (saved.kind === 'grid' && fitsColumns(n)) {
    return mark(columns(page, pixels(equalWidths(n), page.width - (n - 1) * DIVIDER_SIZE)), 'columns', false);
  }
  if (fitsRows(n)) {
    return mark(rows(page, pixels(equalWidths(n), page.height - (n - 1) * DIVIDER_SIZE)), 'rows', false);
  }

  // Focus only: every other pane is its header band, stacked in pane order;
  // the focused pane takes the rest.
  const focused = Number.isInteger(focusedIndex) ? clamp(focusedIndex, 0, n - 1) : 0;
  const panes = new Array(n);
  let y = page.y;
  for (let i = 0; i < n; i++) {
    if (i === focused) continue;
    const band = Math.min(SPLIT_HEADER_HEIGHT, Math.max(0, page.y + page.height - y));
    panes[i] = pane(page.x, y, page.width, band);
    y += band;
  }
  panes[focused] = pane(page.x, y, page.width, Math.max(0, page.y + page.height - y));
  return { mode: 'focus', panes, dividers: [] };
}

/**
 * A new saved layout after a divider moves to `point`, or null when the
 * divider is a fallback's, unknown, or the layout isn't drawn as saved.
 */
function layoutForDivider(pageBounds, layout, paneCount, divider, point, { paneMinWidth } = {}) {
  const page = bounds(pageBounds);
  const drawn = computeSplitLayout(page, layout, paneCount, { paneMinWidth });
  const target = drawn.dividers.find((d) => d.index === divider?.index && d.axis === divider?.axis);
  if (!target?.saved) return null;
  const saved = normalizeSplitLayout(layout, paneCount);
  const minW = Number.isFinite(paneMinWidth) && paneMinWidth > 0 ? paneMinWidth : DEFAULT_PANE_MIN_WIDTH;
  const minH = SPLIT_HEADER_HEIGHT + PANE_MIN_CONTENT_HEIGHT;
  const half = DIVIDER_SIZE / 2;

  if (saved.kind === 'grid') {
    if (target.axis === 'x') {
      const usable = page.width - DIVIDER_SIZE;
      const lo = Math.max(MIN_GRID_SHARE, minW / usable);
      const share = clamp((point.x - page.x - half) / usable, lo, 1 - lo);
      return normalizeSplitLayout({ ...saved, column: share }, paneCount);
    }
    const usable = page.height - DIVIDER_SIZE;
    const lo = Math.max(MIN_GRID_SHARE, minH / usable);
    const share = clamp((point.y - page.y - half) / usable, lo, 1 - lo);
    return normalizeSplitLayout({ ...saved, row: share }, paneCount);
  }

  // Columns: move the boundary between pane i and i+1; the others keep their size.
  const i = target.index;
  const usable = page.width - (paneCount - 1) * DIVIDER_SIZE;
  const px = drawn.panes.map((p) => p.header.width);
  const start = drawn.panes[i].header.x;
  const pair = px[i] + px[i + 1];
  const floor = Math.max(minW, Math.ceil(MIN_COLUMN_SHARE * usable));
  const left = clamp(Math.round(point.x - start - half), floor, pair - floor);
  px[i] = left;
  px[i + 1] = pair - left;
  const widths = px.map((w) => Math.round((w / usable) * 1e6) / 1e6);
  const sum = widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] = Math.round((widths[widths.length - 1] + (1 - sum)) * 1e6) / 1e6;
  return normalizeSplitLayout({ kind: 'columns', widths }, paneCount);
}

module.exports = {
  SPLIT_HEADER_HEIGHT,
  PANE_MIN_CONTENT_HEIGHT,
  DEFAULT_PANE_MIN_WIDTH,
  defaultSplitLayout,
  normalizeSplitLayout,
  computeSplitLayout,
  layoutForDivider,
};
