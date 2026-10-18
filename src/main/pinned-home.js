'use strict';

const { persistableUrl } = require('./session-snapshot');
const { KNOWN_PAGES, UTILITY_PAGES } = require('./utility-pages');
const { restorableLocalHtmlUrl } = require('./local-html-files');

function pinnedHomeFor(url, { localFile = false } = {}) {
  const persisted = persistableUrl(url);
  if (!persisted) return null;

  let parsed;
  try {
    parsed = new URL(persisted);
  } catch {
    return null;
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  if (parsed.protocol === 'file:') {
    return localFile ? restorableLocalHtmlUrl(parsed.href) : null;
  }
  if (parsed.protocol === 'blanc:' && KNOWN_PAGES.has(parsed.host)
    && !UTILITY_PAGES.has(parsed.host) && parsed.host !== 'error') {
    return parsed.href;
  }
  return null;
}

function applyPinnedHomes(saved = {}, { cleanStart = false } = {}) {
  const urls = Array.isArray(saved.urls) ? [...saved.urls] : [];
  const pinned = Array.isArray(saved.pinned) ? [...saved.pinned] : [];
  const meta = Array.isArray(saved.meta)
    ? saved.meta.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
    : [];
  const result = { ...saved, urls, pinned, meta };
  let localFiles = Array.isArray(saved.localFiles) ? [...saved.localFiles] : null;

  for (let index = 0; index < urls.length; index += 1) {
    if (!pinned[index]) continue;
    const entry = meta[index];
    const stored = typeof entry?.pinnedHomeUrl === 'string' ? entry.pinnedHomeUrl : null;
    if (!stored) continue;
    const home = pinnedHomeFor(stored, { localFile: stored.startsWith('file:') });
    if (!home) {
      delete entry.pinnedHomeUrl;
      continue;
    }
    if (!cleanStart) continue;

    urls[index] = home;
    if (!localFiles) localFiles = Array(urls.length).fill(false);
    localFiles[index] = home.startsWith('file:');
  }

  if (localFiles) result.localFiles = localFiles;
  return result;
}

module.exports = { pinnedHomeFor, applyPinnedHomes };
