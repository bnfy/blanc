// blanc://mahjong — board rendering and interaction. All game rules live in
// MahjongEngine; this file owns DOM, timer, best time, and the sound toggle.
'use strict';

const E = window.MahjongEngine;
const S = window.MahjongState;
const sound = window.MahjongSound;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Private tabs carry ?private=1 (same mechanism as newtab.js) — token
// selection only; the session itself needs no signal.
const isPrivate = new URLSearchParams(location.search).has('private');
if (isPrivate) {
  document.documentElement.dataset.theme = 'private';
  // Keep private presentation on the way back to the start page too.
  document.querySelector('.mj-title').href = 'blanc://newtab/?private=1';
}

// Inside the newtab "mahjong" layout the page runs framed; the back-link
// would try to navigate the frame itself (and the parent's frame-src rightly
// blocks it), so the wordmark goes inert there.
if (window.top !== window.self) {
  document.querySelector('.mj-title').removeAttribute('href');
}

// Geometry: half-unit -> px. Layout descriptors all use the same coordinate
// system, while the virtual board is recalculated per layout and scaled once
// into the available lacquer table.
const HU_X = 26;
const HU_Y = 34;
const LAYER_SHIFT = 5;

const board = document.getElementById('mjBoard');
let positions = E.TURTLE_LAYOUT;
let boardWidth = 0;
let boardHeight = 0;
let extentY = 0;

function setLayoutGeometry(layoutId) {
  positions = E.LAYOUTS?.[layoutId]?.positions || E.TURTLE_LAYOUT;
  const maxLayer = Math.max(...positions.map((p) => p.z));
  const extentX = Math.max(...positions.map((p) => p.x)) + 2;
  extentY = Math.max(...positions.map((p) => p.y)) + 2;
  boardWidth = extentX * HU_X + (maxLayer + 1) * LAYER_SHIFT;
  boardHeight = extentY * HU_Y + (maxLayer + 1) * LAYER_SHIFT;
  board.style.width = `${boardWidth}px`;
  board.style.height = `${boardHeight}px`;
  board.style.setProperty('--mj-layout-layers', String(maxLayer + 1));
}

// --- tile faces -----------------------------------------------------------
// One-color ink marks: dots/bamboo pictorial, characters numeral + rule,
// winds/dragons mono letterforms, the Blanc white dragon, and distinct
// botanical bonus-family engravings. All currentColor.

// Traditional arrangements. Dots follow real circle tiles (7 is a diagonal
// of three over a 2x2 square — never the domino 6+1); bamboo overrides the
// counts where sticks stack differently (2: parallel pair, 3: one over two,
// 6: two rows of three, 7: one over three over three).
const NINE_GRID = { xs: [11, 22, 33], ys: [13, 30, 47] };
const SPOTS = {
  1: [[22, 30]],
  2: [[11, 13], [33, 47]],
  3: [[11, 13], [22, 30], [33, 47]],
  4: [[11, 13], [33, 13], [11, 47], [33, 47]],
  5: [[11, 13], [33, 13], [22, 30], [11, 47], [33, 47]],
  6: [[11, 13], [33, 13], [11, 30], [33, 30], [11, 47], [33, 47]],
  7: [[9, 9], [22, 13], [35, 17], [11, 34], [33, 34], [11, 49], [33, 49]],
  8: [[11, 9], [33, 9], [11, 23], [33, 23], [11, 37], [33, 37], [11, 51], [33, 51]],
  9: NINE_GRID.ys.flatMap((y) => NINE_GRID.xs.map((x) => [x, y])),
};
const BAM_SPOTS = {
  ...SPOTS,
  2: [[14, 30], [30, 30]],
  3: [[22, 14], [11, 44], [33, 44]],
  6: [[11, 17], [22, 17], [33, 17], [11, 43], [22, 43], [33, 43]],
  7: [[22, 9], [11, 30], [22, 30], [33, 30], [11, 51], [22, 51], [33, 51]],
  // Stagger the four pairs so eight bamboo reads as individual sticks instead
  // of two uninterrupted rails.
  8: [[13, 7.5], [31, 7.5], [11, 22.5], [33, 22.5], [13, 37.5], [31, 37.5], [11, 52.5], [33, 52.5]],
};

const BAMBOO_ART = Object.freeze({
  one: 'mahjong-bamboo-one.png',
  jade: 'mahjong-bamboo-jade.svg',
  gold: 'mahjong-bamboo-gold.svg',
});
const BAMBOO_STICK_SIZES = Object.freeze({
  2: [10, 34],
  3: [10, 20],
  4: [9.5, 18],
  5: [9, 16.5],
  6: [8.5, 15.5],
  7: [8, 14.5],
  8: [7.5, 13.5],
  9: [7, 13],
});

// One rounded plum-blossom petal. Five rotations make a botanical engraving
// whose negative space stays open when the 44 × 60 face is rendered small.
const FLOWER_PETAL_PATH =
  'M19.6 27.4C16.5 23.8 16.1 19.2 18.5 15.2C20.2 12.4 23.8 12.4 25.5 15.2C27.9 19.2 27.5 23.8 24.4 27.4C22.8 28.4 21.2 28.4 19.6 27.4Z';

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function bambooImage(href, x, y, width, height, className) {
  return el('image', {
    href,
    x: x - width / 2,
    y: y - height / 2,
    width,
    height,
    class: className,
    preserveAspectRatio: 'xMidYMid meet',
  });
}

function bambooStickAsset(count, index, x) {
  const goldAccent =
    (count === 3 && index === 0) ||
    (count === 5 && index === 2) ||
    (count === 7 && index === 0) ||
    ((count === 6 || count === 9) && x === 22);
  return goldAccent ? BAMBOO_ART.gold : BAMBOO_ART.jade;
}

// One bamboo keeps its special panda emblem. The numbered suit uses bold,
// segmented jade sticks with restrained seasonal-gold accents, borrowing
// Mahjong Blast's at-a-glance clarity while preserving the supplied local
// vector shape.
function bambooFace(count) {
  const group = el('g', { class: `mj-bamboo-art mj-bamboo-art-${count}` });
  if (count === 1) {
    group.append(bambooImage(BAMBOO_ART.one, 22, 30, 42, 48, 'mj-bamboo-source mj-bamboo-source-one'));
  } else {
    const [width, height] = BAMBOO_STICK_SIZES[count];
    BAM_SPOTS[count].forEach(([x, y], index) => {
      group.append(bambooImage(
        bambooStickAsset(count, index, x),
        x,
        y,
        width,
        height,
        'mj-bamboo-source mj-bamboo-source-stick'
      ));
    });
  }
  return group;
}

function textEl(x, y, size, content) {
  const t = el('text', {
    x, y,
    'font-size': size,
    'text-anchor': 'middle',
    fill: 'currentColor',
  });
  t.textContent = content;
  return t;
}

// Canonical Blanc mark (two paths, copied verbatim from the newtab vignette
// — never redrawn). Drawn inside the white-dragon frame.
const BLANC_MARK_PATHS = ["M126.07,9.65s0,0,0,0c0,0,.01,0,.02.01l-.02-.02Z","M153.05,123.49h0s0-.02-.01-.03c0-.02-.01-.03-.02-.05h0c-1.42-3.8-3.32-7.27-5.21-10.57-1.9-3.31-3.8-6.46-5.28-9.5l-.06-.13-.04-.08-.04-.08c-1.92-3.63-2.59-6.78-2.6-9.97,0-1.98.27-3.98.75-6.06.72-3.13,1.9-6.44,3.19-10,1.29-3.57,2.68-7.39,3.7-11.59v-.02s.01-.04.01-.04c.89-3.93,1.33-7.96,1.33-11.99,0-8.53-1.96-17.06-5.77-24.68-3.81-7.61-9.49-14.32-16.93-19.06-3.91-2.53-7.71-4.42-11.53-5.78-5.74-2.06-11.49-2.94-17.7-3.33-6.22-.39-12.94-.31-20.92-.4h-.02s-.02,0-.02,0C61.41.13,45.12,0,30.04,0c-4.51,0-8.92.01-13.14.04h-.03s-.03,0-.03,0c-2.57.05-4.75.14-6.75.43-1.49.22-2.91.56-4.28,1.2-1.02.48-2.01,1.15-2.83,2.02-.61.65-1.12,1.39-1.52,2.17-.59,1.18-.93,2.42-1.13,3.71-.2,1.29-.28,2.65-.28,4.15,0,.24,0,.49,0,.74-.01,22.39-.08,85.06-.08,132.38,0,18.98.01,35.49.04,45.95v.08s0,.08,0,.08c.07,1.52.04,3.35.46,5.41.22,1.03.56,2.13,1.19,3.21.62,1.08,1.53,2.13,2.69,2.91l.03.02.04.02c.97.64,2,1.05,3.06,1.35,1.59.45,3.29.67,5.23.82,1.94.15,4.14.21,6.66.24h.02s.02,0,.02,0c8.88.04,18.46.05,28.12.05s19.04,0,28.08,0c1,0,1.99,0,2.98,0,2.34.06,4.62.1,6.84.1,11.36,0,21.42-.9,30.74-4.07,4.65-1.58,9.1-3.73,13.35-6.58,4.26-2.85,8.32-6.38,12.25-10.7l.02-.02h.01c9.98-11.23,15.25-25.89,15.26-40.6,0-7.32-1.31-14.67-4.04-21.61ZM122.32,183.57c-3.67,2.39-8.05,4.16-12.92,5.43-7.3,1.91-15.69,2.69-24.21,2.99-8.5.3-17.13.14-25.06.28-8.58-.06-16.83-.12-23.11-.27h-.01c-2.19-.05-4.06-.12-5.58-.24-1.01-.08-1.86-.18-2.55-.29.35-.44.78-.94,1.29-1.51.94-1.04,2.15-2.26,3.59-3.66,20.75-19.95,54.25-52.14,75.59-72.41,1.9-1.74,3.97-3.49,5.97-4.79,1-.65,1.99-1.19,2.9-1.57.89-.37,1.71-.59,2.42-.67.2-.02.4-.02.59-.02.95,0,1.89.17,2.87.52,1.7.6,3.52,1.79,5.3,3.47,2.67,2.52,5.2,6.13,7.23,9.98,2.04,3.85,3.59,7.94,4.48,11.34v.03s0,0,0,0c.99,3.66,1.48,7.52,1.48,11.43,0,7.79-1.93,15.81-5.45,22.84-3.52,7.04-8.61,13.09-14.82,17.11h0ZM27.87,172.46c-.42.36-.83.73-1.29,1.17-.94.9-2.06,2.04-3.29,3.24-1.84,1.81-3.93,3.78-5.75,5.18-.56.43-1.09.8-1.56,1.1,0-.04,0-.07,0-.1,0-1.02.1-2.35.28-3.81.53-4.4,1.81-9.99,2.87-13.39l.03-.09.02-.09c4.53-17.55,15.62-34.58,30.07-47.08,7.22-6.25,15.28-11.38,23.73-14.92,8.45-3.55,17.29-5.52,26.13-5.52,1.13,0,2.27.03,3.4.1.36.04.66.09.91.14-.08.15-.17.31-.28.48-.57.91-1.48,2.04-2.47,3.13-.99,1.09-2.04,2.14-2.94,3.04-6.26,6.14-12.82,12.38-19.74,19.08h0c-15.42,14.87-35.83,34.55-50.13,48.34ZM16.83,23.17c.05-2.03.22-3.65.49-4.86.2-.91.45-1.58.7-2.06.19-.36.38-.62.59-.84.32-.33.69-.6,1.32-.87.63-.27,1.51-.51,2.69-.68,4.12-.56,8.4-.66,12.86-.66,2.21,0,4.47.02,6.77.02.75,0,1.5,0,2.26,0,11.64.04,24.53.04,35.96.11,6.07.12,11.73.12,17.02.71,5.3.59,10.21,1.73,14.97,4.08h.01c6.24,3.06,11.27,8.13,14.76,14.25,3.49,6.11,5.39,13.25,5.38,20.21,0,4.2-.69,8.34-2.09,12.16-1.41,3.82-3.52,7.33-6.42,10.36-1.84,1.88-3.92,3.43-6.24,4.74-3.47,1.96-7.46,3.35-11.7,4.42-4.22,1.06-8.67,1.79-13.06,2.48-15.4,1.8-29.25,6.75-41.4,14.46-12.16,7.7-22.63,18.12-31.43,30.78-.67.81-1.32,1.69-1.99,2.6-.44.61-.89,1.21-1.34,1.8-.07-1.19-.13-2.5-.17-3.91-.08-2.67-.1-5.67-.1-8.8,0-5.16.07-10.68.07-15.76,0-1.89,0-3.73-.04-5.46.01-3.39.02-6.87.02-10.42,0-12.98-.06-26.83-.06-40.11,0-10.13.04-19.92.16-28.71Z"];

// Bonus tiles match by family in classic Mahjong solitaire: every flower can
// pair with every flower, and every season can pair with every season. Their
// artwork therefore uses one polished, unmistakable motif per family. This
// avoids the false promise of exact matching created by unrelated UI glyphs
// and corner numerals while keeping the underlying four-tile sets intact.
function bonusFace(family) {
  const g = el('g', {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2.1,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  if (family === 'flower') {
    g.classList.add('mj-bonus-flower');
    const petals = el('g', { class: 'mj-flower-petals' });
    for (const angle of [0, 72, 144, 216, 288]) {
      const attributes = { d: FLOWER_PETAL_PATH };
      if (angle) attributes.transform = `rotate(${angle} 22 30)`;
      petals.append(el('path', attributes));
    }
    g.append(
      petals,
      el('circle', { class: 'mj-flower-center', cx: 22, cy: 30, r: 3.7 }),
    );
  } else {
    g.classList.add('mj-bonus-season');
    g.append(el('path', {
      d: 'M11 42c1-16 10-25 25-24 0 15-9 24-25 24Z',
    }));
    g.append(el('path', { d: 'M13 40c8-8 14-14 21-20', 'stroke-width': 1.7 }));
  }
  return g;
}

const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function tileName(kind) {
  const [family, id] = kind.split('-');
  if (family === 'dot') return `${NUM_WORDS[id - 1]} dot`;
  if (family === 'bam') return `${NUM_WORDS[id - 1]} bamboo`;
  if (family === 'chr') return `${NUM_WORDS[id - 1]} character`;
  if (family === 'wind') return `${{ e: 'east', s: 'south', w: 'west', n: 'north' }[id]} wind`;
  if (family === 'drg') return { c: 'red dragon', f: 'green dragon', p: 'white dragon' }[id];
  if (family === 'flower') return 'flower bonus';
  return 'season bonus';
}

function faceSVG(kind) {
  const svg = el('svg', { viewBox: '0 0 44 60', 'aria-hidden': 'true' });
  svg.classList.add('mj-face');
  const [family, id] = kind.split('-');
  if (family === 'dot') {
    for (const [x, y] of SPOTS[Number(id)]) svg.append(el('circle', { cx: x, cy: y, r: 4.5, fill: 'currentColor' }));
  } else if (family === 'bam') {
    svg.append(bambooFace(Number(id)));
  } else if (family === 'chr') {
    svg.append(textEl(22, 36, 26, id));
    svg.append(el('rect', { x: 12, y: 46, width: 20, height: 1.5, fill: 'currentColor' }));
  } else if (family === 'wind') {
    svg.append(textEl(22, 38, 24, id.toUpperCase()));
  } else if (family === 'drg') {
    if (id === 'p') {
      // The white dragon is the Blanc tile (blanc = white): the canonical
      // mark alone, embedded verbatim. Brand rule: the logomark appears
      // ONLY in black or white (here the theme ink) and NEVER in a frame.
      const scale = 26 / 207.08;
      const g = el('g', {
        transform: `translate(${22 - (157.08 * scale) / 2}, ${30 - 13}) scale(${scale})`,
      });
      for (const d of BLANC_MARK_PATHS) g.append(el('path', { d, fill: 'currentColor' }));
      svg.append(g);
    } else svg.append(textEl(22, 38, 24, id.toUpperCase()));
  } else if (family === 'flower' || family === 'season') {
    svg.append(bonusFace(family));
  }
  return svg;
}

// --- board ----------------------------------------------------------------

let game = null;
const tileButtons = [];
let focusIndex = 0;
let tileAnimationBusy = false;
let hintTimer = null;

function clearHint() {
  if (hintTimer !== null) window.clearTimeout(hintTimer);
  hintTimer = null;
  for (const button of tileButtons) button.classList.remove('hinted');
}

function trayIndices() {
  return Array.isArray(game?.tray)
    ? game.tray.map((entry) => typeof entry === 'number' ? entry : entry.index)
        .filter((index) => Number.isInteger(index))
    : [];
}

function clearedPairs() {
  if (!game) return 0;
  const offBoard = game.removed.reduce((count, removed) => count + Number(removed), 0);
  return Math.max(0, (offBoard - trayIndices().length) / 2);
}

function renderBoard() {
  setLayoutGeometry(game.layoutId);
  board.replaceChildren();
  tileButtons.length = 0;
  positions.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mj-tile';
    b.dataset.i = i;
    b.style.left = `${p.x * HU_X + p.z * LAYER_SHIFT}px`;
    b.style.top = `${(extentY - 2 - p.y) * HU_Y - p.z * LAYER_SHIFT +
      (Math.max(...positions.map((tile) => tile.z)) + 1) * LAYER_SHIFT}px`;
    b.style.width = `${2 * HU_X}px`;
    b.style.height = `${2 * HU_Y}px`;
    b.style.zIndex = String(10 + p.z);
    b.style.setProperty('--mj-order', String(i));
    b.setAttribute('aria-label', tileName(game.kinds[i]));
    b.setAttribute('aria-pressed', 'false');
    b.tabIndex = -1;
    // Suit ink (traditional four-color engraving; dragons colored per-tile).
    const [family, id] = game.kinds[i].split('-');
    b.dataset.suit = family === 'drg' ? `drg-${id}` : family;
    b.append(faceSVG(game.kinds[i]));
    board.append(b);
    tileButtons.push(b);
  });
  refreshTiles();
}

function renderTray() {
  const indices = trayIndices();
  for (let slot = 0; slot < 4; slot++) {
    const target = document.getElementById(`mjTraySlot${slot}`);
    if (!target) continue;
    target.replaceChildren();
    const index = indices[slot];
    target.classList.toggle('filled', Number.isInteger(index));
    target.setAttribute('aria-label', Number.isInteger(index)
      ? `Tray slot ${slot + 1}: ${tileName(game.kinds[index])}`
      : `Tray slot ${slot + 1}: empty`);
    if (!Number.isInteger(index)) continue;
    const face = faceSVG(game.kinds[index]);
    face.classList.add('mj-tray-face');
    target.append(face);
  }
  document.getElementById('mjTrayRail')?.toggleAttribute('hidden', game.mode !== 'tray');
}

function refreshTiles({ recoverFocus = false } = {}) {
  if (!game) return;
  clearHint();
  let nextFocus = focusIndex;
  tileButtons.forEach((b, i) => {
    b.hidden = game.removed[i];
    const free = !game.removed[i] && E.isFree(game, i);
    if (free) {
      delete b.dataset.blocked;
      b.removeAttribute('aria-disabled');
    } else {
      b.dataset.blocked = '';
      b.setAttribute('aria-disabled', 'true');
    }
    b.classList.toggle('selected', game.selected === i);
    b.setAttribute('aria-pressed', String(game.selected === i));
    b.setAttribute('aria-label', `${tileName(game.kinds[i])}, ${free ? 'free' : 'blocked'}`);
  });

  if (!tileButtons[nextFocus] || tileButtons[nextFocus].hidden) {
    nextFocus = nearestVisibleIndex(focusIndex);
  }
  focusIndex = nextFocus;
  tileButtons.forEach((button, index) => { button.tabIndex = index === focusIndex ? 0 : -1; });

  const left = Math.max(0, positions.length / 2 - clearedPairs());
  document.getElementById('mjPairs').textContent =
    `${left} ${left === 1 ? 'pair' : 'pairs'} left`;
  const score = document.getElementById('mjScore');
  if (score) score.textContent = game.mode === 'tray' ? game.score.toLocaleString() : '—';
  const chain = document.getElementById('mjChain');
  if (chain) chain.textContent = game.mode === 'tray' && game.chain > 0 ? `×${game.chain}` : '—';
  document.body.dataset.mode = game.mode;
  const shell = document.querySelector('.mj');
  if (shell) {
    shell.dataset.mode = game.mode;
    shell.dataset.layout = game.layoutId;
    shell.dataset.source = game.dailyKey ? 'daily' : 'random';
  }
  const layoutName = document.getElementById('mjLayoutName');
  if (layoutName) layoutName.textContent = E.LAYOUTS[game.layoutId].name;
  const modeName = document.getElementById('mjModeName');
  if (modeName) modeName.textContent = game.mode === 'tray' ? 'Tray' : 'Classic';
  const dailyBadge = document.getElementById('mjDailyBadge');
  if (dailyBadge) dailyBadge.hidden = !game.dailyKey;
  renderTray();
  paintBest();
  if (recoverFocus && tileButtons[focusIndex] && !tileButtons[focusIndex].hidden) {
    requestAnimationFrame(() => tileButtons[focusIndex]?.focus({ preventScroll: true }));
  }
}

function fitBoard() {
  const wrap = document.getElementById('mjBoardWrap');
  const safeSide = Math.max(
    0,
    Number.parseFloat(getComputedStyle(wrap).getPropertyValue('--mj-board-safe-side')) || 0
  );
  // The small floor guards the moment before the view has settled its size;
  // supported browser zoom can legitimately need a scale below 0.2.
  const scale = Math.max(0.05, Math.min(
    1.35,
    (wrap.clientWidth - 36 - (safeSide * 2)) / boardWidth,
    (wrap.clientHeight - 36) / boardHeight
  ));
  board.style.transform = `scale(${scale})`;
  board.style.setProperty('--mj-board-scale', String(scale));
}
window.addEventListener('resize', fitBoard);

// --- interaction ----------------------------------------------------------

let playReported = false;

function reportPlayOnce() {
  if (playReported) return;
  playReported = true;
  if (window.top !== window.self) {
    window.parent.postMessage('blanc:mahjong-played', 'blanc://newtab');
    return;
  }
  window.bowserPages?.mahjong?.played?.().catch(() => {});
}

function announce(message) {
  const live = document.getElementById('mjLive');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = message; });
}

const modalBackground = () => [
  document.querySelector('.mj-skip'),
  document.querySelector('.mj-head'),
  document.getElementById('mjBoard'),
  document.getElementById('mjTrayRail'),
  document.querySelector('.mj-feedback'),
  document.querySelector('.mj-dock'),
].filter(Boolean);

function activeModal() {
  return ['mjSetupSheet', 'mjRescue', 'mjWin']
    .map((id) => document.getElementById(id))
    .find((element) => element && !element.hidden) || null;
}

function syncModalBackground() {
  const covered = Boolean(activeModal());
  for (const element of modalBackground()) {
    element.inert = covered || tileAnimationBusy;
    element.toggleAttribute('aria-hidden', covered);
  }
}

function setTileAnimationBusy(busy) {
  tileAnimationBusy = busy;
  board.toggleAttribute('aria-busy', busy);
  board.style.pointerEvents = busy ? 'none' : '';
  syncModalBackground();
}

function setDialogVisible(element, visible) {
  if (!element) return;
  if (typeof element.showModal === 'function' && typeof element.close === 'function') {
    if (visible && !element.open) element.showModal();
    else if (!visible && element.open) element.close();
  } else {
    element.hidden = !visible;
  }
  syncModalBackground();
  if (visible) {
    requestAnimationFrame(() => element.querySelector(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])'
    )?.focus({ preventScroll: true }));
  }
}

function nearestVisibleIndex(origin = 0) {
  const source = positions[origin] || positions[0];
  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < positions.length; index++) {
    if (game?.removed[index]) continue;
    const point = positions[index];
    const distance = Math.hypot(point.x - source.x, point.y - source.y) + Math.abs(point.z - source.z) * 0.35;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return Math.max(0, best);
}

function spatialNeighbor(origin, key) {
  const source = positions[origin];
  if (!source) return nearestVisibleIndex(0);
  const direction = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
  }[key];
  if (!direction) return origin;
  let winner = origin;
  let winnerScore = Infinity;
  for (let index = 0; index < positions.length; index++) {
    if (index === origin || game.removed[index]) continue;
    const candidate = positions[index];
    const dx = candidate.x - source.x;
    const dy = candidate.y - source.y;
    const forward = dx * direction[0] + dy * direction[1];
    if (forward <= 0) continue;
    const across = Math.abs(dx * direction[1] - dy * direction[0]);
    const score = forward + across * 2.4 + Math.abs(candidate.z - source.z) * 0.8;
    if (score < winnerScore) {
      winnerScore = score;
      winner = index;
    }
  }
  return winner;
}

function checkEndStates() {
  const notice = document.getElementById('mjNotice');
  if (E.isWon(game)) {
    stopTimer();
    if (notice) notice.hidden = true;
    setDialogVisible(document.getElementById('mjRescue'), false);
    recordCompletion();
    showWin();
    return;
  }
  setDialogVisible(document.getElementById('mjWin'), false);
  const rescuing = game.status === 'rescue';
  setDialogVisible(document.getElementById('mjRescue'), rescuing);
  if (rescuing) {
    pauseTimer();
    announce('The tray is full. Undo, shuffle and continue, or restart.');
  }
  if (notice) notice.hidden = rescuing || E.availableMoves(game).length > 0;
}

function cueForResult(result) {
  if (E.isWon(game)) return 'win';
  if (game.status === 'rescue' || result.type === 'rescue') return 'rescue';
  if (result.type === 'tray-pair') return result.points > 100 ? 'chain' : 'pair';
  if (result.type === 'tray-park') return 'tray';
  if (result.type === 'pair') return 'pair';
  return 'select';
}

function finishTileResult(result, index) {
  setTileAnimationBusy(false);
  refreshTiles({ recoverFocus: ['pair', 'tray-pair', 'tray-park', 'rescue'].includes(result.type) });
  checkEndStates();
  if (result.type === 'tray-pair') {
    announce(`${result.points} points. ${game.score} total. ${clearedPairs()} pairs cleared.`);
  } else if (result.type === 'tray-park') {
    announce(`${tileName(game.kinds[index])} moved to tray. ${trayIndices().length} of 4 slots filled.`);
  } else if (result.type === 'pair') {
    announce(`Pair cleared. ${Math.max(0, positions.length / 2 - clearedPairs())} pairs left.`);
  }
}

function animateTileResult(result, index) {
  const departing = result.type === 'pair' || result.type === 'tray-pair'
    ? result.indices
    : result.type === 'tray-park' || result.type === 'rescue'
      ? [result.index]
      : [];
  if (!departing.length) {
    finishTileResult(result, index);
    return;
  }
  const className = result.type === 'tray-park' || result.type === 'rescue'
    ? 'tray-travel'
    : 'removing';
  setTileAnimationBusy(true);
  for (const tileIndex of departing) {
    const button = tileButtons[tileIndex];
    if (!button || button.hidden) continue;
    button.classList.remove(className);
    void button.offsetWidth;
    button.classList.add(className);
  }
  if (result.type === 'tray-pair') {
    const score = document.getElementById('mjScore');
    score?.classList.remove('score-pulse');
    if (score) void score.offsetWidth;
    score?.classList.add('score-pulse');
  }
  const immediate = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => finishTileResult(result, index), immediate ? 0 : 300);
}

function activateTile(i, tile = tileButtons[i]) {
  if (!game) return;
  if (board.hasAttribute('aria-busy')) return;
  if (!tile || tile.hidden || game.status === 'won' || game.status === 'rescue') return;
  if (!E.isFree(game, i)) {
    sound.play('blocked');
    tile.classList.remove('shake');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('shake');
    return;
  }
  // The timer's first real move is also the analytics definition of "played".
  // Main independently gates this on saved consent, a non-private managed tab,
  // a packaged build, and one event per app session.
  reportPlayOnce();
  startTimer();
  const wasWon = E.isWon(game);
  const result = E.selectTile(game, i);
  if (!result?.ok) return;
  focusIndex = i;
  sound.play(cueForResult(result));
  const wonNow = !wasWon && E.isWon(game);
  if (wonNow || game.status === 'rescue') pauseTimer();
  if (wonNow) recordCompletion();
  else saveAfterMutation();
  animateTileResult(result, i);
}

board.addEventListener('click', (event) => {
  const tile = event.target.closest('.mj-tile');
  if (!tile) return;
  activateTile(Number(tile.dataset.i), tile);
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (tileAnimationBusy) {
    const key = event.key.toLowerCase();
    if (event.key.startsWith('Arrow') || event.key === 'Enter' || event.key === ' ' ||
        ['u', 'h', 's'].includes(key) || ((event.metaKey || event.ctrlKey) && key === 'z')) {
      event.preventDefault();
    }
    return;
  }
  const modal = activeModal();
  if (modal) {
    if (event.key === 'Escape' && modal.id === 'mjSetupSheet') {
      event.preventDefault();
      closeSetup();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...modal.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])'
      )].filter((element) => !element.hidden);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    return;
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  if (event.key.startsWith('Arrow') && game) {
    event.preventDefault();
    focusIndex = spatialNeighbor(focusIndex, event.key);
    refreshTiles();
    tileButtons[focusIndex]?.focus({ preventScroll: true });
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && target?.classList?.contains('mj-tile')) {
    event.preventDefault();
    activateTile(Number(target.dataset.i), target);
    return;
  }
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault();
    document.getElementById('mjUndo').click();
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'u') {
    event.preventDefault();
    document.getElementById('mjUndo').click();
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'h') {
    event.preventDefault();
    document.getElementById('mjHint').click();
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 's') {
    event.preventDefault();
    document.getElementById('mjShuffle').click();
  } else if (event.key === 'Escape' && game?.selected !== null) {
    game.selected = null;
    saveAfterMutation();
    refreshTiles();
  }
});

document.getElementById('mjUndo').addEventListener('click', () => {
  if (!game || !E.undo(game)) return;
  sound.play('undo');
  resumeTimerAfterUndo();
  saveAfterMutation();
  refreshTiles({ recoverFocus: true });
  checkEndStates();
  announce('Last move undone.');
});
document.getElementById('mjNoticeUndo').addEventListener('click', () =>
  document.getElementById('mjUndo').click());

document.getElementById('mjHint').addEventListener('click', () => {
  if (!game) return;
  const moves = E.availableMoves(game);
  if (!moves.length) return;
  clearHint();
  game.assists.hint += 1;
  saveAfterMutation();
  sound.play('hint');
  const move = moves[0];
  const visible = move.filter((index) => tileButtons[index] && !game.removed[index]);
  for (const k of visible) {
    void tileButtons[k].offsetWidth;
    tileButtons[k].classList.add('hinted');
  }
  hintTimer = window.setTimeout(clearHint, 1400);
  if (move.length === 2 && move.some((index) => game.tray.includes(index))) {
    const trayIndex = move.find((index) => game.tray.includes(index));
    announce(`Hint: a ${tileName(game.kinds[trayIndex])} in the tray has a free match.`);
  } else if (visible.length === 2) {
    announce(`Hint: two ${tileName(game.kinds[visible[0]])} tiles are available.`);
  } else {
    announce(`Hint: ${tileName(game.kinds[visible[0]])} is free to move into the tray.`);
  }
});

function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function shuffleGame() {
  if (!game || E.isWon(game)) return false;
  const wasRescue = game.status === 'rescue';
  if (!E.shuffleRemaining(game, E.createRng(randomSeed()))) return false;
  sound.play('shuffle');
  saveAfterMutation();
  renderBoard();
  refreshTiles({ recoverFocus: true });
  board.classList.remove('shuffle-cascade');
  void board.offsetWidth;
  board.classList.add('shuffle-cascade');
  window.setTimeout(() => board.classList.remove('shuffle-cascade'), 540);
  fitBoard();
  checkEndStates();
  if (wasRescue) resumeTimerAfterUndo();
  announce('Remaining tiles shuffled into a new solvable deal.');
  return true;
}
document.getElementById('mjShuffle').addEventListener('click', shuffleGame);
document.getElementById('mjRescueUndo')?.addEventListener('click', () =>
  document.getElementById('mjUndo').click());
document.getElementById('mjRescueShuffle')?.addEventListener('click', shuffleGame);

const soundButton = document.getElementById('mjSound');
function setDockLabel(button, label) {
  const target = button.querySelector('[data-dock-label]');
  if (target) target.textContent = label;
  else button.textContent = label;
}
function paintSoundButton() {
  const enabled = sound.isEnabled();
  setDockLabel(soundButton, enabled ? 'Sound on' : 'Sound off');
  soundButton.setAttribute('aria-pressed', String(enabled));
  soundButton.setAttribute('aria-label', `Sound effects ${enabled ? 'on' : 'off'}`);
}
soundButton.addEventListener('click', () => {
  const enabled = sound.setEnabled(!sound.isEnabled());
  paintSoundButton();
  if (enabled) sound.play('toggle');
});
paintSoundButton();

// --- timer + best ---------------------------------------------------------
// Elapsed time is checkpointed into the serializable state. Hidden pages,
// quiet tabs, rescue dialogs, and a closed Blanc window never accrue time.

let runningSince = null;
let hasStarted = false;
let tickHandle = null;

function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function paintTimer() {
  if (!game) return;
  const live = runningSince === null ? 0 : Math.max(0, Date.now() - runningSince);
  document.getElementById('mjTimer').textContent = formatMs(game.elapsedMs + live);
}

function startTimer() {
  hasStarted = true;
  if (runningSince !== null || document.hidden || !embedActive || game?.status !== 'playing') return;
  runningSince = Date.now();
  clearInterval(tickHandle);
  tickHandle = setInterval(paintTimer, 500);
}

function checkpointTimer() {
  if (!game || runningSince === null) return;
  const now = Date.now();
  game.elapsedMs += Math.max(0, now - runningSince);
  runningSince = now;
}

function pauseTimer() {
  checkpointTimer();
  runningSince = null;
  clearInterval(tickHandle);
  tickHandle = null;
  paintTimer();
}

function stopTimer() { pauseTimer(); }

function resumeTimerAfterUndo() {
  if (!game) return;
  game.status = 'playing';
  if (hasStarted) startTimer();
}

function resetTimer() {
  clearInterval(tickHandle);
  tickHandle = null;
  runningSince = null;
  hasStarted = false;
  paintTimer();
}

function bestForGame() {
  if (!recordStore || !game) return null;
  const records = recordStore.read();
  const record = game.mode === 'classic'
    ? records.classic[game.layoutId] || null
    : records.tray[game.layoutId] || null;
  if (!record) return null;
  const layoutRevision = record.layoutRevision === undefined ? 1 : record.layoutRevision;
  return layoutRevision === game.layoutRevision ? record : null;
}

function paintBest() {
  const target = document.getElementById('mjBest');
  if (!target || !game) return;
  const best = bestForGame();
  if (!best) {
    target.textContent = 'No record';
  } else if (game.mode === 'classic') {
    target.textContent = `Best ${formatMs(best.bestTimeMs)}`;
  } else {
    target.textContent = `Best ${best.bestScore.toLocaleString()} · ${formatMs(best.bestTimeMs)}`;
  }
}

function recordCompletion() {
  if (!game || game.completionRecorded) return true;
  pauseTimer();
  const before = bestForGame();
  const updated = recordStore?.record({
    gameId,
    layoutId: game.layoutId,
    layoutRevision: game.layoutRevision,
    mode: game.mode,
    elapsedMs: game.elapsedMs,
    score: game.score,
    completed: true,
    dailyKey: game.dailyKey,
    assists: game.assists,
  });
  game.completionRecorded = Boolean(updated);
  const after = updated && (game.mode === 'classic'
    ? updated.classic[game.layoutId]
    : updated.tray[game.layoutId]);
  game._newRecord = !before || (game.mode === 'classic'
    ? after?.bestTimeMs < before.bestTimeMs
    : after?.bestScore > before.bestScore ||
      (after?.bestScore === before.bestScore && after?.bestTimeMs < before.bestTimeMs));
  saveAfterMutation();
  return Boolean(updated);
}

function showWin() {
  const best = bestForGame();
  const label = game.mode === 'classic'
    ? formatMs(game.elapsedMs)
    : `${game.score.toLocaleString()} points · ${formatMs(game.elapsedMs)}`;
  document.getElementById('mjWinTime').textContent = label;
  document.getElementById('mjWinBest').textContent = game._newRecord
    ? 'new record'
    : best
      ? (game.mode === 'classic'
          ? `best ${formatMs(best.bestTimeMs)}`
          : `best ${best.bestScore.toLocaleString()} · ${formatMs(best.bestTimeMs)}`)
      : 'complete';
  setDialogVisible(document.getElementById('mjWin'), true);
  announce(`Board cleared. ${label}.`);
}

// --- lifecycle ------------------------------------------------------------

const FREE_HIGHLIGHT_KEY = 'mahjong.free-highlight';
let gameId = null;
let gameStore = null;
let recordStore = null;
let duplicateGuard = null;
let duplicateChannel = null;
let embedActive = true;
let setupChoice = { layoutId: 'turtle', mode: 'classic', source: 'random' };
let setupReturnToWin = false;

function saveAfterMutation() {
  if (!game || !gameStore || !gameId) return false;
  checkpointTimer();
  game.gameId = gameId;
  game.updatedAt = Date.now();
  return gameStore.save(gameId, game);
}

function configureGame(nextGame) {
  game = nextGame;
  game.gameId = gameId;
  game.assists ||= { undo: 0, hint: 0, shuffle: 0 };
  focusIndex = nearestVisibleIndex(0);
  hasStarted = game.elapsedMs > 0 || game.history.length > 0 ||
    game.tray.length > 0 || game.selected !== null;
  resetTimer();
  hasStarted = game.elapsedMs > 0 || game.history.length > 0 ||
    game.tray.length > 0 || game.selected !== null;
  document.getElementById('mjNotice').hidden = true;
  document.getElementById('mjError').hidden = true;
  document.getElementById('mjRecoveryNotice').hidden = true;
  setDialogVisible(document.getElementById('mjWin'), false);
  setDialogVisible(document.getElementById('mjRescue'), false);
  renderBoard();
  fitBoard();
  requestAnimationFrame(fitBoard);
  paintTimer();
  checkEndStates();
  if (hasStarted && game.status === 'playing') startTimer();
}

function startGame({ layoutId, mode, seed, dailyKey = null }, { soundCue = true } = {}) {
  pauseTimer();
  try {
    const next = E.createGame({ seed, layoutId, mode, gameId, dailyKey });
    next.gameId = gameId;
    next.dailyKey = dailyKey;
    configureGame(next);
    saveAfterMutation();
    if (soundCue) sound.play('deal');
    announce(`${E.LAYOUTS[layoutId].name} ${mode} game ready.`);
  } catch {
    // Never expected (defensive cap in generateDeal); leave no stale board.
    game = null;
    board.replaceChildren();
    tileButtons.length = 0;
    document.getElementById('mjPairs').textContent = '';
    document.getElementById('mjError').hidden = false;
    return false;
  }
  return true;
}

function newGameFromControl() {
  const layoutId = game?.layoutId || 'turtle';
  const mode = game?.mode || 'classic';
  startGame({ layoutId, mode, seed: randomSeed() });
}

function paintSetupChoices() {
  if (setupChoice.source === 'daily') setupChoice.layoutId = S.dailyDeal(new Date()).layoutId;
  for (const button of document.querySelectorAll('#mjSetupSheet button[data-layout]')) {
    const selected = button.dataset.layout === setupChoice.layoutId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = setupChoice.source === 'daily';
  }
  for (const button of document.querySelectorAll('#mjSetupSheet button[data-mode]')) {
    const selected = button.dataset.mode === setupChoice.mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  for (const button of document.querySelectorAll('#mjSetupSheet button[data-source]')) {
    const selected = button.dataset.source === setupChoice.source;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const modeDescription = document.getElementById('mjModeDescription');
  if (modeDescription) modeDescription.textContent = setupChoice.mode === 'tray'
    ? 'Move free tiles into a four-slot matching tray.'
    : 'Match two free tiles directly.';
  const sourceDescription = document.getElementById('mjSourceDescription');
  if (sourceDescription) sourceDescription.textContent = setupChoice.source === 'daily'
    ? `${S.dailyDeal(new Date()).dailyKey} · ${E.LAYOUTS[setupChoice.layoutId].name}`
    : 'A fresh, guaranteed-solvable board.';
}

function openSetup() {
  setupReturnToWin = E.isWon(game);
  if (setupReturnToWin) setDialogVisible(document.getElementById('mjWin'), false);
  setupChoice = {
    layoutId: game?.layoutId || 'turtle',
    mode: game?.mode || 'classic',
    source: game?.dailyKey ? 'daily' : 'random',
  };
  paintSetupChoices();
  setDialogVisible(document.getElementById('mjSetupSheet'), true);
}

function closeSetup() {
  setDialogVisible(document.getElementById('mjSetupSheet'), false);
  if (setupReturnToWin && E.isWon(game)) {
    setupReturnToWin = false;
    setDialogVisible(document.getElementById('mjWin'), true);
  } else {
    setupReturnToWin = false;
    document.getElementById('mjSetup')?.focus();
  }
}

function startSetupChoice() {
  if (setupChoice.source === 'daily') {
    const daily = S.dailyDeal(new Date());
    startGame({ ...daily, mode: setupChoice.mode });
  } else {
    startGame({
      layoutId: setupChoice.layoutId,
      mode: setupChoice.mode,
      seed: randomSeed(),
    });
  }
  closeSetup();
}

for (const button of document.querySelectorAll('#mjSetupSheet button[data-layout]')) {
  button.addEventListener('click', () => {
    if (setupChoice.source === 'daily') return;
    setupChoice.layoutId = button.dataset.layout;
    paintSetupChoices();
  });
}
for (const button of document.querySelectorAll('#mjSetupSheet button[data-mode]')) {
  button.addEventListener('click', () => {
    setupChoice.mode = button.dataset.mode;
    paintSetupChoices();
  });
}
for (const button of document.querySelectorAll('#mjSetupSheet button[data-source]')) {
  button.addEventListener('click', () => {
    setupChoice.source = button.dataset.source;
    if (setupChoice.source === 'daily') setupChoice.layoutId = S.dailyDeal(new Date()).layoutId;
    paintSetupChoices();
  });
}

document.getElementById('mjSetup')?.addEventListener('click', openSetup);
document.getElementById('mjSetupClose')?.addEventListener('click', closeSetup);
document.getElementById('mjSetupScrim')?.addEventListener('click', closeSetup);
document.getElementById('mjStart')?.addEventListener('click', startSetupChoice);
document.getElementById('mjNew').addEventListener('click', newGameFromControl);
document.getElementById('mjNoticeNew').addEventListener('click', newGameFromControl);
document.getElementById('mjWinNew').addEventListener('click', openSetup);
document.getElementById('mjWinBoards')?.addEventListener('click', openSetup);
document.getElementById('mjErrorNew').addEventListener('click', newGameFromControl);
document.getElementById('mjRescueRestart')?.addEventListener('click', () => {
  if (!game) return;
  const started = startGame({
    layoutId: game.layoutId,
    mode: game.mode,
    seed: game.seed,
    dailyKey: game.dailyKey,
  });
  if (started) requestAnimationFrame(() => tileButtons[focusIndex]?.focus({ preventScroll: true }));
});

const freeHighlight = document.getElementById('mjFreeHighlight');
function setFreeHighlight(enabled) {
  document.body.dataset.freeHighlight = enabled ? 'strong' : 'standard';
  const shell = document.querySelector('.mj');
  if (shell) shell.dataset.freeHighlight = enabled ? 'strong' : 'standard';
  if (freeHighlight) freeHighlight.checked = enabled;
  try { localStorage.setItem(FREE_HIGHLIGHT_KEY, enabled ? 'on' : 'off'); } catch { /* per-session */ }
}
let strongFree = false;
try { strongFree = localStorage.getItem(FREE_HIGHLIGHT_KEY) === 'on'; } catch { /* default restrained */ }
setFreeHighlight(strongFree);
freeHighlight?.addEventListener('change', () => setFreeHighlight(freeHighlight.checked));

function notifyParentGameId() {
  if (window.top !== window.self) {
    window.parent.postMessage({ type: 'blanc:mahjong-game-id', id: gameId }, 'blanc://newtab');
  }
}

function installDuplicateGuard() {
  if (duplicateGuard || typeof BroadcastChannel !== 'function') return;
  duplicateChannel = new BroadcastChannel('blanc-mahjong-v2-live');
  duplicateGuard = S.createDuplicateGuard({
    channel: duplicateChannel,
    gameId,
    onFork: ({ from, to }) => {
      pauseTimer();
      // Never write the duplicate's in-memory state back over the original
      // id during the fork handshake. Preserve its current moves directly
      // under the new id; fall back to the validated shared save only when
      // this renderer has not configured a game yet.
      let forked = null;
      if (game) {
        const payload = E.serializeGame(game);
        payload.gameId = to;
        forked = E.restoreGame(payload);
        if (forked) gameStore.save(to, forked);
      }
      if (!forked) forked = gameStore.forkSavedGame(from, to);
      const changed = S.forkGameId({ href: location.href, history, uuid: () => to });
      gameId = changed.gameId;
      if (forked) game = forked;
      if (!game) return;
      game.gameId = gameId;
      saveAfterMutation();
      notifyParentGameId();
      renderBoard();
      fitBoard();
      announce('This duplicated tab now has its own independent game.');
      if (hasStarted && game.status === 'playing') startTimer();
    },
  });
}

function disposeDuplicateGuard() {
  duplicateGuard?.dispose();
  duplicateChannel?.close();
  duplicateGuard = null;
  duplicateChannel = null;
}

function bootstrap() {
  const identity = S.ensureGameId({ href: location.href, history });
  gameId = identity.gameId;
  gameStore = S.createGameStore({ storage: localStorage, engine: E });
  recordStore = S.createRecordStore({ storage: localStorage });
  recordStore.migrateLegacy();

  let hadSave = false;
  try { hadSave = localStorage.getItem(S.gameStorageKey(gameId)) !== null; } catch { /* unavailable */ }
  gameStore.cleanup();
  const restored = gameStore.load(gameId);
  if (restored) {
    configureGame(restored);
    announce('Saved game restored.');
  } else {
    startGame({ layoutId: 'turtle', mode: 'classic', seed: randomSeed() }, { soundCue: false });
    if (hadSave) document.getElementById('mjRecoveryNotice').hidden = false;
  }
  notifyParentGameId();
  installDuplicateGuard();
}

document.addEventListener('visibilitychange', () => {
  if (!game) return;
  if (document.hidden) {
    pauseTimer();
    saveAfterMutation();
  } else if (embedActive && hasStarted && game.status === 'playing') {
    startTimer();
  }
});

window.addEventListener('message', (event) => {
  if (window.top === window.self || event.source !== window.parent || event.origin !== 'blanc://newtab' ||
      event.data?.type !== 'blanc:mahjong-active' || typeof event.data.active !== 'boolean') return;
  embedActive = event.data.active;
  if (!embedActive) {
    pauseTimer();
    saveAfterMutation();
  } else if (!document.hidden && hasStarted && game?.status === 'playing') {
    startTimer();
  }
});

window.addEventListener('pagehide', (event) => {
  pauseTimer();
  saveAfterMutation();
  if (!event.persisted) disposeDuplicateGuard();
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) installDuplicateGuard();
  if (!document.hidden && embedActive && hasStarted && game?.status === 'playing') startTimer();
});

bootstrap();
