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

  assert.match(html, /<button id="bringTabsBtn" type="button">Bring tabs…<\/button>/);
  assert.match(renderer, /bringTabsBtn\.addEventListener\('click'/);
  assert.match(renderer, /window\.location\.href = 'blanc:\/\/tab-import\/'/);
  assert.doesNotMatch(renderer, /bringTabsBtn[\s\S]{0,300}https?:\/\//,
    'the Favorites entry must stay on the allowlisted utility origin');
});

test('/bring-tabs is catalogued and dispatches through the privileged page allowlist', () => {
  const catalog = JSON.parse(read('copy/slash-commands.json'));
  const entry = catalog.commands.find((candidate) => candidate.command === '/bring-tabs');
  assert.deepEqual(entry, {
    command: '/bring-tabs',
    hint: 'Bring tabs from another browser',
  });

  const overlay = read('src/renderer/overlay.js');
  assert.match(
    overlay,
    /cmd: '\/bring-tabs', hint: 'Bring tabs from another browser', run: \(\) => window\.browserAPI\.openPage\('tab-import'\)/,
  );

  const main = read('src/main/main.js');
  const handler = main.match(
    /chromeHandle\('tabs:open-page',[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(handler, 'tabs:open-page handler not found');
  assert.match(handler, /'tab-import'/);
  assert.match(handler, /openInternalPage\(`blanc:\/\/\$\{name\}\/\$\{fragment\}`\)/);
});
