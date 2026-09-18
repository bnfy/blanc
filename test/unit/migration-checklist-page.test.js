'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('start page carries one shared accessible migration checklist', () => {
  const html = read('src/renderer/pages/newtab.html');

  assert.equal((html.match(/id="migrationChecklistShell"/g) ?? []).length, 1);
  assert.match(html, /id="migrationChecklistTitle">ready to move in\?<\/h2>/);
  assert.match(html, /id="migrationSyncAction"[^>]*>[\s\S]*?Set up Sync/);
  assert.match(html, /id="migrationTabsAction"[^>]*href="blanc:\/\/tab-import\/"[\s\S]*?Bring your tabs/);
  assert.match(html, /aria-label="Hide moving-in checklist">hide<\/button>/);
  assert.match(html, /id="migrationChecklistCompact"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(html, /tab-import-promo|js-sync-nudge|syncNudge/);
  assert.doesNotMatch(html, /style="/);
});

test('every start-page template names the Blanc Patron upgrade as an action', () => {
  const html = read('src/renderer/pages/newtab.html');
  const css = read('src/renderer/pages/pages.css');
  const ctas = html.match(/<a href="blanc:\/\/settings\/#group-patron"><img class="patron-cta-mark" src="sunrise-mark\.png" alt="" \/><span>Upgrade to Blanc Patron<\/span><span class="patron-cta-arrow" aria-hidden="true">→<\/span><\/a>/g) ?? [];

  assert.equal(ctas.length, 4, 'Ledger, Billboard, Shelf, and Tally share the explicit Patron CTA');
  assert.doesNotMatch(html, />Support Blanc</);
  assert.match(css, /\.js-patron-callout a \{[\s\S]{0,620}?display: inline-flex;[\s\S]{0,620}?border: 1px solid color-mix\(in srgb, var\(--patron-gold\) 58%, transparent\);[\s\S]{0,620}?border-radius: 999px;/,
    'the upgrade link is a compact pill action');
  assert.match(css, /--patron-gold: #d4ad66;/i, 'the CTA uses the Sunrise gold');
  assert.match(css, /--patron-surface: #12100b;/i, 'the CTA uses Patron warm ink');
  assert.match(css, /\.js-patron-callout a \{[\s\S]{0,800}?color: var\(--patron-label\);[\s\S]{0,800}?background: var\(--patron-surface\);/,
    'the Patron pill reserves the warm dark surface for the upgrade action');
  assert.match(css, /\.patron-cta-mark \{[\s\S]{0,180}?width: 20px;[\s\S]{0,180}?height: 20px;/,
    'the local Sunrise mark is sized as the pill’s leading brand asset');
  assert.match(css, /\.patron-cta-arrow \{[\s\S]{0,100}?color: var\(--patron-gold\);/,
    'the action arrow repeats the mark’s gold accent');
  assert.match(css, /\.js-patron-callout a:hover \{[\s\S]{0,300}?background: var\(--patron-surface\);/,
    'hover preserves the warm-ink material instead of inverting the pill');
  assert.match(css, /\.js-patron-callout a:hover \.patron-cta-arrow \{ transform: translateX\(2px\); \}/,
    'hover emphasizes the action through the arrow rather than recoloring the brand');
  const hover = css.match(/\.js-patron-callout a:hover \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(hover, /transform|padding|font-size|min-height|border(?:-width|-color)?\s*:/,
    'hover cannot resize, move, or repaint the Patron pill border');
  assert.match(hover, /box-shadow: 0 5px 18px -9px var\(--patron-halo\);/,
    'hover keeps the resting shadow geometry');
  assert.match(hover, /filter: brightness\(1\.16\);/,
    'hover visibly brightens the complete capsule without changing geometry');
});

test('checklist occupies the corner, compacts at tight viewports, and avoids private and Mahjong', () => {
  const css = read('src/renderer/pages/pages.css');

  assert.match(css, /\.migration-checklist-shell \{[\s\S]{0,260}?position: fixed;[\s\S]{0,260}?bottom: 84px;/);
  assert.match(css, /body\[data-layout="billboard"\] \.migration-checklist-shell \{[\s\S]{0,120}?top: 92px;[\s\S]{0,120}?bottom: auto;/,
    'Billboard keeps the checklist above its recent-site row');
  assert.match(css, /@media \(max-width: 960px\), \(max-height: 640px\) \{[\s\S]{0,900}?\.migration-checklist-compact \{[\s\S]{0,300}?display: grid;/);
  assert.match(css, /body\[data-layout="billboard"\] \.migration-checklist \{[\s\S]{0,100}?top: 58px;[\s\S]{0,100}?bottom: auto;/,
    'Billboard compact expansion opens downward from the upper-right trigger');
  assert.match(css, /body\[data-layout="mahjong"\] \.migration-checklist-shell/);
  assert.match(css, /:root\[data-theme="private"\] \.migration-checklist-shell/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,320}?animation: none;/);
});

test('Caveat is local and scoped to checklist display copy', () => {
  const css = read('src/renderer/pages/pages.css');
  const font = fs.readFileSync(path.join(root, 'src/renderer/pages/caveat-latin.woff2'));

  assert.match(css, /font-family: "Caveat";\s*src: url\("caveat-latin\.woff2"\) format\("woff2"\);/);
  assert.match(css, /\.migration-checklist-heading h2 \{[\s\S]{0,180}?font-family: "Caveat"/);
  assert.match(css, /\.migration-checklist-heading h2 \{[\s\S]{0,260}?transform: rotate\(-1\.4deg\)/,
    'the hand-written heading keeps the mockup’s slight upward tilt');
  assert.match(css, /\.migration-task-label \{[\s\S]{0,180}?font-family: "Caveat"/);
  assert.deepEqual([...font.subarray(0, 4)], [119, 79, 70, 50], 'font is WOFF2');
});

test('renderer reflects progress, keeps completed rows actionable, and retires after 1.5 seconds', () => {
  const js = read('src/renderer/pages/newtab.js');

  assert.match(js, /function renderMigrationChecklist\(checklist\)/);
  assert.match(js, /previous\?\.completedCount < 2 && checklist\.completedCount === 2/);
  assert.match(js, /setTimeout\(hideMigrationChecklist, 1500\)/);
  assert.match(js, /migrationSyncAction\.addEventListener\('click'/);
  assert.match(js, /start\.openSettings\('sync'\)/);
  assert.match(js, /start\.dismissMigrationChecklist\(\)/);
  assert.doesNotMatch(js, /migrationSyncAction\.disabled|migrationTabsAction\.disabled/);
});
