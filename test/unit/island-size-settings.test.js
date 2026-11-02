'use strict';

// Settings → General → Island size (#1292).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ISLAND_SIZE_GEOMETRY, ISLAND_SIZES, stripHeightFor, scaleForIslandSize } = require('../../src/main/island-size');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the setting is device-local, defaults to the shipped size and accepts only its three sizes', () => {
  const settings = read('src/main/settings.js');
  assert.deepEqual(ISLAND_SIZES, ['default', 'large', 'extra-large']);
  assert.match(settings, /const \{ ISLAND_SIZES \} = require\('\.\/island-size'\);/);
  assert.match(settings, /\n  islandSize: 'default',\n/);
  assert.match(settings, /if \(!ISLAND_SIZES\.includes\(data\.islandSize\)\) data\.islandSize = DEFAULTS\.islandSize;/);
  assert.match(settings, /if \(ISLAND_SIZES\.includes\(partial\.islandSize\)\) clean\.islandSize = partial\.islandSize;/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /islandSize/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('islandSize'));
});

test('main sends it with every tabs payload and rebroadcasts when it changes', () => {
  const main = read('src/main/main.js');
  assert.equal(main.match(/\n    islandTabIcons,\n    islandSize,\n/g)?.length, 2, 'both tab payloads carry it');
  assert.match(main, /if \(s\.islandSize !== islandSize\) \{\s*islandSize = s\.islandSize;\s*forEachWindowRuntime\(\(\) => broadcastTabs\(\), \{ liveOnly: true \}\);/);
});

test('the strip scales the pill and itself together, keeping the default untouched', () => {
  const renderer = read('src/renderer/renderer.js');
  const css = read('src/renderer/styles.css');
  // Applied from each payload, only when it changes.
  assert.match(renderer, /if \(document\.documentElement\.dataset\.islandSize !== next\) document\.documentElement\.dataset\.islandSize = next;/);
  assert.equal(renderer.match(/state = payload;\s*applyIslandSize\(state\.islandSize\);\s*render\(\);/g)?.length, 2);
  assert.doesNotMatch(renderer.match(/function render\(\) \{[\s\S]*?\n {2}\}/)[0], /islandSize/);
  // The shipped geometry stays the :root default (tokens.json guards it).
  assert.match(css, /--island-resting-height: 44px;/);
  assert.match(css, /--strip-h: 68px;/);
  assert.match(css, /--pill-zoom: 1\.15;/);
  const size = (name) => css.match(new RegExp(`:root\\[data-island-size="${name}"\\] \\{([^}]*)\\}`))[1];
  for (const [name, zoom, height, radius, strip] of [['large', '1.3', 50, 19, 76], ['extra-large', '1.45', 56, 21, 84]]) {
    const block = size(name);
    // Main's copy (island-size.js) matches what the strip draws.
    assert.deepEqual(ISLAND_SIZE_GEOMETRY[name], { zoom: Number(zoom), stripHeight: strip });
    assert.match(block, new RegExp(`--pill-zoom: ${zoom.replace('.', '\\.')};`));
    assert.match(block, new RegExp(`--island-resting-height: ${height}px;`));
    assert.match(block, new RegExp(`--island-resting-radius: ${radius}px;`));
    assert.match(block, new RegExp(`--strip-h: ${strip}px;`));
    // The strip keeps the pill's margins: 10px of zoomed margin above, the rest below.
    const above = 10 * Number(zoom);
    assert.ok(Math.abs((strip - height - above) - above) <= 1.5, `${name}: margins stay even`);
  }
});

test('Settings offers the three sizes and recovers the saved value if a save fails', () => {
  const html = read('src/renderer/pages/settings.html');
  const page = read('src/renderer/pages/settings.js');
  assert.match(html, /<select id="islandSize"[^>]*aria-describedby="islandSizeHint"[\s\S]*?value="default"[\s\S]*?value="large"[\s\S]*?value="extra-large"/);
  assert.match(page, /window\.bowserPages\.settings\.set\(\{ islandSize: islandSize\.value \}\)/);
  assert.match(page, /\} catch \{\s*window\.bowserPages\.settings\.get\(\)\.then\(\(\{ settings: saved \}\) => showIslandSize\(saved\.islandSize\)/);
});

test('main keeps the default geometry in step with the CSS and starts each window at the saved height', () => {
  assert.deepEqual(ISLAND_SIZE_GEOMETRY.default, { zoom: 1.15, stripHeight: 68 });
  assert.equal(stripHeightFor('large'), 76);
  assert.equal(stripHeightFor('extra-large'), 84);
  assert.equal(stripHeightFor('bogus'), 68);
  const main = read('src/main/main.js');
  assert.match(main, /runtime\.chromeReady = false;\s*\/\/[^\n]*\n[^\n]*\n\s*runtime\.chromeHeight = stripHeightFor\(islandSize\);/);
  // The strip reports its height only once it has drawn at the saved size.
  const renderer = read('src/renderer/renderer.js');
  assert.match(renderer, /function reportLayout\(\) \{\s*if \(copySurface \|\| !islandSizeApplied\) return;/);
  assert.match(renderer, /if \(!islandSizeApplied\) \{\s*islandSizeApplied = true;\s*requestAnimationFrame\(\(\) => reportLayout\(\)\);/);
});

test('the floating Island leaves room for its shadow at every size', () => {
  // The float shadow (0 6px 20px -6px) is drawn inside the pill's zoom.
  const below = (zoom) => (6 + 20 - 6) * zoom;
  const beside = (zoom) => (20 - 6) * zoom;
  for (const size of ISLAND_SIZES) {
    const { zoom } = ISLAND_SIZE_GEOMETRY[size];
    assert.ok(scaleForIslandSize(24, size) >= below(zoom), `${size}: room below`);
    assert.ok(scaleForIslandSize(20, size) >= beside(zoom), `${size}: room beside`);
  }
  assert.equal(scaleForIslandSize(24, 'default'), 24, 'the default keeps its tuned room');
  assert.match(read('src/renderer/styles.css'), /--shadow-island-float: inset 0 1px 0 rgba\(255,255,255,\.72\), inset 0 -1px 0 rgba\(14,14,14,\.035\), 0 6px 20px -6px /);
  const main = read('src/main/main.js');
  assert.match(main, /side: pill \? scaleForIslandSize\(islandAutoHideModule\.FLOAT_SIDE_PX, islandSize\)/);
  assert.match(main, /bottom: pill \? scaleForIslandSize\(islandAutoHideModule\.FLOAT_BOTTOM_PX, islandSize\)/);
});

test('the panel grows out of the resting pill\'s corner at its size', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.match(overlay, /window\.browserAPI\.onTabsUpdated\(\(payload\) => \{\s*applyIslandSize\(payload\.islandSize\);/);
  assert.match(overlay, /state = payload;\s*applyIslandSize\(payload\.islandSize\);/);
  assert.match(overlay, /var\(--island-resting-radius\)/);
});
