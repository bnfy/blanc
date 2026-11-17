'use strict';

// Picks where a download lands when Blanc saves it without asking (#1591):
// the suggested name in the folder, else "name (1).ext", "name (2).ext", ...
// Pure, so it never touches the disk itself: the caller passes `exists` and
// the names other in-flight downloads have already claimed.

const path = require('path');

const COMPOUND_EXTENSIONS = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst'];
const MAX_NUMBER = 9999;

// Reservations compare without case, so two downloads can't claim names that
// a case-insensitive disk (macOS, Windows) would treat as one file.
const downloadReservationKey = (p) => String(p).toLowerCase();

function cleanName(filename) {
  // eslint-disable-next-line no-control-regex
  const name = String(filename ?? '').replace(/[/\\\u0000]/g, '_').trim();
  return name === '' || name === '.' || name === '..' ? 'download' : name;
}

function splitName(name) {
  const lower = name.toLowerCase();
  const compound = COMPOUND_EXTENSIONS.find((ext) => lower.endsWith(ext) && lower.length > ext.length);
  if (compound) return [name.slice(0, -compound.length), name.slice(-compound.length)];
  // A dotfile such as ".env" is all name: path.extname already returns '' for it.
  const ext = path.extname(name);
  return [name.slice(0, name.length - ext.length), ext];
}

function chooseDownloadPath({ folder, filename, exists, reserved }) {
  const name = cleanName(filename);
  const [base, ext] = splitName(name);
  const isFree = (p) => !exists(p) && !reserved.has(downloadReservationKey(p));
  for (let n = 0; n <= MAX_NUMBER; n += 1) {
    const candidate = path.join(folder, n === 0 ? name : `${base} (${n})${ext}`);
    if (isFree(candidate)) return candidate;
  }
  return null;
}

module.exports = { chooseDownloadPath, downloadReservationKey };
