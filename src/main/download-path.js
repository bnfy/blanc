'use strict';

// Picks where a download lands when Blanc saves it without asking (#1591):
// the suggested name in the folder, else "name (1).ext" ... "name (100).ext",
// then gives up so the caller shows Save As. Pure, so it never touches the
// disk itself: the caller passes `claim` (or `exists`) and the names other
// in-flight downloads have already reserved.

const path = require('path');

const COMPOUND_EXTENSIONS = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst'];
// Chrome also stops at (100). It bounds the disk checks, which run on the main
// process thread.
const MAX_NUMBER = 100;
// File names are limited to 255 bytes on macOS and Linux (and 255 UTF-16 units
// on Windows, never more than the UTF-8 byte count), so the longest candidate,
// "name (100).ext", must fit.
const MAX_NAME_BYTES = 255;
const SUFFIX = ` (${MAX_NUMBER})`;
const SUFFIX_BYTES = Buffer.byteLength(SUFFIX);
// Windows counts a whole path, folder included, against MAX_PATH (260 UTF-16
// units with the terminating NUL), and Electron doesn't opt into long paths.
const WINDOWS_MAX_PATH = 259;
const maxDownloadPathLength = (platform) => (platform === 'win32' ? WINDOWS_MAX_PATH : Infinity);
// An "extension" longer than this is really part of the name.
const MAX_EXT_BYTES = 32;

// Reservations compare without case, so two downloads can't claim names that
// a case-insensitive disk (macOS, Windows) would treat as one file.
const downloadReservationKey = (p) => String(p).toLowerCase();

function cleanName(filename) {
  // eslint-disable-next-line no-control-regex
  const name = String(filename ?? '').replace(/[/\\\u0000]/g, '_').trim();
  return name === '' || name === '.' || name === '..' ? 'download' : name;
}

// Shortens text to fit both budgets: UTF-8 bytes (the file-name limit) and
// UTF-16 units (how Windows counts a path), never splitting a character.
function truncate(text, maxBytes, maxUnits) {
  let out = '';
  let bytes = 0;
  for (const ch of text) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > maxBytes || out.length + ch.length > maxUnits) break;
    out += ch;
    bytes += size;
  }
  return out;
}

// Returns [base, ext] such that "base (100)ext" fits in 255 bytes and in
// `nameUnits` UTF-16 units, or null when not even one character fits.
function fitName(base, ext, nameUnits) {
  const unitsForName = nameUnits - SUFFIX.length;
  if (Buffer.byteLength(ext) > MAX_EXT_BYTES || ext.length >= unitsForName) [base, ext] = [base + ext, ''];
  const roomBytes = MAX_NAME_BYTES - SUFFIX_BYTES - Buffer.byteLength(ext);
  const roomUnits = unitsForName - ext.length;
  if (roomUnits < 1) return null;
  if (Buffer.byteLength(base) > roomBytes || base.length > roomUnits) {
    base = truncate(base, roomBytes, roomUnits).trimEnd();
    if (!base) return null;
  }
  return [base, ext];
}

function splitName(name) {
  const lower = name.toLowerCase();
  const compound = COMPOUND_EXTENSIONS.find((ext) => lower.endsWith(ext) && lower.length > ext.length);
  if (compound) return [name.slice(0, -compound.length), name.slice(-compound.length)];
  // A dotfile such as ".env" is all name: path.extname already returns '' for it.
  const ext = path.extname(name);
  return [name.slice(0, name.length - ext.length), ext];
}

// `claim(p)` returns true when it took the name (for example by creating the
// file), false when the name is taken; anything it throws reaches the caller.
// Without `claim`, `exists(p)` decides. `maxPathLength` caps the whole path in
// UTF-16 units (see maxDownloadPathLength); null means no name fits.
function chooseDownloadPath({ folder, filename, exists, claim, reserved, maxPathLength = Infinity }) {
  // The folder plus its separator, measured the way the candidate is built.
  const folderUnits = path.join(folder, 'x').length - 1;
  const fitted = fitName(...splitName(cleanName(filename)), maxPathLength - folderUnits);
  if (!fitted) return null;
  const [base, ext] = fitted;
  const take = claim ?? ((p) => !exists(p));
  for (let n = 0; n <= MAX_NUMBER; n += 1) {
    const candidate = path.join(folder, n === 0 ? `${base}${ext}` : `${base} (${n})${ext}`);
    if (!reserved.has(downloadReservationKey(candidate)) && take(candidate)) return candidate;
  }
  return null;
}

module.exports = { chooseDownloadPath, downloadReservationKey, maxDownloadPathLength };
