'use strict';

// The Blanc Mail pages show real screenshots only through MailShot.astro,
// which always labels them "Preview build · sample mail": Blanc Mail has no
// public build, docs/marketing-claims.md requires a screenshot of an
// unreleased app to read as a preview, and every capture shows the demo's
// made-up mail. Each 1100px copy is a display image built from its
// capture (site/scripts/build-display-images.mjs), so a recapture cannot
// leave a stale copy behind.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '../../site');
const read = (file) => fs.readFileSync(path.join(SITE, file), 'utf8');
// Recursive, .astro only: /mail/reserve/release lives in a folder of its own.
const mailPages = ['src/pages/mail.astro', ...fs.readdirSync(path.join(SITE, 'src/pages/mail'), { recursive: true })
  .filter((f) => f.endsWith('.astro')).map((f) => `src/pages/mail/${f.split(path.sep).join('/')}`)];

test('MailShot is the only way to show a Mail screenshot, and its caption is not optional', () => {
  const shot = read('src/components/MailShot.astro');
  assert.match(shot, /<figcaption>Preview build · sample mail<\/figcaption>/);
  assert.doesNotMatch(shot, /\{[^}]*&&\s*<figcaption|caption\s*[:=]/, 'the caption must not depend on a prop');
  const sources = fs.readdirSync(path.join(SITE, 'src'), { recursive: true })
    .filter((file) => /\.(astro|css|mjs|js|ts)$/.test(file) && file !== path.join('components', 'MailShot.astro'));
  for (const file of sources) {
    assert.doesNotMatch(read(path.join('src', file)), /mail\/screens\//, `${file} uses a Mail screenshot without MailShot`);
  }
});

// The owner lifted the November 20 hold for one image (November 24, 2026):
// the Mail page hero's window. No other Mail page shows a screenshot.
test('only the Mail page hero shows a native app screenshot', () => {
  for (const file of mailPages) {
    const shots = read(file).match(/<MailShot\b[^>]*>/g) ?? [];
    if (file !== 'src/pages/mail.astro') {
      assert.equal(shots.length, 0, file);
      continue;
    }
    assert.equal(shots.length, 1, 'one screenshot on /mail');
    assert.match(shots[0], /class="offer-shot"/);
    assert.match(read(file), /name: 'hero-light'/);
    assert.doesNotMatch(read(file), /alt: 'PENDING'/, 'the hero window needs real alt text');
  }
});
