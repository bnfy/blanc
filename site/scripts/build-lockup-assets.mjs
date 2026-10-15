#!/usr/bin/env node
/*
 * Builds the Blanc lockup assets the website uses (header, footer and the
 * homepage sunrise) into site/public/lockup/.
 *
 *   - The Sunrise mark, rendered from the vector assets/sunrise-mark.svg as
 *     WebP: 2048 px for the homepage sunrise, sharp on Retina screens and when
 *     zoomed, and 256 px for lockups. The SVG sits on the same 1024 canvas as
 *     the macOS icon's raster artwork (build/app-icons/Icon.icon/Assets/
 *     sunrise-mark.png), so one set of lockup percentages and the hero's clip
 *     paths fit every file. SVG rendering can differ by a step between
 *     platforms, so --check compares these two by decoded pixels within a
 *     small tolerance; everything else must match byte for byte.
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
const MARK = path.join(ROOT, 'assets/sunrise-mark.svg');
const WORDS = path.join(ROOT, 'assets/wordmark');
const OUT = path.join(ROOT, 'site/public/lockup');
const check = process.argv.includes('--check');

const outputs = new Map();
const rendered = new Map();
for (const size of [2048, 256]) {
  const image = sharp(MARK, { density: (72 * size) / 1024 }).resize(size, size);
  const name = `sunrise-mark-${size}.webp`;
  outputs.set(name, await image.clone().webp({ quality: 95, alphaQuality: 100, effort: 6 }).toBuffer());
  rendered.set(name, await image.clone().ensureAlpha().raw().toBuffer());
}

// A committed mark export is current when its pixels are within a small
// tolerance of a fresh render: the lossy encode moves values a little, and
// librsvg differs slightly between platforms.
const MAX_MEAN_DIFF = 1.5;
const MAX_PIXEL_DIFF = 48;
async function sameMark(name, current) {
  const decoded = await sharp(current).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const expected = rendered.get(name);
  if (decoded.data.length !== expected.length) return false;
  let total = 0;
  let worst = 0;
  for (let i = 0; i < expected.length; i += 1) {
    const diff = Math.abs(decoded.data[i] - expected[i]);
    total += diff;
    if (diff > worst) worst = diff;
  }
  return total / expected.length <= MAX_MEAN_DIFF && worst <= MAX_PIXEL_DIFF;
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
  if (current && (current.equals(bytes) || (check && rendered.has(name) && (await sameMark(name, current))))) continue;
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
