// Pure bookmark folder-tree projection for F39 tab migration. Shared by
// Chromium JSON and Netscape HTML sources. No Electron.
const crypto = require('node:crypto');
const { validFolder, validFavicon } = require('./bookmark-validate');

const DEFAULT_MAX_NODES = 100_000;
const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_CANDIDATES = 500;
const CHROMIUM_EPOCH_OFFSET_MS = 11_644_473_600_000;
const treeNodes = new WeakMap();

const CHROMIUM_ROOTS = [
  ['bookmark_bar', 'Bookmarks bar'],
  ['other', 'Other bookmarks'],
  ['synced', 'Mobile bookmarks'],
];

function folderIdFromPath(pathLabels) {
  return crypto
    .createHash('sha256')
    .update(pathLabels.join('\0'))
    .digest('base64url')
    .slice(0, 24);
}

function normalizeUrl(url) {
  try {
    return new URL(url).href;
  } catch {
    return String(url);
  }
}

function isHttpUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
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

function createNode(pathLabels, name) {
  const folderId = folderIdFromPath(pathLabels);
  return {
    folderId,
    name,
    pathLabels: [...pathLabels],
    parentFolderId: pathLabels.length > 1
      ? folderIdFromPath(pathLabels.slice(0, -1))
      : null,
    childFolderIds: [],
    bookmarks: [],
  };
}

function ensureNode(nodes, pathLabels, name) {
  const folderId = folderIdFromPath(pathLabels);
  let node = nodes.get(folderId);
  if (!node) {
    node = createNode(pathLabels, name);
    nodes.set(folderId, node);
    if (node.parentFolderId) {
      const parent = nodes.get(node.parentFolderId);
      if (parent && !parent.childFolderIds.includes(folderId)) {
        parent.childFolderIds.push(folderId);
      }
    }
  }
  return node;
}

function countHttp(bookmarks) {
  return bookmarks.length;
}

function projectFolders(nodes) {
  const totals = new Map();
  const totalFor = (node) => {
    if (totals.has(node.folderId)) return totals.get(node.folderId);
    let total = countHttp(node.bookmarks);
    for (const childId of node.childFolderIds) {
      const child = nodes.get(childId);
      if (child) total += totalFor(child);
    }
    totals.set(node.folderId, total);
    return total;
  };
  return [...nodes.values()].map((node) => ({
    folderId: node.folderId,
    name: node.name,
    pathLabels: [...node.pathLabels],
    childFolderIds: [...node.childFolderIds],
    httpCount: countHttp(node.bookmarks),
    subtreeHttpCount: totalFor(node),
  }));
}

function finishTree(nodes, rootFolderIds) {
  const tree = {
    folders: projectFolders(nodes),
    rootFolderIds,
  };
  // Exact URLs stay behind a module-private seam. The public tree is safe to
  // project through IPC without relying on callers to strip an enumerable Map.
  treeNodes.set(tree, nodes);
  return tree;
}

function buildChromiumTree(input, {
  now = Date.now(),
  maxNodes = DEFAULT_MAX_NODES,
  maxDepth = DEFAULT_MAX_DEPTH,
} = {}) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || typeof data !== 'object' || !data.roots || typeof data.roots !== 'object') {
    throw new Error('invalid-bookmarks');
  }

  const nodes = new Map();
  const rootFolderIds = [];
  let visited = 0;

  const visit = (node, pathLabels, depth) => {
    if (!node || typeof node !== 'object') return;
    visited += 1;
    if (visited > maxNodes || depth > maxDepth) throw new Error('bookmarks-too-complex');

    if (node.type === 'url') {
      if (typeof node.url !== 'string' || !isHttpUrl(node.url)) return;
      const parent = ensureNode(nodes, pathLabels, pathLabels[pathLabels.length - 1]);
      const title = typeof node.name === 'string' && node.name.trim()
        ? node.name.trim()
        : node.url;
      parent.bookmarks.push({
        url: node.url,
        title,
        addedAt: chromiumTimestampMs(node.date_added, now),
      });
      return;
    }

    if (!Array.isArray(node.children)) return;
    const ownName = validFolder(node.name);
    const childPath = ownName ? [...pathLabels, ownName] : pathLabels;
    if (ownName) ensureNode(nodes, childPath, ownName);
    for (const child of node.children) visit(child, childPath, depth + 1);
  };

  for (const [key, fallbackName] of CHROMIUM_ROOTS) {
    const root = data.roots[key];
    if (!root || typeof root !== 'object') continue;
    const rootName = validFolder(root.name) ?? fallbackName;
    const rootPath = [rootName];
    ensureNode(nodes, rootPath, rootName);
    rootFolderIds.push(folderIdFromPath(rootPath));
    if (!Array.isArray(root.children)) continue;
    for (const child of root.children) visit(child, rootPath, 1);
  }

  return finishTree(nodes, rootFolderIds);
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, '&');
}

function attr(attrs, name) {
  const m =
    attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) ||
    attrs.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i')) ||
    attrs.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return m ? m[1] : null;
}

const NETSCAPE_TOKEN = /<\/dl\s*>|<dl\b[^>]*>|<h3\b[^>]*>([\s\S]*?)<\/h3\s*>|<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;

function buildNetscapeTree(html, {
  now = Date.now(),
  maxNodes = DEFAULT_MAX_NODES,
  maxDepth = DEFAULT_MAX_DEPTH,
} = {}) {
  const nodes = new Map();
  const rootFolderIds = [];
  const nameStack = [];
  let pending;
  let visited = 0;

  const pathLabelsFromStack = () => nameStack.filter((name) => name);

  for (const m of String(html).matchAll(NETSCAPE_TOKEN)) {
    const tok = m[0].slice(0, 4).toLowerCase();
    if (tok.startsWith('</dl')) {
      nameStack.pop();
    } else if (tok.startsWith('<dl')) {
      nameStack.push(pending !== undefined ? pending : null);
      const labels = pathLabelsFromStack();
      if (labels.length > maxDepth) throw new Error('bookmarks-too-complex');
      if (labels.length) {
        const labelPath = [];
        for (const segment of labels) {
          labelPath.push(segment);
          ensureNode(nodes, labelPath, segment);
        }
        const rootId = folderIdFromPath([labels[0]]);
        if (!rootFolderIds.includes(rootId)) rootFolderIds.push(rootId);
      }
      pending = undefined;
    } else if (tok.startsWith('<h3')) {
      visited += 1;
      if (visited > maxNodes) throw new Error('bookmarks-too-complex');
      pending = validFolder(decodeEntities(m[1] || ''));
    } else {
      visited += 1;
      if (visited > maxNodes) throw new Error('bookmarks-too-complex');
      const attrs = m[2] || '';
      const rawHref = attr(attrs, 'href');
      if (!rawHref) continue;
      const url = decodeEntities(rawHref);
      if (!isHttpUrl(url)) continue;
      const rawIcon = attr(attrs, 'icon');
      const secs = Number(attr(attrs, 'add_date'));
      let addedAt = now;
      if (Number.isFinite(secs) && secs > 0) {
        const ms = secs * 1000;
        if (ms <= now) addedAt = ms;
      }
      const title = decodeEntities(m[3] || '').trim();
      const labels = pathLabelsFromStack();
      if (!labels.length) {
        const rootName = 'Imported bookmarks';
        const rootPath = [rootName];
        ensureNode(nodes, rootPath, rootName);
        if (!rootFolderIds.includes(folderIdFromPath(rootPath))) {
          rootFolderIds.push(folderIdFromPath(rootPath));
        }
        labels.push(rootName);
      } else {
        const labelPath = [];
        for (const segment of labels) {
          labelPath.push(segment);
          ensureNode(nodes, labelPath, segment);
        }
      }
      const parentPath = labels;
      const parent = ensureNode(nodes, parentPath, parentPath[parentPath.length - 1]);
      parent.bookmarks.push({
        url,
        title: title || url,
        favicon: validFavicon(rawIcon),
        addedAt,
      });
    }
  }

  return finishTree(nodes, rootFolderIds);
}

function extractSubtree(tree, rootFolderId) {
  const nodes = tree && treeNodes.get(tree);
  const root = nodes?.get(rootFolderId);
  if (!nodes || !root) return { candidates: [] };

  const candidates = [];
  const rootPathLen = root.pathLabels.length;

  const walk = (folderId) => {
    const node = nodes.get(folderId);
    if (!node) return;
    const isMigrationRoot = folderId === rootFolderId;
    for (const bookmark of node.bookmarks) {
      const beneath = node.pathLabels.slice(rootPathLen);
      const favoriteFolder = isMigrationRoot
        ? null
        : validFolder(node.name);
      candidates.push({
        url: bookmark.url,
        title: bookmark.title,
        addedAt: bookmark.addedAt,
        folderPath: beneath,
        favoriteFolder,
        sourceFolderId: node.folderId,
      });
    }
    for (const childId of node.childFolderIds) walk(childId);
  };

  walk(rootFolderId);
  return { candidates };
}

function dedupeCandidatesByUrl(candidates) {
  const seen = new Set();
  const unique = [];
  let duplicateCount = 0;
  for (const candidate of candidates) {
    const key = normalizeUrl(candidate.url);
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push({ ...candidate, url: key });
  }
  return { candidates: unique, duplicateCount };
}

function enforceCandidateCap(candidates, max = DEFAULT_MAX_CANDIDATES) {
  if (candidates.length <= max) {
    return { ok: true, candidates };
  }
  return { ok: false, count: candidates.length };
}

module.exports = {
  DEFAULT_MAX_CANDIDATES,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_NODES,
  buildChromiumTree,
  buildNetscapeTree,
  extractSubtree,
  dedupeCandidatesByUrl,
  enforceCandidateCap,
  folderIdFromPath,
  normalizeUrl,
};
