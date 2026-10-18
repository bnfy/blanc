'use strict';
// Electron adapter for the Start Page's custom wallpaper (F49). The chosen
// file is decoded, downscaled and re-encoded here, so the stored copy carries
// no location or camera metadata. It lives in this device's userData, never
// in settings and never in Profile Sync. Policy lives in wallpaper-model.js.

const { app, nativeImage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { JsonStore } = require('./store');
const {
  MAX_INPUT_BYTES, JPEG_QUALITY, scaledSize, normalizeMeta, readJpegOrientation, withOrientation,
} = require('./wallpaper-model');

const EMPTY = Object.freeze({ version: 1, hash: '', width: 0, height: 0, updatedAt: 0 });
// Unguessable for this launch: blanc:// answers any page's request, and only
// the Start Page is told this name, so a website cannot embed the photo.
const servedName = `user-wallpaper-${crypto.randomBytes(16).toString('hex')}.jpg`;

let store = null;
const ensureStore = () => (store ??= new JsonStore('wallpaper', EMPTY));
const imageDir = () => path.join(app.getPath('userData'), 'wallpaper');
const imageFile = () => path.join(imageDir(), 'current.jpg');

/** The stored image's record, or null when there is no usable image. */
function current() {
  const meta = normalizeMeta(ensureStore().data);
  if (!meta) return null;
  try {
    return fs.statSync(imageFile()).isFile() ? meta : null;
  } catch {
    return null;
  }
}

/** The Start Page URL for the stored image, or null. */
function imageUrl() {
  const meta = current();
  return meta ? `blanc://newtab/${servedName}?v=${meta.hash}` : null;
}

async function writeAtomically(file, bytes) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.promises.open(temp, 'w', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(temp, file);
}

/**
 * Store `filePath` as the wallpaper. Returns `{ ok: true }` or `{ error }`
 * with a fixed id: too-large | unsupported | unreadable.
 */
async function importFile(filePath) {
  let bytes;
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) return { error: 'unreadable' };
    if (stat.size > MAX_INPUT_BYTES) return { error: 'too-large' };
    bytes = await handle.readFile();
  } catch {
    return { error: 'unreadable' };
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
  // createFromBuffer decodes PNG and JPEG on every platform, which keeps the
  // accepted formats the same on macOS, Windows and Linux.
  const decoded = nativeImage.createFromBuffer(bytes);
  if (decoded.isEmpty()) return { error: 'unsupported' };
  const original = decoded.getSize();
  const size = scaledSize(original);
  const resized = size.width === original.width ? decoded : decoded.resize({ ...size, quality: 'best' });
  const jpeg = withOrientation(resized.toJPEG(JPEG_QUALITY), readJpegOrientation(bytes));
  try {
    await writeAtomically(imageFile(), jpeg);
  } catch {
    return { error: 'unreadable' };
  }
  const hash = crypto.createHash('sha256').update(jpeg).digest('hex').slice(0, 16);
  ensureStore().updateAndFlush((data) => {
    Object.assign(data, { version: 1, hash, ...size, updatedAt: Date.now() });
  });
  return { ok: true };
}

async function remove() {
  ensureStore().updateAndFlush((data) => { Object.assign(data, EMPTY); });
  await fs.promises.rm(imageFile(), { force: true }).catch(() => {});
}

/** Whether a blanc://newtab path names this launch's stored image. */
function isServedPath(pathname) {
  return pathname === `/${servedName}`;
}

/** The stored image as a Response (404 when there is none). */
async function serve() {
  if (!current()) return new Response('Not found', { status: 404 });
  try {
    const bytes = await fs.promises.readFile(imageFile());
    return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

module.exports = { current, imageUrl, importFile, remove, isServedPath, serve };
