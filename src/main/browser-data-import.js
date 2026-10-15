const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validFolder } = require('./bookmark-validate');
const {
  CHROMIUM_ROOTS,
  buildChromiumTree,
  extractSubtree,
  dedupeCandidatesByUrl,
  enforceCandidateCap,
} = require('./bookmark-tree');
const {
  MAX_SESSION_BYTES,
  parseChromiumSession,
} = require('./chromium-session');

const MAX_BROWSER_BOOKMARK_BYTES = 20 * 1024 * 1024;
const MAX_BROWSER_BOOKMARK_NODES = 100_000;
const CHROMIUM_EPOCH_OFFSET_MS = 11_644_473_600_000;
// Recent Chrome keeps the bookmarks of a profile signed in to a Google
// Account in AccountBookmarks, beside the local Bookmarks file or instead of
// it. Both use the same JSON format. The account file only ever adds to the
// local one: when Bookmarks is readable, an AccountBookmarks file that is
// blocked, gone, too large or malformed is left out, so the profile imports
// exactly as it did before Blanc read the account file.
const LOCAL_BOOKMARKS_FILE = 'Bookmarks';
const ACCOUNT_BOOKMARKS_FILE = 'AccountBookmarks';


function isBrowserAccessError(err) {
  return err?.code === 'EPERM' || err?.code === 'EACCES';
}

function isBrowserSessionLockError(err, platform) {
  return err?.code === 'EBUSY' || err?.code === 'ETXTBSY'
    || (platform === 'win32' && isBrowserAccessError(err));
}

const BROWSERS = Object.freeze([
  {
    id: 'chrome',
    name: 'Google Chrome',
    roots: {
      darwin: ['Library', 'Application Support', 'Google', 'Chrome'],
      win32: ['Google', 'Chrome', 'User Data'],
      linux: ['.config', 'google-chrome'],
    },
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    roots: {
      darwin: ['Library', 'Application Support', 'Microsoft Edge'],
      win32: ['Microsoft', 'Edge', 'User Data'],
      linux: ['.config', 'microsoft-edge'],
    },
  },
  {
    id: 'brave',
    name: 'Brave',
    roots: {
      darwin: ['Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'],
      win32: ['BraveSoftware', 'Brave-Browser', 'User Data'],
      linux: ['.config', 'BraveSoftware', 'Brave-Browser'],
    },
  },
  {
    id: 'chromium',
    name: 'Chromium',
    roots: {
      darwin: ['Library', 'Application Support', 'Chromium'],
      win32: ['Chromium', 'User Data'],
      linux: ['.config', 'chromium'],
    },
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    roots: {
      darwin: ['Library', 'Application Support', 'Vivaldi'],
      win32: ['Vivaldi', 'User Data'],
      linux: ['.config', 'vivaldi'],
    },
  },
]);

function browserDataRoot(browserId, {
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
} = {}) {
  const browser = BROWSERS.find((candidate) => candidate.id === browserId);
  const parts = browser?.roots?.[platform];
  if (!parts) return null;
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA;
    return typeof localAppData === 'string' && localAppData
      ? path.join(localAppData, ...parts)
      : null;
  }
  return path.join(homeDir, ...parts);
}

function sourceId(browserId, profileDirectory) {
  return crypto
    .createHash('sha256')
    .update(`${browserId}\0${profileDirectory}`)
    .digest('base64url')
    .slice(0, 24);
}

function chromiumTimestampMs(value, now) {
  try {
    const micros = BigInt(String(value));
    if (micros <= 0n) return now;
    const ms = Number(micros / 1000n) - CHROMIUM_EPOCH_OFFSET_MS;
    return Number.isFinite(ms) && ms > 0 && ms <= now ? ms : now;
  } catch {
    return now;
  }
}

// `t` is the interface translator: imported root folders are named in the
// interface language, and those names are saved with the favorites.
function parseChromiumBookmarks(input, {
  now = Date.now(),
  maxNodes = MAX_BROWSER_BOOKMARK_NODES,
  t,
} = {}) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || typeof data !== 'object' || !data.roots || typeof data.roots !== 'object') {
    throw new Error('invalid-bookmarks');
  }

  const entries = [];
  let visited = 0;
  const roots = [
    ['bookmark_bar', t('import.folder.bookmarksBar')],
    ['other', t('import.folder.other')],
    ['synced', t('import.folder.mobile')],
  ];

  const visit = (node, folder, depth) => {
    if (!node || typeof node !== 'object') return;
    visited += 1;
    if (visited > maxNodes || depth > 64) throw new Error('bookmarks-too-complex');

    if (node.type === 'url') {
      if (typeof node.url !== 'string' || !/^https?:\/\//i.test(node.url)) return;
      const title = typeof node.name === 'string' && node.name.trim()
        ? node.name.trim()
        : node.url;
      entries.push({
        url: node.url,
        title,
        favicon: null,
        addedAt: chromiumTimestampMs(node.date_added, now),
        folder: validFolder(folder),
      });
      return;
    }

    if (!Array.isArray(node.children)) return;
    const ownName = validFolder(node.name);
    const childFolder = ownName ?? folder;
    for (const child of node.children) visit(child, childFolder, depth + 1);
  };

  for (const [key, fallbackName] of roots) {
    const root = data.roots[key];
    if (!root || typeof root !== 'object') continue;
    const rootName = validFolder(root.name) ?? fallbackName;
    if (!Array.isArray(root.children)) continue;
    for (const child of root.children) visit(child, rootName, 1);
  }
  return entries;
}

async function readJsonIfSmall(filePath, fsPromises, maxBytes = 2 * 1024 * 1024) {
  let file;
  try {
    file = await fsPromises.open(filePath, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return JSON.parse(await file.readFile('utf8'));
  } catch {
    return null;
  } finally {
    if (file) await file.close().catch(() => {});
  }
}

// Concatenates each root's children across a profile's already-validated
// bookmark files, so the tree builder sees one tree. Every file count takes
// this path. The first file's root names win, a root without children is
// kept as an empty folder, and only the roots the builder reads are copied.
function mergeChromiumBookmarkFiles(files) {
  const roots = {};
  for (const data of files) {
    for (const [key] of CHROMIUM_ROOTS) {
      const root = data.roots[key];
      if (!root || typeof root !== 'object') continue;
      const children = Array.isArray(root.children) ? root.children : [];
      roots[key] = roots[key]
        ? { ...roots[key], children: roots[key].children.concat(children) }
        : { ...root, children };
    }
  }
  return { roots };
}

// Drops account entries whose exact URL the local file already has, so an
// import doesn't report bookmarks kept in both files as "already saved".
function withoutLocalDuplicates(localEntries, accountEntries) {
  const localUrls = new Set(localEntries.map((entry) => entry.url));
  return accountEntries.filter((entry) => !localUrls.has(entry.url));
}

function safeProfileName(infoCache, directory) {
  const candidate = infoCache?.[directory]?.name;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 120);
  return directory === 'Default' ? 'Default' : directory.slice(0, 120);
}

function publicUnavailable(browser, t) {
  return {
    browserId: browser.id,
    browser: browser.name,
    label: browser.name,
    reason: 'permission',
    guidance: t('import.permissionGuidance'),
  };
}

function publicSource(source) {
  return {
    id: source.id,
    browser: source.browser,
    profile: source.profile,
    label: source.profile === 'Default'
      ? source.browser
      : `${source.browser} — ${source.profile}`,
  };
}

function createBrowserDataImportService({
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
  fsPromises = fs.promises,
  t,
} = {}) {
  // 'file', 'blocked' (EPERM/EACCES) or 'absent' (anything else).
  async function bookmarkFileState(filePath) {
    try {
      return (await fsPromises.stat(filePath)).isFile() ? 'file' : 'absent';
    } catch (err) {
      return isBrowserAccessError(err) ? 'blocked' : 'absent';
    }
  }

  async function discover({ requireBookmarks = true } = {}) {
    const sources = [];
    const unavailable = [];
    const blockedBrowserIds = new Set();
    const markBlocked = (browser) => {
      if (blockedBrowserIds.has(browser.id)) return;
      blockedBrowserIds.add(browser.id);
      unavailable.push({ browserId: browser.id, browser: browser.name });
    };
    for (const browser of BROWSERS) {
      const root = browserDataRoot(browser.id, { platform, homeDir, env });
      if (!root) continue;
      try {
        const rootStat = await fsPromises.stat(root);
        if (!rootStat.isDirectory()) continue;
      } catch (err) {
        if (err?.code === 'ENOENT') continue;
        if (isBrowserAccessError(err)) markBlocked(browser);
        continue;
      }
      let directories;
      try {
        directories = await fsPromises.readdir(root, { withFileTypes: true });
      } catch (err) {
        if (isBrowserAccessError(err)) markBlocked(browser);
        continue;
      }
      const localState = await readJsonIfSmall(path.join(root, 'Local State'), fsPromises);
      const infoCache = localState?.profile?.info_cache;
      for (const entry of directories) {
        if (!entry.isDirectory() || !/^(Default|Profile .+)$/.test(entry.name)) continue;
        const profilePath = path.join(root, entry.name);
        let bookmarksPath = null;
        let accountBookmarksPath = null;
        if (requireBookmarks) {
          const localPath = path.join(profilePath, LOCAL_BOOKMARKS_FILE);
          const accountPath = path.join(profilePath, ACCOUNT_BOOKMARKS_FILE);
          const [local, account] = await Promise.all([
            bookmarkFileState(localPath),
            bookmarkFileState(accountPath),
          ]);
          // A blocked account file matters only when it would be the
          // profile's sole bookmarks; beside a local file it is left out.
          if (local === 'blocked' || (local === 'absent' && account === 'blocked')) {
            markBlocked(browser);
            continue;
          }
          if (local === 'file') bookmarksPath = localPath;
          if (account === 'file') accountBookmarksPath = accountPath;
          if (!bookmarksPath && !accountBookmarksPath) continue;
        }
        sources.push({
          id: sourceId(browser.id, entry.name),
          browserId: browser.id,
          browser: browser.name,
          profileDirectory: entry.name,
          profile: safeProfileName(infoCache, entry.name),
          profilePath,
          bookmarksPath,
          accountBookmarksPath,
          sessionsPath: path.join(profilePath, 'Sessions'),
        });
      }
    }
    sources.sort((a, b) =>
      a.browser.localeCompare(b.browser) || a.profile.localeCompare(b.profile));
    return { sources, unavailable };
  }

  async function readNewestOpenTabSession(source, { afterQuit = false } = {}) {
    let entries;
    try {
      entries = await fsPromises.readdir(source.sessionsPath, { withFileTypes: true });
    } catch (err) {
      if (isBrowserSessionLockError(err, platform)) return { error: 'source-locked' };
      if (isBrowserAccessError(err)) return { error: 'permission' };
      return { error: err?.code === 'ENOENT' ? 'empty' : 'unreadable' };
    }
    const sessionNames = entries
      .filter((entry) => entry.isFile() && /^Session_[0-9]+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => {
        const aStamp = BigInt(a.slice('Session_'.length));
        const bStamp = BigInt(b.slice('Session_'.length));
        return aStamp === bStamp ? 0 : aStamp > bStamp ? -1 : 1;
      });
    if (!sessionNames.length) return { error: 'empty' };

    async function readSession(sessionName) {
      const sessionPath = path.join(source.sessionsPath, sessionName);
      let handle;
      try {
        handle = await fsPromises.open(sessionPath, 'r');
        const before = await handle.stat();
        if (!before.isFile()) return { error: 'unreadable' };
        if (before.size > MAX_SESSION_BYTES) {
          return { error: 'session-too-large', count: before.size };
        }
        const parsed = parseChromiumSession(await handle.readFile());
        const after = await handle.stat();
        const changedSize = before.size !== after.size;
        const changedTime = Number.isFinite(before.mtimeMs) && Number.isFinite(after.mtimeMs)
          && before.mtimeMs !== after.mtimeMs;
        return changedSize || changedTime ? { error: 'source-saving' } : parsed;
      } catch (err) {
        if (isBrowserSessionLockError(err, platform)) return { error: 'source-locked' };
        if (isBrowserAccessError(err)) return { error: 'permission' };
        return { error: 'unreadable' };
      } finally {
        await handle?.close().catch(() => {});
      }
    }

    const newest = await readSession(sessionNames[0]);
    if (!newest.error) return newest;
    if (afterQuit) return newest;

    const needsNormalQuit = new Set([
      'source-locked',
      'source-saving',
      'missing-session-marker',
      'incomplete-session',
    ]);
    if (!needsNormalQuit.has(newest.error)) return newest;

    // Older snapshots are preflight evidence only. They are never returned as
    // the import source. A normal-quit prompt is allowed only when Blanc can
    // already prove that this profile has a saved, restorable session.
    for (const sessionName of sessionNames.slice(1)) {
      const recovery = await readSession(sessionName);
      if (!recovery.error && recovery.candidates?.length) {
        return {
          error: 'source-locked',
          recoverable: true,
          recoverableTabCount: recovery.candidates.length,
        };
      }
    }
    return { ...newest, recoverable: false };
  }

  // Keep validation, reading and parsing on one opened descriptor. A profile
  // file replaced between path-based stat() and readFile() must never bypass
  // the size/type check applied to the bytes we actually parse. Parsing here
  // gives each file the full node and depth caps on its own.
  async function readBookmarkFile(filePath) {
    let handle;
    try {
      handle = await fsPromises.open(filePath, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) return { error: 'source-unavailable' };
      if (stat.size > MAX_BROWSER_BOOKMARK_BYTES) return { error: 'too-large' };
      const data = JSON.parse(await handle.readFile('utf8'));
      return { data, entries: parseChromiumBookmarks(data, { t }) };
    } catch {
      return { error: 'unreadable' };
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  // The local file reads exactly as it always has, and its failures are the
  // profile's. The account file joins it only when it reads cleanly; on its
  // own, it fails the way the local file would.
  async function readBookmarkFiles(source) {
    const local = source.bookmarksPath ? await readBookmarkFile(source.bookmarksPath) : null;
    if (local?.error) return local;
    const account = source.accountBookmarksPath
      ? await readBookmarkFile(source.accountBookmarksPath)
      : null;
    if (local) return { files: account && !account.error ? [local, account] : [local] };
    if (!account) return { error: 'source-unavailable' };
    return account.error ? account : { files: [account] };
  }

  async function readTree(id) {
    const source = (await discover()).sources.find((candidate) => candidate.id === id);
    if (!source) return { error: 'source-unavailable' };
    const read = await readBookmarkFiles(source);
    if (read.error) return read;
    try {
      const data = mergeChromiumBookmarkFiles(read.files.map((file) => file.data));
      // Each file already passed the node cap on its own.
      const maxNodes = MAX_BROWSER_BOOKMARK_NODES * read.files.length;
      return { source, tree: buildChromiumTree(data, { maxNodes }) };
    } catch {
      return { error: 'unreadable' };
    }
  }

  return {
    async listSources() {
      const { sources, unavailable } = await discover();
      return {
        sources: sources.map(publicSource),
        unavailable: unavailable.map((entry) =>
          publicUnavailable(
            BROWSERS.find((browser) => browser.id === entry.browserId) ?? {
              id: entry.browserId,
              name: entry.browser,
            },
            t,
          )),
      };
    },

    async listOpenTabSources() {
      const { sources, unavailable } = await discover({ requireBookmarks: false });
      return {
        sources: sources.map(publicSource),
        unavailable: unavailable.map((entry) =>
          publicUnavailable(
            BROWSERS.find((browser) => browser.id === entry.browserId) ?? {
              id: entry.browserId,
              name: entry.browser,
            },
            t,
          )),
      };
    },

    async readOpenTabs(id, { afterQuit = false } = {}) {
      const source = (await discover({ requireBookmarks: false })).sources
        .find((candidate) => candidate.id === id);
      if (!source) return { error: 'source-unavailable' };
      const parsed = await readNewestOpenTabSession(source, { afterQuit: afterQuit === true });
      if (parsed.error) return { ...parsed, source: publicSource(source) };
      return {
        source: publicSource(source),
        candidates: parsed.candidates,
        windowCount: parsed.windowCount,
        excludedCount: parsed.excludedCount,
        partialTail: parsed.partialTail,
      };
    },

    async readSource(id) {
      const source = (await discover()).sources.find((candidate) => candidate.id === id);
      if (!source) return { error: 'source-unavailable' };
      const read = await readBookmarkFiles(source);
      if (read.error) return read;
      const [first, second] = read.files;
      const entries = second
        ? first.entries.concat(withoutLocalDuplicates(first.entries, second.entries))
        : first.entries;
      if (!entries.length) return { error: 'empty' };
      return { source: publicSource(source), entries };
    },

    async readFolderTree(id) {
      const result = await readTree(id);
      if (result.error) return result;
      const { source, tree } = result;
      if (!tree.folders.some((folder) => folder.subtreeHttpCount > 0)) {
        return { error: 'empty' };
      }
      return {
        source: publicSource(source),
        folders: tree.folders,
        rootFolderIds: tree.rootFolderIds,
      };
    },

    async readSubtreeCandidates(id, rootFolderId) {
      const result = await readTree(id);
      if (result.error) return result;
      const { source, tree } = result;
      const { candidates } = extractSubtree(tree, String(rootFolderId ?? ''));
      const { candidates: deduped, duplicateCount } = dedupeCandidatesByUrl(candidates);
      const capped = enforceCandidateCap(deduped);
      if (!capped.ok) return { error: 'too-many-candidates', count: capped.count };
      if (!capped.candidates.length) return { error: 'empty' };
      return {
        source: publicSource(source),
        candidates: capped.candidates,
        duplicateCount,
      };
    },
  };
}

module.exports = {
  BROWSERS,
  MAX_BROWSER_BOOKMARK_BYTES,
  MAX_SESSION_BYTES,
  browserDataRoot,
  chromiumTimestampMs,
  parseChromiumBookmarks,
  createBrowserDataImportService,
};
