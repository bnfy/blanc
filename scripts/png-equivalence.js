'use strict';

const sharp = require('sharp');

// libvips/librsvg round a handful of anti-aliased pixels one level apart on
// macOS and Linux, so the same sources produce PNGs that differ by bytes but
// not by any visible amount. Two PNGs are equivalent when they decode to the
// same dimensions and every channel is within `tolerance` levels; a real
// artwork, colour or geometry change moves far more than one level.
// Colour is compared as it is seen, weighted by its alpha: librsvg rasterizes
// with premultiplied 8-bit colour, so a nearly transparent pixel's stored RGB
// can swing from 0 to 255 on a one-level rounding difference (a gradient
// fading to clear, as in the iPhone icons' glow layers) while drawing the
// same.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

async function decode(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function pngsEquivalent(a, b, tolerance = 1) {
  if (!isPng(a) || !isPng(b)) return false;
  let left;
  let right;
  try {
    [left, right] = await Promise.all([decode(a), decode(b)]);
  } catch {
    return false;
  }
  if (left.info.width !== right.info.width
      || left.info.height !== right.info.height
      || left.info.channels !== right.info.channels) {
    return false;
  }
  const l = left.data;
  const r = right.data;
  for (let pixel = 0; pixel < l.length; pixel += 4) {
    const alphaL = l[pixel + 3];
    const alphaR = r[pixel + 3];
    if (Math.abs(alphaL - alphaR) > tolerance) return false;
    for (let channel = pixel; channel < pixel + 3; channel += 1) {
      const seenL = Math.round((l[channel] * alphaL) / 255);
      const seenR = Math.round((r[channel] * alphaR) / 255);
      if (Math.abs(seenL - seenR) > tolerance) return false;
    }
  }
  return true;
}

module.exports = { pngsEquivalent };
