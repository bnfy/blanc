// blanc://mahjong — board rendering and interaction. All game rules live in
// MahjongEngine; this file owns DOM, timer, best time, and the sound toggle.
'use strict';

const E = window.MahjongEngine;
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

// Traditional arrangements. Dots follow real circle tiles (7 is a diagonal
// of three over a 2x2 square — never the domino 6+1); bamboo overrides the
// counts where slats stack differently (2: centered pair, 3: one over two,
// 7: one over three over three).
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
  2: [[22, 13], [22, 47]],
  3: [[22, 13], [11, 47], [33, 47]],
  7: [[22, 9], [11, 30], [22, 30], [33, 30], [11, 51], [22, 51], [33, 51]],
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

// Canonical Blanc mark (two paths, copied verbatim from the newtab vignette
// — never redrawn). Drawn inside the white-dragon frame.
const BLANC_MARK_PATHS = ["M126.07,9.65s0,0,0,0c0,0,.01,0,.02.01l-.02-.02Z","M153.05,123.49h0s0-.02-.01-.03c0-.02-.01-.03-.02-.05h0c-1.42-3.8-3.32-7.27-5.21-10.57-1.9-3.31-3.8-6.46-5.28-9.5l-.06-.13-.04-.08-.04-.08c-1.92-3.63-2.59-6.78-2.6-9.97,0-1.98.27-3.98.75-6.06.72-3.13,1.9-6.44,3.19-10,1.29-3.57,2.68-7.39,3.7-11.59v-.02s.01-.04.01-.04c.89-3.93,1.33-7.96,1.33-11.99,0-8.53-1.96-17.06-5.77-24.68-3.81-7.61-9.49-14.32-16.93-19.06-3.91-2.53-7.71-4.42-11.53-5.78-5.74-2.06-11.49-2.94-17.7-3.33-6.22-.39-12.94-.31-20.92-.4h-.02s-.02,0-.02,0C61.41.13,45.12,0,30.04,0c-4.51,0-8.92.01-13.14.04h-.03s-.03,0-.03,0c-2.57.05-4.75.14-6.75.43-1.49.22-2.91.56-4.28,1.2-1.02.48-2.01,1.15-2.83,2.02-.61.65-1.12,1.39-1.52,2.17-.59,1.18-.93,2.42-1.13,3.71-.2,1.29-.28,2.65-.28,4.15,0,.24,0,.49,0,.74-.01,22.39-.08,85.06-.08,132.38,0,18.98.01,35.49.04,45.95v.08s0,.08,0,.08c.07,1.52.04,3.35.46,5.41.22,1.03.56,2.13,1.19,3.21.62,1.08,1.53,2.13,2.69,2.91l.03.02.04.02c.97.64,2,1.05,3.06,1.35,1.59.45,3.29.67,5.23.82,1.94.15,4.14.21,6.66.24h.02s.02,0,.02,0c8.88.04,18.46.05,28.12.05s19.04,0,28.08,0c1,0,1.99,0,2.98,0,2.34.06,4.62.1,6.84.1,11.36,0,21.42-.9,30.74-4.07,4.65-1.58,9.1-3.73,13.35-6.58,4.26-2.85,8.32-6.38,12.25-10.7l.02-.02h.01c9.98-11.23,15.25-25.89,15.26-40.6,0-7.32-1.31-14.67-4.04-21.61ZM122.32,183.57c-3.67,2.39-8.05,4.16-12.92,5.43-7.3,1.91-15.69,2.69-24.21,2.99-8.5.3-17.13.14-25.06.28-8.58-.06-16.83-.12-23.11-.27h-.01c-2.19-.05-4.06-.12-5.58-.24-1.01-.08-1.86-.18-2.55-.29.35-.44.78-.94,1.29-1.51.94-1.04,2.15-2.26,3.59-3.66,20.75-19.95,54.25-52.14,75.59-72.41,1.9-1.74,3.97-3.49,5.97-4.79,1-.65,1.99-1.19,2.9-1.57.89-.37,1.71-.59,2.42-.67.2-.02.4-.02.59-.02.95,0,1.89.17,2.87.52,1.7.6,3.52,1.79,5.3,3.47,2.67,2.52,5.2,6.13,7.23,9.98,2.04,3.85,3.59,7.94,4.48,11.34v.03s0,0,0,0c.99,3.66,1.48,7.52,1.48,11.43,0,7.79-1.93,15.81-5.45,22.84-3.52,7.04-8.61,13.09-14.82,17.11h0ZM27.87,172.46c-.42.36-.83.73-1.29,1.17-.94.9-2.06,2.04-3.29,3.24-1.84,1.81-3.93,3.78-5.75,5.18-.56.43-1.09.8-1.56,1.1,0-.04,0-.07,0-.1,0-1.02.1-2.35.28-3.81.53-4.4,1.81-9.99,2.87-13.39l.03-.09.02-.09c4.53-17.55,15.62-34.58,30.07-47.08,7.22-6.25,15.28-11.38,23.73-14.92,8.45-3.55,17.29-5.52,26.13-5.52,1.13,0,2.27.03,3.4.1.36.04.66.09.91.14-.08.15-.17.31-.28.48-.57.91-1.48,2.04-2.47,3.13-.99,1.09-2.04,2.14-2.94,3.04-6.26,6.14-12.82,12.38-19.74,19.08h0c-15.42,14.87-35.83,34.55-50.13,48.34ZM16.83,23.17c.05-2.03.22-3.65.49-4.86.2-.91.45-1.58.7-2.06.19-.36.38-.62.59-.84.32-.33.69-.6,1.32-.87.63-.27,1.51-.51,2.69-.68,4.12-.56,8.4-.66,12.86-.66,2.21,0,4.47.02,6.77.02.75,0,1.5,0,2.26,0,11.64.04,24.53.04,35.96.11,6.07.12,11.73.12,17.02.71,5.3.59,10.21,1.73,14.97,4.08h.01c6.24,3.06,11.27,8.13,14.76,14.25,3.49,6.11,5.39,13.25,5.38,20.21,0,4.2-.69,8.34-2.09,12.16-1.41,3.82-3.52,7.33-6.42,10.36-1.84,1.88-3.92,3.43-6.24,4.74-3.47,1.96-7.46,3.35-11.7,4.42-4.22,1.06-8.67,1.79-13.06,2.48-15.4,1.8-29.25,6.75-41.4,14.46-12.16,7.7-22.63,18.12-31.43,30.78-.67.81-1.32,1.69-1.99,2.6-.44.61-.89,1.21-1.34,1.8-.07-1.19-.13-2.5-.17-3.91-.08-2.67-.1-5.67-.1-8.8,0-5.16.07-10.68.07-15.76,0-1.89,0-3.73-.04-5.46.01-3.39.02-6.87.02-10.42,0-12.98-.06-26.83-.06-40.11,0-10.13.04-19.92.16-28.71Z"];

// Bonus-tile faces: eight canonical Blanc UI glyphs, copied VERBATIM from
// the chrome (index.html / overlay.html) — never redrawn. Flowers carry the
// blocker shield, Favorites heart, History clock, and Downloads arrow;
// seasons carry the 1Password key hint, bookmark flag, Settings sliders,
// and the capture mic. All 16x16 stroke art, scaled into the face.
const BLANC_GLYPHS = {
  'flower-1': '<path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.7z"/><path d="M4.4 11.47 12.61 3.55"/>',
  'flower-2': '<path d="M8 13.25C4.6 11 2.75 8.9 2.75 6.6a2.85 2.85 0 0 1 5.25-1.54A2.85 2.85 0 0 1 13.25 6.6c0 2.3-1.85 4.4-5.25 6.65z"/>',
  'flower-3': '<circle cx="8" cy="8" r="5.75"/><path d="M8 4.75V8l2.25 1.5"/>',
  'flower-4': '<path d="M8 2.5v6.5M5.3 6.3 8 9l2.7-2.7M3.5 12.5h9"/>',
  'season-1': '<circle cx="6" cy="6.4" r="3.1"/><path d="M8.3 8.7 13.2 13.6M10.9 11.3l1.7-1.7M12.7 13.1l1.3-1.3"/>',
  'season-2': '<path d="M4.25 2.75h7.5v10.5L8 10.5l-3.75 2.75z"/>',
  'season-3': '<path d="M2.5 4.75h6M12 4.75h1.5M2.5 11.25h1.5M7.5 11.25h6"/><circle cx="10.25" cy="4.75" r="1.75"/><circle cx="5.75" cy="11.25" r="1.75"/>',
  'season-4': '<rect x="6" y="2.2" width="4" height="7" rx="2"/><path d="M3.8 8.2a4.2 4.2 0 0 0 8.4 0M8 12.4v1.8"/>',
};

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
    for (const [x, y] of BAM_SPOTS[Number(id)]) {
      svg.append(el('rect', { x: x - 2, y: y - 7, width: 4, height: 14, rx: 2, fill: 'currentColor' }));
    }
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
    // Center the 16-box glyph at (22, 27), 1.7x, chrome-style round strokes.
    const g = el('g', {
      transform: 'translate(8.4, 13.4) scale(1.7)',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    g.innerHTML = BLANC_GLYPHS[kind];
    svg.append(g);
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
  // The small floor guards the moment before the view has settled its size;
  // supported browser zoom can legitimately need a scale below 0.2.
  const scale = Math.max(0.05, Math.min(
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
    sound.play('blocked');
    tile.classList.remove('shake');
    void tile.offsetWidth; // restart the animation
    tile.classList.add('shake');
    return;
  }
  startTimer();
  if (selected === null) { sound.play('select'); setSelected(i); return; }
  if (selected === i) { sound.play('select'); setSelected(null); return; }
  if (E.removePair(game, selected, i)) {
    sound.play(E.isWon(game) ? 'win' : 'pair');
    setSelected(null);
    refreshTiles();
    checkEndStates();
  } else {
    sound.play('select');
    setSelected(i); // non-matching free tile: move the selection
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setSelected(null);
});

document.getElementById('mjUndo').addEventListener('click', () => {
  if (!game || !E.undo(game)) return;
  sound.play('undo');
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
  sound.play('hint');
  const [i, j] = moves[0];
  for (const k of [i, j]) {
    tileButtons[k].classList.remove('hinted');
    void tileButtons[k].offsetWidth;
    tileButtons[k].classList.add('hinted');
  }
});

const soundButton = document.getElementById('mjSound');
function paintSoundButton() {
  const enabled = sound.isEnabled();
  soundButton.textContent = enabled ? 'sound on' : 'sound off';
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

function newGameFromControl() {
  sound.play('deal');
  newGame();
}
document.getElementById('mjNew').addEventListener('click', newGameFromControl);
document.getElementById('mjNoticeNew').addEventListener('click', newGameFromControl);
document.getElementById('mjWinNew').addEventListener('click', newGameFromControl);
document.getElementById('mjErrorNew').addEventListener('click', newGameFromControl);

newGame();
