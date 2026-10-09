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
  assert.match(html, /id="migrationChecklistCompact"[^>]*popovertarget="migrationChecklist"[^>]*aria-expanded="false">\s*<span id="migrationChecklistLabel" class="migration-compact-label">Finish setup<\/span>\s*<\/button>/,
    'the pill is plain sentence-case text, with no progress ring');
  assert.match(html, /<\/button>\s*<button id="migrationChecklistHide" class="start-pill-close" type="button" aria-label="Hide moving-in checklist">\s*<svg [^>]*aria-hidden="true"/,
    'the pill ends in its own close button');
  const popover = html.match(/<aside id="migrationChecklist" class="migration-checklist" popover role="dialog"[\s\S]*?<\/aside>/)?.[0] ?? '';
  assert.ok(popover, 'the full checklist is a popover dialog');
  assert.doesNotMatch(popover, /migrationChecklistHide/, 'the popover no longer carries a separate hide link');
  assert.doesNotMatch(html, /tab-import-promo|js-sync-nudge|syncNudge/);
  assert.doesNotMatch(html, /style="/);
});

test('one footer Patron pill names the upgrade and can be closed', () => {
  const html = read('src/renderer/pages/newtab.html');
  const css = read('src/renderer/pages/pages.css');
  const tokens = JSON.parse(read('tokens/tokens.json'));
  const ctas = html.match(/<a href="blanc:\/\/settings\/#group-patron"><img class="patron-cta-mark" src="sunrise-mark\.png" alt="" \/><span>Upgrade to Blanc Patron<\/span><\/a>/g) ?? [];

  assert.equal(ctas.length, 1, 'one Patron upgrade serves every layout');
  assert.doesNotMatch(html, /patron-cta-arrow|ledger-patron|bb-patron|shelf-patron|tally-patron/);
  assert.doesNotMatch(html, />Support Blanc</);
  const footer = html.match(/<footer id="layoutFooter"[\s\S]*?<\/footer>/)[0];
  assert.match(footer, /<span class="footer-left">\s*<span id="footerLeft"><\/span>\s*<span id="version" class="ledger-version"><\/span>\s*<span id="migrationChecklistShell"[\s\S]*?<\/aside>\s*<\/span>\s*<span id="patronCallout" class="patron-pill js-patron-callout" hidden>/,
    'the Patron pill ends the footer\'s left group');
  assert.match(footer, /<\/a>\s*<button id="patronCalloutHide" class="start-pill-close" type="button" aria-label="Hide the Blanc Patron upgrade for 90 days">/);
  const chip = css.match(/\.js-patron-callout \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(chip, /border: 1px solid color-mix\(in srgb, var\(--patron-gold\) 60%, transparent\);/,
    'the upgrade is an outlined pill edged in Sunrise gold');
  assert.match(chip, /border-radius: 999px;/);
  assert.match(chip, /background: transparent;/, 'the pill carries no fill');
  assert.match(css, /\.patron-cta-mark \{[\s\S]{0,180}?width: 16px;[\s\S]{0,180}?height: 16px;/);
  const hover = css.match(/\.js-patron-callout:hover \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(hover, /border-color: var\(--patron-gold\);/);
  assert.doesNotMatch(hover, /transform|padding|font-size|min-height|border-width/,
    'hover cannot resize or move the pill');
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
  assert.match(html, /<span id="version" class="ledger-version"><\/span>\s*<span id="migrationChecklistShell" class="migration-checklist-shell" hidden>[\s\S]*?<\/aside>\s*<\/span>\s*<span id="patronCallout"/,
    'the checklist pill sits on the footer\'s left, after the version and before the Patron pill');
  assert.match(html, /<span class="footer-appearance">\s*<button id="customizeButton"/,
    'Customize stays alone in the footer\'s centre');
  assert.match(css, /\.migration-checklist-shell \{[^}]*border-radius: 999px;[^}]*anchor-name: --start-checklist;/s);
  assert.match(css, /\.migration-checklist \{[^}]*position: fixed;[^}]*position-anchor: --start-checklist;[^}]*position-area: top span-right;/s,
    'the checklist popover opens above its pill and grows rightward, away from the window edge');
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

test('checklist dismissal is a round close button at the pill\'s end', () => {
  const css = read('src/renderer/pages/pages.css');

  assert.match(css, /\.start-pill-close \{[^}]*width: 22px;[^}]*height: 22px;[^}]*border-radius: 50%;/s,
    'the checklist and Patron pills share one round close button');
  assert.match(css, /\.migration-checklist-shell\.is-completing \.start-pill-close \{ visibility: hidden; \}/,
    'the close button steps aside while the pill confirms completion');
  assert.doesNotMatch(css, /margin: 7px 0 0 87px/, 'the in-popover hide link is gone');
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
  assert.match(js, /migrationChecklistLabel\.textContent = completing \? 'All moved in' : 'Finish setup'/,
    'the footer pill itself confirms completion');
  assert.doesNotMatch(js, /showPopover\(/, 'completion never opens the popover on its own');
  assert.doesNotMatch(js, /is-expanded/);
  assert.match(js, /window\.addEventListener\('focus', presentPendingMigrationChecklistCompletion\)/);
  assert.match(js, /setTimeout\(hideMigrationChecklist, 1500\)/);
  assert.match(js, /migrationSyncAction\.addEventListener\('click', \(\) => \{\s*closeMigrationChecklistPopover\(\);/,
    'choosing a task closes the popover behind it');
  assert.match(js, /migrationTabsAction\.addEventListener\('click', closeMigrationChecklistPopover\)/);
  assert.match(js, /start\.openSettings\('sync'\)/);
  assert.match(js, /start\.dismissMigrationChecklist\(\)/);
  assert.doesNotMatch(js, /migrationSyncAction\.disabled|migrationTabsAction\.disabled/);
});
