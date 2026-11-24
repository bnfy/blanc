#!/usr/bin/env node
// The homepage hero's device slides (site/src/components/DeviceTour.astro)
// show Blanc for iPhone and iPad as App Store version 1.1 draws it: the
// captures in docs/ios/app-store/captures/, taken from the running app for the
// 1.1 screenshots (docs/ios/app-store-listing.md). This exports them as WebP
// for the website, resized only: no crop, no retouching. The frames around
// them are drawn in CSS.
//
//   node scripts/build-device-hero-images.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEVICE_HERO_IMAGES = Object.freeze([
  { capture: 'docs/ios/app-store/captures/1-start.png', out: 'site/public/devices/iphone-start-1.1', widths: [660] },
  { capture: 'docs/ios/app-store/captures/ipad-13/2-split.png', out: 'site/public/devices/ipad-split-view-1.1', widths: [840, 1680] },
  { capture: 'docs/ios/app-store/captures/duo-open/1-start.png', out: 'site/public/devices/duo-unfolded-start-1.1', widths: [780, 1560] },
  { capture: 'docs/ios/app-store/captures/duo-closed/3-spaces.png', out: 'site/public/devices/duo-folded-spaces-1.1', widths: [640] },
]);

export const outputFile = (image, width) => `${image.out}-${width}.webp`;

async function build() {
  for (const image of DEVICE_HERO_IMAGES) {
    for (const width of image.widths) {
      const file = outputFile(image, width);
      await sharp(path.join(root, image.capture))
        .resize({ width })
        .webp({ quality: 86, effort: 6 })
        .toFile(path.join(root, file));
      console.log(file);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
