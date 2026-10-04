const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const site = path.resolve(__dirname, '../../site');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'src/data/display-images.json'), 'utf8'));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(site, 'public', file))).digest('hex');

test('display copies are current for their untouched sources', async () => {
  assert.ok(manifest.length >= 8);
  for (const entry of manifest) {
    assert.equal(sha256(entry.source), entry.sourceSha256, `${entry.source} changed: rerun node site/scripts/build-display-images.mjs`);
    const meta = await sharp(path.join(site, 'public', entry.output)).metadata();
    assert.equal(meta.format, 'webp', entry.output);
    assert.deepEqual([meta.width, meta.height], [entry.width, entry.height], entry.output);
  }
});

test('Start Page layout copies keep the Display P3 profile of their captures', async () => {
  for (const entry of manifest.filter(item => item.source.endsWith('.png'))) {
    const [source, output] = await Promise.all([entry.source, entry.output].map(file => sharp(path.join(site, 'public', file)).metadata()));
    assert.ok(source.icc && output.icc && Buffer.compare(source.icc, output.icc) === 0, entry.output);
  }
});

test('pages use the light copies while full-size links keep the pinned captures', () => {
  const read = file => fs.readFileSync(path.join(site, file), 'utf8');
  const home = read('src/pages/index.astro');
  for (const name of ['rest', 'tabs', 'command']) {
    assert.match(home, new RegExp(`<source media="\\(max-width: 760px\\)" srcset="/revamp/island-roman-${name}-800\\.webp"`));
    assert.match(home, new RegExp(`src="/revamp/island-roman-${name}-display\\.webp"`));
  }
  // Pages never load the pinned lossless originals directly.
  assert.doesNotMatch(home + read('src/components/GestureDemo.astro'), /src="\/revamp\/(island-roman-[a-z]+|champagne-desktop-v2|space-black-laptop-v2)\.webp"/);
  assert.match(home, /src="\/feature-captures\/ledger-v1\.21\.0\.webp"/);
  assert.doesNotMatch(read('src/scripts/home.js'), /-v1\.21\.0\.png/);
  const guide = read('src/pages/features/start-page.astro');
  assert.doesNotMatch(guide, /<img src="\/feature-captures\/[a-z]+-v1\.21\.0\.png"/);
  assert.match(guide, /href="\/feature-captures\/ledger-v1\.21\.0\.png"/);
  // Lazy wallpaper scenes: only the first ships with src.
  assert.equal((home.match(/(?<!data-)src="\/feature-captures\/home-wallpaper-/g) || []).length, 1);
  assert.equal((home.match(/data-src="\/feature-captures\/home-wallpaper-/g) || []).length, 7);
});
