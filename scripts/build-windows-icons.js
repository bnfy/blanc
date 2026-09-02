#!/usr/bin/env node
// Build Blanc's fixed Sunrise application icon for Windows. Windows gets the
// freestanding mark rather than the macOS square tile, with a small optical
// margin so it reads at the same scale as neighboring taskbar icons. The ICO
// embeds raster frames for the sizes Windows commonly asks for instead of
// relying on Electron to downsample one large PNG at runtime.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'build/app-icons/Icon.icon/Assets/sunrise-mark.png');
const OUTPUT_DIR = path.join(ROOT, 'build/windows-icons');
const OUTPUT_ICON = path.join(OUTPUT_DIR, 'icon-sunrise.ico');
const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const WINDOWS_VISIBLE_SCALE = 1;

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
    .resize(visibleSize, visibleSize, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
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

async function createWindowsIcon() {
  const metadata = await sharp(SOURCE_ICON).metadata();
  if (metadata.width !== metadata.height) {
    throw new Error(`${path.relative(ROOT, SOURCE_ICON)} must be a square PNG`);
  }

  const windowsSource = await sharp(SOURCE_ICON)
    .ensureAlpha()
    .trim()
    .png()
    .toBuffer();

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
  if (check) console.log('Windows app icon is current (fixed Sunrise icon).');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  ICON_SIZES,
  SOURCE_ICON,
  WINDOWS_VISIBLE_SCALE,
  createIco,
};
