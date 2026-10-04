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
  // Device frames (lossless, pinned in docs/website-revamp-assets.json).
  ...['champagne-desktop-v2', 'space-black-laptop-v2'].map(name => ({
    source: `revamp/${name}.webp`,
    output: `revamp/${name}-display.webp`,
  })),
  ...['ledger', 'billboard', 'shelf', 'tally', 'mahjong'].map(name => ({
    source: `feature-captures/${name}-v1.21.0.png`,
    output: `feature-captures/${name}-v1.21.0.webp`,
  })),
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = [];
for (const job of jobs) {
  const input = readFileSync(pub(job.source));
  let image = sharp(input).keepIccProfile();
  if (job.width) image = image.resize({ width: job.width });
  const { data, info } = await image.webp({ quality: 88, alphaQuality: 100, effort: 6 }).toBuffer({ resolveWithObject: true });
  writeFileSync(pub(job.output), data);
  manifest.push({ source: job.source, sourceSha256: sha256(input), output: job.output, width: info.width, height: info.height });
  console.log(`${job.output}: ${Math.round(input.length / 1024)}K -> ${Math.round(data.length / 1024)}K`);
}
writeFileSync(join(site, 'src/data/display-images.json'), JSON.stringify(manifest, null, 2) + '\n');
