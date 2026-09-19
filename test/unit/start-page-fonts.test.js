'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('start pages remap the mono role to Inter without changing the global token', () => {
  const pages = read('src/renderer/pages/pages.css');
  const mahjong = read('src/renderer/pages/mahjong.css');
  const newtab = read('src/renderer/pages/newtab.html');
  const game = read('src/renderer/pages/mahjong.html');

  assert.match(pages, /--font-mono:\s*"JetBrains Mono"/);
  assert.match(pages, /\.ledger-body\s*\{[\s\S]{0,260}--font-mono:\s*var\(--font-ui\)/);
  assert.match(mahjong, /\.mahjong-body\s*\{[\s\S]{0,260}--font-mono:\s*var\(--font-ui\)/);
  assert.match(newtab, /<body class="ledger-body"/);
  assert.match(game, /<body class="mahjong-body"/);
});
