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

test('Billboard centres its content between the window top and the measured footer', () => {
  const css = read('src/renderer/pages/pages.css');
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /root\.setProperty\('--start-header-h', `\$\{startHeader\.offsetHeight\}px`\);/);
  assert.match(js, /root\.setProperty\('--start-footer-h', `\$\{layoutFooter\.offsetHeight\}px`\);/);
  assert.match(js, /frameHeightObserver\.observe\(startHeader\);\s*frameHeightObserver\.observe\(layoutFooter\);/);
  assert.match(css, /padding: 0 0 var\(--start-footer-h, 72px\);/, 'the body reserves exactly the footer');
  assert.match(css, /body\[data-layout="billboard"\] \.start-content \{[^}]*justify-content: center;[^}]*margin-top: calc\(-1 \* var\(--start-header-h, 0px\)\);[^}]*padding-block: calc\(var\(--start-header-h, 0px\) \+ 16px\);/s);
});

test('the Billboard clock drops the day period in every locale', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /\.formatToParts\(new Date\(\)\)\s*\.filter\(\(part\) => part\.type !== 'dayPeriod'\)/);
  assert.doesNotMatch(js, /bbMeridiem|\[AP\]M/);
});

test('the header row holds the brand, in flow', () => {
  const html = read('src/renderer/pages/newtab.html');
  assert.match(
    html,
    /<header class="start-header" aria-label="Blanc start page">\s*<div class="start-brand">[\s\S]*?id="startDate" class="start-brand-date"><\/span>\s*<\/div>\s*<\/header>/,
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

test('the checklist is a footer pill with an anchored popover', () => {
  const css = frameCss();
  assert.match(read('src/renderer/pages/pages.css'), /\.footer-left \{[^}]*flex-wrap: wrap;/s,
    'the left group wraps rather than overflowing narrow windows');
  assert.match(css, /\.migration-checklist-shell \{[^}]*display: inline-flex;[^}]*min-height: 28px;/s);
  assert.doesNotMatch(css, /\.migration-checklist-compact \.migration-progress-ring/, 'the pill carries no ring');
  assert.match(css, /\.migration-checklist \{[^}]*background: var\(--start-float-fill\);[^}]*backdrop-filter: blur\(20px\) saturate\(140%\);/s,
    'the popover uses the same floating material as Customize');
  assert.doesNotMatch(read('src/renderer/pages/pages.css'), /body\[data-layout="(billboard|tally)"\] \.migration-checklist-shell \{ top:/,
    'no per-layout checklist offsets remain');
});

test('layouts no longer carry their own Patron chip', () => {
  const html = read('src/renderer/pages/newtab.html');
  for (const main of html.match(/<main [\s\S]*?<\/main>/g)) {
    assert.doesNotMatch(main, /js-patron-callout/, `${main.slice(0, 60)}… leaves the upgrade to the footer`);
  }
});

test('private tabs never show the Patron chip or blocked counts', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /function renderPatronCallout\(\) \{[\s\S]*?const hide = patronCallout\.active \|\| Date\.now\(\) < patronCallout\.snoozedUntil \|\| isPrivate;/);
  assert.match(js, /patronCalloutHide\.addEventListener\('click', \(\) => \{\s*patronCallout\.snoozedUntil = Infinity;\s*renderPatronCallout\(\);\s*window\.bowserPages\?\.start\.dismissPatronCallout\(\)/,
    'closing hides the pill at once, then main records the 90-day snooze');
  assert.match(js, /document\.addEventListener\('visibilitychange', \(\) => \{\s*if \(!document\.hidden\) renderPatronCallout\(\);/,
    'a start page shown again re-checks whether the snooze has ended');
  assert.match(js, /document\.getElementById\('shBlocked'\)\.closest\('\.shelf-card'\)\.hidden = isPrivate;/);
  assert.match(js, /document\.querySelector\('\.tally-right'\)\.hidden = isPrivate;/);
});

test('Ledger, Shelf and Tally explain an empty Favorites list; Billboard does not', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /const EMPTY_FAVORITES_HINT = 'Favorite a page with ♥ to pin it here';/);
  for (const fn of ['renderLedgerFavorites', 'renderShelf', 'renderTally']) {
    const body = js.match(new RegExp(`function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
    assert.match(body, /emptyFavoritesHint\(\)/, `${fn} renders the hint`);
  }
  const billboard = js.match(/function renderBillboard\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(billboard, /emptyFavoritesHint/);
  assert.doesNotMatch(js, /♥ a page to pin it here/);
  assert.match(frameCss(), /\.start-empty-hint \{/);
});

test('the footer offers one Customize popover with four layout previews and the wallpaper switch', () => {
  const html = read('src/renderer/pages/newtab.html');
  const js = read('src/renderer/pages/newtab.js');
  assert.match(html, /<button id="customizeButton" class="start-customize" type="button" popovertarget="customizePopover" aria-expanded="false">Customize<\/button>/);
  const popover = html.match(/<div id="customizePopover" class="start-customize-popover" popover role="dialog" aria-label="Customize start page">([\s\S]*?)<\/div>\s*<\/span>/)?.[1] ?? '';
  assert.deepEqual(
    [...popover.matchAll(/data-layout-pick="(\w+)"/g)].map((m) => m[1]),
    ['ledger', 'billboard', 'shelf', 'tally'],
    'the four layouts keep their order',
  );
  assert.match(popover, /id="dynamicWallpaperToggle"/);
  assert.doesNotMatch(html, /layout-switcher-label/);
  assert.match(js, /customizePopover\.addEventListener\('toggle', \(event\) => \{\s*customizeButton\.setAttribute\('aria-expanded', String\(event\.newState === 'open'\)\);/);
  const css = frameCss();
  assert.match(css, /\.start-customize-popover \{[^}]*position-anchor: --start-customize;[^}]*position-area: top center;/s);
  assert.match(css, /:root:not\(\[data-theme="private"\]\) body:not\(\[data-layout="ledger"\]\) #footerLeft \{ display: none; \}/,
    'only Ledger repeats the blocked count in the footer');
});

test('labels are sentence case without tracking, and the date keeps locale case', () => {
  const html = read('src/renderer/pages/newtab.html');
  const js = read('src/renderer/pages/newtab.js');
  for (const label of ['Favorites', 'Pick up where you left off', 'On your other devices', 'Blocked this week', 'Blocked']) {
    assert.match(html, new RegExp(`>${label}<`), `label "${label}"`);
  }
  assert.doesNotMatch(html, />(favorites|pick up where you left off|on your other devices|blocked this week|blocked)</);
  assert.match(js, /const dateText = isPrivate\s*\? 'Private tab'/);
  assert.doesNotMatch(js.match(/const dateText[\s\S]*?;\n/)[0], /toLowerCase/);
  const css = frameCss();
  assert.match(css, /\.ledger-label,\s*\.shelf-label \{[^}]*font: 600 12px\/1\.3 var\(--font-ui\);[^}]*letter-spacing: 0\.005em;[^}]*text-transform: none;/s);
  assert.match(css, /\.start-brand-date \{[^}]*font: 500 12px\/1\.3 var\(--font-ui\);[^}]*letter-spacing: 0;[^}]*text-transform: none;/s);
  assert.match(css, /\.shelf-count,\s*\.tally-count \{[^}]*letter-spacing: -0\.02em;[^}]*font-variant-numeric: tabular-nums;/s);
});

test('surfaces follow one weight ladder with accessibility fallbacks', () => {
  const css = frameCss();
  const all = read('src/renderer/pages/pages.css');
  const js = read('src/renderer/pages/newtab.js');
  assert.match(css, /\.shelf-tile,\s*\.shelf-card \{[^}]*background: var\(--start-card-fill\);[^}]*box-shadow: var\(--start-shadow-card\), var\(--start-card-highlight\);[^}]*backdrop-filter: blur\(12px\) saturate\(140%\);/s);
  assert.match(css, /\.group-chip \{[^}]*background: transparent;[^}]*backdrop-filter: none;/s);
  assert.match(css, /\.ledger-footer,\s*body:not\(\[data-layout="ledger"\]\) \.ledger-footer \{ border-top: 0; \}/);
  assert.match(css, /\.ledger-footer::before \{[^}]*height: 24px;[^}]*opacity: 0;/s);
  assert.match(css, /body\.has-underflow \.ledger-footer::before \{ opacity: 1; \}/);
  assert.match(js, /new IntersectionObserver\(/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?backdrop-filter: none;/);
  assert.match(css, /@media \(prefers-contrast: more\) \{[\s\S]*?border-color: var\(--text-dim\);/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*\.bb-clock \{ text-shadow: none; \}/);
  assert.match(css, /:root\[data-theme="private"\] \.bb-clock \{ text-shadow: none; \}/);
  assert.match(css, /\.fav \.tile,\s*\.shelf-tile \.tile,\s*\.bb-fav \.tile \{[^}]*border-radius: 6px;[^}]*box-shadow: var\(--start-shadow-icon\);/s);
  assert.doesNotMatch(all, /\.bb-site-dismiss \{[^}]*box-shadow: 0 2px 8px/s, 'the dismiss button uses the icon shadow');
});

test('motion grows surfaces from their source and respects reduced motion', () => {
  const css = frameCss();
  const js = read('src/renderer/pages/newtab.js');
  assert.match(css, /\.start-customize-popover,\s*\.migration-checklist \{[^}]*transform-origin: bottom center;[^}]*transition:[^;]*opacity 150ms var\(--start-ease\)/s);
  assert.match(css, /\.start-customize-popover:popover-open,\s*\.migration-checklist:popover-open \{[^}]*transition-duration: 200ms;/s);
  assert.match(css, /@starting-style \{\s*\.start-customize-popover:popover-open,\s*\.migration-checklist:popover-open \{[^}]*scale\(0\.96\)/);
  assert.match(css, /body\.layout-ready \.start-content > main \{[^}]*transition: opacity 160ms var\(--start-ease\);/s);
  assert.match(css, /@starting-style \{\s*body\.layout-ready \.start-content > main \{ opacity: 0; \}/);
  assert.match(css, /:active \{[^}]*transform: scale\(0\.98\);/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.start-customize-popover,[\s\S]*?transform: none;/);
  assert.match(js, /requestAnimationFrame\(\(\) => document\.body\.classList\.add\('layout-ready'\)\)/);
  assert.doesNotMatch(css, /cubic-bezier\([^)]*1\.[0-9]/, 'no overshooting curves');
});

test('Ledger is a centered spread: Favorites left, groups and devices right', () => {
  const html = read('src/renderer/pages/newtab.html');
  const ledger = html.match(/<main class="ledger" id="layoutLedger">([\s\S]*?)<\/main>/)[1];
  assert.match(ledger, /<div class="ledger-spread">\s*<div class="ledger-col ledger-col-primary">[\s\S]*?id="favoritesList"[\s\S]*?<\/div>\s*<div class="ledger-col ledger-col-secondary">[\s\S]*?id="groupsSection"[\s\S]*?id="remoteSection"[\s\S]*?<\/div>\s*<\/div>/);
  const css = frameCss();
  assert.match(css, /body\[data-layout="ledger"\] \.ledger \{[^}]*max-width: 904px;[^}]*margin-inline: auto;/s);
  assert.match(css, /\.ledger-spread \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*column-gap: 64px;/s);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?\.ledger-spread \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.group-row \.cluster \{[^}]*flex: 0 0 46px;/s, 'group names line up');
});

test('Billboard keeps its recent sites on one row', () => {
  const css = frameCss();
  assert.match(css, /\.bb-favs \{[^}]*flex-wrap: nowrap;/s);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.bb-site:nth-child\(n \+ 5\) \{ display: none; \}/);
});

test('Shelf columns follow the favorites count', () => {
  const js = read('src/renderer/pages/newtab.js');
  const source = js.match(/function shelfColumns\(count\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'newtab.js defines shelfColumns');
  const shelfColumns = require('node:vm').runInNewContext(`${source}; shelfColumns;`);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(shelfColumns), [2, 2, 2, 3, 4, 3, 3, 4, 4]);
  assert.match(js, /document\.getElementById\('layoutShelf'\)\.dataset\.columns = String\(shelfColumns\(/);
});

test('Shelf tiles and cards share one grid with full rows', () => {
  const html = read('src/renderer/pages/newtab.html');
  assert.match(html, /<div class="shelf-card shelf-card-groups">/);
  assert.match(html, /<div class="shelf-card shelf-card-blocked">/);
  const css = frameCss();
  assert.match(css, /body\[data-layout="shelf"\] #layoutShelf \{ display: grid; \}/);
  assert.match(css, /#shFavorites,\s*\.shelf-cards \{ display: contents; \}/);
  assert.match(css, /#layoutShelf\[data-columns="3"\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /#layoutShelf\[data-columns="3"\] \.shelf-card-groups \{ grid-column: span 2; \}/);
  assert.match(css, /#layoutShelf\[data-columns="4"\] \.shelf-card-groups \{ grid-column: span 3; \}/);
  assert.match(css, /#layoutShelf:has\(\.shelf-card-blocked\[hidden\]\) \.shelf-card-groups \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.shelf-tile \{[^}]*min-height: 92px;[^}]*padding: 14px;/s);
});

test('Tally is two balanced columns with warm bars, data first when narrow', () => {
  const css = frameCss();
  const all = read('src/renderer/pages/pages.css');
  assert.match(css, /body\[data-layout="tally"\] #layoutTally \{ display: grid; \}/);
  assert.match(css, /#layoutTally \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*max-width: 904px;[^}]*margin-inline: auto;/s);
  assert.match(css, /#layoutTally:has\(> \.tally-right\[hidden\]\) \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*max-width: 420px;/s);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?#layoutTally \{ grid-template-columns: minmax\(0, 1fr\); \}[\s\S]*?\.tally-right \{ order: -1; \}/);
  assert.match(css, /\.tally-bar \{[^}]*background: color-mix\(in srgb, var\(--accent\) 32%, transparent\);[^}]*border: 0;/s);
  assert.match(css, /\.tally-bar\.today \{ background: var\(--accent\); \}/);
  assert.doesNotMatch(all, /\.tally-right \{ margin-top: 56px; max-width: 280px;/, 'the old 280px cap is gone');
});
