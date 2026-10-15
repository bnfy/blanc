#!/usr/bin/env node
/*
 * Blubird is a commercial typeface (Rajesh Rajput). Its licence lets Blanc use
 * it on the website but forbids redistributing the font files, and this
 * repository is public, so the files are never committed. They live in the
 * git-ignored site/public/fonts/blubird/ on the machine that deploys, and the
 * build copies them into site/dist like any other public file. Without them the
 * site falls back to Inter, which is what CI and contributors see.
 *
 *   node site/scripts/blubird-fonts.mjs install /path/to/Blubird.zip
 *   node site/scripts/blubird-fonts.mjs check          (fonts installed?)
 *   node site/scripts/blubird-fonts.mjs check --dist   (fonts in site/dist? run by site:deploy)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'Blubird-RegularDisplay.woff2',
  'Blubird-RegularText.woff2',
  'Blubird-MediumText.woff2',
  'Blubird-SemiBoldText.woff2',
];
const [command, arg] = process.argv.slice(2);

function missingIn(dir) {
  return FILES.filter(name => {
    const file = path.join(dir, name);
    return !fs.existsSync(file) || fs.statSync(file).size === 0;
  });
}

if (command === 'install') {
  if (!arg || !fs.existsSync(arg)) {
    console.error('Usage: node site/scripts/blubird-fonts.mjs install /path/to/Blubird.zip');
    process.exit(1);
  }
  const target = path.join(SITE, 'public/fonts/blubird');
  fs.mkdirSync(target, { recursive: true });
  for (const name of FILES) {
    const bytes = fs.statSync(arg).isDirectory()
      ? fs.readFileSync(path.join(arg, name))
      : execFileSync('unzip', ['-p', arg, `Blubird/Web-PS/${name}`], { maxBuffer: 8 * 1024 * 1024 });
    if (!bytes.length) throw new Error(`${name} is missing from ${arg}`);
    fs.writeFileSync(path.join(target, name), bytes);
    console.log(`Installed site/public/fonts/blubird/${name}`);
  }
} else if (command === 'check') {
  const dist = arg === '--dist';
  const dir = path.join(SITE, dist ? 'dist/fonts/blubird' : 'public/fonts/blubird');
  const missing = missingIn(dir);
  if (missing.length) {
    console.error(`Blubird is missing from ${path.relative(path.dirname(SITE), dir)}: ${missing.join(', ')}.`);
    console.error('The site would fall back to Inter. Install the licensed fonts first:');
    console.error('  npm run site:fonts -- /path/to/Blubird.zip');
    process.exit(1);
  }
  console.log(`Blubird fonts present in ${path.relative(path.dirname(SITE), dir)}.`);
} else {
  console.error('Usage: blubird-fonts.mjs install <zip-or-folder> | check [--dist]');
  process.exit(1);
}
