'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');

const styles = ['pages.css', 'mahjong.css'].map((name) => fs.readFileSync(
  path.join(__dirname, `../../src/renderer/pages/${name}`),
  'utf8'
)).join('\n');
const mahjongStyles = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/mahjong.css'),
  'utf8'
);
// Markup is read without its interface keys (F44), so its structure and
// English stay checkable as before.
const html = withoutInterfaceKeys(fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/mahjong.html'),
  'utf8'
));
// The page's English lives in the interface catalog.
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../copy/messages/en.json'), 'utf8'));
const english = (key) => catalog[key].message;
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

test('every board the engine deals has a translated name on the page', () => {
  const { LAYOUTS } = require('../../src/renderer/pages/mahjong-engine');
  for (const id of Object.keys(LAYOUTS)) {
    assert.match(controller, new RegExp(`\\b${id}: t\\('mahjong\\.layout\\.${id}'\\)`), id);
    assert.equal(english(`mahjong.layout.${id}`), LAYOUTS[id].name);
  }
});

test('the Mahjong stylesheet has balanced blocks', () => {
  let depth = 0;
  let line = 1;
  for (const character of mahjongStyles) {
    if (character === '\n') line += 1;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      assert.ok(depth >= 0, `unexpected closing brace on line ${line}`);
    }
  }
  assert.equal(depth, 0, 'Mahjong CSS ends with an open block');
});

test('mahjong provides static hint feedback and suppresses shake for reduced motion', () => {
  const block = mediaBlocks('(prefers-reduced-motion: reduce)')
    .find((candidate) => candidate.includes('.mj-tile.hinted'));

  assert.ok(block, 'no reduced-motion rules for mahjong feedback');
  assert.match(block, /\.mj-tile\.hinted\s*\{[^}]*animation:\s*none;/);
  assert.match(block, /\.mj-tile\.hinted\s*\{[^}]*border-color:\s*var\(--accent\);/);
  assert.match(block, /\.mj-tile\.shake\s*\{[^}]*animation:\s*none;/);
});

test('bonus families keep their full-scale artwork and hints clear stale emphasis', () => {
  assert.doesNotMatch(controller, /BLANC_GLYPHS/);
  assert.match(controller, /function bonusFace\(family\)/);
  assert.match(controller, /return sheetCrop\(THEME_CROPS\[activeTileTheme\]\[family\], \{/);
  assert.match(controller, /className: `mj-sheet-face mj-bonus-art mj-bonus-\$\{family\}`/);
  assert.match(controller, /if \(family === 'flower'\) return t\('mahjong\.tile\.flower'\);/);
  assert.equal(english('mahjong.tile.flower'), 'flower bonus');
  assert.doesNotMatch(controller, /FLOWER_PETAL_PATH/);
  assert.doesNotMatch(controller, /textEl\(36,\s*54,\s*10,\s*id\)/);
  assert.match(styles, /\.mj-tile\[data-suit="flower"\]\s*\{[^}]*var\(--mj-flower\)/);
  assert.match(styles, /\.mj-tile\[data-suit="season"\]\s*\{[^}]*var\(--mj-season\)/);
  assert.match(controller, /let hintTimer = null;/);
  assert.match(controller, /function clearHint\(\)\s*\{[\s\S]*classList\.remove\('hinted'\)/);
  assert.match(controller, /hintTimer = window\.setTimeout\(clearHint, 2200\);/);
  assert.match(controller, /function refreshTiles[\s\S]*if \(!game\) return;\s*if \(!keepHint\) clearHint\(\);/);

});

test('the dot suit uses the reference ring pip in centered Mahjong arrangements', () => {
  assert.match(controller, /if \(crops\.dot\[count\]\) return sheetCrop\(crops\.dot\[count\]/);
  assert.match(controller, /2:\s*\[\[22, 18\], \[22, 42\]\]/);
  assert.match(controller, /3:\s*\[\[22, 12\], \[22, 30\], \[22, 48\]\]/);
  assert.match(controller, /7:\s*\[\[11, 13\], \[22, 13\], \[33, 13\], \[22, 30\], \[11, 47\], \[22, 47\], \[33, 47\]\]/);
  assert.match(controller, /const DOT_PIP_SIZES = Object\.freeze\(\{[\s\S]*1:\s*32,[\s\S]*2:\s*18,[\s\S]*9:\s*11\.25,/);
  assert.match(controller, /function dotFace\(count\)/);
  assert.match(controller, /DOT_SPOTS\[count\]/);
  assert.match(controller, /sheetCrop\(crops\.pip, \{[\s\S]*className: 'mj-dot-source'/);
  assert.match(controller, /svg\.append\(dotFace\(Number\(id\)\)\)/);
  assert.doesNotMatch(controller, /family === 'dot'[\s\S]{0,180}el\('circle'/);
  assert.match(styles, /\.mj-dot-source\s*\{[^}]*image-rendering:\s*auto;/);

});

test('winds and dragons use the exact approved concept-sheet crops', () => {
  assert.match(controller, /const THEME_SHEETS = Object\.freeze\(\{[\s\S]*porcelain: 'mahjong-theme-porcelain-sheet\.png',[\s\S]*carved: 'mahjong-theme-carved-sheet\.png',[\s\S]*inlay: 'mahjong-theme-inlay-sheet\.png'/);
  assert.match(controller, /function sheetCrop\(crop/);
  assert.match(controller, /href: THEME_SHEETS\[activeTileTheme\]/);
  assert.match(controller, /function windFace\(id, variant = 'motif'\) \{[\s\S]*THEME_CROPS\[activeTileTheme\]\.wind\[id\]/);
  assert.match(controller, /function dragonFace\(id, variant = 'motif'\) \{[\s\S]*THEME_CROPS\[activeTileTheme\]\.drg\[id\]/);
  assert.match(controller, /svg\.append\(windFace\(id, variant\)\)/);
  assert.match(controller, /svg\.append\(dragonFace\(id, variant\)\)/);
  assert.doesNotMatch(controller, /family === 'drg'[\s\S]{0,240}id\.toUpperCase\(\)/);
  assert.doesNotMatch(controller, /const BLANC_MARK_PATHS/);
  assert.doesNotMatch(controller, /for \(const d of BLANC_MARK_PATHS\)/);
  assert.match(controller, /const WIND_MOTIFS = \{\s*e: t\('mahjong\.tile\.motif\.sunrise'\), s: t\('mahjong\.tile\.motif\.sun'\),\s*w: t\('mahjong\.tile\.motif\.moonAndWave'\), n: t\('mahjong\.tile\.motif\.mountain'\),/);
  assert.deepEqual(['sunrise', 'sun', 'moonAndWave', 'mountain'].map((motif) => english(`mahjong.tile.motif.${motif}`)),
    ['sunrise', 'sun', 'moon and wave', 'mountain']);
  assert.match(controller, /const motif = variant === 'seal' \? t\('mahjong\.tile\.motif\.compass'\) : WIND_MOTIFS\[id\];/);
  assert.equal(english('mahjong.tile.windEast'), 'east wind, {motif}');
  assert.match(controller, /const DRAGON_MOTIFS = \{\s*c: t\('mahjong\.tile\.motif\.flame'\), f: t\('mahjong\.tile\.motif\.flourish'\), p: t\('mahjong\.tile\.motif\.blancMark'\),/);
  assert.equal(english('mahjong.tile.motif.blancMark'), 'Blanc mark');
  assert.match(controller, /const motif = variant === 'seal' \? t\('mahjong\.tile\.motif\.seal'\) : DRAGON_MOTIFS\[id\];/);

});

test('character tiles preserve approved samples and use Inter Bold for interpolated ranks', () => {
  assert.match(controller, /const sample = count <= 3 \? 1 : count <= 7 \? 5 : 9;/);
  assert.match(controller, /group\.append\(sheetCrop\(crops\.chr\[sample\]\)\);/);
  assert.match(controller, /if \(count === sample\) return group;/);
  assert.match(controller, /number\.classList\.add\('mj-character-number'\)/);
  assert.match(controller, /group\.append\(sheetCrop\(crops\.chrMotif, \{/);
  assert.match(controller, /'text-anchor': 'middle',[\s\S]{0,80}'dominant-baseline': 'central'/);
  assert.match(controller, /class: 'mj-character-number-patch'/);
  assert.match(styles, /\.mj-tile\[data-suit="chr"\]\s*\{\s*color:\s*var\(--mj-tile-ink\);\s*\}/);
  assert.match(styles, /\.mj-face text\.mj-character-number\s*\{[^}]*font-family:\s*var\(--mj-face-font\);[^}]*font-weight:\s*700;[^}]*fill:\s*#aa2e20;/);
});

test('the bamboo suit uses exact approved samples and source-sheet sticks', () => {
  assert.match(controller, /function bambooFace\(count\)/);
  assert.match(controller, /if \(crops\.bam\[count\]\) return sheetCrop\(crops\.bam\[count\]/);
  assert.match(controller, /2:\s*\[\[14, 30\], \[30, 30\]\]/);
  assert.match(controller, /6:\s*\[\[11, 17\], \[22, 17\], \[33, 17\], \[11, 43\], \[22, 43\], \[33, 43\]\]/);
  assert.match(controller, /BAM_SPOTS\[count\]\.forEach\(\(\[x, y\]\) =>/);
  assert.match(controller, /sheetCrop\(crops\.bamboo, \{[\s\S]*className: 'mj-bamboo-source mj-bamboo-source-stick'/);
  assert.match(controller, /svg\.append\(bambooFace\(Number\(id\)\)\)/);
  assert.match(controller, /8:\s*\[\[13, 7\.5\], \[31, 7\.5\], \[11, 22\.5\], \[33, 22\.5\], \[13, 37\.5\], \[31, 37\.5\], \[11, 52\.5\], \[33, 52\.5\]\]/);
  assert.match(styles, /\.mj-bamboo-source\s*\{[^}]*image-rendering:\s*auto;[^}]*filter:\s*none;/);

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
  for (const icon of ['boards', 'records', 'undo', 'hint', 'shuffle', 'sound-on', 'sound-off']) {
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

test('the Mahjong wordmark carries the Sunrise mark without the retired B', () => {
  assert.match(html, /class="mj-brand-mark" aria-hidden="true"/);
  assert.match(styles, /\.mj-brand-mark\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/);
  assert.match(styles, /\.mj-brand-mark\s*\{[^}]*background:\s*url\("sunrise-mark\.png"\) center \/ contain no-repeat/);
  assert.doesNotMatch(styles, /\.mj-brand-mark\s*\{[^}]*icon\.svg/);
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
  for (const cue of ['select', 'pair', 'tray', 'mismatch', 'rescue', 'win']) {
    assert.match(controller, new RegExp(`return '${cue}'`), `missing ${cue} result cue`);
  }
  for (const cue of ['comboStep', 'comboFlowing', 'comboBrilliant', 'comboMasterful', 'autoClear']) {
    assert.match(controller, new RegExp(`'${cue}'`), `missing ${cue} cue`);
  }
  assert.match(controller, /if \(soundCue\) sound\.play\('deal'\)/);
  assert.match(controller, /function startPreferredGame\(\{ soundCue = false \} = \{\}\)/);
  assert.match(controller, /startGame\(\{ \.\.\.S\.dailyDeal\(new Date\(\)\), mode: prefs\.mode, burstRules: prefs\.burstRules \}, \{ soundCue \}\)/);
  assert.match(controller, /document\.getElementById\('mjNew'\)\.addEventListener\('click', newGameFromControl\);/);
  // The game starts once the page's static text is applied (F44).
  assert.match(controller, /function start\(\) \{\s*paintSoundButton\(\);\s*bootstrap\(\);\s*\}\s*if \(document\.readyState === 'loading'\) document\.addEventListener\('DOMContentLoaded', start, \{ once: true \}\);\s*else start\(\);\s*$/);
});

test('a fresh table deals the remembered table (Daily Burst by default) while the tray id preserves saved-game compatibility', () => {
  assert.match(controller, /prefsStore = S\.createPrefsStore\(/);
  assert.match(controller, /function startPreferredGame\(\{ soundCue = false \} = \{\}\)/);
  assert.match(controller, /if \(restored\) \{[\s\S]*configureGame\(restored\);[\s\S]*\} else \{[\s\S]*startPreferredGame\(\)/);
  // every explicit start records the table for the next fresh tab
  assert.match(controller, /function startGame\([\s\S]*?prefsStore\?\.write\(\{ layoutId, mode, source: dailyKey \? 'daily' : 'random', burstRules \}\)/);
  assert.match(html, /id="mjModeTray"[^>]*data-mode="tray"[^>]*>Burst<\/button>/);
  assert.match(html, /burst rack/i);
  assert.match(html, /id="mjBurstScoreWrap"[^>]*>[\s\n]*<strong id="mjBurstScore">0<\/strong>/);
  assert.match(controller, /mode === 'tray' \? t\('mahjong\.mode\.burst'\) : t\('mahjong\.mode\.classic'\)/);
  assert.equal(english('mahjong.setup.burstDescription'), 'Build rapid matches in a four-slot Burst rack.');
});

test('v3 exposes setup, Tray rescue, local restoration, and keyboard affordances', () => {
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
  assert.match(controller, /if \(event\.key === 'Escape' && modal\.id === 'mjRescue'\) \{[\s\S]*?setDialogVisible\(modal, false\);[\s\S]*?getElementById\('mjUndo'\)\?\.focus\(\)/);
  assert.match(controller, /\['pair', 'tray-pair', 'tray-park', 'rescue'\]\.includes\(result\.type\)/);
  assert.match(controller, /setProperty\('--mj-order', String\(i\)\)/);
  assert.match(controller, /visibilitychange/);
  assert.match(controller, /pagehide/);
  assert.match(controller, /S\.createGameStore/);
  assert.match(controller, /S\.createDuplicateGuard/);
  assert.match(controller, /new BroadcastChannel\('blanc-mahjong-v3-live'\)/);
  for (const id of ['mjCombo', 'mjComboBar', 'mjComboFill', 'mjComboFx', 'mjWinCombo', 'mjWinAutoClears']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(controller, /E\.advanceComboClock\(game, delta\)/);
  assert.match(controller, /game\?\.mode === 'tray'[\s\S]*!document\.hidden[\s\S]*!tileAnimationBusy[\s\S]*comboAnimationPauseCount === 0[\s\S]*!activeModal\(\)/);
  assert.match(controller, /document\.getElementById\('mjHint'\)\.addEventListener[\s\S]*game\.assists\.hint \+= 1[\s\S]*saveAfterMutation\(\)/);
  assert.doesNotMatch(controller, /getElementById\('mjHint'\)[\s\S]{0,600}resetCombo/);
  assert.match(controller, /freeHighlight\.checked = enabled;\s*freeHighlight\.defaultChecked = enabled;/);
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
  assert.match(controller, /function invalidateTileAnimations\(\)[\s\S]*tileAnimationGeneration \+= 1;[\s\S]*scoreAnimationGeneration \+= 1;/);
  assert.match(controller, /getElementById\('mjUndo'\)\.addEventListener[\s\S]*E\.undo\(game\)[\s\S]*invalidateTileAnimations\(\)/);
  assert.match(controller, /E\.shuffleRemaining\(game,[\s\S]*invalidateTileAnimations\(\)/);
  assert.match(controller, /function configureGame\(nextGame\) \{\s*invalidateTileAnimations\(\);/);
});

test('combo feedback restores animated tiles and removes immediately for reduced motion', () => {
  assert.match(controller, /b\.disabled = false;/);
  assert.match(controller, /b\.classList\.remove\('removing', 'tray-travel', 'is-flight-source', 'auto-clearing'\)/);
  assert.match(controller, /generation !== tileAnimationGeneration/);
  assert.match(controller, /immediate \? 0 : duration/);
  assert.match(controller, /mj-tray-slot\[data-tile-index=/);
  assert.match(controller, /const target = result\.type === 'tray-pair'[\s\S]*?data-tile-index="\$\{result\.indices\[0\]\}"[\s\S]*?: nextTrayTarget\(\)/);
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
  assert.match(styles, /\.mj-score-meter\.is-heated \.mj-score::before\s*\{[^}]*left:\s*calc\(100% \+ 8px\)/);
  assert.match(styles, /\.mj-score-meter\.is-heated \.mj-score::after\s*\{[^}]*right:\s*calc\(100% \+ 8px\)/);
  assert.match(styles, /\.mj-burst-score strong::before\s*\{[^}]*left:\s*calc\(100% \+ 8px\)/);
  assert.match(styles, /\.mj-burst-score strong::after\s*\{[^}]*right:\s*calc\(100% \+ 8px\)/);
  assert.doesNotMatch(styles, /\.mj-burst-score::(?:before|after)/);
  assert.match(styles, /\.mj-burst-score strong\s*\{[^}]*background:\s*none;[^}]*-webkit-text-fill-color:\s*currentColor;[^}]*text-shadow:\s*none;/);
  assert.match(styles, /@keyframes mj-score-flight/);
  assert.match(styles, /\.mj-tray-slot\.filled\s*\{[^}]*color:\s*var\(--mj-tile-ink\)/);
  assert.match(styles, /\.mj-tray-slot\.is-receiving/);
  assert.match(styles, /\.mj-tile\.shake::before/);
  assert.match(controller, /callout\.replaceChildren\(\)[\s\S]*label\.textContent = result\.milestone \? tier\.label : t\('mahjong\.combo\.combo'\)[\s\S]*multiplier\.textContent = `×\$\{result\.comboCount\}`/);
  assert.match(controller, /document\.querySelectorAll\('\.mj-tray-slot\.filled'\)/);
  assert.doesNotMatch(controller, /for \(const slot of rippleSlots\)[^{]*\{[^}]*offsetWidth/);
  assert.match(controller, /result\.comboCount >= 15 \? 860[\s\S]*result\.milestone \? 760[\s\S]*result\.comboCount > 1 \? 660[\s\S]*: 560/);
  assert.match(styles, /\.mj-combo-fx\s*\{[^}]*contain:\s*layout paint;[^}]*isolation:\s*isolate;/);
  assert.match(styles, /\.mj-combo-callout strong\s*\{[^}]*font:\s*700[^}]*var\(--font-text\)[^}]*-webkit-text-stroke:[^}]*text-shadow:/);
  assert.doesNotMatch(styles, /\.mj-(?:combo-particles|combo-glint|tray-burst)[^{]*\{[^}]*mix-blend-mode:/);
});

test('the completion card scrolls its content while its decorative layer stays clipped', () => {
  assert.match(styles, /\.mj-win\s*\{[^}]*max-height:[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/);
  assert.doesNotMatch(styles, /\.mj-win\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(styles, /\.mj-win-visual\s*\{[^}]*overflow:\s*hidden;/);
});

test('desktop game header promotes session identity and status hierarchy', () => {
  const responsiveHeader = styles.slice(
    styles.indexOf('@media (max-width: 1080px)'),
    styles.indexOf('@media (max-width: 780px)')
  );
  assert.match(styles, /\.mj-head\s*\{[^}]*min-height:\s*52px/);
  assert.match(styles, /\.mj-session\s*\{[^}]*min-height:\s*40px[^}]*border-radius:\s*999px[^}]*font:\s*600 13px/);
  assert.match(styles, /\.mj-meters\s*\{[^}]*min-height:\s*50px[^}]*border:[^}]*border-radius:\s*15px/);
  assert.match(styles, /\.mj-meter strong\s*\{[^}]*font:\s*700 16px[^}]*var\(--font-text\)/);
  assert.match(styles, /\.mj-chain-meter \.mj-chain\s*\{[^}]*font-size:\s*18px[^}]*text-shadow:/);
  assert.match(styles, /\.mj-combo-bar\s*\{[^}]*width:\s*90px[^}]*height:\s*6px/);
  assert.match(responsiveHeader, /\.mj-head\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(responsiveHeader, /\.mj-session\s*\{[^}]*display:\s*none;/);
  assert.match(responsiveHeader, /\.mj-meters\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/);
});

test('hints use safe selection, cycle Classic pairs, and include a parked Burst tile', () => {
  assert.match(controller, /const moves = E\.hintMoves\(game\)/);
  assert.match(controller, /game\.mode === 'tray' && game\.tray\.length === 3 && E\.availableMoves\(game\)\.length/);
  assert.match(controller, /announce\(t\('mahjong\.live\.rackNeedsMatch'\)\)/);
  assert.match(english('mahjong.live.rackNeedsMatch'), /The Burst rack needs a match\. Use Undo or Shuffle/);
  assert.match(controller, /moves\[game\.mode === 'classic' \? hintCycleIndex % moves\.length : 0\]/);
  assert.match(controller, /hintCycleIndex = \(hintCycleIndex \+ 1\) % moves\.length/);
  assert.match(controller, /function resetHintCycle\(\) \{[\s\S]*?hintCycleIndex = 0/);
  assert.match(controller, /document\.querySelector\(`\.mj-tray-slot\[data-tile-index="\$\{trayIndex\}"\]`\)\?\.classList\.add\('hinted'\)/);
  assert.match(controller, /hintTimer = window\.setTimeout\(clearHint, 2200\)/);
  assert.match(styles, /\.mj-tile\.hinted\s*\{[^}]*mj-hint-pulse 720ms ease-in-out 3/);
  assert.match(styles, /\.mj-tray-slot\.hinted/);
  assert.match(mahjongStyles, /--mj-cue:\s*#29636b/, 'hints use a restrained teal, distinct from the gold selection');
});

function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('mahjong uses shared Sunrise surfaces and the authentic landscape', () => {
  assert.match(html, /<link rel="stylesheet" href="mahjong\.css"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<script src="mahjong-state\.js"><\/script>/);
  assert.doesNotMatch(mahjongStyles, /mahjong-lacquer|\.mahjong-body::(before|after)/, 'no backdrop image or grain layers');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../src/renderer/pages/mahjong-lacquer.webp')));
  for (const token of ['var(--sunrise-bg)', 'var(--sunrise-text)', 'var(--sunrise-border)', 'var(--sunrise-accent)']) assert.ok(mahjongStyles.includes(token), token);
  const dark = mediaBlocks('(prefers-color-scheme: dark)').join('\n');
  assert.match(mahjongStyles, /url\("start-page-sunrise\.png"\)/);
  assert.match(mahjongStyles, /\.mahjong-body\s*\{[^}]*color-scheme:\s*light;/);
  assert.match(dark, /color-scheme:\s*dark;/);
  assert.match(mahjongStyles, /:root\[data-theme="private"\] \.mahjong-body\s*\{[^}]*--mj-bg:\s*#100d0b/);
  assert.match(mahjongStyles, /:root\[data-theme="private"\] \.mj-board-frame\s*\{[^}]*border-style:\s*dashed/);
  assert.doesNotMatch(styles, /\.mj-brand-mark\s*\{[^}]*filter:/);
  for (const hook of ['mj-pair-remove', 'mj-tray-travel', 'mj-score-pulse', 'mj-shuffle-cascade']) {
    assert.match(styles, new RegExp(`@keyframes ${hook}`));
  }
  assert.match(controller, /classList\.add\('shuffle-cascade'\)/);
  assert.match(controller, /button\.classList\.add\(className\)/);
  assert.match(html, /src="mahjong-combo-particles\.png"/);
  assert.match(html, /src="mahjong-combo-glint\.png"/);
  assert.match(styles, /@keyframes mj-auto-clear/);
});

test('suit inks stay legible on both tile faces', () => {
  const inks = ['--mj-red', '--mj-green', '--mj-blue', '--mj-flower', '--mj-season'].map((name) =>
    mahjongStyles.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1]);
  for (const ink of inks) for (const face of ['#fdf7ef', '#ece2d2']) {
    assert.ok(contrast(ink, face) >= 4.5, `${ink} on ${face}: ${contrast(ink, face).toFixed(2)}`);
  }
});

test('no lacquer-era token or hard-coded dark surface survives', () => {
  assert.doesNotMatch(mahjongStyles, /--mj-(table|panel|brass|ivory|line|muted|tile-side|focus|hint)\b/);
  assert.doesNotMatch(mahjongStyles, /rgba\((5, 42, 34|3, 29, 25|0, 10, 8|2, 25, 20)/);
  assert.match(mahjongStyles, /\.mj-tile:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--mj-accent\)/);
});

test('blocked tiles soften instead of turning gray on the light sky', () => {
  const rule = mahjongStyles.match(/\.mj-tile\[data-blocked\]\s*\{([^}]*)\}/)[1];
  const brightness = Number(rule.match(/brightness\(([\d.]+)\)/)[1]);
  assert.ok(brightness >= 0.88, `blocked brightness ${brightness} reads as gray`);
  assert.doesNotMatch(rule, /opacity/, 'stacked tiles must not show through');
  assert.doesNotMatch(rule, /contrast\(0\.[0-8]/, 'low contrast pulls the cream face to gray');
  assert.match(mahjongStyles, /\.mj-tile\[data-blocked\]::after\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--mj-surface-line\)/, 'blocked tiles take a quiet surface wash');
});

test('a daily deal still shows which board it picked', () => {
  assert.match(mahjongStyles, /\.mj-layout-choice:disabled\.selected\s*\{[^}]*opacity:\s*1;/);
});

test('text on the accent stays readable', () => {
  for (const [accent, ink] of [['#805d28', '#ffffff'], ['#d4ad66', '#12100b']]) {
    assert.ok(contrast(accent, ink) >= 4.5, `${ink} on ${accent}`);
  }
  assert.match(mahjongStyles, /--mj-on-accent:\s*#ffffff/);
});

test('layout-card hover and focus keep readable Dawn sky text colors', () => {
  assert.match(styles, /\.mj-choice:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--mj-text\)/);
  assert.match(styles, /\.mj-choice:is\(:hover, :focus-visible\) small\s*\{[^}]*color:\s*var\(--mj-text-muted\)/);
});

test('Mahjong launches from a separate footer link and owns its game URL', () => {
  assert.match(newtabHtml, /id="mahjongLink" href="blanc:\/\/mahjong\/" target="_blank"/);
  assert.match(newtab, /'blanc:\/\/mahjong\/\?private=1'/);
  assert.match(controller, /S\.forkGameId\(\{ href: location\.href, history/);
  assert.doesNotMatch(newtabHtml, /mahjongFrame|mahjongFooterToggle|<iframe/);
  assert.doesNotMatch(controller, /postMessage|embedActive/);
  assert.doesNotMatch(styles, /\.mahjong-embed|\.mahjong-footer-toggle/);
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
  assert.match(desktop, /\.mj-board-frame\s*\{\s*anchor-name:\s*--mj-board;\s*\}/);
  assert.match(desktop, /\.mj-board-wrap\s*\{\s*--mj-board-safe-side:\s*88px;\s*\}/);
  assert.match(desktop, /\.mj-feedback\s*\{[^}]*position:\s*absolute;/);
  assert.match(desktop, /\.mj-dock\s*\{[^}]*position:\s*absolute;[^}]*position-anchor:\s*--mj-board;[^}]*left:\s*calc\(anchor\(left\) \+ 16px\);[^}]*top:\s*anchor\(center\);[^}]*transform:\s*translateY\(-50%\);[^}]*grid-template-columns:\s*1fr;/);
  assert.match(desktop, /\.mj-dock\s*\{[^}]*width:\s*64px;[^}]*grid-template-rows:\s*repeat\(6,\s*64px\);[^}]*gap:\s*16px;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*none;[^}]*box-shadow:\s*none;/);
  assert.match(desktop, /\.mj-dock > button\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*aspect-ratio:\s*1;[^}]*border-radius:\s*50%;/);
  assert.match(desktop, /\.mj-dock > button\s*\{[^}]*background:\s*var\(--mj-pill\);[^}]*box-shadow:\s*0 2px 8px var\(--mj-pill-shadow\);/);
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
  assert.match(controller, /startPreferredGame\(\);[\s\S]*?else if \(hadSave\) \{\s*document\.getElementById\('mjRecoveryNotice'\)\.hidden = false;\s*\} else \{\s*offerResume\(\);/);
});

test('best records are scoped to the active layout revision', () => {
  assert.match(controller, /const layoutRevision = record\.layoutRevision === undefined \? 1 : record\.layoutRevision;/);
  assert.match(controller, /if \(layoutRevision !== game\.layoutRevision\) return null;/);
  assert.match(controller, /record\.scoringRevision !== expectedScoringRevision/);
  assert.match(controller, /layoutId: game\.layoutId,\s*layoutRevision: game\.layoutRevision,\s*mode: game\.mode,/);
});

test('the completion card stays centered without an entrance drift', () => {
  const rule = styles.match(/\.mj-win\s*\{([^}]*)\}/)?.[1] || '';
  assert.ok(html.indexOf('id="mjWin"') > html.indexOf('id="mjTrayRail"'));
  assert.match(rule, /position:\s*fixed;/);
  assert.match(rule, /transform:\s*translate\(-50%,\s*-50%\);/);
  assert.match(rule, /max-height:\s*calc\(100% - 28px\);/);
  assert.match(rule, /animation:\s*none;/);
  assert.doesNotMatch(rule, /(?:^|;)\s*translate:/);
});

test('completion results promote the score and separate time from Burst performance', () => {
  for (const id of ['mjWinScore', 'mjWinUnit', 'mjWinBest', 'mjWinTime', 'mjWinCombo', 'mjWinAutoClears']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(html, /class="mj-win-mark" src="sunrise-mark\.png"/);
  assert.match(html, /class="mj-win-landscape" src="start-page-sunrise\.png"/);
  assert.match(controller, /win\.dataset\.mode = isBurst \? 'burst' : 'classic'/);
  assert.match(controller, /renderWinScore\(document\.getElementById\('mjWinScore'\), \{ isBurst, score: game\.score, time \}\)/);
  assert.match(controller, /new Intl\.NumberFormat\(blancI18n\.formatLocale\(\)\)\.formatToParts\(score\)/);
  assert.match(controller, /separator\.className = 'mj-win-score-separator'/);
  assert.match(controller, /getElementById\('mjWinTime'\)\.textContent = time/);
  assert.match(controller, /record\.classList\.toggle\('is-record', game\._outcome === 'record' \|\| game\._outcome === 'first'\)/);
  assert.match(styles, /\.mj-win-result\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0;/);
  assert.match(styles, /\.mj-win-score\s*\{[^}]*clamp\(64px, 8vw, 88px\)[^}]*text-shadow:/);
  assert.match(styles, /\.mj-win-score-separator\s*\{[^}]*-webkit-text-fill-color:\s*var\(--mj-text-muted\);[^}]*text-shadow:\s*none/);
  assert.match(styles, /\.mj-win-stats\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.mj-win-landscape\s*\{[^}]*opacity:\s*0\.4;[^}]*mask-image:/);
  assert.doesNotMatch(styles, /\.mj-win-result\s*\{[^}]*border-radius:/);
  assert.doesNotMatch(styles, /\.mj-win-result\s*\{[^}]*box-shadow:/);
});

test('dialog actions keep readable dusk contrast through hover and keyboard focus', () => {
  assert.match(styles, /\.mj-setup-card,\s*\.mj-rescue-card,\s*\.mj-card-overlay\s*\{[^}]*background:\s*var\(--mj-surface\);[^}]*box-shadow:/);
  assert.match(styles, /\.mj-modal h1,\s*\.mj-card-overlay h1\s*\{[^}]*clamp\(30px, 3\.6vw, 40px\)/);
  assert.match(styles, /\.mj-button\s*\{[^}]*min-height:\s*48px;[^}]*font-size:\s*14px;[^}]*font-weight:\s*660/);
  assert.match(styles, /\.mj-rescue-card > p:not\(\.mj-overline\)\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*1\.55/);
  assert.match(styles, /\.mj-rescue-actions \.mj-button\s*\{[^}]*min-height:\s*52px/);
  assert.match(styles, /\.mj-button:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--mj-text\);[^}]*border-color:\s*var\(--mj-accent\);[^}]*translate:\s*0 -1px;/);
  assert.match(styles, /\.mj-button-primary:is\(:hover, :focus-visible\)\s*\{[^}]*color:\s*var\(--mj-on-accent\);[^}]*background:\s*var\(--mj-accent\);/);
  assert.match(styles, /\.mj-button:active\s*\{[^}]*translate:\s*0 1px;/);
});

test('mahjong reports play only after a real free-tile move', () => {
  assert.match(
    controller,
    /function reportPlayOnce\(\) \{[\s\S]*if \(playReported\) return;[\s\S]*mahjong\?\.played\?\.\(\)/,
  );
  assert.doesNotMatch(controller, /window\.parent\.postMessage/);
  assert.match(
    controller,
    /if \(!E\.isFree\(game, i\)\) \{[\s\S]*return;[\s\S]*reportPlayOnce\(\);\s*startTimer\(\);/,
  );
});

test('undo re-renders the board after reversing a shuffle and never forces a status', () => {
  assert.match(controller, /const undone = game\?\.history\.at\(-1\)\?\.type;[\s\S]*?if \(!game \|\| !E\.undo\(game\)\) return;[\s\S]*?if \(undone === 'shuffle'\) \{[\s\S]*?renderBoard\(\);[\s\S]*?fitBoard\(\);/);
  assert.doesNotMatch(controller, /function resumeTimerAfterUndo\(\) \{[\s\S]{0,120}game\.status = 'playing'/);
  assert.match(controller, /announce\(t\('mahjong\.live\.shuffled'\)\)/);
  assert.equal(english('mahjong.live.shuffled'), 'Remaining tiles shuffled into a new solvable deal. Undo restores the previous board.');
});

test('arrow-key navigation keeps an active hint visible', () => {
  assert.match(controller, /function refreshTiles\(\{ recoverFocus = false, keepHint = false \} = \{\}\)[\s\S]*?if \(!keepHint\) clearHint\(\);/);
  assert.match(controller, /event\.key\.startsWith\('Arrow'\) && game\) \{[\s\S]*?refreshTiles\(\{ keepHint: true \}\);/);
});

test('the dead-end notice offers shuffle alongside undo and a new deal', () => {
  assert.match(html, /id="mjNotice"[\s\S]*?id="mjNoticeUndo"[\s\S]*?id="mjNoticeShuffle"[\s\S]*?id="mjNoticeNew"/);
  assert.match(controller, /getElementById\('mjNoticeShuffle'\)\.addEventListener\('click', shuffleGame\)/);
});

test('daily layout choices read as disabled and the sheet explains the rotation', () => {
  assert.match(mahjongStyles, /\.mj-layout-choice:disabled\s*\{[^}]*opacity/);
  assert.match(controller, /t\('mahjong\.setup\.dailyRotates'\)/);
  assert.equal(english('mahjong.setup.dailyRotates'), 'layout rotates daily');
});

test('completion copy distinguishes first clear from a new record using the stored outcome', () => {
  assert.match(controller, /S\.completionOutcome\(\{ mode: game\.mode, before, after \}\)/);
  assert.match(controller, /game\._outcome === 'record'[\s\S]*?t\('mahjong\.win\.newRecord'\)[\s\S]*?game\._outcome === 'first'[\s\S]*?t\('mahjong\.win\.firstClear'\)/);
  assert.doesNotMatch(controller, /game\._newRecord/);
});

test('daily results surface in the setup sheet and the completion card', () => {
  assert.match(html, /id="mjWinDaily"/);
  assert.match(controller, /S\.describeDailyResult\([\s\S]*?setupChoice\.mode,[\s\S]*?setupChoice\.burstRules/);
  assert.match(controller, /S\.describeDailyResult\(recordStore\.read\(\), game\.dailyKey, game\.mode, formatMs, game\.burstRules\)/);
});

test('Boards exposes mode-specific Auto and Zen controls without persisting Zen', () => {
  for (const id of ['mjAutoClearOption', 'mjAutoClears', 'mjZenOption', 'mjZen']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(controller, /autoOption\.hidden = !isBurst/);
  assert.match(controller, /zenOption\.hidden = isBurst/);
  assert.match(controller, /setupChoice\.mode === 'tray'\) setupChoice\.zen = false/);
  assert.match(controller, /function openSetup\([\s\S]*?burstRules: prefs\.burstRules,[\s\S]*?zen: false/);
  assert.match(controller, /prefsStore\?\.write\(\{ layoutId, mode, source: dailyKey \? 'daily' : 'random', burstRules \}\)/);
  assert.doesNotMatch(controller, /prefsStore\?\.write\([^\n]*zen/);
});

test('Zen suppresses timing and records while completion explains the exclusion', () => {
  assert.match(styles, /\.mj\[data-zen="true"\] #mjTimeMeter,[\s\S]*?#mjScoreMeter\s*\{\s*display:\s*none;/);
  assert.match(controller, /if \(game\?\.zen \|\| runningSince !== null/);
  assert.match(controller, /if \(game\.zen\) \{[\s\S]*?game\.completionRecorded = true;[\s\S]*?game\._outcome = 'zen';[\s\S]*?return true;/);
  assert.match(html, /id="mjWinZen"[^>]*>This Zen game was not added to Records\./);
  assert.match(controller, /t\('mahjong\.live\.wonZen'\)/);
  assert.match(english('mahjong.live.wonZen'), /Zen game complete\. This game was not added to Records/);
});

test('Records stacks separately labeled Auto and Manual Burst results', () => {
  assert.match(controller, /\[t\('mahjong\.rulesName\.auto'\), row\.trayAutoBestScore, row\.trayAutoBestMs\]/);
  assert.match(controller, /\[t\('mahjong\.rulesName\.manual'\), row\.trayManualBestScore, row\.trayManualBestMs\]/);
  assert.match(styles, /\.mj-record-variants > span\s*\{/);
  assert.match(controller, /records\.trayManual\[game\.layoutId\]/);
});

test('Boards share action uses the sanitized Clipboard API without adding finish or dock controls', () => {
  assert.match(html, /id="mjCopyDeal"[^>]*>copy current deal<\/button>/);
  assert.doesNotMatch(html, /id="mjWinCopyDeal"/);
  assert.match(controller, /S\.buildShareDealUrl\(game\)/);
  assert.match(controller, /await navigator\.clipboard\.writeText\(link\)/);
  assert.match(controller, /announce\(t\('mahjong\.live\.copied'\)\)/);
  assert.match(controller, /announce\(t\('mahjong\.live\.linkCopyFailed'\)\)/);
  assert.equal((html.match(/class="mj-dock-action"/g) || []).length, 5);
  assert.equal((html.match(/class="mj-dock-icon/g) || []).length, 7, 'five actions plus two sound-state icons');
});

test('bootstrap restores by game id before shared deals and rejects invalid links nonblockingly', () => {
  const bootstrap = controller.match(/function bootstrap\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(bootstrap.indexOf('const restored = gameStore.load(gameId)') < bootstrap.indexOf("shared.status === 'valid'"));
  assert.match(bootstrap, /if \(restored\) \{[\s\S]*?configureGame\(restored\);[\s\S]*?\} else if \(shared\.status === 'valid'\) \{[\s\S]*?rememberPreferences: false, shared: true/);
  assert.match(bootstrap, /searchParams\.get\(S\.GAME_ID_PARAM\) === gameId[\s\S]*?searchParams\.delete\(S\.GAME_ID_PARAM\)[\s\S]*?S\.parseShareDeal\(resumedUrl\)/);
  assert.match(bootstrap, /shared\.status === 'invalid'[\s\S]*?mjShareNotice/);
  assert.match(html, /id="mjShareNotice"[^>]*>[\s\S]*shared deal link was invalid/);
});

test('shared games omit Daily identity, keep normal record eligibility, and do not overwrite preferences', () => {
  assert.match(controller, /startGame\(shared\.deal, \{ soundCue: false, rememberPreferences: false, shared: true \}\)/);
  assert.match(controller, /if \(rememberPreferences\) \{[\s\S]*?prefsStore\?\.write/);
  assert.match(controller, /rememberPreferences: !activeSharedChallenge, shared: activeSharedChallenge/);
  assert.match(controller, /dailyKey = null/);
  assert.doesNotMatch(controller, /activeSharedChallenge[\s\S]{0,120}recordCompletion/);
});

test('a fresh tab offers to continue the most recent unfinished board without auto-adopting it', () => {
  for (const id of ['mjResumeNotice', 'mjResumeCopy', 'mjResumeContinue', 'mjResumeDismiss']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(controller, /S\.resumeCandidate\(gameStore\.summaries\(\), \{ excludeGameId: gameId \}\)/);
  assert.match(controller, /function adoptGame\(targetId\)/);
  // adopting re-points this standalone tab's id and re-arms the duplicate guard
  assert.match(controller, /function adoptGame[\s\S]*?S\.forkGameId\(\{ href: location\.href, history, uuid: \(\) => targetId \}\)[\s\S]*?disposeDuplicateGuard\(\);[\s\S]*?installDuplicateGuard\(\);/);
  // the untouched fresh deal this tab just made is discarded rather than orphaned
  assert.match(controller, /function adoptGame[\s\S]*?gameStore\.discard\(previousId\)/);
});

test('the Boards sheet lists all eight layouts in registry order on a four-column grid', () => {
  const S = require('../../src/renderer/pages/mahjong-state');
  const ids = [...html.matchAll(/class="mj-choice mj-layout-choice[^"]*"[^>]*data-layout="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...S.LAYOUT_IDS]);
  for (const id of ['Pyramid', 'Fortress', 'Butterfly', 'Bridge', 'Cross']) {
    assert.match(html, new RegExp(`id="mjLayout${id}"`), `missing card for ${id}`);
    assert.match(mahjongStyles, new RegExp(`\\.mj-layout-mini-${id.toLowerCase()} i:nth-child\\(1\\)`), `missing preview for ${id}`);
  }
  assert.match(html, /108 tiles · steep/);
  assert.match(html, /96 tiles · walled/);
  assert.match(html, /94 tiles · open/);
  assert.match(html, /100 tiles · narrow/);
  assert.match(html, /86 tiles · layered/);
  assert.match(mahjongStyles, /\.mj-layout-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mahjongStyles, /@media \(max-width: 900px\)\s*\{[^@]*\.mj-layout-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
});

test('the Records dock action and sheet are wired with accessible semantics', () => {
  const icons = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/mahjong-icons.svg'), 'utf8');
  assert.match(icons, /<symbol id="records" viewBox="0 0 24 24">/);
  assert.match(html, /<button id="mjRecords" class="mj-dock-action" type="button" aria-label="Records" data-tooltip="Records" aria-haspopup="dialog" aria-controls="mjRecordsSheet" aria-keyshortcuts="R">[\s\S]*?mahjong-icons\.svg#records[\s\S]*?data-dock-label>records<\/span>/);
  assert.match(html, /id="mjSetup"[\s\S]*id="mjRecords"[\s\S]*id="mjUndo"/, 'records follows boards in the dock');
  assert.match(html, /<section id="mjRecordsSheet" class="mj-modal" role="dialog" aria-modal="true" aria-labelledby="mjRecordsTitle" hidden>/);
  for (const id of ['mjRecordsScrim', 'mjRecordsClose', 'mjRecordsCleared', 'mjRecordsStreak', 'mjRecordsLongest', 'mjRecordsDailies', 'mjRecordsRows', 'mjRecordsDays', 'mjRecordsDaysCaption']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(html, /<table class="mj-records-table">\s*<caption>best results by board<\/caption>\s*<thead>\s*<tr>\s*<th scope="col">board<\/th>\s*<th scope="col">classic best<\/th>\s*<th scope="col">burst best<\/th>\s*<th scope="col">cleared<\/th>/);
  assert.match(html, /<tbody id="mjRecordsRows"><\/tbody>/);
  assert.match(mahjongStyles, /\.mj-dock\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(mahjongStyles, /\.mj-records-overview\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mahjongStyles, /\.mj-records-table tr\[aria-current="true"\] th\s*\{/);
  assert.match(mahjongStyles, /\.mj-records-strip i\.is-cleared\s*\{/);
  assert.match(mahjongStyles, /\.mj-records-strip i\.is-today\s*\{/);
  // The rail is sized from the standalone tab viewport below Blanc's Island
  // strip, in tiers measured against the Burst table:
  // 611–659 → 52/10, 660–720 → 56/14, ≥721 → the desktop block's 64/16.
  assert.match(mahjongStyles, /@media \(min-width: 1000px\) and \(min-height: 611px\) and \(max-height: 659px\)\s*\{[^@]*\.mj-dock\s*\{[^}]*grid-template-rows:\s*repeat\(6, 52px\);[^}]*gap:\s*10px;/);
  assert.match(mahjongStyles, /@media \(min-width: 1000px\) and \(min-height: 611px\) and \(max-height: 659px\)\s*\{[^@]*\.mj-dock > button\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;[^}]*min-width:\s*52px;[^}]*min-height:\s*52px;/);
  assert.match(mahjongStyles, /@media \(min-width: 1000px\) and \(min-height: 660px\) and \(max-height: 720px\)\s*\{[^@]*\.mj-dock\s*\{[^}]*grid-template-rows:\s*repeat\(6, 56px\);[^}]*gap:\s*14px;/);
  assert.match(mahjongStyles, /@media \(min-width: 1000px\) and \(min-height: 660px\) and \(max-height: 720px\)\s*\{[^@]*\.mj-dock > button\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;[^}]*min-width:\s*56px;[^}]*min-height:\s*56px;/);
  assert.doesNotMatch(mahjongStyles, /repeat\(6, 54px\)/);
});

test('the Records sheet opens from the dock and R, paints from the pure summary, and returns focus', () => {
  assert.match(controller, /function activeModal\(\) \{\s*return \['mjSetupSheet', 'mjRecordsSheet', 'mjRescue', 'mjWin'\]/);
  assert.match(controller, /function paintRecords\(\)[\s\S]*?S\.recordsSummary\(recordStore\.read\(\), \{[\s\S]*?currentLayoutId: game\?\.layoutId \|\| null/);
  assert.match(controller, /function openRecords\(\) \{\s*pauseTimer\(\);\s*paintRecords\(\);\s*setDialogVisible\(document\.getElementById\('mjRecordsSheet'\), true\);/);
  assert.match(controller, /function closeRecords\(\) \{[\s\S]*?setDialogVisible\(document\.getElementById\('mjRecordsSheet'\), false\);[\s\S]*?document\.getElementById\('mjRecords'\)\?\.focus\(\);/);
  assert.match(controller, /if \(event\.key === 'Escape' && modal\.id === 'mjRecordsSheet'\) \{[\s\S]*?closeRecords\(\);/);
  assert.match(controller, /!event\.altKey && key === 'r'\) \{\s*event\.preventDefault\(\);\s*openRecords\(\);/);
  assert.match(controller, /getElementById\('mjRecords'\)\?\.addEventListener\('click', openRecords\)/);
  assert.match(controller, /getElementById\('mjRecordsClose'\)\?\.addEventListener\('click', closeRecords\)/);
  assert.match(controller, /getElementById\('mjRecordsScrim'\)\?\.addEventListener\('click', closeRecords\)/);
  // rows are real table semantics built per layout, with the current board marked
  assert.match(controller, /name\.scope = 'row'/);
  assert.match(controller, /tr\.setAttribute\('aria-current', 'true'\)/);
  assert.match(controller, /t\('mahjong\.records\.noDailiesLabel'\)/);
  assert.equal(english('mahjong.records.noDailiesLabel'), 'No dailies cleared in the last 28 days.');
  assert.match(controller, /t\('mahjong\.records\.clearedCount', \{ count: clearedDays\.length \}\)/);
  assert.match(english('mahjong.records.clearedCount'), /other \{cleared # of the last 28 dailies\}/);
});

test('tile numerals are Inter Bold while the game UI uses Instrument Sans', () => {
  // Owner choice, October 17, 2026: Inter Bold numerals replace JetBrains Mono,
  // and every non-tile game label, count and score uses Instrument Sans.
  assert.match(mahjongStyles, /\.mahjong-body\s*\{[^}]*--mj-face-font:\s*"Inter"/);
  assert.match(mahjongStyles, /text\.mj-character-number\s*\{[^}]*font-weight:\s*700;[^}]*letter-spacing:\s*-0\.02em;/);
  assert.doesNotMatch(mahjongStyles, /--font-text:\s*var\(--font-ui\)/);
  assert.doesNotMatch(mahjongStyles, /JetBrains Mono/);
  assert.match(mahjongStyles, /\.mahjong-body\s*\{[^}]*font-family:\s*var\(--font-text\);/);
  for (const selector of ['\\.mj-meter strong', '\\.mj-burst-score strong', '\\.mj-win-score', '\\.mj-records-overview strong', '\\.mj-win-stats strong']) {
    assert.match(mahjongStyles, new RegExp(`${selector}\\s*\\{[^}]*font:[^;]*var\\(--font-text\\);`), `${selector} uses Instrument Sans`);
  }
  const interUiRules = [...mahjongStyles.matchAll(/font(?:-family)?:\s*[^;]*var\(--font-ui\)/g)];
  assert.equal(interUiRules.length, 0, 'Mahjong UI never bypasses Instrument Sans');
  // JetBrains Mono stays bundled for now; its @font-face keeps the full range.
  assert.match(styles, /font-family:\s*"JetBrains Mono";\s*src:\s*url\("jetbrains-mono-latin\.woff2"\)[^}]*font-weight:\s*400 800;/);
  assert.doesNotMatch(mahjongStyles, /--font-mono/);
});

test('all three rotating tile themes ship the approved source sheets intact', () => {
  const themes = ['porcelain', 'carved', 'inlay'];
  for (const theme of themes) {
    const data = fs.readFileSync(path.join(__dirname, `../../src/renderer/pages/mahjong-theme-${theme}-sheet.png`));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', `${theme} concept sheet is a PNG`);
    assert.ok(data.length > 1_000_000, `${theme} concept sheet is the full-resolution approved source`);
  }
  assert.match(controller, /Literal face crops from the approved concept sheets/);
  assert.match(controller, /Rendering the source\s*\/\/ sheets as sprites keeps their exact linework, texture, color and ornaments/);
});

test('consecutive clears drive the tile collection and celebration artwork', () => {
  assert.match(controller, /progressStore = S\.createProgressStore\(\{ storage: localStorage \}\)/);
  assert.match(controller, /activeTileTheme = S\.tileThemeForStreak\(progressStore\?\.read\(\)\.clearStreak \?\? 0\)/);
  assert.match(controller, /document\.body\.dataset\.tileTheme = activeTileTheme/);
  assert.match(controller, /progressStore\?\.recordClear\(gameId\)/);
  assert.match(controller, /game\._celebrationStyle = S\.celebrationStyleForStreak\(progress\.clearStreak\)/);
  assert.match(controller, /if \(game && !E\.isWon\(game\)\) progressStore\?\.reset\(\)/);
  assert.match(mahjongStyles, /\.mj-win-score\s*\{[^}]*letter-spacing:\s*0\.025em;/);
});

test('match trail is placed by custom properties on a fixed layer', () => {
  assert.match(controller, /function launchMatchTrail\(fromEl, toEl, \{ tier \} = \{\}\)/);
  assert.match(controller, /setProperty\('--mj-trail-length'/);
  assert.match(controller, /trackTransient\(trail, FX\.TRAIL_MS\)/);
  assert.match(mahjongStyles, /\.mj-trail\s*\{[^}]*position:\s*fixed;[^}]*width:\s*calc\(var\(--mj-trail-length\) \* 1px\);[^}]*background:[^}]*var\(--mj-accent\)/);
  assert.match(mahjongStyles, /\.mj-trail\s*\{[^}]*pointer-events:\s*none;/);
  assert.doesNotMatch(controller.match(/function launchMatchTrail[\s\S]*?\n\}/)[0], /style\.(left|top|width)\s*=/, 'geometry goes through custom properties');
});

test('reduced motion swaps the travelling trail for static marks', () => {
  const reduced = mediaBlocks('(prefers-reduced-motion: reduce)').join('\n');
  assert.match(reduced, /\.mj-trail\s*\{[^}]*display:\s*none;/);
  assert.match(controller, /function launchMatchMarks\(elements\)/);
  assert.match(mahjongStyles, /\.mj-match-mark\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/);
});

test('auto-clears get their own delayed trail', () => {
  assert.match(controller, /FX\.AUTO_TRAIL_DELAY_MS/);
  assert.match(controller, /generation === tileAnimationGeneration\) launchPairTrail\(/);
});

test('win shows the card after a tiered celebration that can be skipped', () => {
  assert.match(html, /<div id="mjCelebrate" class="mj-celebrate" aria-hidden="true" hidden>/);
  assert.match(controller, /celebrationTier\(\{ zen: isZen, outcome: game\._outcome \|\| null, reducedMotion, hidden: document\.hidden \}\)/);
  assert.match(controller, /function playCelebration\(tier, style, done\)/);
  assert.match(controller, /layer\.dataset\.style = style/);
  assert.match(controller, /addEventListener\('pointerdown', skip/);
  assert.match(controller, /addEventListener\('keydown', skip/);
  assert.doesNotMatch(controller, /SKY|canvas/);
});

test('the celebration rotates all three selected Sunrise artworks', () => {
  const layer = html.match(/<div id="mjCelebrate"[\s\S]*?\n {8}<\/div>/)[0];
  assert.match(layer, /mj-celebrate-horizon-bloom/);
  assert.match(layer, /mj-celebrate-tile-echo/);
  assert.match(layer, /mj-celebrate-gilded-fan/);
  assert.match(layer, /class="mj-celebrate-mark" src="sunrise-mark\.png"/);
  assert.match(layer, /data-celebrate-kind="dot-1"/);
  assert.match(controller, /for \(const tile of layer\.querySelectorAll\('\[data-celebrate-kind\]'\)\) \{\s*tile\.replaceChildren\(faceSVG\(tile\.dataset\.celebrateKind\)\);/);
  assert.doesNotMatch(html, /mahjong-sky\.js|mj-celebrate-canvas/);
  assert.match(mahjongStyles, /\.mj-celebrate\[data-style="horizon-bloom"\]/);
  assert.match(mahjongStyles, /\.mj-celebrate\[data-style="tile-echo"\]/);
  assert.match(mahjongStyles, /\.mj-celebrate\[data-style="gilded-fan"\]/);
  assert.match(mahjongStyles, /@keyframes mj-horizon-mark/);
  assert.match(mahjongStyles, /@keyframes mj-tile-echo/);
  assert.match(mahjongStyles, /@keyframes mj-fan-open/);
});

test('the celebration runs on timers and finishes when the tab returns', () => {
  const play = controller.match(/function playCelebration\(tier, style, done\)[\s\S]*?\n\}/)[0];
  assert.match(play, /window\.setTimeout\(/);
  assert.doesNotMatch(play, /animationend/);
  assert.match(play, /visibilitychange/);
});

test('only a fresh win celebrates; restores and undo show the card directly', () => {
  assert.match(controller, /function invalidateTileAnimations\(\)\s*\{[^}]*cancelCelebration\(\)/);
  assert.match(controller, /function checkEndStates\(\{ fresh = false \} = \{\}\)/);
  assert.match(controller, /showWin\(\{ celebrate: fresh \}\)/);
  assert.equal((controller.match(/checkEndStates\(\{ fresh: true \}\)/g) || []).length, 1);
  assert.match(controller.match(/function finishTileResult[\s\S]*?\n\}/)[0], /checkEndStates\(\{ fresh: true \}\)/);
});

test('notices are dusk pills anchored inside the table instead of loose text at its edge', () => {
  assert.match(mahjongStyles, /\.mj-notice\s*\{[^}]*max-width:\s*min\(640px, 100%\);[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--mj-pill\);[^}]*box-shadow:/);
  const desktop = mediaBlocks('(min-width: 1000px) and (min-height: 611px)')[0];
  assert.ok(desktop, 'desktop media block present');
  assert.match(desktop, /\.mj-feedback\s*\{[^}]*position:\s*absolute;[^}]*position-anchor:\s*--mj-board;[^}]*top:\s*calc\(anchor\(top\) \+ 14px\);[^}]*left:\s*anchor\(center\);[^}]*width:\s*min\(640px, calc\(anchor-size\(width\) - 208px\)\);[^}]*transform:\s*translateX\(-50%\);/);
  assert.doesNotMatch(mahjongStyles, /\.mj-feedback\s*\{[^}]*top:\s*calc\(var\(--mj-shell-block\)/);
});
