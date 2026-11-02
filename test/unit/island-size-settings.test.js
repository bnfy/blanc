'use strict';

// Settings → General → Island size (#1292).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the setting is device-local, defaults to the shipped size and accepts only its three sizes', () => {
  const settings = read('src/main/settings.js');
  assert.match(settings, /const ISLAND_SIZES = \['default', 'large', 'extra-large'\];/);
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
  assert.match(renderer, /document\.documentElement\.dataset\.islandSize = \['large', 'extra-large'\]\.includes\(state\.islandSize\)\s*\? state\.islandSize : 'default';/);
  // The shipped geometry stays the :root default (tokens.json guards it).
  assert.match(css, /--island-resting-height: 44px;/);
  assert.match(css, /--strip-h: 68px;/);
  assert.match(css, /--pill-zoom: 1\.15;/);
  const size = (name) => css.match(new RegExp(`:root\\[data-island-size="${name}"\\] \\{([^}]*)\\}`))[1];
  for (const [name, zoom, height, radius, strip] of [['large', '1.3', 50, 19, 76], ['extra-large', '1.45', 56, 21, 84]]) {
    const block = size(name);
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
