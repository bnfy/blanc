'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Favorites exposes an exact in-sheet Bring tabs entry point', () => {
  const html = read('src/renderer/pages/bookmarks.html');
  const renderer = read('src/renderer/pages/bookmarks.js');

  assert.match(html, /<button id="bringTabsBtn" type="button">Bring open tabs…<\/button>/);
  assert.match(renderer, /bringTabsBtn\.addEventListener\('click'/);
  assert.match(renderer, /window\.location\.href = 'blanc:\/\/tab-import\/'/);
  assert.doesNotMatch(renderer, /bringTabsBtn[\s\S]{0,300}https?:\/\//,
    'the Favorites entry must stay on the allowlisted utility origin');
});

test('Bring Your Tabs groups profiles under bundled browser artwork', () => {
  const html = read('src/renderer/pages/tab-import.html');
  const renderer = read('src/renderer/pages/tab-import-open-tabs.js');
  const css = read('src/renderer/pages/pages.css');

  assert.match(html, /id="tabImportBrowserList"[^>]+role="radiogroup"/);
  assert.match(html, /id="tabImportProfileSection"/);
  assert.match(html, /id="tabImportStepProgress"[^>]+aria-live="polite"[^>]*>Step 1 of 4/);
  assert.match(renderer, /stepProgressEl\.textContent = `Step \$\{STEPS\.indexOf\(step\) \+ 1\} of \$\{STEPS\.length\}`/);
  assert.doesNotMatch(html, /tab-import-kicker|tab-import-assurances|data-step-marker/);
  assert.match(html, /Only the first tab wakes\. Your source browser and Favorites stay unchanged\./);
  assert.doesNotMatch(html, /Profiles keep separate windows|Changing the browser updates the profiles/);
  assert.doesNotMatch(html, /HTML bookmarks|bookmarks file|Choose a bookmarks folder/);

  for (const browser of ['brave', 'chrome', 'edge', 'vivaldi', 'chromium']) {
    const filename = `import-browser-${browser}.png`;
    assert.match(renderer, new RegExp(filename.replace('.', '\\.')));
    const asset = fs.readFileSync(path.join(root, 'src/renderer/pages', filename));
    assert.deepEqual([...asset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }

  assert.match(renderer, /dataset\.sourceLabel = source\.label/);
  assert.match(renderer, /openSource\(source\.id, source\.label, \{[\s\S]*?browserName: source\.browser/);
  assert.match(renderer, /Permission needed/);
  assert.match(renderer, /suggestSourceGroups/);
  assert.match(renderer, /saved, restorable session/);
  assert.match(renderer, /depends on its startup setting/);
  assert.match(renderer, /Blanc only reads it and never removes tabs/);
  assert.match(renderer, /will not use an older snapshot/);
  assert.match(renderer, /waiting\.textContent = 'Waiting…'/);
  assert.match(renderer, /button\.disabled = true/);
  assert.match(renderer, /button\.classList\.toggle\('waiting', waiting\)/);
  assert.match(css, /\.tab-import-source-btn\.waiting \.tab-import-source-arrow \{ display: none; \}/);
  assert.match(css, /\.tab-import-source-btn\.waiting \.tab-import-source-waiting \{ display: block; \}/);
  assert.doesNotMatch(html, /src="tab-import\.js"/,
    'the rejected bookmark-folder renderer must not be loaded alongside the corrected flow');
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/pages/tab-import.js')), false,
    'the rejected bookmark-folder renderer must not ship as dead duplicate UI');
  assert.match(renderer, /pageEl\.scrollTop = 0/,
    'wizard transitions must reset the sheet scrollport so the next heading stays visible');
  assert.match(renderer, /requestAnimationFrame\(resetScroll\)/,
    'the scroll reset must win over Chromium focus reveal after the clicked CTA is hidden');
  assert.match(renderer, /group\.confidence === 'high' \? 'from source' : 'new'/,
    'source-browser groups must be distinguished from groups created during review');
  assert.doesNotMatch(css, /\.tab-import-review-row,\s*\n\s*\.tab-import-review-heading/,
    'the narrow layout must not turn the group-name flex basis into vertical blank space');
  assert.match(css, /\.tab-import-review-actions \.tab-import-restore-btn \{ max-width: none; width: 100%; \}/,
    'only row-level restore controls may stretch at the narrow breakpoint');
  assert.doesNotMatch(renderer, /openFile|selectFolder|suggestFolders|Save to Favorites/);
});

test('every start-page layout promotes the same local Bring Your Tabs flow', () => {
  const html = read('src/renderer/pages/newtab.html');
  const css = read('src/renderer/pages/pages.css');
  const entryPoints = [...html.matchAll(
    /class="tab-import-promo [^"]+" href="blanc:\/\/tab-import\/"/g,
  )];

  assert.equal(entryPoints.length, 4, 'ledger, billboard, shelf, and tally each need one CTA');
  assert.equal((html.match(/Move open tabs from another browser and organize them here\./g) ?? []).length, 4);
  assert.equal((html.match(/class="tab-import-promo-arrow" src="import-chevron-right\.svg"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /tab-import-promo-kicker|tab-import-promo-action|new in blanc/);
  assert.match(css, /:root\[data-theme="private"\] \.tab-import-promo \{ display: none; \}/,
    'private start tabs must not advertise a regular-profile migration action');
});

test('/bring-tabs is catalogued and dispatches through the privileged page allowlist', () => {
  const catalog = JSON.parse(read('copy/slash-commands.json'));
  const entry = catalog.commands.find((candidate) => candidate.command === '/bring-tabs');
  assert.deepEqual(entry, {
    command: '/bring-tabs',
    hint: 'Bring open tabs from another browser',
  });

  const overlay = read('src/renderer/overlay.js');
  assert.match(
    overlay,
    /cmd: '\/bring-tabs', hint: 'Bring open tabs from another browser', run: \(\) => window\.browserAPI\.openPage\('tab-import'\)/,
  );

  const main = read('src/main/main.js');
  const handler = main.match(
    /chromeHandle\('tabs:open-page',[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(handler, 'tabs:open-page handler not found');
  assert.match(handler, /'tab-import'/);
  assert.match(handler, /openInternalPage\(`blanc:\/\/\$\{name\}\/\$\{fragment\}`\)/);
});

test('onboarding import step exposes the open-tab handoff on both paths', () => {
  const html = read('src/renderer/pages/newtab.html');
  const renderer = read('src/renderer/pages/onboarding.js');

  assert.match(html, /id="obBringTabs"/);
  assert.match(renderer, /Bring your open tabs…/);
  assert.doesNotMatch(renderer, /folder in as tabs|without importing everything/);
  assert.match(renderer, /bringTabsBtn\.addEventListener\('click'/);
  assert.match(renderer, /window\.location\.href = 'blanc:\/\/tab-import\/'/);
  assert.match(renderer, /state\.importHandoff = 'post-import'/);
});
