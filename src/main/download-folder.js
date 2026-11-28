'use strict';

// #1780: the folder downloads go to when Blanc saves without asking, and the
// folder Save As opens in. Pure: no require('electron'), so the rules are
// unit-tested. The stored value is the device-local setting `downloadFolder`:
// '' means the system's Downloads folder, anything else an absolute path the
// person chose in Settings (written only by settings.setDownloadFolder()).

const path = require('node:path');

const MAX_FOLDER_LENGTH = 4096;

// The stored form of a chosen folder, or '' for the system folder. A folder
// equal to the system Downloads folder is stored as '' so it keeps following
// the system if that ever moves.
function normalizeDownloadFolder(value, systemFolder) {
  if (typeof value !== 'string' || !value || value.length > MAX_FOLDER_LENGTH) return '';
  if (value.includes('\0') || !path.isAbsolute(value)) return '';
  const resolved = path.resolve(value);
  if (typeof systemFolder === 'string' && systemFolder && samePath(resolved, path.resolve(systemFolder))) return '';
  return resolved;
}

function samePath(a, b) {
  // macOS and Windows folders are matched without regard to case by default.
  if (process.platform === 'win32' || process.platform === 'darwin') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

// Where downloads go: the chosen folder, or the system's.
function resolveDownloadFolder(stored, systemFolder) {
  const chosen = normalizeDownloadFolder(stored, systemFolder);
  return chosen || systemFolder;
}

// What Settings shows. `missing` is true when the chosen folder isn't a
// folder now (an unplugged drive, a deleted folder); `unwritable` when it is
// one Blanc can't write to (read-only, or access refused). Downloads then ask
// where to save, and never fall back to another folder unasked.
// `check(folder)` answers 'ok', 'missing' or 'unwritable'.
function downloadFolderState(stored, systemFolder, check) {
  const chosen = normalizeDownloadFolder(stored, systemFolder);
  const folder = chosen || systemFolder || '';
  let status = 'ok';
  if (chosen) {
    try {
      status = check(chosen);
    } catch {
      status = 'missing';
    }
  }
  return {
    path: folder,
    name: path.basename(folder) || folder,
    custom: Boolean(chosen),
    missing: status === 'missing',
    unwritable: status === 'unwritable',
  };
}

// The check Settings uses, on the real file system.
function checkDownloadFolder(fs, folder) {
  let stat;
  try {
    stat = fs.statSync(folder);
  } catch {
    return 'missing';
  }
  if (!stat.isDirectory()) return 'missing';
  try {
    fs.accessSync(folder, fs.constants.W_OK);
  } catch {
    return 'unwritable';
  }
  return 'ok';
}

module.exports = {
  MAX_FOLDER_LENGTH,
  normalizeDownloadFolder,
  resolveDownloadFolder,
  downloadFolderState,
  checkDownloadFolder,
};
