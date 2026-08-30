// blanc://mahjong — board rendering and interaction. All game rules live in
// MahjongEngine; this file owns DOM, timer, and the localStorage best.
'use strict';

const E = window.MahjongEngine;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Private tabs carry ?private=1 (same mechanism as newtab.js) — token
// selection only; the session itself needs no signal.
const isPrivate = new URLSearchParams(location.search).has('private');
if (isPrivate) {
  document.documentElement.dataset.theme = 'private';
  // Keep private presentation on the way back to the start page too.
  document.querySelector('.mj-title').href = 'blanc://newtab/?private=1';
}

// Geometry: half-unit -> px. A tile is 2x2 half-units = 52x68 px; layers
// shift 4px up-right so stack depth reads without 3D theatrics.
const HU_X = 26;
const HU_Y = 34;
const LAYER_SHIFT = 4;
const EXTENT_X = Math.max(...E.TURTLE_LAYOUT.map((p) => p.x)) + 2;
const EXTENT_Y = Math.max(...E.TURTLE_LAYOUT.map((p) => p.y)) + 2;
const BOARD_W = EXTENT_X * HU_X + 5 * LAYER_SHIFT;
const BOARD_H = EXTENT_Y * HU_Y + 5 * LAYER_SHIFT;

const board = document.getElementById('mjBoard');
board.style.width = `${BOARD_W}px`;
board.style.height = `${BOARD_H}px`;

// --- tile faces -----------------------------------------------------------
// One-color ink marks: dots/bamboo pictorial, characters numeral + rule,
// winds/dragons mono letterforms, white dragon a hollow frame, flowers and
// seasons small marks with a corner numeral. All currentColor.

const NINE_GRID = { xs: [11, 22, 33], ys: [13, 30, 47] };
const SPOTS = {
  1: [[22, 30]],
  2: [[11, 13], [33, 47]],
  3: [[11, 13], [22, 30], [33, 47]],
  4: [[11, 13], [33, 13], [11, 47], [33, 47]],
  5: [[11, 13], [33, 13], [22, 30], [11, 47], [33, 47]],
  6: [[11, 13], [33, 13], [11, 30], [33, 30], [11, 47], [33, 47]],
  7: [[11, 13], [33, 13], [11, 30], [22, 30], [33, 30], [11, 47], [33, 47]],
  8: [[11, 9], [33, 9], [11, 23], [33, 23], [11, 37], [33, 37], [11, 51], [33, 51]],
  9: NINE_GRID.ys.flatMap((y) => NINE_GRID.xs.map((x) => [x, y])),
};

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
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

const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function tileName(kind) {
  const [family, id] = kind.split('-');
  if (family === 'dot') return `${NUM_WORDS[id - 1]} dot`;
  if (family === 'bam') return `${NUM_WORDS[id - 1]} bamboo`;
  if (family === 'chr') return `${NUM_WORDS[id - 1]} character`;
  if (family === 'wind') return `${{ e: 'east', s: 'south', w: 'west', n: 'north' }[id]} wind`;
  if (family === 'drg') return { c: 'red dragon', f: 'green dragon', p: 'white dragon' }[id];
  if (family === 'flower') return `flower ${id}`;
  return `season ${id}`;
}

function faceSVG(kind) {
  const svg = el('svg', { viewBox: '0 0 44 60', 'aria-hidden': 'true' });
  svg.classList.add('mj-face');
  const [family, id] = kind.split('-');
  if (family === 'dot') {
    for (const [x, y] of SPOTS[Number(id)]) svg.append(el('circle', { cx: x, cy: y, r: 4.5, fill: 'currentColor' }));
  } else if (family === 'bam') {
    for (const [x, y] of SPOTS[Number(id)]) {
      svg.append(el('rect', { x: x - 2, y: y - 7, width: 4, height: 14, rx: 2, fill: 'currentColor' }));
    }
  } else if (family === 'chr') {
    svg.append(textEl(22, 36, 26, id));
    svg.append(el('rect', { x: 12, y: 46, width: 20, height: 1.5, fill: 'currentColor' }));
  } else if (family === 'wind') {
    svg.append(textEl(22, 38, 24, id.toUpperCase()));
  } else if (family === 'drg') {
    if (id === 'p') svg.append(el('rect', { x: 13, y: 18, width: 18, height: 24, rx: 3, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
    else svg.append(textEl(22, 38, 24, id.toUpperCase()));
  } else if (family === 'flower') {
    for (const [dx, dy] of [[0, -8], [8, 0], [0, 8], [-8, 0]]) {
      svg.append(el('circle', { cx: 22 + dx, cy: 28 + dy, r: 4, fill: 'currentColor' }));
    }
    svg.append(textEl(36, 54, 10, id));
  } else if (family === 'season') {
    svg.append(el('path', { d: 'M22 16 L32 28 L22 40 L12 28 Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
    svg.append(textEl(36, 54, 10, id));
  }
  return svg;
}

// --- board ----------------------------------------------------------------

let game = null;
const tileButtons = [];

function renderBoard() {
  board.replaceChildren();
  tileButtons.length = 0;
  E.TURTLE_LAYOUT.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mj-tile';
    b.dataset.i = i;
    b.style.left = `${p.x * HU_X + p.z * LAYER_SHIFT}px`;
    b.style.top = `${(EXTENT_Y - 2 - p.y) * HU_Y - p.z * LAYER_SHIFT + 5 * LAYER_SHIFT}px`;
    b.style.width = `${2 * HU_X}px`;
    b.style.height = `${2 * HU_Y}px`;
    b.style.zIndex = p.z;
    b.setAttribute('aria-label', tileName(game.kinds[i]));
    b.setAttribute('aria-pressed', 'false');
    // Suit ink (traditional four-color engraving; dragons colored per-tile).
    const [family, id] = game.kinds[i].split('-');
    b.dataset.suit = family === 'drg' ? `drg-${id}` : family;
    b.append(faceSVG(game.kinds[i]));
    board.append(b);
    tileButtons.push(b);
  });
  refreshTiles();
}

function refreshTiles() {
  tileButtons.forEach((b, i) => {
    b.hidden = game.removed[i];
    if (E.isFree(game, i)) {
      delete b.dataset.blocked;
      b.removeAttribute('aria-disabled');
    } else {
      b.dataset.blocked = '';
      b.setAttribute('aria-disabled', 'true');
    }
  });
  const left = 72 - game.history.length;
  document.getElementById('mjPairs').textContent =
    `${left} ${left === 1 ? 'pair' : 'pairs'} left`;
}

function fitBoard() {
  const wrap = document.getElementById('mjBoardWrap');
  // Floor guards the moment before the view has settled its size; the
  // resize listener re-fits once real dimensions land.
  const scale = Math.max(0.2, Math.min(
    1.25,
    (wrap.clientWidth - 32) / BOARD_W,
    (wrap.clientHeight - 32) / BOARD_H
  ));
  board.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitBoard);

// --- interaction ----------------------------------------------------------

let selected = null;

function setSelected(i) {
  if (selected !== null) {
    tileButtons[selected].classList.remove('selected');
    tileButtons[selected].setAttribute('aria-pressed', 'false');
  }
  selected = i;
  if (i !== null) {
    tileButtons[i].classList.add('selected');
    tileButtons[i].setAttribute('aria-pressed', 'true');
  }
}

function checkEndStates() {
  const notice = document.getElementById('mjNotice');
  if (E.isWon(game)) {
    stopTimer();
    notice.hidden = true;
    showWin();
    return;
  }
  document.getElementById('mjWin').hidden = true;
  notice.hidden = E.movesAvailable(game).length > 0;
}

board.addEventListener('click', (event) => {
  if (!game) return;
  const tile = event.target.closest('.mj-tile');
  if (!tile || tile.hidden) return;
  const i = Number(tile.dataset.i);
  if (!E.isFree(game, i)) {
    tile.classList.remove('shake');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('shake');
    return;
  }
  startTimer();
  if (selected === null) { setSelected(i); return; }
  if (selected === i) { setSelected(null); return; }
  if (E.removePair(game, selected, i)) {
    setSelected(null);
    refreshTiles();
    checkEndStates();
  } else {
    setSelected(i); // non-matching free tile: move the selection
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSelected(null);
});

document.getElementById('mjUndo').addEventListener('click', () => {
  if (!game || !E.undo(game)) return;
  resumeTimerAfterUndo();
  setSelected(null);
  refreshTiles();
  checkEndStates();
});
document.getElementById('mjNoticeUndo').addEventListener('click', () =>
  document.getElementById('mjUndo').click());

document.getElementById('mjHint').addEventListener('click', () => {
  if (!game) return;
  const moves = E.movesAvailable(game);
  if (!moves.length) return;
  const [i, j] = moves[0];
  for (const k of [i, j]) {
    tileButtons[k].classList.remove('hinted');
    void tileButtons[k].offsetWidth;
    tileButtons[k].classList.add('hinted');
  }
});

// --- timer + best ---------------------------------------------------------
// Elapsed is always Date.now() - startedAt: background tabs throttle
// intervals, so ticks only repaint — they never accumulate time.

let startedAt = null;
let finishedAt = null;
let tickHandle = null;

function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function paintTimer() {
  const elapsed = startedAt === null ? 0 : (finishedAt ?? Date.now()) - startedAt;
  document.getElementById('mjTimer').textContent = formatMs(elapsed);
}

function startTimer() {
  if (startedAt !== null) return;
  startedAt = Date.now();
  tickHandle = setInterval(paintTimer, 500);
}

function stopTimer() {
  finishedAt = Date.now();
  clearInterval(tickHandle);
  tickHandle = null;
  paintTimer();
}

function resumeTimerAfterUndo() {
  if (finishedAt === null) return;
  startedAt += Date.now() - finishedAt; // don't bill the time spent won
  finishedAt = null;
  tickHandle = setInterval(paintTimer, 500);
}

function resetTimer() {
  clearInterval(tickHandle);
  tickHandle = null;
  startedAt = null;
  finishedAt = null;
  paintTimer();
}

function readBest() {
  try {
    const raw = Number(localStorage.getItem('mahjong.best'));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch { return null; }
}

function writeBest(ms) {
  try { localStorage.setItem('mahjong.best', String(ms)); } catch { /* no best line */ }
}

function showWin() {
  const elapsed = finishedAt - startedAt;
  const prior = readBest();
  const isNewBest = prior === null || elapsed < prior;
  if (isNewBest) writeBest(elapsed);
  document.getElementById('mjWinTime').textContent = formatMs(elapsed);
  document.getElementById('mjWinBest').textContent = isNewBest
    ? (prior === null ? 'first win' : `new best — was ${formatMs(prior)}`)
    : `best ${formatMs(readBest())}`;
  document.getElementById('mjWin').hidden = false;
}

// --- lifecycle ------------------------------------------------------------

function newGame() {
  selected = null;
  resetTimer();
  document.getElementById('mjNotice').hidden = true;
  document.getElementById('mjError').hidden = true;
  document.getElementById('mjWin').hidden = true;
  try {
    game = E.createGame(Math.floor(Math.random() * 2 ** 31));
  } catch {
    // Never expected (defensive cap in generateDeal); leave no stale board.
    game = null;
    board.replaceChildren();
    tileButtons.length = 0;
    document.getElementById('mjPairs').textContent = '';
    document.getElementById('mjError').hidden = false;
    return;
  }
  renderBoard();
  fitBoard();
  requestAnimationFrame(fitBoard);
}

document.getElementById('mjNew').addEventListener('click', newGame);
document.getElementById('mjNoticeNew').addEventListener('click', newGame);
document.getElementById('mjWinNew').addEventListener('click', newGame);
document.getElementById('mjErrorNew').addEventListener('click', newGame);

newGame();
