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
  assert.match(html, /id="migrationChecklistCompact"[^>]*popovertarget="migrationChecklist"[^>]*aria-expanded="false"/);
  assert.match(html, /<aside id="migrationChecklist" class="migration-checklist" popover role="dialog"/);
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
  const chip = css.match(/\.js-patron-callout a \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(chip, /border: 1px solid color-mix\(in srgb, var\(--patron-gold\) 60%, transparent\);/,
    'the upgrade is an outlined chip edged in Sunrise gold');
  assert.match(chip, /border-radius: 999px;/);
  assert.match(chip, /background: transparent;/, 'the chip carries no fill');
  assert.match(chip, /color: var\(--text\);/);
  assert.match(css, /\.patron-cta-mark \{[\s\S]{0,180}?width: 16px;[\s\S]{0,180}?height: 16px;/);
  assert.match(css, /\.patron-cta-arrow \{[\s\S]{0,100}?color: var\(--patron-gold\);/);
  const hover = css.match(/\.js-patron-callout a:hover \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(hover, /border-color: var\(--patron-gold\);/);
  assert.doesNotMatch(hover, /transform|padding|font-size|min-height|border-width/,
    'hover cannot resize or move the chip');
  assert.match(css, /--patron-gold: #d4ad66;/i);
  assert.equal(tokens.tokens.find((entry) => entry.name === 'patron-gold')?.consumers?.[0], 'pages');
  for (const name of ['patron-surface', 'patron-label', 'patron-halo']) {
    assert.equal(tokens.tokens.find((entry) => entry.name === name), undefined, `${name} is retired`);
    assert.doesNotMatch(css, new RegExp(`--${name}`), `${name} has no CSS use left`);
  }
});

test('checklist is a footer pill beside Customize whose popover opens upward, and avoids private tabs', () => {
  const css = read('src/renderer/pages/pages.css');
  const html = read('src/renderer/pages/newtab.html');

  assert.doesNotMatch(html.match(/<header class="start-header"[\s\S]*?<\/header>/)[0], /migrationChecklist/,
    'the header no longer carries the checklist');
  assert.match(html, /<span class="footer-appearance">\s*<span id="migrationChecklistShell" class="migration-checklist-shell" hidden>[\s\S]*?<\/span>\s*<button id="customizeButton"/,
    'the checklist pill sits just before Customize in the footer');
  assert.match(css, /\.migration-checklist-compact \{[^}]*border-radius: 999px;[^}]*anchor-name: --start-checklist;/s);
  assert.match(css, /\.migration-checklist \{[^}]*position: fixed;[^}]*position-anchor: --start-checklist;[^}]*position-area: top center;/s,
    'the checklist popover opens above its pill, like Customize');
  assert.doesNotMatch(css, /@media \(max-width: 960px\), \(max-height: 640px\) \{[^@]*migration-checklist/,
    'no tight-window checklist variants remain');
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

test('checklist dismissal stays attached to the task-label column', () => {
  const css = read('src/renderer/pages/pages.css');

  assert.match(
    css,
    /\.migration-checklist-hide \{[^}]*width: fit-content;[^}]*margin: 7px 0 0 87px;[^}]*padding: 5px 0;[^}]*text-align: left;/s
  );
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
  assert.match(js, /migrationChecklistShell\.classList\.add\('is-completing'\)/);
  assert.match(js, /migrationChecklistLabel\.textContent = completing \? 'all moved in' : 'finish setup'/,
    'the footer pill itself confirms completion');
  assert.doesNotMatch(js, /showPopover\(/, 'completion never opens the popover on its own');
  assert.doesNotMatch(js, /is-expanded/);
  assert.match(js, /window\.addEventListener\('focus', presentPendingMigrationChecklistCompletion\)/);
  assert.match(js, /setTimeout\(hideMigrationChecklist, 1500\)/);
  assert.match(js, /migrationSyncAction\.addEventListener\('click'/);
  assert.match(js, /start\.openSettings\('sync'\)/);
  assert.match(js, /start\.dismissMigrationChecklist\(\)/);
  assert.doesNotMatch(js, /migrationSyncAction\.disabled|migrationTabsAction\.disabled/);
});
