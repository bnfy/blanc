// Derives lighter display copies of large site images. The sources stay
// untouched (several are hash-pinned release captures); each copy records its
// source's SHA-256 in src/data/display-images.json so a changed source is
// caught by test/unit/website-display-images.test.js.
//
//   node site/scripts/build-display-images.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = file => join(site, 'public', file);

// Island captures: 800px phone copies (served below 760px via <picture>).
// Start Page layout captures: full-size WebP display copies that keep their
// Display P3 profile; the PNGs remain the linked full-size originals.
const jobs = [
  ...['rest', 'tabs', 'command'].flatMap(name => [
    { source: `revamp/island-roman-${name}.webp`, output: `revamp/island-roman-${name}-800.webp`, width: 800 },
    // Full-size lossy copy for desktops; the lossless original stays pinned.
    { source: `revamp/island-roman-${name}.webp`, output: `revamp/island-roman-${name}-display.webp` },
  ]),
  // The homepage's Island stage: public v1.36.0 over the Smithsonian American
  // Art Museum (docs/website-captures-v1.36.0.json, island). The stage is
  // about 940 CSS px wide, so desktops get the wide crop at full size (1:1 on
  // a 2x screen); phones and the /features tiles get the tighter crop, where
  // the Island stays large enough to read.
  ...['rest', 'tabs', 'command'].flatMap(name => [
    { source: `revamp/island-smithsonian-${name}-v1.36.0.webp`, output: `revamp/island-smithsonian-${name}-v1.36.0-800.webp`, width: 800 },
    { source: `revamp/island-smithsonian-${name}-v1.36.0.webp`, output: `revamp/island-smithsonian-${name}-v1.36.0-1400.webp` },
    { source: `revamp/island-smithsonian-${name}-v1.36.0-wide.webp`, output: `revamp/island-smithsonian-${name}-v1.36.0-display.webp` },
  ]),
  // Glance demo: a phone copy of the wide Nyhavn photo. (A WebP copy of the
  // noisy Kusama JPEG came out larger than the original, so it stays as is.)
  { source: 'revamp/glance-nyhavn.webp', output: 'revamp/glance-nyhavn-800.webp', width: 800 },
  // Device frames (lossless, pinned in docs/website-revamp-assets.json).
  ...['champagne-desktop-v2', 'space-black-laptop-v2'].map(name => ({
    source: `revamp/${name}.webp`,
    output: `revamp/${name}-display.webp`,
  })),
  ...['ledger', 'billboard', 'shelf', 'tally'].map(name => ({
    source: `feature-captures/${name}-v1.31.0.png`,
    output: `feature-captures/${name}-v1.31.0.webp`,
  })),
  // Public v1.35.0 captures shown on the homepage and /features
  // (docs/website-captures-v1.35.0.json).
  ...['ledger', 'billboard', 'shelf', 'tally', 'mahjong'].map(name => ({
    source: `feature-captures/${name}-v1.35.0.png`,
    output: `feature-captures/${name}-v1.35.0.webp`,
  })),
  { source: 'feature-captures/mahjong-v1.21.0.png', output: 'feature-captures/mahjong-v1.21.0.webp' },
  // Blanc Mail screenshots (capture-public-shots.sh in bnfy/blanc-mail):
  // 1100px copies for MailShot's srcset; the 2200px captures stay as taken.
  ...['main', 'dark', 'island', 'zero', 'zero-night', 'rules'].map(name => ({
    source: `mail/screens/${name}.webp`,
    output: `mail/screens/${name}-1100.webp`,
    width: 1100,
  })),
  // The homepage's first screen: the floating Island from public v1.40.0
  // (docs/website-captures-float-island-v1.40.0.json). The hidden capture is
  // the window; the macOS buttons are cut from the revealed one at their
  // measured place (the system draws them, not the app).
  { source: 'feature-captures/float-island-hidden-v1.40.0.png', output: 'revamp/float-island-hidden-v1.40.0-display.webp' },
  { source: 'feature-captures/float-island-hidden-v1.40.0.png', output: 'revamp/float-island-hidden-v1.40.0-800.webp', width: 800 },
  { source: 'feature-captures/float-island-revealed-v1.40.0.png', output: 'revamp/float-island-lights-v1.40.0.webp', extract: floatIslandLights() },
];

function floatIslandLights() {
  const { measured } = JSON.parse(readFileSync(join(site, '../docs/website-captures-float-island-v1.40.0.json'), 'utf8'));
  const { trafficLightsRect: rect, scale } = measured;
  return { left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = [];
for (const job of jobs) {
  const input = readFileSync(pub(job.source));
  let image = sharp(input).keepIccProfile();
  if (job.extract) image = image.extract(job.extract);
  if (job.width) image = image.resize({ width: job.width });
  const { data, info } = await image.webp({ quality: 88, alphaQuality: 100, effort: 6 }).toBuffer({ resolveWithObject: true });
  writeFileSync(pub(job.output), data);
  manifest.push({ source: job.source, sourceSha256: sha256(input), output: job.output, width: info.width, height: info.height });
  console.log(`${job.output}: ${Math.round(input.length / 1024)}K -> ${Math.round(data.length / 1024)}K`);
}
writeFileSync(join(site, 'src/data/display-images.json'), JSON.stringify(manifest, null, 2) + '\n');
