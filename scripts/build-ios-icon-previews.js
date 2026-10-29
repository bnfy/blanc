#!/usr/bin/env node
'use strict';

// Renders the iPhone App icon picker's previews: each icon package from
// ios-app-icons.js drawn by Icon Composer itself, in Light and Dark, so the
// picker shows what the Home Screen will. ictool exists only on a Mac with
// Icon Composer, so CI never re-renders: this writes a lock recording each
// package's digest and each preview's sha256, and
// test/unit/ios-app-icons.test.js fails when a package changes without its
// previews being rendered again. Run after npm run brand:build changes a
// package: npm run ios:icon-previews

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { IOS_APP_ICONS, IOS_APP_ICON_DIR, packageDigest } = require('./ios-app-icons');

const ROOT = path.join(__dirname, '..');
const ICTOOL = '/Applications/Icon Composer.app/Contents/Executables/ictool';
const CATALOG = path.join(ROOT, 'ios/Blanc/Blanc/Assets.xcassets');
const LOCK = path.join(ROOT, 'ios/Blanc/app-icon-previews.lock.json');
// The picker draws previews at 60 pt, the Home Screen's size; @3x.
const POINTS = 60;
const SCALE = 3;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function render(packageDir, rendition, output) {
  execFileSync(ICTOOL, [
    packageDir, '--export-image', '--output-file', output, '--platform', 'iOS', '--rendition', rendition,
    '--width', String(POINTS), '--height', String(POINTS), '--scale', String(SCALE),
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
}

function imageSet(name) {
  return {
    images: [
      { filename: `${name}.png`, idiom: 'universal', scale: '3x' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: `${name}-dark.png`, idiom: 'universal', scale: '3x' },
    ],
    info: { author: 'xcode', version: 1 },
  };
}

async function main() {
  if (process.platform !== 'darwin' || !fs.existsSync(ICTOOL)) {
    throw new Error(`ios:icon-previews needs a Mac with Icon Composer (${ICTOOL}).`);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-icon-previews-'));
  const lock = { icons: {} };
  try {
    for (const { nativeName } of IOS_APP_ICONS) {
      const packageDir = path.join(ROOT, IOS_APP_ICON_DIR, `${nativeName}.icon`);
      const setDir = path.join(CATALOG, `AppIconPreview-${nativeName}.imageset`);
      fs.mkdirSync(setDir, { recursive: true });
      const previews = {};
      for (const [key, rendition, file] of [['light', 'Default', `${nativeName}.png`], ['dark', 'Dark', `${nativeName}-dark.png`]]) {
        const raw = path.join(work, `${nativeName}-${rendition}.png`);
        render(packageDir, rendition, raw);
        // ictool writes 16-bit PNGs; the app needs no more than 8.
        const png = await sharp(raw).toColourspace('srgb').png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
        fs.writeFileSync(path.join(setDir, file), png);
        previews[key] = sha256(png);
      }
      fs.writeFileSync(path.join(setDir, 'Contents.json'), `${JSON.stringify(imageSet(nativeName), null, 2)}\n`);
      lock.icons[nativeName] = { package: packageDigest(packageDir), ...previews };
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  fs.writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Rendered ${IOS_APP_ICONS.length * 2} App icon previews.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
