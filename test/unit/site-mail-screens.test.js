'use strict';

// The Blanc Mail pages show real screenshots only through MailShot.astro,
// which always labels them "Preview build": Blanc Mail has no public build,
// and docs/marketing-claims.md requires a screenshot of an unreleased app to
// read as a preview. Each 1100px copy is a display image built from its
// capture (site/scripts/build-display-images.mjs), so a recapture cannot
// leave a stale copy behind.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '../../site');
const read = (file) => fs.readFileSync(path.join(SITE, file), 'utf8');
const mailPages = ['src/pages/mail.astro', ...fs.readdirSync(path.join(SITE, 'src/pages/mail')).map((f) => `src/pages/mail/${f}`)];
const SHOTS = ['dark', 'island', 'main', 'rules', 'zero', 'zero-night'];

test('MailShot is the only way to show a Mail screenshot, and its caption is not optional', () => {
  const shot = read('src/components/MailShot.astro');
  assert.match(shot, /<figcaption>Preview build<\/figcaption>/);
  assert.doesNotMatch(shot, /\{[^}]*&&\s*<figcaption|caption\s*[:=]/, 'the caption must not depend on a prop');
  const sources = fs.readdirSync(path.join(SITE, 'src'), { recursive: true })
    .filter((file) => /\.(astro|css|mjs|js|ts)$/.test(file) && file !== path.join('components', 'MailShot.astro'));
  for (const file of sources) {
    assert.doesNotMatch(read(path.join('src', file)), /mail\/screens\//, `${file} uses a Mail screenshot without MailShot`);
  }
});

test('every screenshot the Mail pages name exists, with a built 1100px copy', () => {
  const named = new Set(mailPages.flatMap((file) => [...read(file).matchAll(/<MailShot\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1])));
  assert.deepEqual([...named].sort(), SHOTS);
  const manifest = JSON.parse(read('src/data/display-images.json'));
  for (const name of SHOTS) {
    assert.ok(fs.existsSync(path.join(SITE, 'public/mail/screens', `${name}.webp`)), `${name}.webp`);
    const copy = manifest.find((entry) => entry.output === `mail/screens/${name}-1100.webp`);
    assert.ok(copy, `${name}: add it to site/scripts/build-display-images.mjs`);
    assert.equal(copy.source, `mail/screens/${name}.webp`);
    assert.equal(copy.width, 1100);
  }
});
