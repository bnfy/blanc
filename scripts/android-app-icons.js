'use strict';

// Blanc for Android's launcher icon: the Sunrise only (design F17; alternate
// icons are after 1.0). The adaptive icon's three layers — the Sunrise field
// as the background, the mark as the foreground, and the mark's ink
// silhouette as the monochrome layer Android 13+ tints for themed icons —
// plus legacy square mipmaps for launchers that ignore adaptive icons.
// Files carry the names Chromium's own icons use (chrome/android/java/
// res_chromium_base), so patch 0101 only points chrome_base_module_resources
// at these and sets the adaptive icons' layers (res_base/drawable/ic_launcher*).

const sharp = require('sharp');

const ANDROID_RES_DIR = 'chromium/blanc/android/res';
const DENSITIES = Object.freeze([['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]);
// Adaptive layers are 108dp; launchers mask them to any shape inside the
// central 72dp, and only a 66dp circle is guaranteed visible.
const ADAPTIVE_DP = 108;
const SAFE_ZONE_DP = 66;
const LEGACY_DP = 48;
// The mark's trimmed box fits inside this share of the safe-zone circle's
// diameter, measured on its corners, so no launcher shape clips a ray.
const MARK_DIAMETER_SHARE = 0.92;
const LEGACY_CORNER_SHARE = 0.18;
// The Sunrise light field, as the desktop's enhanced icon uses it.
const FIELD = '#F7F0E5';
const INK = { r: 14, g: 14, b: 14 };
const PNG = { compressionLevel: 9, adaptiveFiltering: true };

const px = (dp, scale) => Math.round(dp * scale);

async function trimmedMark(master) {
  return sharp(master).trim({ threshold: 8 }).png().toBuffer();
}

// The mark centered on a transparent 108dp canvas, its box's diagonal held
// inside the safe zone. With a tint, the mark is painted in that one color.
async function foreground(mark, size, tint) {
  const { width, height } = await sharp(mark).metadata();
  const diameter = (SAFE_ZONE_DP / ADAPTIVE_DP) * size * MARK_DIAMETER_SHARE;
  const scale = diameter / Math.hypot(width, height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  let layer = sharp(mark).resize(w, h, { kernel: sharp.kernel.lanczos3 });
  if (tint) {
    const alpha = await layer.ensureAlpha().extractChannel(3).png().toBuffer();
    layer = sharp({ create: { width: w, height: h, channels: 3, background: tint } }).joinChannel(alpha);
  }
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await layer.png().toBuffer(), left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png(PNG)
    .toBuffer();
}

// The legacy icon: the adaptive composition's visible 72dp, rounded.
async function legacy(mark, size) {
  const canvas = Math.round(size * (ADAPTIVE_DP / 72));
  const inset = Math.round((canvas - size) / 2);
  const layer = await foreground(mark, canvas);
  const radius = Math.round(size * LEGACY_CORNER_SHARE);
  const shape = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  const visible = await sharp(layer).extract({ left: inset, top: inset, width: size, height: size }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: FIELD } })
    .composite([{ input: visible }, { input: shape, blend: 'dest-in' }])
    .png(PNG)
    .toBuffer();
}

// The adaptive background: the field, edge to edge.
const background = (size) => sharp({ create: { width: size, height: size, channels: 3, background: FIELD } }).png(PNG).toBuffer();

// Every generated file, by repository path. The monochrome layer uses the ink
// silhouette, whose disc-to-horizon hairline is closed (build-brand-assets.js).
async function androidAppIconFiles(master, inkMotif) {
  const mark = await trimmedMark(master);
  const ink = await trimmedMark(inkMotif);
  const files = {};
  for (const [density, scale] of DENSITIES) {
    const dir = `${ANDROID_RES_DIR}/mipmap-${density}`;
    files[`${dir}/app_icon.png`] = await legacy(mark, px(LEGACY_DP, scale));
    files[`${dir}/layered_app_icon.png`] = await foreground(mark, px(ADAPTIVE_DP, scale));
    files[`${dir}/layered_app_icon_background.png`] = await background(px(ADAPTIVE_DP, scale));
    files[`${ANDROID_RES_DIR}/drawable-${density}/themed_app_icon.png`] = await foreground(ink, px(ADAPTIVE_DP, scale), INK);
  }
  return files;
}

module.exports = { ANDROID_RES_DIR, DENSITIES, ADAPTIVE_DP, SAFE_ZONE_DP, LEGACY_DP, androidAppIconFiles };
