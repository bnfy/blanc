'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const frameCss = () => {
  const css = read('src/renderer/pages/pages.css');
  const start = css.indexOf('/* ---------- Start page frame (2026-10-05 polish) ----------');
  assert.ok(start > 0, 'pages.css carries the start page frame section');
  const end = css.indexOf('/* ---------- first-run onboarding dialog ----------', start);
  assert.ok(end > start, 'the frame section ends before the onboarding section');
  return css.slice(start, end);
};

test('the header row holds the brand and the checklist slot, in flow', () => {
  const html = read('src/renderer/pages/newtab.html');
  assert.match(
    html,
    /<header class="start-header" aria-label="Blanc start page">\s*<div class="start-brand">[\s\S]*?id="startDate" class="start-brand-date"[\s\S]*?<\/div>\s*<div id="migrationChecklistShell"/,
  );
  const css = frameCss();
  assert.match(css, /\.start-header \{[^}]*display: flex;[^}]*justify-content: space-between;/s);
  assert.doesNotMatch(read('src/renderer/pages/pages.css'), /\.start-brand \{[^}]*position: fixed/s,
    'the brand no longer floats over content');
});

test('every layout renders inside one centered content area', () => {
  const html = read('src/renderer/pages/newtab.html');
  const content = html.match(/<div class="start-content" id="startContent">([\s\S]*?)<div id="startContentEnd" class="start-content-end" aria-hidden="true"><\/div>\s*<\/div>/);
  assert.ok(content, 'start-content wraps the layouts and ends with its sentinel');
  for (const id of ['layoutLedger', 'layoutBillboard', 'layoutShelf', 'layoutTally']) {
    assert.match(content[1], new RegExp(`<main [^>]*id="${id}"`), `${id} lives in the content area`);
  }
  const css = frameCss();
  assert.match(css, /\.start-content \{[^}]*max-width: calc\(var\(--start-measure\) \+ 2 \* var\(--start-gutter\)\);[^}]*margin-inline: auto;/s);
  for (const selector of ['.billboard', '.shelf', '.tally-left', '.tally-right']) {
    const escaped = selector.replace('.', '\\.');
    assert.match(css, new RegExp(`${escaped}[^{]*\\{[^}]*position: static;`, 's'), `${selector} is in flow`);
  }
});

test('the checklist sits in the header and compacts to a top-right ring', () => {
  const css = frameCss();
  assert.match(css, /\.migration-checklist-shell \{[^}]*position: relative;[^}]*width: 286px;/s);
  assert.match(css, /@media \(max-width: 960px\), \(max-height: 640px\) \{[\s\S]*?\.migration-checklist \{[^}]*position: absolute;[^}]*top: 58px;[^}]*right: 0;/);
  assert.doesNotMatch(read('src/renderer/pages/pages.css'), /body\[data-layout="(billboard|tally)"\] \.migration-checklist-shell \{ top:/,
    'no per-layout checklist offsets remain');
});

test('each layout ends with the Patron chip', () => {
  const html = read('src/renderer/pages/newtab.html');
  const mains = html.match(/<main [\s\S]*?<\/main>/g);
  assert.equal(mains.length, 4);
  for (const main of mains) {
    assert.match(main, /<p [^>]*class="[^"]*js-patron-callout[^"]*" hidden>\s*<a [^>]*>[\s\S]*?<\/a>\s*<\/p>\s*<\/main>$/,
      `${main.slice(0, 60)}… ends with its Patron chip`);
  }
});

test('private tabs never show the Patron chip or blocked counts', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /function renderPatronCallout\(patronActive\) \{[\s\S]*?const hide = !!patronActive \|\| isPrivate;/);
  assert.match(js, /document\.getElementById\('shBlocked'\)\.closest\('\.shelf-card'\)\.hidden = isPrivate;/);
  assert.match(js, /document\.querySelector\('\.tally-right'\)\.hidden = isPrivate;/);
});
