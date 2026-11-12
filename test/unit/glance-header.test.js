'use strict';

// Floating Glance header (spec 2026-10-20-floating-glance-design.md): Open as
// tab, Keep as split and Change carry icon and label; the header gives up
// room in a fixed order down to the 360 px card; a focusable Move or resize
// control moves and resizes the card from the keyboard and announces it.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('src/renderer/index.html');
const renderer = read('src/renderer/renderer.js');
const css = read('src/renderer/styles.css');
const en = JSON.parse(read('copy/messages/en.json'));
const header = html.slice(html.indexOf('<header id="glanceHeader"'), html.indexOf('</header>', html.indexOf('<header id="glanceHeader"')));
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} not found`);
  return source.slice(from, to);
};

test('Open as tab replaces Make main, with an icon and a label', () => {
  assert.match(header, /<button id="glanceOpenAsTab"[^>]*data-i18n-tooltip="glance\.openAsTab\.title"[^>]*data-i18n-aria-label="glance\.openAsTab\.title"/);
  assert.match(header, /id="glanceOpenAsTab"[\s\S]*?<svg[\s\S]*?<span class="glance-action-label" data-i18n="glance\.openAsTab">Open as tab<\/span>/);
  assert.doesNotMatch(html, /glance\.promote/);
});

test('Keep as split and Change carry an icon and a label too', () => {
  assert.match(header, /id="glanceKeepSplit"[\s\S]*?<svg[\s\S]*?<span class="glance-action-label" data-i18n="split\.keepAsSplit">Keep as split<\/span>/);
  assert.match(header, /id="glanceChange"[\s\S]*?<svg[\s\S]*?<span class="glance-action-label" data-i18n="glance\.change">Change<\/span>/);
});

test('a focusable Move or resize control sits before ×, with its hint', () => {
  assert.match(header, /<span id="glanceMove" class="glance-move" role="button" tabindex="0"[^>]*data-i18n-aria-label="glance\.move"[^>]*aria-describedby="glanceMoveHint"/);
  assert.ok(header.indexOf('id="glanceMove"') < header.indexOf('id="glanceClose"'));
  assert.match(html, /<span id="glanceMoveHint" class="sr-only" data-i18n="glance\.move\.hint">/);
  assert.match(html, /id="glanceCardStatus" class="sr-only" aria-live="polite"/);
});

test('the header gives up room in order: action labels, the GLANCE label, then the host', () => {
  assert.match(renderer, /const GLANCE_HEADER_STEPS = \['compact-actions', 'no-eyebrow', 'no-host'\];/);
  const fit = between(renderer, 'function fitGlanceHeader() {', '\n  }\n');
  assert.match(fit, /for \(const step of GLANCE_HEADER_STEPS\) \{\s+if \(!crowded\(\)\) break;\s+glanceHeader\.classList\.add\(step\);/);
  assert.match(css, /\.glance-header\.compact-actions \.glance-action-label \{ display: none; \}/);
  assert.match(css, /\.glance-header\.no-eyebrow #glanceEyebrow \{ display: none; \}/);
  assert.match(css, /\.glance-header\.no-host #glanceTitle \{ display: none; \}/);
  for (const id of ['glanceBack', 'glanceReload', 'glanceClose', 'glancePrivate']) {
    assert.doesNotMatch(css, new RegExp(`\\.glance-header\\.(compact-actions|no-eyebrow|no-host) #${id}`), `${id} never hides`);
  }
});

test('arrow keys move, Option or Alt with an arrow resizes, Enter resets, all with the generation', () => {
  const keys = between(renderer, "glanceMove.addEventListener('keydown'", '\n  });\n');
  assert.match(keys, /event\.shiftKey \? CARD_KEY_STEP_LARGE : CARD_KEY_STEP/);
  assert.match(keys, /window\.browserAPI\.resizeGlanceCard\(\{ generation, edge: 'se', dx, dy \}\)/);
  assert.match(keys, /window\.browserAPI\.moveGlanceCard\(\{ generation, dx, dy \}\)/);
  assert.match(keys, /window\.browserAPI\.resetGlanceCard\(\{ generation \}\)/);
  assert.match(renderer, /const CARD_KEY_STEP = 16;/);
  assert.match(renderer, /const CARD_KEY_STEP_LARGE = 64;/);
});

test('the new strings are in the catalog and the old ones are gone', () => {
  for (const key of ['glance.openAsTab', 'glance.openAsTab.title', 'glance.move', 'glance.move.hint', 'glance.status.moved', 'glance.status.resized', 'glance.status.reset']) {
    assert.ok(en[key], key);
  }
  assert.equal(en['glance.status.resized'].message, 'Glance resized to {width} by {height}');
  assert.equal(en['slash.glance.hint'].message, 'Look at another open tab without leaving this page');
  for (const key of ['glance.promote', 'glance.promoteShort', 'glance.resize', 'glance.dividerValue']) {
    assert.equal(en[key], undefined, key);
  }
});
