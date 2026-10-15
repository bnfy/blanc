#!/usr/bin/env node
/*
 * Builds the Blanc lockup assets the website uses (header, footer and the
 * homepage sunrise) into site/public/lockup/.
 *
 *   - The Sunrise mark, from the canonical 1024 px artwork the macOS icon also
 *     uses (build/app-icons/Icon.icon/Assets/sunrise-mark.png), re-encoded as
 *     WebP at full size for the homepage sunrise and at 256 px for lockups.
 *     Both keep the 1024 canvas geometry, so one set of lockup percentages and
 *     the hero's clip paths fit either file.
 *   - The outlined "Blanc" wordmark in Blubird Regular Display (large sizes)
 *     and Blubird Regular Text (about 32 px tall and under), copied unchanged
 *     from assets/wordmark/. They are outlines drawn from the licensed font,
 *     not font files, so they can live in the repository.
 *
 *   node site/scripts/build-lockup-assets.mjs           (write)
 *   node site/scripts/build-lockup-assets.mjs --check   (fail if stale)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARK = path.join(ROOT, 'build/app-icons/Icon.icon/Assets/sunrise-mark.png');
const WORDS = path.join(ROOT, 'assets/wordmark');
const OUT = path.join(ROOT, 'site/public/lockup');
const check = process.argv.includes('--check');

const outputs = new Map();
for (const size of [1024, 256]) {
  const image = sharp(MARK).resize(size, size);
  outputs.set(`sunrise-mark-${size}.webp`, await image.webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer());
}
for (const name of fs.readdirSync(WORDS).filter(name => name.endsWith('.svg')).sort()) {
  outputs.set(name, fs.readFileSync(path.join(WORDS, name)));
}

// Read the current file directly rather than checking for it first, so there
// is no window between a check and the write that follows.
const readCurrent = (target) => {
  try {
    return fs.readFileSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const stale = [];
for (const [name, bytes] of outputs) {
  const target = path.join(OUT, name);
  const current = readCurrent(target);
  if (current && current.equals(bytes)) continue;
  if (check) stale.push(name);
  else {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(target, bytes);
    console.log(`Wrote site/public/lockup/${name}`);
  }
}
const extra = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(name => !outputs.has(name)) : [];
if (check && (stale.length || extra.length)) {
  console.error(`site/public/lockup is stale: ${[...stale, ...extra.map(name => `${name} (not generated)`)].join(', ')}.`);
  console.error('Run node site/scripts/build-lockup-assets.mjs and commit the result.');
  process.exit(1);
}
if (check) console.log('site/public/lockup matches its sources.');
