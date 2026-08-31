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
const newtabHtml = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/newtab.html'),
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

test('bonus families use full-scale lacquer artwork and hints clear stale emphasis', () => {
  assert.doesNotMatch(controller, /BLANC_GLYPHS/);
  assert.match(controller, /function bonusFace\(family\)/);
  assert.match(controller, /flower:\s*'mahjong-flower\.png'/);
  assert.match(controller, /season:\s*'mahjong-season\.png'/);
  assert.match(controller, /class: `mj-bonus-art mj-bonus-\$\{family\}`/);
  assert.match(controller, /faceImage\(BONUS_ART\[family\], 22, 30, 42, 48, 'mj-bonus-source'\)/);
  assert.match(controller, /if \(family === 'flower'\) return 'flower bonus';/);
  assert.doesNotMatch(controller, /FLOWER_PETAL_PATH/);
  assert.doesNotMatch(controller, /textEl\(36,\s*54,\s*10,\s*id\)/);
  assert.match(styles, /\.mj-tile\[data-suit="flower"\]\s*\{[^}]*var\(--mj-flower\)/);
  assert.match(styles, /\.mj-tile\[data-suit="season"\]\s*\{[^}]*var\(--mj-season\)/);
  assert.match(styles, /\.mj-bonus-source\s*\{[^}]*image-rendering:\s*auto;[^}]*drop-shadow/);
  assert.match(controller, /let hintTimer = null;/);
  assert.match(controller, /function clearHint\(\)\s*\{[\s\S]*classList\.remove\('hinted'\)/);
  assert.match(controller, /hintTimer = window\.setTimeout\(clearHint, 2200\);/);
  assert.match(controller, /function refreshTiles[\s\S]*if \(!game\) return;\s*clearHint\(\);/);

  const expected = new Map([
    ['mahjong-flower.png', '81dbfb0478ab92974406a9f174234f7bea308c4e849625fc2a73c4351c11bd39'],
    ['mahjong-season.png', '382c076ccc109512804d11216d6162c4e2fcce0b0c304531f93e80f0ca83de91'],
  ]);
  for (const [asset, digest] of expected) {
    const data = fs.readFileSync(path.join(__dirname, `../../src/renderer/pages/${asset}`));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', `${asset} is not a PNG`);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), digest);
  }
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
    '81a435812d1b6196d30fda4167597877523c60c934a6334698d2109efbd3a70c'
  );
});

test('winds and dragons unite all motif and compass-seal designs at their intended scale', () => {
  assert.match(controller, /n:\s*'mahjong-wind-north\.png'/);
  assert.match(controller, /e:\s*'mahjong-wind-east\.png'/);
  assert.match(controller, /s:\s*'mahjong-wind-south\.png'/);
  assert.match(controller, /w:\s*'mahjong-wind-west\.png'/);
  assert.match(controller, /const WIND_SEAL_ART = 'mahjong-wind-compass\.png'/);
  assert.match(controller, /WIND_SEAL_ROTATION = Object\.freeze\(\{ n: 0, e: 90, s: 180, w: 270 \}\)/);
  assert.match(controller, /WIND_DIRECTION_LABEL = Object\.freeze\(\{ n: 'N', e: 'E', s: 'S', w: 'W' \}\)/);
  assert.match(controller, /c:\s*'mahjong-dragon-red\.png'/);
  assert.match(controller, /f:\s*'mahjong-dragon-green\.png'/);
  assert.match(controller, /p:\s*'mahjong-dragon-white\.png'/);
  assert.match(controller, /c:\s*'mahjong-dragon-red-seal\.png'/);
  assert.match(controller, /f:\s*'mahjong-dragon-green-seal\.png'/);
  assert.match(controller, /p:\s*'mahjong-dragon-white-seal\.png'/);
  assert.match(controller, /faceImage\(WIND_ART\[id\], 22, 30, 42, 48, 'mj-wind-source mj-wind-source-motif'\)/);
  assert.match(controller, /faceImage\(WIND_SEAL_ART, 22, 30, 40, 40, 'mj-wind-source mj-wind-source-seal'\)/);
  assert.match(controller, /compass\.setAttribute\('transform', `rotate\(\$\{WIND_SEAL_ROTATION\[id\]\} 22 30\)`\)/);
  assert.match(controller, /class: `mj-wind-direction mj-wind-direction-\$\{id\}`/);
  assert.match(controller, /textEl\(22, 51, 7\.5, WIND_DIRECTION_LABEL\[id\]\)/);
  assert.match(controller, /const \[width, height\] = variant === 'seal' \? \[40, 40\] : \[42, 48\]/);
  assert.match(controller, /svg\.append\(windFace\(id, variant\)\)/);
  assert.match(controller, /svg\.append\(dragonFace\(id, variant\)\)/);
  assert.doesNotMatch(controller, /family === 'drg'[\s\S]{0,240}id\.toUpperCase\(\)/);
  assert.doesNotMatch(controller, /const BLANC_MARK_PATHS/);
  assert.doesNotMatch(controller, /for \(const d of BLANC_MARK_PATHS\)/);
  assert.match(styles, /\.mj-wind-source,\s*\.mj-dragon-source,\s*\.mj-bonus-source\s*\{[^}]*image-rendering:\s*auto;[^}]*drop-shadow/);
  assert.match(styles, /\.mj-wind-direction-label\s*\{[^}]*fill:\s*#fff8e6;[^}]*font-weight:\s*820/);
  for (const direction of ['n', 'e', 's', 'w']) {
    assert.match(styles, new RegExp(`\\.mj-wind-direction-${direction} rect\\s*\\{[^}]*fill:`));
  }
  assert.match(controller, /const motif = \{ e: 'sunrise', s: 'sun', w: 'moon and wave', n: 'mountain' \}\[id\];/);
  assert.match(controller, /return `\$\{direction\} wind, \$\{variant === 'seal' \? 'compass' : motif\}`;/);
  assert.match(controller, /const motif = \{ c: 'flame', f: 'flourish', p: 'Blanc mark' \}\[id\];/);
  assert.match(controller, /return `\$\{dragon\}, \$\{variant === 'seal' \? 'seal' : motif\}`;/);

  const expected = new Map([
    ['mahjong-wind-north.png', '5a2be0fdd57bcc7cc6ad6b1faac6b04a52b16417004474cd3368c406ff49a743'],
    ['mahjong-wind-east.png', 'f003b0ac6781390482ddabd94986935e805809354f2b02dfb7c79c9e20f1dcc5'],
    ['mahjong-wind-south.png', '862042ff9a958846bf75bd6e9209ef19222c094a14f09adfcb582e0b302ca390'],
    ['mahjong-wind-west.png', '85025a29255c5774479219a8912f74020c301e3a8a4e825c179f73909ff9cbf7'],
    ['mahjong-dragon-red.png', '63737ac5058ff5e342336a8a0781b15b64bf873ddb9f8ad5942662b6069aefe0'],
    ['mahjong-dragon-green.png', 'c86c6b593a1ac802307a862c617b705d3fa6b68369bdd729bbbab7fe90be9925'],
    ['mahjong-dragon-white.png', 'e9315bb2a7fd7ae39c8a8a253e1946d0f40dbf8b2e2bd6ef9aaa58f92a0f6f74'],
    ['mahjong-wind-compass.png', 'f3c61bde97bf34933421a7bd46fd386ce9fb29f0208cf69ea2a5c0685c5cd39c'],
    ['mahjong-dragon-red-seal.png', '8f107b4828e67aa9a904b6e7d4d7311f367523ca52b8395a8284f64f730b7f16'],
    ['mahjong-dragon-green-seal.png', 'ce6cd0c15b5b7be36bf52b885b88f692fceda4b6aa855ee4feb10b3efe13ccb0'],
    ['mahjong-dragon-white-seal.png', '18dbe60105c492f6fd413f4a6084041b90c5182a455ffdb5f656003194a7ac0c'],
  ]);
  for (const [asset, digest] of expected) {
    const data = fs.readFileSync(path.join(__dirname, `../../src/renderer/pages/${asset}`));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', `${asset} is not a PNG`);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), digest);
  }
});

test('character numerals fill their tile faces in ink without underline marks', () => {
  assert.match(controller, /family === 'chr'[\s\S]{0,100}textEl\(22, 30, 42, id\)/);
  assert.match(controller, /number\.classList\.add\('mj-character-number'\)/);
  assert.match(controller, /'text-anchor': 'middle',[\s\S]{0,80}'dominant-baseline': 'central'/);
  assert.doesNotMatch(controller, /family === 'chr'[\s\S]{0,180}el\('rect'/);
  assert.match(styles, /\.mj-tile\[data-suit="chr"\]\s*\{\s*color:\s*var\(--mj-ink\);\s*\}/);
  assert.doesNotMatch(styles, /\.mj-tile\[data-suit="chr"\][^{]*\{[^}]*var\(--mj-red\)/);
  assert.match(styles, /\.mj-character-number\s*\{[^}]*font-weight:\s*850;[^}]*stroke-width:\s*0\.7px;[^}]*paint-order:\s*stroke fill;/);
});

test('the bamboo suit uses a panda emblem plus the supplied jade and gold stick artwork', () => {
  assert.match(controller, /one:\s*'mahjong-bamboo-one\.png'/);
  assert.match(controller, /jade:\s*'mahjong-bamboo-jade\.png'/);
  assert.match(controller, /gold:\s*'mahjong-bamboo-gold\.png'/);
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

  const expected = new Map([
    ['mahjong-bamboo-one.png', '22b440a2a744684926340c672dc2961ad25365c8663ed17958a93565705a30d3'],
    ['mahjong-bamboo-jade.png', '95ee4db4a473a4007d355c33dcb9084e282bbc4805e0e36cd38abe9b494616cc'],
    ['mahjong-bamboo-gold.png', '14b428a5f41a790f70ac0387312a27c4c8668600cdfc56172be16e44b7ea50ef'],
  ]);
  for (const [asset, digest] of expected) {
    const data = fs.readFileSync(path.join(__dirname, `../../src/renderer/pages/${asset}`));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', `${asset} is not a PNG`);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), digest);
  }
});

test('mahjong loads its sound module before the controller and exposes a pressed toggle', () => {
  assert.match(
    html,
    /<button id="mjSound" type="button" aria-label="Sound effects on" data-tooltip="Sound on" aria-pressed="true">[\s\S]*mahjong-icons\.svg#sound-on[\s\S]*data-dock-label>sound on<\/span>/
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
  assert.match(html, /id="mjSetup"[^>]*aria-label="Boards"[^>]*data-tooltip="Boards"/);
  assert.match(html, /id="mjUndo"[^>]*aria-label="Undo"[^>]*data-tooltip="Undo"/);
  assert.match(styles, /\.mj-dock \[data-dock-label\]\s*\{[^}]*clip-path:\s*inset\(50%\)/);
  assert.match(styles, /\.mj-dock > button::after\s*\{[^}]*content:\s*attr\(data-tooltip\)[^}]*background:/);
  assert.match(controller, /button\.dataset\.tooltip = label/);
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
  for (const cue of ['comboStep', 'comboFlowing', 'comboBrilliant', 'comboMasterful', 'autoClear']) {
    assert.match(controller, new RegExp(`'${cue}'`), `missing ${cue} cue`);
  }
  assert.match(controller, /if \(soundCue\) sound\.play\('deal'\)/);
  assert.match(controller, /const daily = S\.dailyDeal\(new Date\(\)\);[\s\S]*startGame\(\{ \.\.\.daily, mode: 'tray' \}, \{ soundCue: false \}\)/);
  assert.match(controller, /document\.getElementById\('mjNew'\)\.addEventListener\('click', newGameFromControl\);/);
  assert.match(controller, /\nbootstrap\(\);\s*$/);
});

test('a fresh table defaults to Daily Burst while the tray id preserves saved-game compatibility', () => {
  assert.match(controller, /setupChoice = \{ layoutId: S\.dailyDeal\(new Date\(\)\)\.layoutId, mode: 'tray', source: 'daily' \}/);
  assert.match(controller, /if \(restored\) \{[\s\S]*configureGame\(restored\);[\s\S]*\} else \{[\s\S]*startGame\(\{ \.\.\.daily, mode: 'tray' \}/);
  assert.match(html, /id="mjModeTray"[^>]*data-mode="tray"[^>]*>Burst<\/button>/);
  assert.match(html, /burst rack/i);
  assert.match(html, /id="mjBurstScoreWrap"[^>]*>[\s\n]*<strong id="mjBurstScore">0<\/strong>/);
  assert.match(controller, /game\.mode === 'tray' \? 'Burst' : 'Classic'/);
  assert.match(controller, /Build rapid matches in a four-slot Burst rack\./);
});

test('v2 exposes setup, Tray rescue, local restoration, and keyboard affordances', () => {
  for (const id of [
    'mjSetupSheet', 'mjLayoutTurtle', 'mjLayoutArch', 'mjLayoutPeaks',
    'mjModeClassic', 'mjModeTray', 'mjSourceRandom', 'mjSourceDaily',
    'mjTraySlot0', 'mjTraySlot1', 'mjTraySlot2', 'mjTraySlot3', 'mjBurstScore',
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
  for (const id of ['mjCombo', 'mjComboBar', 'mjComboFill', 'mjComboFx', 'mjWinCombo', 'mjWinAutoClears']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(controller, /E\.advanceComboClock\(game, delta\)/);
  assert.match(controller, /game\?\.mode === 'tray'[\s\S]*!document\.hidden[\s\S]*embedActive[\s\S]*!tileAnimationBusy[\s\S]*comboAnimationPauseCount === 0[\s\S]*!activeModal\(\)/);
  assert.match(controller, /document\.getElementById\('mjHint'\)\.addEventListener[\s\S]*game\.assists\.hint \+= 1[\s\S]*saveAfterMutation\(\)/);
  assert.doesNotMatch(controller, /getElementById\('mjHint'\)[\s\S]{0,600}resetCombo/);
});

test('only automatic-clear motion locks input while ordinary tile feedback stays responsive', () => {
  assert.match(controller, /let tileAnimationBusy = false/);
  assert.match(controller, /let comboAnimationPauseCount = 0/);
  assert.match(controller, /element\.inert = covered \|\| tileAnimationBusy/);
  assert.match(controller, /function setTileAnimationBusy\(busy\)/);
  assert.match(controller, /const locksInput = Boolean\(result\.autoClear\)/);
  assert.match(controller, /if \(locksInput\) setTileAnimationBusy\(true\)/);
  assert.match(controller, /button\.disabled = true[\s\S]*button\.style\.pointerEvents = 'none'/);
  assert.match(controller, /result\.type === 'tray-pair' \? 760[\s\S]*result\.type === 'tray-park' \|\| result\.type === 'rescue' \? 340[\s\S]*: 240/);
  assert.match(controller, /comboAnimationPauseCount === 0/);
  assert.match(controller, /if \(tileAnimationBusy\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*return;/);
});

test('combo feedback restores animated tiles and removes immediately for reduced motion', () => {
  assert.match(controller, /b\.disabled = false;/);
  assert.match(controller, /b\.classList\.remove\('removing', 'tray-travel', 'is-flight-source', 'auto-clearing'\)/);
  assert.match(controller, /generation !== tileAnimationGeneration/);
  assert.match(controller, /immediate \? 0 : duration/);
  assert.match(controller, /mj-tray-slot\[data-tile-index=/);
  assert.match(styles, /\.mj-tray-slot\.auto-clearing/);
  assert.match(controller, /classList\.add\('is-impact'\)/);
  assert.match(controller, /scoreMeter\?\.classList\.toggle\('is-heated', count >= 3\)/);
  assert.match(controller, /burstScore\?\.classList\.toggle\('is-heated', count >= 3\)/);
  assert.match(controller, /animateDisplayedScore\(from, result\.score, Math\.max\(300, flightDuration\)\)/);
  assert.match(controller, /clone\.animate\(\[/);
  assert.match(controller, /document\.getElementById\('mjBurstScore'\)/);
  assert.match(styles, /@keyframes mj-particles-impact/);
  assert.match(styles, /@keyframes mj-score-spark/);
  assert.match(styles, /@keyframes mj-score-twinkle/);
  assert.match(styles, /\.mj-burst-score strong\s*\{[^}]*background:\s*linear-gradient[^}]*-webkit-background-clip:\s*text[^}]*-webkit-text-stroke:[^}]*text-shadow:/);
  assert.match(styles, /@keyframes mj-score-flight/);
  assert.match(styles, /\.mj-tray-slot\.filled\s*\{[^}]*color:\s*var\(--mj-ink\)/);
  assert.match(styles, /\.mj-tray-slot\.is-receiving/);
  assert.match(styles, /\.mj-tile\.shake::before/);
  assert.match(controller, /callout\.replaceChildren\(\)[\s\S]*label\.textContent = result\.milestone \? tier\.name : 'combo'[\s\S]*multiplier\.textContent = `×\$\{result\.comboCount\}`/);
  assert.match(controller, /document\.querySelectorAll\('\.mj-tray-slot\.filled'\)/);
  assert.doesNotMatch(controller, /for \(const slot of rippleSlots\)[^{]*\{[^}]*offsetWidth/);
  assert.match(controller, /result\.comboCount >= 15 \? 860[\s\S]*result\.milestone \? 760[\s\S]*result\.comboCount > 1 \? 660[\s\S]*: 560/);
  assert.match(styles, /\.mj-combo-fx\s*\{[^}]*contain:\s*layout paint;[^}]*isolation:\s*isolate;/);
  assert.match(styles, /\.mj-combo-callout strong\s*\{[^}]*font:\s*820[^}]*-webkit-text-stroke:[^}]*text-shadow:/);
  assert.doesNotMatch(styles, /\.mj-(?:combo-particles|combo-glint|tray-burst)[^{]*\{[^}]*mix-blend-mode:/);
});

test('desktop game header promotes session identity and status hierarchy', () => {
  assert.match(styles, /\.mj-head\s*\{[^}]*min-height:\s*58px/);
  assert.match(styles, /\.mj-session\s*\{[^}]*min-height:\s*44px[^}]*border-radius:\s*999px[^}]*font:\s*600 15px/);
  assert.match(styles, /\.mj-meters\s*\{[^}]*min-height:\s*56px[^}]*border:[^}]*border-radius:\s*15px/);
  assert.match(styles, /\.mj-meter strong\s*\{[^}]*font:\s*740 18px/);
  assert.match(styles, /\.mj-chain-meter \.mj-chain\s*\{[^}]*font-size:\s*20px[^}]*text-shadow:/);
  assert.match(styles, /\.mj-combo-bar\s*\{[^}]*width:\s*98px[^}]*height:\s*7px/);
});

test('hints pulse a complete pair and include a parked Burst tile', () => {
  assert.match(controller, /document\.querySelector\(`\.mj-tray-slot\[data-tile-index="\$\{trayIndex\}"\]`\)\?\.classList\.add\('hinted'\)/);
  assert.match(controller, /hintTimer = window\.setTimeout\(clearHint, 2200\)/);
  assert.match(styles, /\.mj-tile\.hinted\s*\{[^}]*mj-hint-pulse 720ms ease-in-out 3/);
  assert.match(styles, /\.mj-tray-slot\.hinted/);
  assert.match(styles, /#65f0dc/);
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
  assert.match(html, /src="mahjong-combo-particles\.png"/);
  assert.match(html, /src="mahjong-combo-glint\.png"/);
  assert.match(styles, /@keyframes mj-auto-clear/);
});

test('layout-card hover and focus preserve readable lacquer text colors', () => {
  assert.match(styles, /\.mj-choice:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--mj-ivory\)/);
  assert.match(styles, /\.mj-choice:is\(:hover, :focus-visible\) small\s*\{[^}]*color:\s*var\(--mj-muted\)/);
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

test('Mahjong footer can collapse, expand the game, and persist locally', () => {
  assert.match(newtabHtml, /id="mahjongFooterToggle"[^>]*aria-controls="layoutFooter"[^>]*aria-expanded="true"/);
  assert.match(newtab, /const MAHJONG_FOOTER_KEY = 'mahjongFooterHidden'/);
  assert.match(newtab, /localStorage\.getItem\(MAHJONG_FOOTER_KEY\) === '1'/);
  assert.match(newtab, /mahjongFooterHidden = !mahjongFooterHidden[\s\S]*localStorage\.setItem\(MAHJONG_FOOTER_KEY, mahjongFooterHidden \? '1' : '0'\)[\s\S]*syncMahjongFooter\(\{ animate: true \}\)/);
  assert.match(newtab, /mahjongFooterToggle\.hidden = state\.layout !== 'mahjong'/);
  assert.match(newtab, /document\.startViewTransition\(paintMahjongFooter\)/);
  assert.match(newtab, /mahjongFooterTransition\?\.skipTransition\(\)/);
  assert.match(styles, /body\[data-layout="mahjong"\]\[data-mahjong-footer="hidden"\] \.mahjong-embed\s*\{[^}]*bottom:\s*0/);
  assert.match(styles, /body\[data-layout="mahjong"\]\[data-mahjong-footer="hidden"\] \.ledger-footer\s*\{[^}]*visibility:\s*hidden[^}]*pointer-events:\s*none/);
  assert.match(styles, /body\[data-layout="mahjong"\]\[data-mahjong-footer="hidden"\] \.mahjong-footer-toggle\s*\{[^}]*bottom:\s*12px/);
  assert.match(styles, /\.mahjong-footer-toggle:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*#fff6dc/);
  assert.match(styles, /::view-transition-group\(mahjong-game\)[\s\S]*animation-duration:\s*260ms/);
  assert.doesNotMatch(styles, /\.mahjong-embed\s*\{[^}]*transition:\s*bottom/);
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
  assert.match(desktop, /\.mj-dock-icon\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;[^}]*flex-basis:\s*34px;/);
  assert.match(controller, /getPropertyValue\('--mj-board-safe-side'\)/);
  assert.match(controller, /wrap\.clientWidth - 36 - \(safeSide \* 2\)/);
  assert.match(desktop, /\.mj\[data-mode="classic"\] \.mj-game\s*\{[^}]*gap:\s*0;/);
  assert.match(desktop, /\.mj-tray-slot\s*\{[^}]*width:\s*64px;[^}]*height:\s*74px;/);
});

test('starting another board clears a stale recovery notice', () => {
  assert.match(controller, /function configureGame\(nextGame\)[\s\S]*getElementById\('mjRecoveryNotice'\)\.hidden = true;/);
  assert.match(controller, /const daily = S\.dailyDeal\(new Date\(\)\);[\s\S]*startGame\(\{ \.\.\.daily, mode: 'tray' \}[\s\S]*if \(hadSave\) document\.getElementById\('mjRecoveryNotice'\)\.hidden = false;/);
});

test('best records are scoped to the active layout revision', () => {
  assert.match(controller, /const layoutRevision = record\.layoutRevision === undefined \? 1 : record\.layoutRevision;/);
  assert.match(controller, /if \(layoutRevision !== game\.layoutRevision\) return null;/);
  assert.match(controller, /record\.scoringRevision !== E\.TRAY_SCORING_REVISION/);
  assert.match(controller, /layoutId: game\.layoutId,\s*layoutRevision: game\.layoutRevision,\s*mode: game\.mode,/);
});

test('the completion card keeps its center transform after dialog motion', () => {
  const rule = styles.match(/\.mj-win\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /transform:\s*translate\(-50%,\s*-50%\);/);
  assert.match(rule, /max-height:\s*calc\(100% - 28px\);/);
  assert.doesNotMatch(rule, /(?:^|;)\s*translate:/);
  assert.match(styles, /@keyframes mj-dialog-in\s*\{[\s\S]*translate:\s*0 12px;[\s\S]*translate:\s*0 0;/);
});

test('dialog actions keep readable lacquer contrast through hover and keyboard focus', () => {
  assert.match(styles, /\.mj-setup-card,\s*\.mj-rescue-card,\s*\.mj-card-overlay\s*\{[^}]*radial-gradient\(circle at 50% -16%[^}]*0 34px 90px[^}]*inset 0 -2px 0/);
  assert.match(styles, /\.mj-modal h1,\s*\.mj-card-overlay h1\s*\{[^}]*clamp\(30px, 3\.6vw, 40px\)/);
  assert.match(styles, /\.mj-button\s*\{[^}]*min-height:\s*48px;[^}]*font-size:\s*14px;[^}]*font-weight:\s*660/);
  assert.match(styles, /\.mj-rescue-card > p:not\(\.mj-overline\)\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.55/);
  assert.match(styles, /\.mj-rescue-actions \.mj-button\s*\{[^}]*min-height:\s*52px/);
  assert.match(styles, /\.mj-button:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--mj-ivory\);[^}]*border-color:\s*var\(--mj-brass\);[^}]*translate:\s*0 -1px;/);
  assert.match(styles, /\.mj-button-primary:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--mj-lacquer-ink\);[^}]*background:\s*#fffaf0;/);
  assert.match(styles, /\.mj-button:active\s*\{[^}]*translate:\s*0 1px;/);
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
