#!/usr/bin/env node
// Build Blanc's one fixed Windows application icon.
//
// The shared 1024px PNGs intentionally include macOS-style breathing room:
// their visible tile is 824px wide inside the canvas. Windows scales the full
// canvas into its taskbar slot, making that layout look materially smaller than
// native Windows apps. Each ICO therefore trims the shared transparent margin,
// uses the full native icon canvas, and embeds raster frames for the
// taskbar/display scaling sizes Windows commonly requests.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'build/icon.png');
const OUTPUT_DIR = path.join(ROOT, 'build/windows-icons');
const OUTPUT_ICON = path.join(OUTPUT_DIR, 'icon-paper.ico');
const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const WINDOWS_VISIBLE_SCALE = 1;
// The full Paper tile now matches Windows' native taskbar footprint, but the
// shared macOS composition leaves its mark visually smaller than neighboring
// Windows glyphs. Scale only that central region; macOS keeps its source art.
const WINDOWS_MARK_SCALE = 1.1;
// Bounds inside the trimmed 824px Paper tile, including an 8px white guard
// around the 460x544 mark so resampling preserves its antialiased edge.
const WINDOWS_MARK_REGION = { left: 198, top: 132, width: 476, height: 560 };

function createIco(frames) {
  const headerSize = 6;
  const entrySize = 16;
  let imageOffset = headerSize + (entrySize * frames.length);
  const header = Buffer.alloc(imageOffset);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  frames.forEach(({ size, png }, index) => {
    const offset = headerSize + (index * entrySize);
    header.writeUInt8(size === 256 ? 0 : size, offset);
    header.writeUInt8(size === 256 ? 0 : size, offset + 1);
    header.writeUInt8(0, offset + 2);
    header.writeUInt8(0, offset + 3);
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(png.length, offset + 8);
    header.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([header, ...frames.map(({ png }) => png)]);
}

async function createFrame(trimmedSource, size) {
  const visibleSize = Math.max(1, Math.round(size * WINDOWS_VISIBLE_SCALE));
  const horizontalMargin = size - visibleSize;
  const verticalMargin = size - visibleSize;
  return sharp(trimmedSource)
    .resize(visibleSize, visibleSize, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .extend({
      left: Math.floor(horizontalMargin / 2),
      right: Math.ceil(horizontalMargin / 2),
      top: Math.floor(verticalMargin / 2),
      bottom: Math.ceil(verticalMargin / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function enlargeWindowsMark(trimmedSource, tileSize) {
  const region = WINDOWS_MARK_REGION;
  const width = Math.round(region.width * WINDOWS_MARK_SCALE);
  const height = Math.round(region.height * WINDOWS_MARK_SCALE);
  const left = Math.round(region.left + ((region.width - width) / 2));
  const top = Math.round(region.top + ((region.height - height) / 2));
  const enlarged = await sharp(trimmedSource)
    .extract(region)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  if (left < 0 || top < 0 || left + width > tileSize || top + height > tileSize) {
    throw new Error('Windows mark enlargement exceeds the Paper tile');
  }
  return sharp(trimmedSource)
    .composite([{ input: enlarged, left, top }])
    .png()
    .toBuffer();
}

async function createWindowsIcon() {
  const metadata = await sharp(SOURCE_ICON).metadata();
  if (metadata.width !== metadata.height || !metadata.hasAlpha) {
    throw new Error(`${path.relative(ROOT, SOURCE_ICON)} must be a square PNG with alpha`);
  }

  const { data: trimmedSource, info } = await sharp(SOURCE_ICON)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== info.height) {
    throw new Error(`${path.relative(ROOT, SOURCE_ICON)} has non-square visible bounds`);
  }
  const windowsSource = await enlargeWindowsMark(trimmedSource, info.width);

  const frames = [];
  for (const size of ICON_SIZES) {
    frames.push({ size, png: await createFrame(windowsSource, size) });
  }
  return createIco(frames);
}

async function main() {
  const check = process.argv.includes('--check');
  if (!check) await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const expected = await createWindowsIcon();
  const actual = await fs.readFile(OUTPUT_ICON).catch(() => null);
  if (check && (!actual || !actual.equals(expected))) {
    throw new Error(
      `Windows app icon is missing or stale:\n  ${path.relative(ROOT, OUTPUT_ICON)}\n`
      + 'Run npm run icons:windows:build and commit the generated ICO files.'
    );
  }
  if (!check && (!actual || !actual.equals(expected))) {
    await fs.writeFile(OUTPUT_ICON, expected);
    console.log(`wrote ${path.relative(ROOT, OUTPUT_ICON)}`);
  }
  if (check) console.log('Windows app icon is current (fixed Paper icon).');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  ICON_SIZES,
  WINDOWS_MARK_SCALE,
  WINDOWS_VISIBLE_SCALE,
  createIco,
};
