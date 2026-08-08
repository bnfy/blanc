const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validFolder } = require('./bookmark-validate');

const MAX_BROWSER_BOOKMARK_BYTES = 20 * 1024 * 1024;
const MAX_BROWSER_BOOKMARK_NODES = 100_000;
const CHROMIUM_EPOCH_OFFSET_MS = 11_644_473_600_000;

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

function parseChromiumBookmarks(input, {
  now = Date.now(),
  maxNodes = MAX_BROWSER_BOOKMARK_NODES,
} = {}) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || typeof data !== 'object' || !data.roots || typeof data.roots !== 'object') {
    throw new Error('invalid-bookmarks');
  }

  const entries = [];
  let visited = 0;
  const roots = [
    ['bookmark_bar', 'Bookmarks bar'],
    ['other', 'Other bookmarks'],
    ['synced', 'Mobile bookmarks'],
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
  try {
    const stat = await fsPromises.stat(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return JSON.parse(await fsPromises.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeProfileName(infoCache, directory) {
  const candidate = infoCache?.[directory]?.name;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 120);
  return directory === 'Default' ? 'Default' : directory.slice(0, 120);
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
} = {}) {
  async function discover() {
    const found = [];
    for (const browser of BROWSERS) {
      const root = browserDataRoot(browser.id, { platform, homeDir, env });
      if (!root) continue;
      let directories;
      try {
        directories = await fsPromises.readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }
      const localState = await readJsonIfSmall(path.join(root, 'Local State'), fsPromises);
      const infoCache = localState?.profile?.info_cache;
      for (const entry of directories) {
        if (!entry.isDirectory() || !/^(Default|Profile .+)$/.test(entry.name)) continue;
        const bookmarksPath = path.join(root, entry.name, 'Bookmarks');
        try {
          const stat = await fsPromises.stat(bookmarksPath);
          if (!stat.isFile()) continue;
        } catch {
          continue;
        }
        found.push({
          id: sourceId(browser.id, entry.name),
          browserId: browser.id,
          browser: browser.name,
          profileDirectory: entry.name,
          profile: safeProfileName(infoCache, entry.name),
          bookmarksPath,
        });
      }
    }
    return found.sort((a, b) =>
      a.browser.localeCompare(b.browser) || a.profile.localeCompare(b.profile));
  }

  return {
    async listSources() {
      return (await discover()).map(publicSource);
    },

    async readSource(id) {
      const source = (await discover()).find((candidate) => candidate.id === id);
      if (!source) return { error: 'source-unavailable' };
      try {
        const stat = await fsPromises.stat(source.bookmarksPath);
        if (!stat.isFile()) return { error: 'source-unavailable' };
        if (stat.size > MAX_BROWSER_BOOKMARK_BYTES) return { error: 'too-large' };
        const raw = await fsPromises.readFile(source.bookmarksPath, 'utf8');
        const entries = parseChromiumBookmarks(raw);
        if (!entries.length) return { error: 'empty' };
        return { source: publicSource(source), entries };
      } catch {
        return { error: 'unreadable' };
      }
    },
  };
}

module.exports = {
  BROWSERS,
  MAX_BROWSER_BOOKMARK_BYTES,
  browserDataRoot,
  chromiumTimestampMs,
  parseChromiumBookmarks,
  createBrowserDataImportService,
};
