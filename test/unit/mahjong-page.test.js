'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const styles = ['pages.css', 'mahjong.css'].map((name) => fs.readFileSync(
  path.join(__dirname, `../../src/renderer/pages/${name}`),
  'utf8'
)).join('\n');
const html = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/mahjong.html'),
  'utf8'
);
const controller = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/mahjong.js'),
  'utf8'
);
const newtab = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/newtab.js'),
  'utf8'
);

function mediaBlocks(query) {
  const marker = `@media ${query}`;
  const blocks = [];
  let searchFrom = 0;

  while (true) {
    const start = styles.indexOf(marker, searchFrom);
    if (start === -1) return blocks;
    const open = styles.indexOf('{', start + marker.length);
    let depth = 1;
    let cursor = open + 1;
    while (cursor < styles.length && depth > 0) {
      if (styles[cursor] === '{') depth += 1;
      else if (styles[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    blocks.push(styles.slice(start, cursor));
    searchFrom = cursor;
  }
}

test('mahjong provides static hint feedback and suppresses shake for reduced motion', () => {
  const block = mediaBlocks('(prefers-reduced-motion: reduce)')
    .find((candidate) => candidate.includes('.mj-tile.hinted'));

  assert.ok(block, 'no reduced-motion rules for mahjong feedback');
  assert.match(block, /\.mj-tile\.hinted\s*\{[^}]*animation:\s*none;/);
  assert.match(block, /\.mj-tile\.hinted\s*\{[^}]*border-color:\s*var\(--accent\);/);
  assert.match(block, /\.mj-tile\.shake\s*\{[^}]*animation:\s*none;/);
});

test('mahjong loads its sound module before the controller and exposes a pressed toggle', () => {
  assert.match(
    html,
    /<button id="mjSound" type="button" aria-pressed="true">[\s\S]*mahjong-icons\.svg#sound-on[\s\S]*data-dock-label>sound on<\/span>/
  );
  const soundModule = html.indexOf('<script src="mahjong-sound.js"></script>');
  const controllerScript = html.indexOf('<script src="mahjong.js"></script>');
  assert.ok(soundModule !== -1, 'mahjong-sound.js is not loaded');
  assert.ok(soundModule < controllerScript, 'sound module must load before mahjong.js');
});

test('the game dock uses one local professional SVG icon family instead of font glyphs', () => {
  for (const icon of ['boards', 'undo', 'hint', 'shuffle', 'sound-on', 'sound-off']) {
    assert.match(html, new RegExp(`mahjong-icons\\.svg#${icon}`), `missing ${icon} dock icon`);
  }
  assert.doesNotMatch(styles, /content:\s*["'](?:▦|↶|◇|⤨|◖)/);
  assert.match(styles, /\.mj-dock-icon\s*\{/);
});

test('every game interaction is wired to its sound cue and bootstrap stays silent', () => {
  for (const cue of ['blocked', 'undo', 'hint', 'shuffle', 'deal', 'toggle']) {
    assert.match(controller, new RegExp(`sound\\.play\\([^\\n]*'${cue}'`), `missing ${cue} cue`);
  }
  for (const cue of ['select', 'pair', 'tray', 'rescue', 'win']) {
    assert.match(controller, new RegExp(`return '${cue}'`), `missing ${cue} result cue`);
  }
  assert.match(controller, /result\.points > 100 \? 'chain' : 'pair'/);
  assert.match(controller, /if \(soundCue\) sound\.play\('deal'\)/);
  assert.match(controller, /startGame\(\{ layoutId: 'turtle', mode: 'classic', seed: randomSeed\(\) \}, \{ soundCue: false \}\)/);
  assert.match(controller, /document\.getElementById\('mjNew'\)\.addEventListener\('click', newGameFromControl\);/);
  assert.match(controller, /\nbootstrap\(\);\s*$/);
});

test('v2 exposes setup, Tray rescue, local restoration, and keyboard affordances', () => {
  for (const id of [
    'mjSetupSheet', 'mjLayoutTurtle', 'mjLayoutArch', 'mjLayoutPeaks',
    'mjModeClassic', 'mjModeTray', 'mjSourceRandom', 'mjSourceDaily',
    'mjTraySlot0', 'mjTraySlot1', 'mjTraySlot2', 'mjTraySlot3',
    'mjRescueUndo', 'mjRescueShuffle', 'mjRescueRestart', 'mjLive',
  ]) assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);

  assert.match(html, /aria-keyshortcuts="Meta\+Z Control\+Z"/);
  assert.match(html, /aria-keyshortcuts="H"/);
  assert.match(html, /aria-keyshortcuts="S"/);
  assert.match(html, /id="mjBoard"[^>]*role="group"/);
  assert.doesNotMatch(html, /id="mjBoard"[^>]*role="grid"/);
  assert.match(controller, /spatialNeighbor\(focusIndex, event\.key\)/);
  assert.match(controller, /element\.inert = covered/);
  assert.match(controller, /if \(event\.key === 'Escape' && modal\.id === 'mjSetupSheet'\)/);
  assert.match(controller, /\['pair', 'tray-pair', 'tray-park', 'rescue'\]\.includes\(result\.type\)/);
  assert.match(controller, /setProperty\('--mj-order', String\(i\)\)/);
  assert.match(controller, /visibilitychange/);
  assert.match(controller, /pagehide/);
  assert.match(controller, /S\.createGameStore/);
  assert.match(controller, /S\.createDuplicateGuard/);
  assert.match(controller, /new BroadcastChannel\('blanc-mahjong-v2-live'\)/);
});

test('tile motion locks the board, dock, and keyboard until state is settled', () => {
  assert.match(controller, /let tileAnimationBusy = false/);
  assert.match(controller, /element\.inert = covered \|\| tileAnimationBusy/);
  assert.match(controller, /function setTileAnimationBusy\(busy\)/);
  assert.match(controller, /setTileAnimationBusy\(true\)[\s\S]*setTimeout\(\(\) => finishTileResult/);
  assert.match(controller, /if \(tileAnimationBusy\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*return;/);
});

test('mahjong owns a local lacquer presentation with motion and no remote data path', () => {
  assert.match(html, /<link rel="stylesheet" href="mahjong\.css"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<script src="mahjong-state\.js"><\/script>/);
  assert.match(styles, /url\("mahjong-lacquer\.webp"\)/);
  for (const hook of ['mj-pair-remove', 'mj-tray-travel', 'mj-score-pulse', 'mj-shuffle-cascade']) {
    assert.match(styles, new RegExp(`@keyframes ${hook}`));
  }
  assert.match(controller, /classList\.add\('shuffle-cascade'\)/);
  assert.match(controller, /button\.classList\.add\(className\)/);
  assert.match(styles, /:root\[data-theme="private"\] \.mahjong-body/);
});

test('embedded Mahjong shares its opaque game id with the persisted parent URL', () => {
  assert.match(newtab, /function mahjongGameId\(\)/);
  assert.match(newtab, /history\.replaceState\(history\.state, '', url\)/);
  assert.match(newtab, /url\.searchParams\.set\('game', mahjongGameId\(\)\)/);
  assert.match(newtab, /event\.origin !== 'blanc:\/\/mahjong'/);
  assert.match(newtab, /event\.source !== mahjongFrame\.contentWindow/);
  assert.match(newtab, /event\.data\?\.type === 'blanc:mahjong-game-id'/);
  assert.match(newtab, /type:\s*'blanc:mahjong-active'/);
  assert.match(controller, /event\.data\?\.type !== 'blanc:mahjong-active'/);
  assert.match(controller, /if \(!embedActive\) \{[\s\S]*pauseTimer\(\);[\s\S]*saveAfterMutation\(\);/);
  assert.doesNotMatch(newtab, /searchParams\.set\('(seed|layout|mode|score)'/);
});

test('compact and zoomed layouts retain status with a scroll recovery path', () => {
  assert.match(styles, /\.mahjong-body\s*\{[\s\S]*overflow:\s*auto;/);
  const compact = mediaBlocks('(max-width: 390px)')[0];
  assert.ok(compact, 'missing compact Mahjong rules');
  assert.doesNotMatch(compact, /\.mj-score-meter[^}]*display:\s*none/);
  assert.doesNotMatch(compact, /\.mj-chain-meter[^}]*display:\s*none/);
});

test('mahjong reports play only after a real free-tile move', () => {
  assert.match(
    controller,
    /function reportPlayOnce\(\) \{[\s\S]*if \(playReported\) return;[\s\S]*mahjong\?\.played\?\.\(\)/,
  );
  assert.match(
    controller,
    /window\.parent\.postMessage\('blanc:mahjong-played', 'blanc:\/\/newtab'\)/,
  );
  assert.match(
    controller,
    /if \(!E\.isFree\(game, i\)\) \{[\s\S]*return;[\s\S]*reportPlayOnce\(\);\s*startTimer\(\);/,
  );
});
