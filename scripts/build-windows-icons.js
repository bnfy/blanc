#!/usr/bin/env node
// Build Blanc's fixed Sunrise application icon for Windows. Windows gets the
// freestanding canonical mark rather than the macOS square tile. Its three
// shortest reflection lines are omitted before the artwork is uniformly
// scaled, preserving the original sun, horizon, rays, and their proportions.
// The ICO embeds raster frames for the sizes Windows commonly asks for instead
// of relying on Electron to downsample one large PNG at runtime.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'build/app-icons/Icon.icon/Assets/sunrise-mark.png');
const OUTPUT_DIR = path.join(ROOT, 'build/windows-icons');
const OUTPUT_ICON = path.join(OUTPUT_DIR, 'icon-sunrise.ico');
const ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
// The two widest reflection lines end at y=783 in the canonical 1024px source.
// Cropping at 784 removes only the three shorter lines below them.
const WINDOWS_SOURCE_CROP_HEIGHT = 784;
const WINDOWS_VISIBLE_SCALE = 1;
const WINDOWS_PIXEL_DELTA_TOLERANCE = 3;

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

function icoFrames(ico) {
  if (!ico || ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) return null;
  const count = ico.readUInt16LE(4);
  if (!count || ico.length < 6 + (count * 16)) return null;
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + (index * 16);
    const width = ico.readUInt8(entryOffset) || 256;
    const height = ico.readUInt8(entryOffset + 1) || 256;
    const byteLength = ico.readUInt32LE(entryOffset + 8);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);
    if (width !== height || !byteLength || imageOffset + byteLength > ico.length) return null;
    frames.push({ size: width, png: ico.subarray(imageOffset, imageOffset + byteLength) });
  }
  return frames;
}

async function sameIcoPixels(actual, expected, { reportDifference = false } = {}) {
  const actualFrames = icoFrames(actual);
  const expectedFrames = icoFrames(expected);
  if (!actualFrames || !expectedFrames || actualFrames.length !== expectedFrames.length) return false;

  let worstDifference = { size: 0, maxDelta: 0 };
  for (let index = 0; index < expectedFrames.length; index += 1) {
    const actualFrame = actualFrames[index];
    const expectedFrame = expectedFrames[index];
    if (actualFrame.size !== expectedFrame.size) return false;
    const [actualImage, expectedImage] = await Promise.all([
      sharp(actualFrame.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(expectedFrame.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    if (actualImage.info.width !== expectedImage.info.width
      || actualImage.info.height !== expectedImage.info.height
      || actualImage.info.channels !== expectedImage.info.channels
      || actualImage.data.length !== expectedImage.data.length) return false;
    let maxDelta = 0;
    for (let offset = 0; offset < actualImage.data.length; offset += 4) {
      const actualAlpha = actualImage.data[offset + 3];
      const expectedAlpha = expectedImage.data[offset + 3];
      maxDelta = Math.max(maxDelta, Math.abs(actualAlpha - expectedAlpha));
      for (let channel = 0; channel < 3; channel += 1) {
        const actualPremultiplied = Math.round((actualImage.data[offset + channel] * actualAlpha) / 255);
        const expectedPremultiplied = Math.round((expectedImage.data[offset + channel] * expectedAlpha) / 255);
        maxDelta = Math.max(maxDelta, Math.abs(actualPremultiplied - expectedPremultiplied));
      }
    }
    if (maxDelta > worstDifference.maxDelta) {
      worstDifference = { size: actualFrame.size, maxDelta };
    }
  }
  if (worstDifference.maxDelta > WINDOWS_PIXEL_DELTA_TOLERANCE) {
    if (reportDifference) {
      console.error(`Windows icon frame ${worstDifference.size}px differs by up to ${worstDifference.maxDelta} visible channel values.`);
    }
    return false;
  }
  return true;
}

async function createFrame(trimmedSource, size) {
  const visibleSize = Math.max(1, Math.round(size * WINDOWS_VISIBLE_SCALE));
  const horizontalMargin = size - visibleSize;
  const verticalMargin = size - visibleSize;
  const resized = await sharp(trimmedSource)
    .resize(visibleSize, visibleSize, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: resized,
      left: Math.floor(horizontalMargin / 2),
      top: Math.floor(verticalMargin / 2),
    }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function createWindowsIcon() {
  const metadata = await sharp(SOURCE_ICON).metadata();
  if (metadata.width !== metadata.height) {
    throw new Error(`${path.relative(ROOT, SOURCE_ICON)} must be a square PNG`);
  }

  const croppedSource = await sharp(SOURCE_ICON)
    .extract({
      left: 0,
      top: 0,
      width: metadata.width,
      height: WINDOWS_SOURCE_CROP_HEIGHT,
    })
    .png()
    .toBuffer();

  const windowsSource = await sharp(croppedSource)
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
  const current = actual && (actual.equals(expected)
    || await sameIcoPixels(actual, expected, { reportDifference: check }));
  if (check && !current) {
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
  WINDOWS_PIXEL_DELTA_TOLERANCE,
  WINDOWS_SOURCE_CROP_HEIGHT,
  WINDOWS_VISIBLE_SCALE,
  createIco,
  sameIcoPixels,
};
