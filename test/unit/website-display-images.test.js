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

test('phones get frameless, focused crops of every framed capture', () => {
  const css = fs.readFileSync(path.join(site, 'src/styles/home.css'), 'utf8');
  const start = css.indexOf('/* Phones: drop the device frames');
  assert.ok(start > 0, 'phone crop block not found');
  const phone = css.slice(start, css.indexOf('\n}\n', css.indexOf('@media (max-width: 760px)', start)));
  assert.match(phone, /\.device-frame \.device-shell \{\s*display: none;/);
  assert.match(phone, /aspect-ratio: 4 \/ 3;/);
  assert.match(phone, /\.home-cinema \.device \{\s*padding-bottom: \d+px;/, 'the frameless capture needs space above the dark section');
  // The scroll motion's home-screen keyframes end on transform: none and hold
  // it, so the phone crop must center without a transform.
  const img = phone.match(/\.device-frame \.device-screen img \{([^}]*)\}/);
  assert.ok(img, 'phone capture rule not found');
  assert.match(img[1], /height: 100%;/);
  assert.match(img[1], /object-fit: cover;/);
  assert.doesNotMatch(img[1], /transform/);
});

test('pages use the light copies while full-size links keep the pinned captures', () => {
  const read = file => fs.readFileSync(path.join(site, file), 'utf8');
  const home = read('src/pages/index.astro');
  for (const name of ['rest', 'tabs', 'command']) {
    assert.match(home, new RegExp(`<source media="\\(max-width: 760px\\)" srcset="/revamp/island-smithsonian-${name}-v1.36.0-800\\.webp"`));
    assert.match(home, new RegExp(`src="/revamp/island-smithsonian-${name}-v1.36.0-display\\.webp"`));
  }
  // Pages never load the pinned lossless originals directly.
  assert.doesNotMatch(home + read('src/components/GestureDemo.astro'), /src="\/revamp\/(island-roman-[a-z]+|champagne-desktop-v2|space-black-laptop-v2)\.webp"/);
  assert.match(home, /src="\/revamp\/space-black-laptop-v2-display\.webp"/);
  assert.doesNotMatch(home + read('src/scripts/home.js'), /-v1\.31\.0\.png/);
  const guide = read('src/pages/features/start-page.astro');
  assert.doesNotMatch(guide, /<img src="\/feature-captures\/[a-z]+-v1\.31\.0\.png"/);
  assert.match(guide, /href="\/feature-captures\/ledger-v1\.38\.0\.png"/);
  // Below the opening screen, captures wait until they are scrolled near.
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // (The later wallpapers are lazy too: website-home-demos.test.js.)
  for (const capture of ['billboard-v1.38.0']) {
    assert.match(home, new RegExp(`src="${escape(`/feature-captures/${capture}.webp`)}"[^>]*loading="lazy"`), capture);
  }
});

// The homepage's floating Island window (docs/website-captures-float-island-v1.40.0.json):
// the hidden capture whole and at phone width, and the macOS window buttons
// cut from the revealed capture at exactly their measured place.
test('the floating Island window has its display copies and the window buttons’ crop', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(site, '../docs/website-captures-float-island-v1.40.0.json'), 'utf8'));
  const { trafficLightsRect: lights, scale } = ledger.measured;
  const entry = (output) => manifest.find((item) => item.output === output);
  assert.deepEqual([entry('revamp/float-island-hidden-v1.40.0-display.webp')?.width, entry('revamp/float-island-hidden-v1.40.0-display.webp')?.height], [2560, 1600]);
  assert.equal(entry('revamp/float-island-hidden-v1.40.0-800.webp')?.width, 800);
  const crop = entry('revamp/float-island-lights-v1.40.0.webp');
  assert.equal(crop?.source, 'feature-captures/float-island-revealed-v1.40.0.png');
  assert.deepEqual([crop.width, crop.height], [lights.width * scale, lights.height * scale]);
});
