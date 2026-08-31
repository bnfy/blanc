'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

test('bonus families use professional shared motifs and hints clear stale emphasis', () => {
  assert.doesNotMatch(controller, /BLANC_GLYPHS/);
  assert.match(controller, /function bonusFace\(family\)/);
  assert.match(controller, /classList\.add\('mj-bonus-flower'\)/);
  assert.match(controller, /classList\.add\('mj-bonus-season'\)/);
  assert.match(controller, /const FLOWER_PETAL_PATH\s*=/);
  assert.match(controller, /for \(const angle of \[0, 72, 144, 216, 288\]\)/);
  assert.match(controller, /class:\s*'mj-flower-center',[^}]*cx:\s*22,[^}]*cy:\s*30,[^}]*r:\s*3\.7/);
  assert.match(controller, /if \(family === 'flower'\) return 'flower bonus';/);
  assert.doesNotMatch(controller, /M22 28c-5-1-8-5-7-9/);
  assert.doesNotMatch(controller, /textEl\(36,\s*54,\s*10,\s*id\)/);
  assert.doesNotMatch(controller, /M22 39v8M17 47h10/);
  assert.doesNotMatch(controller, /cx:\s*31\.5,\s*cy:\s*17\.5/);
  assert.doesNotMatch(controller, /M22 33l-1-7M26 29l6 1/);
  assert.match(controller, /d:\s*'M13 40c8-8 14-14 21-20'/);
  assert.match(styles, /\.mj-tile\[data-suit="flower"\]\s*\{[^}]*var\(--mj-flower\)/);
  assert.match(styles, /\.mj-tile\[data-suit="season"\]\s*\{[^}]*var\(--mj-season\)/);
  assert.match(styles, /\.mj-bonus-flower \.mj-flower-petals\s*\{[^}]*fill-opacity:\s*0\.055;[^}]*stroke-width:\s*1\.75;/);
  assert.match(styles, /\.mj-bonus-flower \.mj-flower-center\s*\{[^}]*fill:\s*currentColor;[^}]*stroke:\s*none;/);
  assert.match(controller, /let hintTimer = null;/);
  assert.match(controller, /function clearHint\(\)\s*\{[\s\S]*classList\.remove\('hinted'\)/);
  assert.match(controller, /hintTimer = window\.setTimeout\(clearHint, 1400\);/);
  assert.match(controller, /function refreshTiles[\s\S]*if \(!game\) return;\s*clearHint\(\);/);
});

test('the dot suit uses the reference ring pip in centered Mahjong arrangements', () => {
  assert.match(controller, /const DOT_ART = 'mahjong-dot-pip\.png'/);
  assert.match(controller, /2:\s*\[\[22, 18\], \[22, 42\]\]/);
  assert.match(controller, /3:\s*\[\[22, 12\], \[22, 30\], \[22, 48\]\]/);
  assert.match(controller, /7:\s*\[\[11, 13\], \[22, 13\], \[33, 13\], \[22, 30\], \[11, 47\], \[22, 47\], \[33, 47\]\]/);
  assert.match(controller, /const DOT_PIP_SIZES = Object\.freeze\(\{[\s\S]*1:\s*26,[\s\S]*2:\s*15,[\s\S]*9:\s*9,/);
  assert.match(controller, /function dotFace\(count\)/);
  assert.match(controller, /DOT_SPOTS\[count\]/);
  assert.match(controller, /faceImage\(DOT_ART, x, y, size, size, 'mj-dot-source'\)/);
  assert.match(controller, /svg\.append\(dotFace\(Number\(id\)\)\)/);
  assert.doesNotMatch(controller, /family === 'dot'[\s\S]{0,180}el\('circle'/);
  assert.match(styles, /\.mj-dot-source\s*\{[^}]*image-rendering:\s*auto;/);

  const pip = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/mahjong-dot-pip.png'));
  assert.equal(pip.subarray(1, 4).toString(), 'PNG');
  assert.equal(
    crypto.createHash('sha256').update(pip).digest('hex'),
    '39bc795cf513242a477cbf398d6885490f58d13768a4311f38c704398724086c'
  );
});

test('the bamboo suit uses a panda emblem plus the supplied jade and gold stick artwork', () => {
  assert.match(controller, /one:\s*'mahjong-bamboo-one\.png'/);
  assert.match(controller, /jade:\s*'mahjong-bamboo-jade\.svg'/);
  assert.match(controller, /gold:\s*'mahjong-bamboo-gold\.svg'/);
  assert.match(controller, /function faceImage\(href, x, y, width, height, className\)/);
  assert.match(controller, /return el\('image', \{/);
  assert.match(controller, /preserveAspectRatio:\s*'xMidYMid meet'/);
  assert.match(controller, /function bambooStickAsset\(count, index, x\)/);
  assert.match(controller, /\(count === 6 \|\| count === 9\) && x === 22/);
  assert.match(controller, /function bambooFace\(count\)/);
  assert.match(controller, /BAMBOO_ART\.one, 22, 30, 42, 48/);
  assert.match(controller, /2:\s*\[\[14, 30\], \[30, 30\]\]/);
  assert.match(controller, /6:\s*\[\[11, 17\], \[22, 17\], \[33, 17\], \[11, 43\], \[22, 43\], \[33, 43\]\]/);
  assert.match(controller, /BAM_SPOTS\[count\]\.forEach\(\(\[x, y\], index\) =>/);
  assert.match(controller, /bambooStickAsset\(count, index, x\)/);
  assert.match(controller, /svg\.append\(bambooFace\(Number\(id\)\)\)/);
  assert.match(controller, /8:\s*\[\[13, 7\.5\], \[31, 7\.5\], \[11, 22\.5\], \[33, 22\.5\], \[13, 37\.5\], \[31, 37\.5\], \[11, 52\.5\], \[33, 52\.5\]\]/);
  assert.match(styles, /\.mj-bamboo-source\s*\{[^}]*image-rendering:\s*auto;[^}]*drop-shadow/);

  for (const asset of ['mahjong-bamboo-one.png']) {
    const data = fs.readFileSync(path.join(__dirname, `../../src/renderer/pages/${asset}`));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', `${asset} is not a PNG`);
  }
  const suppliedStickPath = 'M9.63,26.39c-1.84,1.85-10.13,3.68-9.61-.82.17-4.22.23-14.87.24-20.11-.03-1.87.45-3.49,2.33-4.37C4.66.16,7.54-.45,9.71.42c1.55.78,1.08,2.04,1.04,4.44-.03,1.4-.02,2.75-.03,4.21-.02,3.69-.04,7.69-.06,11.35-.03,2.96.14,4.71-.94,5.87l-.09.1Z';
  const suppliedAssets = new Map([
    ['mahjong-bamboo-jade.svg', '#1f6d50'],
    ['mahjong-bamboo-gold.svg', '#8a5a18'],
  ]);
  for (const [asset, color] of suppliedAssets) {
    const data = fs.readFileSync(path.join(__dirname, `../../src/renderer/pages/${asset}`), 'utf8');
    assert.match(data, /viewBox="0 0 10\.85 28\.38"/);
    assert.ok(data.includes(suppliedStickPath), `${asset} does not preserve the supplied bamboo path`);
    assert.ok(data.includes(`fill="${color}"`), `${asset} does not use its Mahjong board accent`);
    assert.doesNotMatch(data, /<script|href=|xlink:href|foreignObject/);
  }
  const panda = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/mahjong-bamboo-one.png'));
  assert.equal(
    crypto.createHash('sha256').update(panda).digest('hex'),
    '6f3d925c19f739e79e11f92921f4d020bb6f7be9fe2527be033f3bac12ea79d9'
  );
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

test('the Mahjong wordmark carries a locally weighted canonical Blanc mark', () => {
  assert.match(html, /class="mj-brand-mark" aria-hidden="true"/);
  assert.match(styles, /\.mj-brand-mark\s*\{[^}]*mask:\s*url\("icon\.svg"\)/);
  assert.match(styles, /\.mj-brand-mark\s*\{[^}]*drop-shadow\(0\.55px 0 0 currentColor\)[^}]*drop-shadow\(-0\.55px 0 0 currentColor\)/);
});

test('setup cards devote their visual field to substantial layout previews', () => {
  const turtle = html.match(/mj-layout-mini-turtle[^>]*>([\s\S]*?)<\/span>/)?.[1] || '';
  const arch = html.match(/mj-layout-mini-arch[^>]*>([\s\S]*?)<\/span>/)?.[1] || '';
  const peaks = html.match(/mj-layout-mini-peaks[^>]*>([\s\S]*?)<\/span>/)?.[1] || '';
  assert.equal((turtle.match(/<i><\/i>/g) || []).length, 9);
  assert.equal((arch.match(/<i><\/i>/g) || []).length, 7);
  assert.equal((peaks.match(/<i><\/i>/g) || []).length, 9);
  assert.match(styles, /\.mj-layout-mini\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*180px;[^}]*height:\s*78px;/);
  assert.match(styles, /\.mj-layout-mini i\s*\{[^}]*width:\s*30px;[^}]*height:\s*39px;/);
  assert.match(styles, /\.mj-layout-mini-turtle i:nth-child\(9\)/);
  assert.match(styles, /\.mj-layout-mini-arch i:nth-child\(7\)/);
  assert.match(styles, /\.mj-layout-mini-peaks i:nth-child\(9\)/);
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

test('desktop Mahjong overlays its left rail inside a centered full-width table', () => {
  const desktop = mediaBlocks('(min-width: 1000px) and (min-height: 611px)')[0];
  assert.ok(desktop, 'missing desktop rail rules');
  assert.match(desktop, /--mj-shell-block:\s*clamp\(10px,\s*1\.4vh,\s*16px\)/);
  assert.match(desktop, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(desktop, /\.mj-head\s*\{[^}]*grid-column:\s*1;/);
  assert.match(desktop, /\.mj-game\s*\{[^}]*grid-column:\s*1;/);
  assert.match(desktop, /\.mj-board-frame\s*\{\s*anchor-name:\s*--mj-table;\s*\}/);
  assert.match(desktop, /\.mj-board-wrap\s*\{\s*--mj-board-safe-side:\s*88px;\s*\}/);
  assert.match(desktop, /\.mj-feedback\s*\{[^}]*position:\s*absolute;/);
  assert.match(desktop, /\.mj-dock\s*\{[^}]*position:\s*absolute;[^}]*position-anchor:\s*--mj-table;[^}]*left:\s*calc\(anchor\(left\) \+ 16px\);[^}]*top:\s*anchor\(center\);[^}]*transform:\s*translateY\(-50%\);[^}]*grid-template-columns:\s*1fr;/);
  assert.match(desktop, /\.mj-dock\s*\{[^}]*width:\s*64px;[^}]*grid-template-rows:\s*repeat\(5,\s*64px\);[^}]*gap:\s*16px;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*none;[^}]*box-shadow:\s*none;/);
  assert.match(desktop, /\.mj-dock > button\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%;/);
  assert.match(desktop, /\.mj-dock > button\s*\{[^}]*radial-gradient\(circle at 35% 23%[^}]*0 3px 0[^}]*inset 0 -9px 13px/);
  assert.match(desktop, /color-mix\(in srgb,\s*var\(--mj-panel-solid\) 92%,\s*var\(--mj-ivory\)\)[\s\S]*var\(--mj-lacquer-deep\)/);
  assert.doesNotMatch(desktop, /rgba\(21,\s*78,\s*63/);
  assert.match(desktop, /\.mj-dock > button:active\s*\{[^}]*translate:\s*0 1px;[^}]*inset 0 2px 6px/);
  assert.match(controller, /getPropertyValue\('--mj-board-safe-side'\)/);
  assert.match(controller, /wrap\.clientWidth - 36 - \(safeSide \* 2\)/);
  assert.match(desktop, /\.mj\[data-mode="classic"\] \.mj-game\s*\{[^}]*gap:\s*0;/);
  assert.match(desktop, /\.mj-tray-slot\s*\{[^}]*width:\s*52px;[^}]*height:\s*60px;/);
});

test('starting another board clears a stale recovery notice', () => {
  assert.match(controller, /function configureGame\(nextGame\)[\s\S]*getElementById\('mjRecoveryNotice'\)\.hidden = true;/);
  assert.match(controller, /startGame\(\{ layoutId: 'turtle',[\s\S]*if \(hadSave\) document\.getElementById\('mjRecoveryNotice'\)\.hidden = false;/);
});

test('best records are scoped to the active layout revision', () => {
  assert.match(controller, /const layoutRevision = record\.layoutRevision === undefined \? 1 : record\.layoutRevision;/);
  assert.match(controller, /return layoutRevision === game\.layoutRevision \? record : null;/);
  assert.match(controller, /layoutId: game\.layoutId,\s*layoutRevision: game\.layoutRevision,\s*mode: game\.mode,/);
});

test('the completion card keeps its center transform after dialog motion', () => {
  const rule = styles.match(/\.mj-win\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /transform:\s*translate\(-50%,\s*-50%\);/);
  assert.match(rule, /max-height:\s*calc\(100% - 28px\);/);
  assert.doesNotMatch(rule, /(?:^|;)\s*translate:/);
  assert.match(styles, /@keyframes mj-dialog-in\s*\{[\s\S]*translate:\s*0 12px;[\s\S]*translate:\s*0 0;/);
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
