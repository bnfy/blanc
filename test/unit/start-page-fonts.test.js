'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

test('Newsreader is bundled only for the start-page invitation headings', () => {
  const pages = read('src/renderer/pages/pages.css');
  const chrome = read('src/renderer/styles.css');
  const newtab = read('src/renderer/pages/newtab.html');
  const font = fs.readFileSync(path.join(root, 'src/renderer/pages/newsreader-latin-opsz-normal.woff2'));

  assert.deepEqual([...font.subarray(0, 4)], [119, 79, 70, 50], 'font is WOFF2');
  assert.equal(
    crypto.createHash('sha256').update(font).digest('hex'),
    '6e4f2958c3a7c4a80acde4e5a679abe7e01bc1e30b92be3c7a8b696ef401d101',
    'font matches the pinned Newsreader 5.3.0 Latin optical-size upright build'
  );
  assert.match(
    pages,
    /font-family: "Newsreader Variable";\s*src: url\("newsreader-latin-opsz-normal\.woff2"\) format\("woff2-variations"\);/
  );
  assert.match(pages, /--font-display:\s*"Newsreader Variable"[^;]*serif;/);
  assert.equal(
    (pages.match(/font-family:\s*var\(--font-display\)/g) || []).length,
    3,
    'only the two start-page title selectors and onboarding title selector use Newsreader'
  );
  assert.match(pages, /\.ledger-heading\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*30px[^}]*font-weight:\s*400[^}]*line-height:\s*1\.05[^}]*letter-spacing:\s*-0\.02em[^}]*font-optical-sizing:\s*auto/s);
  assert.match(pages, /\.shelf-heading\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*30px[^}]*font-weight:\s*400[^}]*line-height:\s*1\.05[^}]*letter-spacing:\s*-0\.02em[^}]*font-optical-sizing:\s*auto/s);
  assert.match(pages, /\.ob-content h1\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*22px[^}]*font-weight:\s*400[^}]*line-height:\s*1\.15[^}]*letter-spacing:\s*-0\.015em[^}]*font-optical-sizing:\s*auto[^}]*text-wrap:\s*balance/s);
  assert.equal((newtab.match(/<section data-step="[0-5]"/g) || []).length, 6);
  assert.equal((newtab.match(/<h1>/g) || []).length, 6, 'all six plain h1 elements are onboarding titles');
  assert.doesNotMatch(chrome, /Newsreader|--font-display/);
});
