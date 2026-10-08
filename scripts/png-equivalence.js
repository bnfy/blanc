'use strict';

const sharp = require('sharp');

// libvips/librsvg round a handful of anti-aliased pixels one level apart on
// macOS and Linux, so the same sources produce PNGs that differ by bytes but
// not by any visible amount. Two PNGs are equivalent when they decode to the
// same dimensions and every channel is within `tolerance` levels; a real
// artwork, colour or geometry change moves far more than one level.
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
  for (let index = 0; index < left.data.length; index += 1) {
    if (Math.abs(left.data[index] - right.data[index]) > tolerance) return false;
  }
  return true;
}

module.exports = { pngsEquivalent };
