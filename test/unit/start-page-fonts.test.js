'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('product UI uses Inter while Mahjong tile faces retain their separate font', () => {
  const pages = read('src/renderer/pages/pages.css');
  const chrome = read('src/renderer/styles.css');
  const handoff = read('src/renderer/pages/tab-handoff.css');
  const mahjong = read('src/renderer/pages/mahjong.css');
  const newtab = read('src/renderer/pages/newtab.html');
  const game = read('src/renderer/pages/mahjong.html');

  for (const css of [pages, chrome, handoff, mahjong]) {
    assert.doesNotMatch(css, /--font-mono|--font-kbd/);
  }
  assert.match(mahjong, /--mj-face-font:\s*"JetBrains Mono"/);
  assert.match(newtab, /<body class="ledger-body"/);
  assert.match(game, /<body class="mahjong-body"/);
});

test('Newsreader is bundled for the Billboard clock, invitations, and sheet headings', () => {
  const pages = read('src/renderer/pages/pages.css');
  const chrome = read('src/renderer/styles.css');
  const newtab = read('src/renderer/pages/newtab.html');
  const font = fs.readFileSync(path.join(root, 'src/renderer/pages/newsreader-condensed-latin-opsz-normal.woff2'));

  assert.deepEqual([...font.subarray(0, 4)], [119, 79, 70, 50], 'font is WOFF2');
  assert.equal(
    crypto.createHash('sha256').update(font).digest('hex'),
    crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'site/src/fonts/newsreader-condensed-latin-opsz-normal.woff2'))).digest('hex'),
    'app ships the same Newsreader Condensed Latin build as the website'
  );
  assert.match(
    pages,
    /font-family: "Newsreader Condensed";\s*src: url\("newsreader-condensed-latin-opsz-normal\.woff2"\) format\("woff2-variations"\);/
  );
  assert.match(pages, /--font-display:\s*"Newsreader Condensed"[^;]*serif;/);
  assert.match(pages, /body\.sheet \.page h1\s*\{[^}]*font-family:\s*var\(--font-display\)/s);
  assert.match(pages, /body\.sheet \.group-title,\s*body\.sheet \.shortcut-section \.section-title\s*\{[^}]*font-family:\s*var\(--font-display\)/s);
  assert.match(pages, /\.bb-clock\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*clamp\(80px, 12vw, 148px\)[^}]*font-weight:\s*500[^}]*font-optical-sizing:\s*auto/s);
  assert.match(pages, /\.migration-checklist-heading h2\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*28px[^}]*font-weight:\s*400[^}]*line-height:\s*1\.05[^}]*letter-spacing:\s*-0\.04em[^}]*font-optical-sizing:\s*auto/s);
  assert.match(pages, /\.migration-checklist-heading \{ gap: 14px; \}\s*\.migration-checklist-heading h2 \{\s*font-size: 27px;\s*letter-spacing: -0\.045em;/,
    'the later Sunrise override is the effective checklist heading spacing, so it carries the -0.02em compensation too');
  assert.match(pages, /\.ob-content h1\s*\{[^}]*font-family:\s*var\(--font-display\)[^}]*font-size:\s*22px[^}]*font-weight:\s*400[^}]*line-height:\s*1\.15[^}]*letter-spacing:\s*-0\.035em[^}]*font-optical-sizing:\s*auto[^}]*text-wrap:\s*balance/s);
  assert.doesNotMatch(newtab, /bbMeridiem|bb-meridiem/, 'the Billboard clock shows no am/pm');
  assert.doesNotMatch(pages, /bb-meridiem/);
  assert.match(newtab, /id="startDate" class="start-brand-date"/);
  assert.match(newtab, /<h2 class="ledger-where">Where to\?<\/h2>/, 'Ledger leads with one Newsreader line');
  assert.match(pages, /\.ledger-where \{[^}]*font-family: var\(--font-display\);[^}]*font-size: 32px;[^}]*font-weight: 400;[^}]*line-height: 1\.1;[^}]*letter-spacing: -0\.035em;[^}]*font-optical-sizing: auto;/s);
  assert.equal((newtab.match(/<section data-step="[0-5]"/g) || []).length, 6);
  assert.equal((newtab.match(/<h1>/g) || []).length, 6, 'all six plain h1 elements are onboarding titles');
  assert.doesNotMatch(chrome, /Newsreader|--font-display/);
});
