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
// Tile-face artwork: dots/bamboo pictorial, characters numeral + rule,
// landscape winds, emblematic dragons, and distinct botanical bonus-family
// engravings. All art stays local to the flat-served internal pages directory.

// Traditional arrangements. Dot tiles use centered ring compositions rather
// than domino diagonals; bamboo overrides the counts where sticks stack
// differently (2: parallel pair, 3: one over two, 6: two rows of three,
// 7: one over three over three).
const NINE_GRID = { xs: [11, 22, 33], ys: [13, 30, 47] };
const DOT_SPOTS = {
  1: [[22, 30]],
  2: [[22, 18], [22, 42]],
  3: [[22, 12], [22, 30], [22, 48]],
  4: [[12, 16], [32, 16], [12, 44], [32, 44]],
  5: [[12, 14], [32, 14], [22, 30], [12, 46], [32, 46]],
  6: [[12, 12], [32, 12], [12, 30], [32, 30], [12, 48], [32, 48]],
  7: [[11, 13], [22, 13], [33, 13], [22, 30], [11, 47], [22, 47], [33, 47]],
  8: [[12, 9], [32, 9], [12, 23], [32, 23], [12, 37], [32, 37], [12, 51], [32, 51]],
  9: NINE_GRID.ys.flatMap((y) => NINE_GRID.xs.map((x) => [x, y])),
};
const DOT_ART = 'mahjong-dot-pip.png';
const WIND_ART = Object.freeze({
  n: 'mahjong-wind-north.png',
  e: 'mahjong-wind-east.png',
  s: 'mahjong-wind-south.png',
  w: 'mahjong-wind-west.png',
});
const WIND_SEAL_ART = 'mahjong-wind-compass.png';
const WIND_SEAL_ROTATION = Object.freeze({ n: 0, e: 90, s: 180, w: 270 });
const WIND_DIRECTION_LABEL = Object.freeze({ n: 'N', e: 'E', s: 'S', w: 'W' });
const DRAGON_ART = Object.freeze({
  c: 'mahjong-dragon-red.png',
  f: 'mahjong-dragon-green.png',
  p: 'mahjong-dragon-white.png',
});
const DRAGON_SEAL_ART = Object.freeze({
  c: 'mahjong-dragon-red-seal.png',
  f: 'mahjong-dragon-green-seal.png',
  p: 'mahjong-dragon-white-seal.png',
});
const BONUS_ART = Object.freeze({
  flower: 'mahjong-flower.png',
  season: 'mahjong-season.png',
});
const DOT_PIP_SIZES = Object.freeze({
  1: 26,
  2: 15,
  3: 13.5,
  4: 12.5,
  5: 11.75,
  6: 10.5,
  7: 9.75,
  8: 9.5,
  9: 9,
});
const BAM_SPOTS = {
  1: [[22, 30]],
  2: [[14, 30], [30, 30]],
  3: [[22, 14], [11, 44], [33, 44]],
  4: [[11, 13], [33, 13], [11, 47], [33, 47]],
  5: [[11, 13], [33, 13], [22, 30], [11, 47], [33, 47]],
  6: [[11, 17], [22, 17], [33, 17], [11, 43], [22, 43], [33, 43]],
  7: [[22, 9], [11, 30], [22, 30], [33, 30], [11, 51], [22, 51], [33, 51]],
  // Stagger the four pairs so eight bamboo reads as individual sticks instead
  // of two uninterrupted rails.
  8: [[13, 7.5], [31, 7.5], [11, 22.5], [33, 22.5], [13, 37.5], [31, 37.5], [11, 52.5], [33, 52.5]],
  9: NINE_GRID.ys.flatMap((y) => NINE_GRID.xs.map((x) => [x, y])),
};

const BAMBOO_ART = Object.freeze({
  one: 'mahjong-bamboo-one.png',
  jade: 'mahjong-bamboo-jade.png',
  gold: 'mahjong-bamboo-gold.png',
});
const BAMBOO_STICK_SIZES = Object.freeze({
  2: [13, 36],
  3: [12, 24],
  4: [11, 21],
  5: [10.5, 19],
  6: [10, 18],
  7: [9.5, 17],
  8: [9, 15.5],
  9: [8.5, 14.5],
});

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function faceImage(href, x, y, width, height, className) {
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

function dotFace(count) {
  const group = el('g', { class: `mj-dot-art mj-dot-art-${count}` });
  const size = DOT_PIP_SIZES[count];
  for (const [x, y] of DOT_SPOTS[count]) {
    group.append(faceImage(DOT_ART, x, y, size, size, 'mj-dot-source'));
  }
  return group;
}

function windFace(id, variant = 'motif') {
  const group = el('g', { class: `mj-wind-art mj-wind-art-${id} mj-wind-art-${variant}` });
  if (variant === 'seal') {
    const compass = faceImage(WIND_SEAL_ART, 22, 30, 40, 40, 'mj-wind-source mj-wind-source-seal');
    compass.setAttribute('transform', `rotate(${WIND_SEAL_ROTATION[id]} 22 30)`);
    const badge = el('g', { class: `mj-wind-direction mj-wind-direction-${id}` });
    badge.append(el('rect', { x: 15, y: 46, width: 14, height: 10, rx: 4 }));
    const direction = textEl(22, 51, 7.5, WIND_DIRECTION_LABEL[id]);
    direction.classList.add('mj-wind-direction-label');
    badge.append(direction);
    group.append(compass, badge);
  } else {
    group.append(faceImage(WIND_ART[id], 22, 30, 42, 48, 'mj-wind-source mj-wind-source-motif'));
  }
  return group;
}

function dragonFace(id, variant = 'motif') {
  const group = el('g', { class: `mj-dragon-art mj-dragon-art-${id} mj-dragon-art-${variant}` });
  const source = variant === 'seal' ? DRAGON_SEAL_ART[id] : DRAGON_ART[id];
  const [width, height] = variant === 'seal' ? [40, 40] : [42, 48];
  group.append(faceImage(
    source,
    22,
    30,
    width,
    height,
    `mj-dragon-source mj-dragon-source-${variant}`
  ));
  return group;
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
// segmented lacquer sticks with restrained brass accents, borrowing Mahjong
// Blast's at-a-glance clarity while keeping Blanc's engraved material finish.
function bambooFace(count) {
  const group = el('g', { class: `mj-bamboo-art mj-bamboo-art-${count}` });
  if (count === 1) {
    group.append(faceImage(BAMBOO_ART.one, 22, 30, 42, 48, 'mj-bamboo-source mj-bamboo-source-one'));
  } else {
    const [width, height] = BAMBOO_STICK_SIZES[count];
    BAM_SPOTS[count].forEach(([x, y], index) => {
      group.append(faceImage(
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
    'dominant-baseline': 'central',
    fill: 'currentColor',
  });
  t.textContent = content;
  return t;
}

// Bonus tiles match by family in classic Mahjong solitaire: every flower can
// pair with every flower, and every season can pair with every season. Their
// artwork therefore uses one polished, unmistakable motif per family. This
// avoids the false promise of exact matching created by unrelated UI glyphs
// and corner numerals while keeping the underlying four-tile sets intact.
function bonusFace(family) {
  const group = el('g', { class: `mj-bonus-art mj-bonus-${family}` });
  group.append(faceImage(BONUS_ART[family], 22, 30, 42, 48, 'mj-bonus-source'));
  return group;
}

const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function tileName(kind) {
  const [family, id, rawVariant] = kind.split('-');
  const variant = rawVariant || 'motif';
  if (family === 'dot') return `${NUM_WORDS[id - 1]} dot`;
  if (family === 'bam') return `${NUM_WORDS[id - 1]} bamboo`;
  if (family === 'chr') return `${NUM_WORDS[id - 1]} character`;
  if (family === 'wind') {
    const direction = { e: 'east', s: 'south', w: 'west', n: 'north' }[id];
    const motif = { e: 'sunrise', s: 'sun', w: 'moon and wave', n: 'mountain' }[id];
    return `${direction} wind, ${variant === 'seal' ? 'compass' : motif}`;
  }
  if (family === 'drg') {
    const dragon = { c: 'red dragon', f: 'green dragon', p: 'white dragon' }[id];
    const motif = { c: 'flame', f: 'flourish', p: 'Blanc mark' }[id];
    return `${dragon}, ${variant === 'seal' ? 'seal' : motif}`;
  }
  if (family === 'flower') return 'flower bonus';
  return 'season bonus';
}

function faceSVG(kind) {
  const svg = el('svg', { viewBox: '0 0 44 60', 'aria-hidden': 'true' });
  svg.classList.add('mj-face');
  const [family, id, rawVariant] = kind.split('-');
  const variant = rawVariant || 'motif';
  if (family === 'dot') {
    svg.append(dotFace(Number(id)));
  } else if (family === 'bam') {
    svg.append(bambooFace(Number(id)));
  } else if (family === 'chr') {
    const number = textEl(22, 30, 42, id);
    number.classList.add('mj-character-number');
    svg.append(number);
  } else if (family === 'wind') {
    svg.append(windFace(id, variant));
  } else if (family === 'drg') {
    svg.append(dragonFace(id, variant));
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
let comboAnimationPauseCount = 0;
let comboFxTimer = null;
let tileAnimationGeneration = 0;
let scoreAnimationGeneration = 0;
let hintTimer = null;
const transientMotion = new Set();

function scoreElements() {
  return ['mjScore', 'mjBurstScore']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function setDisplayedScore(value) {
  const label = Number(value || 0).toLocaleString();
  for (const element of scoreElements()) element.textContent = label;
}

function animateDisplayedScore(from, to, duration = 360) {
  const generation = ++scoreAnimationGeneration;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || to <= from || typeof requestAnimationFrame !== 'function') {
    setDisplayedScore(to);
    return;
  }
  const startedAt = performance.now();
  const tick = (now) => {
    if (generation !== scoreAnimationGeneration) return;
    const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
    const eased = 1 - ((1 - progress) ** 3);
    setDisplayedScore(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function clearTransientMotion() {
  for (const element of transientMotion) element.remove();
  transientMotion.clear();
}

function clearHint() {
  if (hintTimer !== null) window.clearTimeout(hintTimer);
  hintTimer = null;
  for (const button of tileButtons) button.classList.remove('hinted');
  for (const slot of document.querySelectorAll('.mj-tray-slot')) slot.classList.remove('hinted');
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
    target.classList.remove('auto-clearing', 'is-rippling', 'is-receiving', 'is-matching');
    const index = indices[slot];
    if (Number.isInteger(index)) target.dataset.tileIndex = String(index);
    else delete target.dataset.tileIndex;
    target.classList.toggle('filled', Number.isInteger(index));
    target.setAttribute('aria-label', Number.isInteger(index)
      ? `Burst slot ${slot + 1}: ${tileName(game.kinds[index])}`
      : `Burst slot ${slot + 1}: empty`);
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
    b.disabled = false;
    b.style.pointerEvents = '';
    b.classList.remove('removing', 'tray-travel', 'is-flight-source', 'auto-clearing');
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
  if (game.mode === 'tray') setDisplayedScore(game.score);
  else document.getElementById('mjScore').textContent = '—';
  paintCombo();
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
  if (modeName) modeName.textContent = game.mode === 'tray' ? 'Burst' : 'Classic';
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
  comboClockAt = Date.now();
  board.toggleAttribute('aria-busy', busy);
  board.style.pointerEvents = busy ? 'none' : '';
  syncModalBackground();
}

function beginComboAnimationPause() {
  checkpointComboClock();
  comboAnimationPauseCount += 1;
  comboClockAt = Date.now();
}

function endComboAnimationPause() {
  comboAnimationPauseCount = Math.max(0, comboAnimationPauseCount - 1);
  comboClockAt = Date.now();
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
    announce('The Burst rack is full. Undo, shuffle and continue, or restart.');
  }
  if (notice) notice.hidden = rescuing || E.availableMoves(game).length > 0;
}

function cueForResult(result) {
  if (E.isWon(game)) return 'win';
  if (game.status === 'rescue' || result.type === 'rescue') return 'rescue';
  if (result.type === 'tray-pair' && result.comboCount >= 15) return 'comboMasterful';
  if (result.type === 'tray-pair' && result.comboCount >= 10) return 'comboBrilliant';
  if (result.type === 'tray-pair' && result.milestone) return 'comboFlowing';
  if (result.type === 'tray-pair' && result.comboCount > 1) return 'comboStep';
  if (result.type === 'tray-pair') return 'pair';
  if (result.type === 'tray-park') return 'tray';
  if (result.type === 'pair') return 'pair';
  return 'select';
}

function finishTileResult(result, index, { unlockInput = false, endAnimationPause = false } = {}) {
  if (unlockInput) setTileAnimationBusy(false);
  if (endAnimationPause) endComboAnimationPause();
  refreshTiles({ recoverFocus: ['pair', 'tray-pair', 'tray-park', 'rescue'].includes(result.type) });
  checkEndStates();
  if (result.type === 'tray-pair') {
    const automatic = result.autoClear
      ? ` Automatic pair cleared for ${result.bonusPoints} bonus points.`
      : result.milestone ? ` ${result.bonusPoints} milestone bonus points.` : '';
    announce(`Combo ${result.comboCount}. ${result.userPoints} points.${automatic} ${game.score} total.`);
  } else if (result.type === 'tray-park') {
    announce(`${tileName(game.kinds[index])} moved to the Burst rack. ${trayIndices().length} of 4 slots filled.`);
  } else if (result.type === 'pair') {
    announce(`Pair cleared. ${Math.max(0, positions.length / 2 - clearedPairs())} pairs left.`);
  }
}

function comboTier(count) {
  if (count >= 15) return { name: 'masterful', label: `MASTERFUL ×${count}` };
  if (count >= 10) return { name: 'brilliant', label: `BRILLIANT ×${count}` };
  return { name: 'flowing', label: `FLOWING ×${count}` };
}

function trackTransient(element, duration) {
  transientMotion.add(element);
  window.setTimeout(() => {
    element.remove();
    transientMotion.delete(element);
  }, duration);
}

function nextTrayTarget() {
  return [...document.querySelectorAll('.mj-tray-slot')]
    .find((slot) => !slot.classList.contains('filled')) || null;
}

function startTrayFlight(result, index) {
  if (!['tray-park', 'rescue', 'tray-pair'].includes(result.type)) return 0;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const source = tileButtons[index];
  const target = nextTrayTarget();
  if (!source || !target) return 0;
  target.classList.add('is-receiving');
  if (result.type === 'tray-pair') {
    target.classList.add('is-matching');
    document.querySelector(`.mj-tray-slot[data-tile-index="${result.indices[0]}"]`)
      ?.classList.add('is-matching');
  }
  if (reducedMotion || typeof source.animate !== 'function') return 0;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = source.cloneNode(true);
  clone.removeAttribute('id');
  clone.removeAttribute('aria-label');
  clone.removeAttribute('aria-pressed');
  clone.removeAttribute('tabindex');
  clone.className = 'mj-tile mj-tile-flight';
  clone.disabled = true;
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
  });
  document.body.append(clone);
  const dx = targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2;
  const dy = targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2;
  const scaleX = targetRect.width / sourceRect.width;
  const scaleY = targetRect.height / sourceRect.height;
  const targetTransform = `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`;
  if (result.type === 'tray-pair') {
    trackTransient(clone, 780);
    clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', filter: 'brightness(1)', opacity: 1, offset: 0 },
      { transform: `translate3d(${dx * 0.55}px, ${dy * 0.46 - 18}px, 0) scale(1.08)`, filter: 'brightness(1.12)', opacity: 1, offset: 0.22 },
      { transform: targetTransform, filter: 'brightness(1.16)', opacity: 1, offset: 0.42 },
      { transform: targetTransform, filter: 'brightness(1.08)', opacity: 1, offset: 0.58 },
      { transform: `translate3d(${dx + 5}px, ${dy - 4}px, 0) scale(${scaleX * 1.08}, ${scaleY * 1.08})`, filter: 'brightness(1.32)', opacity: 1, offset: 0.73 },
      { transform: `translate3d(${dx + 10}px, ${dy - 15}px, 0) scale(${scaleX * 0.76}, ${scaleY * 0.76})`, filter: 'brightness(1.45)', opacity: 0, offset: 1 },
    ], { duration: 760, easing: 'cubic-bezier(.18,.82,.2,1)', fill: 'forwards' });
  } else {
    trackTransient(clone, 380);
    clone.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', filter: 'brightness(1)', offset: 0 },
      { transform: `translate3d(${dx * 0.55}px, ${dy * 0.46 - 18}px, 0) scale(1.08)`, filter: 'brightness(1.12)', offset: 0.52 },
      { transform: targetTransform, filter: 'brightness(1.16)', offset: 1 },
    ], { duration: 320, easing: 'cubic-bezier(.18,.82,.2,1)', fill: 'forwards' });
  }
  return 320;
}

function launchTrayBurst() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const anchor = [...document.querySelectorAll('.mj-tray-slot.is-matching')].at(-1);
  const rect = anchor?.getBoundingClientRect();
  if (!rect) return;
  const burst = document.createElement('img');
  burst.className = 'mj-tray-burst';
  burst.src = 'mahjong-combo-particles.png';
  burst.alt = '';
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  document.body.append(burst);
  trackTransient(burst, 560);
}

function launchScoreFlight(result, index) {
  if (result.type !== 'tray-pair') return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const sourceRect = [...document.querySelectorAll('.mj-tray-slot.is-matching')].at(-1)
    ?.getBoundingClientRect() || tileButtons[index]?.getBoundingClientRect();
  const scoreRect = document.getElementById('mjBurstScore')?.getBoundingClientRect();
  if (reducedMotion || !sourceRect || !scoreRect) return;
  const chip = document.createElement('div');
  chip.className = 'mj-score-flight';
  chip.textContent = `+${result.userPoints}`;
  chip.style.setProperty('--mj-flight-from-x', `${sourceRect.left + sourceRect.width / 2}px`);
  chip.style.setProperty('--mj-flight-from-y', `${sourceRect.top + sourceRect.height / 2}px`);
  chip.style.setProperty('--mj-flight-to-x', `${scoreRect.left + scoreRect.width / 2}px`);
  chip.style.setProperty('--mj-flight-to-y', `${scoreRect.top + scoreRect.height / 2}px`);
  document.body.append(chip);
  trackTransient(chip, 760);
}

function startComboFeedback(result, index) {
  const fx = document.getElementById('mjComboFx');
  if (!fx || result.type !== 'tray-pair') return;
  const tier = comboTier(result.comboCount);
  fx.dataset.tier = tier.name;
  const callout = document.getElementById('mjComboCallout');
  callout.replaceChildren();
  if (result.comboCount > 1) {
    const label = document.createElement('span');
    label.textContent = result.milestone ? tier.name : 'combo';
    const multiplier = document.createElement('strong');
    multiplier.textContent = `×${result.comboCount}`;
    callout.append(label, multiplier);
  }
  fx.className = 'mj-combo-fx';
  if (comboFxTimer !== null) window.clearTimeout(comboFxTimer);
  const rippleSlots = [...document.querySelectorAll('.mj-tray-slot.filled')];
  for (const slot of rippleSlots) slot.classList.remove('is-rippling');
  void fx.offsetWidth;
  fx.classList.add('is-impact');
  if (result.comboCount >= 3) fx.classList.add('is-heated');
  if (result.comboCount > 1) fx.classList.add('is-combo');
  if (result.milestone) fx.classList.add('is-milestone');
  if (result.autoClear) fx.classList.add('is-auto');
  for (const slot of rippleSlots) slot.classList.add('is-rippling');
  if (result.autoClear) window.setTimeout(() => sound.play('autoClear'), 250);
  launchScoreFlight(result, index);
  launchTrayBurst();
  const fxDuration = result.comboCount >= 15 ? 860 : result.milestone ? 760 : result.comboCount > 1 ? 660 : 560;
  comboFxTimer = window.setTimeout(() => {
    fx.className = 'mj-combo-fx';
    for (const slot of document.querySelectorAll('.mj-tray-slot')) slot.classList.remove('is-rippling');
    comboFxTimer = null;
  }, fxDuration);
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
  const trayMotion = ['tray-park', 'rescue', 'tray-pair'].includes(result.type);
  const className = trayMotion ? 'is-flight-source' : 'removing';
  const locksInput = Boolean(result.autoClear);
  const generation = tileAnimationGeneration;
  const immediate = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  beginComboAnimationPause();
  if (locksInput) setTileAnimationBusy(true);
  const flightDuration = startTrayFlight(result, index);
  if (result.type === 'tray-pair') {
    const from = Math.max(0, result.score - result.userPoints - result.bonusPoints);
    animateDisplayedScore(from, result.score, Math.max(300, flightDuration));
    window.setTimeout(() => {
      if (generation === tileAnimationGeneration) startComboFeedback(result, index);
    }, immediate ? 0 : Math.max(220, flightDuration - 40));
  }
  for (const tileIndex of departing) {
    const button = tileButtons[tileIndex];
    if (!button || button.hidden) continue;
    button.classList.remove(className);
    void button.offsetWidth;
    button.classList.add(className);
    button.disabled = true;
    button.style.pointerEvents = 'none';
  }
  for (const autoIndex of result.autoClear?.indices || []) {
    const button = tileButtons[autoIndex];
    if (!button || button.hidden) continue;
    button.classList.remove('auto-clearing');
    void button.offsetWidth;
    button.classList.add('auto-clearing');
  }
  if (result.autoClear?.source === 'tray') {
    const trayIndex = result.autoClear.indices[0];
    const traySlot = document.querySelector(`.mj-tray-slot[data-tile-index="${trayIndex}"]`);
    traySlot?.classList.add('auto-clearing');
  }
  if (result.type === 'tray-pair') {
    for (const score of scoreElements()) {
      score.classList.remove('score-pulse');
      void score.offsetWidth;
      score.classList.add('score-pulse');
    }
  }
  const duration = locksInput ? 1080
    : result.type === 'tray-pair' ? 760
      : result.type === 'tray-park' || result.type === 'rescue' ? 340
      : 240;
  window.setTimeout(
    () => {
      if (generation !== tileAnimationGeneration) return;
      finishTileResult(result, index, { unlockInput: locksInput, endAnimationPause: true });
    },
    immediate ? 0 : duration,
  );
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
    window.setTimeout(() => tile.classList.remove('shake'), 420);
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
  const cue = cueForResult(result);
  const semitones = cue === 'comboStep' ? Math.min(7, Math.max(0, result.comboCount - 2)) : 0;
  sound.play(cue, { semitones });
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
  const trayIndex = move.find((index) => game.tray.includes(index));
  if (Number.isInteger(trayIndex)) {
    document.querySelector(`.mj-tray-slot[data-tile-index="${trayIndex}"]`)?.classList.add('hinted');
  }
  hintTimer = window.setTimeout(clearHint, 2200);
  if (move.length === 2 && move.some((index) => game.tray.includes(index))) {
    announce(`Hint: a ${tileName(game.kinds[trayIndex])} in the Burst rack has a free match.`);
  } else if (visible.length === 2) {
    announce(`Hint: two ${tileName(game.kinds[visible[0]])} tiles are available.`);
  } else {
    announce(`Hint: ${tileName(game.kinds[visible[0]])} is free to move into the Burst rack.`);
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
  button.dataset.tooltip = label;
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
let comboClockAt = Date.now();

function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function paintTimer() {
  if (!game) return;
  checkpointComboClock();
  const live = runningSince === null ? 0 : Math.max(0, Date.now() - runningSince);
  document.getElementById('mjTimer').textContent = formatMs(game.elapsedMs + live);
  paintCombo();
}

function comboActionable() {
  return Boolean(game?.mode === 'tray' && game.status === 'playing' && !document.hidden && embedActive
    && !tileAnimationBusy && comboAnimationPauseCount === 0 && !activeModal());
}

function checkpointComboClock() {
  const now = Date.now();
  const delta = Math.max(0, now - comboClockAt);
  comboClockAt = now;
  if (!comboActionable() || delta === 0) return;
  const result = E.advanceComboClock(game, delta);
  if (result.expired) saveAfterMutation();
}

function paintCombo() {
  if (!game) return;
  const combo = document.getElementById('mjCombo');
  const bar = document.getElementById('mjComboBar');
  const score = document.getElementById('mjScore');
  const scoreMeter = score?.closest('.mj-score-meter');
  const burstScore = document.getElementById('mjBurstScoreWrap');
  const rail = document.getElementById('mjTrayRail');
  const count = game.mode === 'tray' ? game.comboCount : 0;
  const progress = game.mode === 'tray' && game.comboCount > 0
    ? Math.max(0, Math.min(1, game.comboRemainingMs / E.COMBO_WINDOW_MS))
    : 0;
  if (combo) combo.textContent = game.mode === 'tray' && game.comboCount > 0 ? `×${game.comboCount}` : '—';
  if (bar) {
    bar.style.setProperty('--mj-combo-progress', String(progress));
    bar.setAttribute('aria-valuenow', String(Math.round(game.comboRemainingMs || 0)));
    bar.classList.toggle('is-urgent', game.comboCount > 0 && game.comboRemainingMs <= 1500);
  }
  scoreMeter?.classList.toggle('is-heated', count >= 3);
  scoreMeter?.classList.toggle('is-brilliant', count >= 10);
  scoreMeter?.classList.toggle('is-masterful', count >= 15);
  burstScore?.classList.toggle('is-heated', count >= 3);
  burstScore?.classList.toggle('is-brilliant', count >= 10);
  burstScore?.classList.toggle('is-masterful', count >= 15);
  rail?.classList.toggle('is-live', count > 0);
  rail?.classList.toggle('is-hot', count >= 5);
}

function startTimer() {
  hasStarted = true;
  if (runningSince !== null || document.hidden || !embedActive || game?.status !== 'playing') return;
  runningSince = Date.now();
  comboClockAt = runningSince;
  clearInterval(tickHandle);
  tickHandle = setInterval(paintTimer, 50);
}

function checkpointTimer() {
  if (!game || runningSince === null) return;
  const now = Date.now();
  game.elapsedMs += Math.max(0, now - runningSince);
  runningSince = now;
}

function pauseTimer() {
  checkpointComboClock();
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
  if (layoutRevision !== game.layoutRevision) return null;
  if (game.mode === 'tray' && record.scoringRevision !== E.TRAY_SCORING_REVISION) return null;
  return record;
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
    maxCombo: game.maxCombo,
    autoClears: game.autoClears,
    scoringRevision: game.scoringRevision,
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
  const win = document.getElementById('mjWin');
  const isBurst = game.mode === 'tray';
  const time = formatMs(game.elapsedMs);
  const label = isBurst ? `${game.score.toLocaleString()} points. ${time}` : time;
  win.dataset.mode = isBurst ? 'burst' : 'classic';
  document.getElementById('mjWinScore').textContent = isBurst
    ? game.score.toLocaleString()
    : time;
  document.getElementById('mjWinUnit').textContent = isBurst ? 'points' : 'clear time';
  document.getElementById('mjWinTime').textContent = time;
  const record = document.getElementById('mjWinBest');
  record.textContent = game._newRecord
    ? 'new record'
    : best
      ? (game.mode === 'classic'
          ? `best ${formatMs(best.bestTimeMs)}`
          : `best ${best.bestScore.toLocaleString()} · ${formatMs(best.bestTimeMs)}`)
      : 'first clear';
  record.classList.toggle('is-record', Boolean(game._newRecord));
  const stats = document.getElementById('mjWinStats');
  if (stats) stats.hidden = !isBurst;
  document.getElementById('mjWinCombo').textContent = `×${game.maxCombo || 0}`;
  document.getElementById('mjWinAutoClears').textContent = String(game.autoClears || 0);
  setDialogVisible(win, true);
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
let setupChoice = { layoutId: S.dailyDeal(new Date()).layoutId, mode: 'tray', source: 'daily' };
let setupReturnToWin = false;

function saveAfterMutation() {
  if (!game || !gameStore || !gameId) return false;
  checkpointTimer();
  game.gameId = gameId;
  game.updatedAt = Date.now();
  return gameStore.save(gameId, game);
}

function configureGame(nextGame) {
  tileAnimationGeneration += 1;
  scoreAnimationGeneration += 1;
  comboAnimationPauseCount = 0;
  clearTransientMotion();
  if (comboFxTimer !== null) window.clearTimeout(comboFxTimer);
  comboFxTimer = null;
  const fx = document.getElementById('mjComboFx');
  if (fx) fx.className = 'mj-combo-fx';
  setTileAnimationBusy(false);
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
    announce(`${E.LAYOUTS[layoutId].name} ${mode === 'tray' ? 'Burst' : 'Classic'} game ready.`);
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
    ? 'Build rapid matches in a four-slot Burst rack.'
    : 'Match two free tiles directly.';
  const sourceDescription = document.getElementById('mjSourceDescription');
  if (sourceDescription) sourceDescription.textContent = setupChoice.source === 'daily'
    ? `${S.dailyDeal(new Date()).dailyKey} · ${E.LAYOUTS[setupChoice.layoutId].name}`
    : 'A fresh, guaranteed-solvable board.';
}

function openSetup() {
  pauseTimer();
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
  if (!document.hidden && embedActive && hasStarted && game?.status === 'playing') startTimer();
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
    const daily = S.dailyDeal(new Date());
    startGame({ ...daily, mode: 'tray' }, { soundCue: false });
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
