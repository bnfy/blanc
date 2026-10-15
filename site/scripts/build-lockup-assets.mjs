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
 *     paths fit every file. librsvg renders the SVG slightly differently on
 *     each platform, so --check never re-renders it: writing records the
 *     SVG's sha256 and each export's in site/scripts/lockup-mark.lock.json,
 *     and --check requires the SVG and the committed exports to match it.
 *     Changing the SVG therefore means running this script and committing
 *     the new exports and lock together.
 *   - The outlined "Blanc" wordmark in Blubird Regular Display (large sizes)
 *     and Blubird Regular Text (about 32 px tall and under), copied unchanged
 *     from assets/wordmark/. They are outlines drawn from the licensed font,
 *     not font files, so they can live in the repository.
 *
 *   node site/scripts/build-lockup-assets.mjs           (write)
 *   node site/scripts/build-lockup-assets.mjs --check   (fail if stale)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARK = path.join(ROOT, 'assets/sunrise-mark.svg');
const WORDS = path.join(ROOT, 'assets/wordmark');
const OUT = path.join(ROOT, 'site/public/lockup');
const check = process.argv.includes('--check');

const LOCK = path.join(ROOT, 'site/scripts/lockup-mark.lock.json');
const MARK_SIZES = [2048, 256];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const markSha = sha256(fs.readFileSync(MARK));

const outputs = new Map();
// Mark exports: rendered when writing; in --check, the expected sha256 from
// the lock (and the lock must name the current SVG).
const expectedMark = new Map();
const problems = [];
if (check) {
  let lock = null;
  try {
    lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  } catch {
    problems.push('site/scripts/lockup-mark.lock.json is missing or unreadable');
  }
  if (lock && lock.source?.sha256 !== markSha) problems.push('assets/sunrise-mark.svg changed since its exports were rendered');
  for (const size of MARK_SIZES) {
    const name = `sunrise-mark-${size}.webp`;
    expectedMark.set(name, lock?.exports?.[name] ?? '');
  }
} else {
  const lock = { source: { file: 'assets/sunrise-mark.svg', sha256: markSha }, exports: {} };
  for (const size of MARK_SIZES) {
    const name = `sunrise-mark-${size}.webp`;
    const bytes = await sharp(MARK, { density: (72 * size) / 1024 })
      .resize(size, size)
      .webp({ quality: 95, alphaQuality: 100, effort: 6 })
      .toBuffer();
    outputs.set(name, bytes);
    lock.exports[name] = sha256(bytes);
  }
  fs.writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
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
for (const [name, expected] of expectedMark) {
  const current = readCurrent(path.join(OUT, name));
  if (!current || sha256(current) !== expected) stale.push(name);
}
const generated = new Set([...outputs.keys(), ...expectedMark.keys()]);
const extra = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter(name => !generated.has(name)) : [];
for (const problem of problems) console.error(problem);
if (check && (problems.length || stale.length || extra.length)) {
  const listed = [...stale, ...extra.map(name => `${name} (not generated)`)];
  if (listed.length) console.error(`site/public/lockup is stale: ${listed.join(', ')}.`);
  console.error('Run node site/scripts/build-lockup-assets.mjs and commit the result.');
  process.exit(1);
}
if (check) console.log('site/public/lockup matches its sources.');
