'use strict';

// The Blanc Mail pages show real screenshots only through MailShot.astro,
// which labels the images "Preview builds" per docs/marketing-claims.md.
// Each smaller copy is a display image built from its
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
  assert.equal((shot.match(/<figcaption\b/g) ?? []).length, 1);
  assert.match(shot, /<figcaption>Preview builds<\/figcaption>/);
  assert.doesNotMatch(shot, /\{[^}]*&&\s*<figcaption|caption\s*[:=]/, 'the caption must not depend on a prop');
  const sources = fs.readdirSync(path.join(SITE, 'src'), { recursive: true })
    .filter((file) => /\.(astro|css|mjs|js|ts)$/.test(file) && file !== path.join('components', 'MailShot.astro'));
  for (const file of sources) {
    assert.doesNotMatch(read(path.join('src', file)), /mail\/screens\//, `${file} uses a Mail screenshot without MailShot`);
  }
});

test('only the Mail overview hero shows native app previews, for Mac and iPhone', () => {
  for (const file of mailPages) {
    const shots = read(file).match(/<MailShot\b[^>]*>/g) ?? [];
    if (file !== 'src/pages/mail.astro') {
      assert.equal(shots.length, 0, file);
      continue;
    }
    assert.deepEqual(shots, ['<MailShot shots={[macShot, iphoneShot]} />']);
    assert.match(read(file), /name: 'hero-dark'/);
    assert.match(read(file), /name: 'iphone-inbox'/);
    assert.doesNotMatch(read(file), /alt: 'PENDING'/);
  }
});
