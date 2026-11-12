'use strict';
// Pure policy for the Start Page's custom wallpaper (F49). No Electron here:
// the fork ports these rules (and reuses the unit tests as vectors), while
// wallpaper.js is the replaceable Electron adapter.

const SOURCES = Object.freeze(['sunrise', 'time-of-day', 'color', 'custom']);
// The wash over your image: auto follows the app theme; light and dark force
// that wash (and matching text) whatever the theme; spotlight follows the
// theme but covers only the area behind the content, leaving the edges bare.
const WASH_STYLES = Object.freeze(['auto', 'light', 'dark', 'spotlight']);
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
// Long edge of the stored copy: sharp on a 4K display, small enough to decode
// on every new tab without a visible delay.
const MAX_EDGE = 3840;
const JPEG_QUALITY = 85;
/** A stored or sent wash style, or null. */
function normalizeWashStyle(value) {
  return WASH_STYLES.includes(value) ? value : null;
}

/**
 * How strongly the theme's wash covers your image, as an integer percent
 * (100, the default, puts legibility first), or null for anything else.
 */
function normalizeWash(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

/**
 * Which wallpaper a Start Page draws. `custom` needs an image on this device
 * and never reaches a private tab; a device without one falls back to the
 * synced choice: a color (never in a private tab either), else the bundled
 * artwork the time-of-day switch selects.
 */
function effectiveSource({ dynamic, custom, color, hasImage, isPrivate }) {
  if (custom === true && hasImage === true && isPrivate !== true) return 'custom';
  if (color === true && isPrivate !== true) return 'color';
  return dynamic === true ? 'time-of-day' : 'sunrise';
}

/**
 * The settings write for a chosen source. Picking your image leaves the synced
 * time-of-day choice alone, so other devices keep what they show.
 */
function settingsForSource(source) {
  if (source === 'custom') return { newtabCustomWallpaper: true };
  // A color is a synced choice, like the time-of-day switch it leaves alone.
  if (source === 'color') return { newtabColorWallpaper: true, newtabCustomWallpaper: false };
  if (source === 'time-of-day') return { newtabDynamicWallpaper: true, newtabColorWallpaper: false, newtabCustomWallpaper: false };
  if (source === 'sunrise') return { newtabDynamicWallpaper: false, newtabColorWallpaper: false, newtabCustomWallpaper: false };
  return null;
}

/** Fit `size` inside a MAX_EDGE square without enlarging it. */
function scaledSize({ width, height }, maxEdge = MAX_EDGE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const HASH_RE = /^[0-9a-f]{16}$/;

/** The stored record, or null when it is missing, partial or hand-edited. */
function normalizeMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { hash, width, height, updatedAt } = raw;
  if (typeof hash !== 'string' || !HASH_RE.test(hash)) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) return null;
  return { version: 1, hash, width, height, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
}

// ---- JPEG orientation ----------------------------------------------------
// Re-encoding drops every metadata segment (location, camera, time), which is
// the point, but phone photos store "rotate me" in that same EXIF block. Read
// only the Orientation tag from the original and give the new file a minimal
// EXIF segment holding just that, so Chromium still draws it upright.

const ORIENTATION_TAG = 0x0112;

function readTiffOrientation(buf, tiff, end) {
  if (tiff + 8 > end) return 1;
  const order = buf.toString('latin1', tiff, tiff + 2);
  const little = order === 'II';
  if (!little && order !== 'MM') return 1;
  const u16 = (at) => (little ? buf.readUInt16LE(at) : buf.readUInt16BE(at));
  const u32 = (at) => (little ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  if (u16(tiff + 2) !== 42) return 1;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) !== ORIENTATION_TAG) continue;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

/** EXIF Orientation (1–8) of a JPEG buffer; 1 for anything else. */
function readJpegOrientation(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let at = 2;
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff) return 1;
    const marker = buf[at + 1];
    // Start of scan: no metadata after this point.
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = buf.readUInt16BE(at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > buf.length) return 1;
    if (marker === 0xe1 && length >= 8 && buf.toString('latin1', at + 4, at + 10) === 'Exif\0\0') {
      return readTiffOrientation(buf, at + 10, end);
    }
    at = end;
  }
  return 1;
}

/** `jpeg` with a one-tag EXIF segment carrying `orientation` (unchanged for 1). */
function withOrientation(jpeg, orientation) {
  if (!Buffer.isBuffer(jpeg) || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) return jpeg;
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 follows the header
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(ORIENTATION_TAG, 10);
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  // bytes 20–21 pad the value; 22–25 are the zero "next IFD" offset
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

module.exports = {
  SOURCES,
  WASH_STYLES,
  normalizeWashStyle,
  MAX_INPUT_BYTES,
  MAX_EDGE,
  JPEG_QUALITY,
  normalizeWash,
  effectiveSource,
  settingsForSource,
  scaledSize,
  normalizeMeta,
  readJpegOrientation,
  withOrientation,
};
