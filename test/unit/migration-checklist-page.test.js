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
  const tokens = JSON.parse(read('tokens/tokens.json'));
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
  for (const name of ['patron-gold', 'patron-surface', 'patron-label', 'patron-halo']) {
    const token = tokens.tokens.find((entry) => entry.name === name);
    assert.deepEqual(token?.consumers, ['pages'], `${name} belongs to the guarded pages token source`);
  }
});

test('checklist occupies the corner, compacts at tight viewports, and avoids private tabs', () => {
  const css = read('src/renderer/pages/pages.css');

  assert.match(css, /\/\* ---------- Sunrise start-page presentation ----------[\s\S]*?\.migration-checklist-shell \{[\s\S]{0,260}?top: clamp\(154px, 22vh, 194px\);[\s\S]{0,260}?bottom: auto;/);
  assert.match(css, /body\[data-layout="billboard"\] \.migration-checklist-shell \{ top: clamp\(30px, 5vh, 48px\); \}/,
    'Billboard keeps the checklist in its quiet upper-right margin');
  assert.match(css, /@media \(max-width: 1120px\) \{[\s\S]{0,900}?\.migration-checklist-compact \{[\s\S]{0,300}?display: grid;/);
  assert.match(css, /\.migration-checklist \{[\s\S]{0,340}?bottom: 58px;[\s\S]{0,340}?display: none;/,
    'the compact checklist expands above the footer trigger');
  assert.doesNotMatch(css, /body\[data-layout="mahjong"\] \.migration-checklist-shell/);
  assert.match(css, /:root\[data-theme="private"\] \.migration-checklist-shell/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,320}?animation: none;/);
});

test('moving-in checklist uses Newsreader and Inter without handwritten styling', () => {
  const css = read('src/renderer/pages/pages.css');

  assert.match(css, /\.migration-checklist-heading h2 \{[\s\S]{0,180}?font-family: var\(--font-display\)/);
  assert.match(css, /\.migration-task-label \{[\s\S]{0,180}?font-family: var\(--font-ui\)/);
  const heading = css.match(/\.migration-checklist-heading h2 \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const task = css.match(/\.migration-task-label \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(heading, /Caveat|rotate/);
  assert.doesNotMatch(task, /Caveat/);
  assert.doesNotMatch(css, /\.migration-task-label::after/,
    'the checklist no longer draws a freehand underline');
});

test('renderer reflects progress, keeps completed rows actionable, and retires after 1.5 seconds', () => {
  const js = read('src/renderer/pages/newtab.js');

  assert.match(js, /function renderMigrationChecklist\(checklist\)/);
  assert.match(js, /previous\.completedCount < 2 && checklist\.completedCount === 2/);
  assert.match(js, /document\.hasFocus\(\)/,
    'completion waits until the start-page WebContents regains focus');
  assert.match(js, /!migrationChecklistUtilitySheetVisible/,
    'completion waits until main reports that the utility sheet is gone');
  assert.match(js, /onUtilitySheetVisibility\(\(visible\) =>/);
  assert.match(js, /classList\.add\('is-completing', 'is-expanded'\)/,
    'compact completion exposes the full checked checklist during its dwell');
  assert.match(js, /window\.addEventListener\('focus', presentPendingMigrationChecklistCompletion\)/);
  assert.match(js, /setTimeout\(hideMigrationChecklist, 1500\)/);
  assert.match(js, /migrationSyncAction\.addEventListener\('click'/);
  assert.match(js, /start\.openSettings\('sync'\)/);
  assert.match(js, /start\.dismissMigrationChecklist\(\)/);
  assert.doesNotMatch(js, /migrationSyncAction\.disabled|migrationTabsAction\.disabled/);
});
