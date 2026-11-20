'use strict';

// Blanc Mail design teasers are mockups of an approved but unshipped design,
// so the Mail pages show them only through MailTeaser.astro, which always
// labels them "Design preview" (docs/marketing-claims.md: design mockups never
// prove a capability). Each is a 2000px WebP master with 1400px and 800px
// copies built by site/scripts/build-display-images.mjs, so a replaced master
// cannot leave stale copies behind.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SITE = path.resolve(__dirname, '../../site');
const read = (file) => fs.readFileSync(path.join(SITE, file), 'utf8');
const TEASERS = ['island-address', 'island-arrival', 'island-offer'];

test('MailTeaser is the only way to show a Mail teaser, and its caption is not optional', () => {
  const teaser = read('src/components/MailTeaser.astro');
  assert.match(teaser, /<figcaption>Design preview<\/figcaption>/);
  assert.doesNotMatch(teaser, /\{[^}]*&&\s*<figcaption|caption\s*[:=]/, 'the caption must not depend on a prop');
  const sources = fs.readdirSync(path.join(SITE, 'src'), { recursive: true })
    .filter((file) => /\.(astro|css|mjs|js|ts)$/.test(file) && file !== path.join('components', 'MailTeaser.astro'));
  for (const file of sources) {
    assert.doesNotMatch(read(path.join('src', file)), /mail\/teasers\//, `${file} uses a Mail teaser without MailTeaser`);
  }
});

test('every teaser the Mail page names exists, with built 1400px and 800px copies', () => {
  const page = read('src/pages/mail.astro');
  const named = [...page.matchAll(/\bname: '(island-[a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(named)].sort(), TEASERS);
  const manifest = JSON.parse(read('src/data/display-images.json'));
  for (const name of TEASERS) {
    assert.ok(fs.existsSync(path.join(SITE, 'public/mail/teasers', `${name}.webp`)), `${name}.webp`);
    for (const width of [1400, 800]) {
      const copy = manifest.find((entry) => entry.output === `mail/teasers/${name}-${width}.webp`);
      assert.ok(copy, `${name}-${width}: add it to site/scripts/build-display-images.mjs`);
      assert.equal(copy.source, `mail/teasers/${name}.webp`);
      assert.equal(copy.width, width);
      assert.ok(fs.existsSync(path.join(SITE, 'public', copy.output)), copy.output);
    }
  }
});

test('teaser images stay light enough for the page', () => {
  for (const file of fs.readdirSync(path.join(SITE, 'public/mail/teasers'))) {
    const size = fs.statSync(path.join(SITE, 'public/mail/teasers', file)).size;
    assert.ok(size < 150 * 1024, `${file} is ${Math.round(size / 1024)}K`);
  }
});
