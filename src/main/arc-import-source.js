'use strict';

// F45 Arc Spaces import: where Arc keeps StorableSidebar.json, and one
// bounded read of it. Main process only; the path never reaches a renderer.
// Arc shipped on macOS and Windows. Linux, and any machine where the file
// is elsewhere, use a file the person chooses (readArcSidebarFile).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_ARC_SIDEBAR_BYTES, parseArcSidebar } = require('./arc-sidebar');

const ARC_SIDEBAR_FILE = 'StorableSidebar.json';
const ARC_WINDOWS_PACKAGE_PREFIX = 'TheBrowserCompany.Arc_';

const isAccessError = (err) => err?.code === 'EPERM' || err?.code === 'EACCES';

/** Candidate locations for Arc's sidebar file on this platform (may be empty). */
async function arcSidebarCandidates({
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
  fsPromises = fs.promises,
} = {}) {
  if (platform === 'darwin') {
    return [path.join(homeDir, 'Library', 'Application Support', 'Arc', ARC_SIDEBAR_FILE)];
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA;
    if (typeof localAppData !== 'string' || !localAppData) return [];
    const packages = path.join(localAppData, 'Packages');
    let entries;
    try {
      entries = await fsPromises.readdir(packages, { withFileTypes: true });
    } catch {
      return [];
    }
    // Store installs carry a publisher-hash suffix; match by prefix and
    // accept only an unambiguous single package.
    const matches = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(ARC_WINDOWS_PACKAGE_PREFIX))
      .map((entry) => path.join(packages, entry.name, 'LocalCache', 'Local', 'Arc', ARC_SIDEBAR_FILE));
    return matches.length === 1 ? matches : [];
  }
  return [];
}

/**
 * Whether Arc's file appears to exist here, without reading it.
 * Returns { state: 'found' | 'missing' | 'permission' | 'unsupported' }.
 */
async function detectArcSidebar(options = {}) {
  const { platform = process.platform, fsPromises = fs.promises } = options;
  const candidates = await arcSidebarCandidates(options);
  if (!candidates.length) {
    return { state: platform === 'darwin' || platform === 'win32' ? 'missing' : 'unsupported' };
  }
  try {
    const stat = await fsPromises.stat(candidates[0]);
    return { state: stat.isFile() ? 'found' : 'missing' };
  } catch (err) {
    return { state: isAccessError(err) ? 'permission' : 'missing' };
  }
}

/**
 * Reads and parses one sidebar file. Size and type are checked on the same
 * descriptor that is read, and a file that changes during the read (Arc
 * saving) is refused rather than half-parsed.
 */
async function readArcSidebarFile(filePath, { fsPromises = fs.promises } = {}) {
  let handle;
  try {
    handle = await fsPromises.open(filePath, 'r');
    const before = await handle.stat();
    if (!before.isFile()) return { error: 'unreadable' };
    if (before.size > MAX_ARC_SIDEBAR_BYTES) return { error: 'too-large' };
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.size !== after.size
      || (Number.isFinite(before.mtimeMs) && before.mtimeMs !== after.mtimeMs)) {
      return { error: 'source-saving' };
    }
    return parseArcSidebar(bytes);
  } catch (err) {
    if (isAccessError(err)) return { error: 'permission' };
    return { error: err?.code === 'ENOENT' ? 'missing' : 'unreadable' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** Finds and reads Arc's own sidebar file on macOS or Windows. */
async function readDetectedArcSidebar(options = {}) {
  const candidates = await arcSidebarCandidates(options);
  if (!candidates.length) return { error: 'missing' };
  return readArcSidebarFile(candidates[0], options);
}

module.exports = {
  ARC_SIDEBAR_FILE,
  arcSidebarCandidates,
  detectArcSidebar,
  readArcSidebarFile,
  readDetectedArcSidebar,
};
