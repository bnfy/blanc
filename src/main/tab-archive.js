// Pure Tab Archive policy (F52): which idle tabs may be archived, and what of
// a tab an archive entry may keep. No electron import — this file must stay
// requireable from `node --test` (precedent: tab-sleep.js, closed-tabs.js).
// The clock is injected, never read.
// See docs/superpowers/specs/2026-10-19-tab-archive-design.md.

const { validFavicon } = require('./bookmark-validate');
const { normalizeTabName } = require('./tab-name');

/** Setting id -> idle threshold in ms. `off` => null (never archive). This is
 *  the ONLY setting-id -> milliseconds mapping; settings.js owns the ids. */
const TAB_ARCHIVE_DELAY_MS = {
  off: null,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** Entries expire this long after they were archived (spec §2.7). */
const ARCHIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Per-profile cap; past it the oldest entry goes. Every entry is also in
 *  History, so dropping one loses nothing the person can't find again. */
const MAX_ARCHIVE_ENTRIES = 500;
/** Nothing is archived this long after launch, resume, or a setting change. */
const ARCHIVE_GRACE_MS = 10 * 60 * 1000;
/** At most this many tabs per window per sweep, oldest-viewed first. */
const ARCHIVE_PER_SWEEP = 20;

const NO_IDS = new Set();
const NO_COUNTS = new Map();

const isWebUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url);
const isNewTab = (url) => typeof url === 'string' && url.startsWith('blanc://newtab');

/**
 * The tabs the sweep may archive now, oldest-viewed first. Reads durable tab
 * fields only; the async dirty probe is the caller's job.
 *
 * @returns {Array<{id: string, closeOnly: boolean}>} closeOnly: a blank new
 *   tab, closed without an entry.
 */
function archiveCandidates(tabList, options) {
  const {
    now,
    thresholdMs,
    activeTabId = null,
    visibleTabIds = NO_IDS,
    permissionPendingTabIds = NO_IDS,
    popupChildCounts = NO_COUNTS,
    graceUntil = 0,
    perSweepLimit = ARCHIVE_PER_SWEEP,
  } = options ?? {};

  if (!Number.isFinite(thresholdMs)) return [];
  if (!Number.isFinite(now) || now < graceUntil) return [];
  if (!Array.isArray(tabList)) return [];

  const survivors = [];
  tabList.forEach((tab, index) => {
    if (!tab?.id || tab.id === activeTabId) return;
    if (tab.pinned || tab.groupId || tab.private) return;
    if (visibleTabIds.has(tab.id) || permissionPendingTabIds.has(tab.id)) return;
    if ((popupChildCounts.get(tab.id) ?? 0) !== 0) return;
    if (tab.isLoading || tab.sleeping || tab.waking) return;
    if (tab.audible || tab.usedMedia || tab.capturing || tab.displayShareBlocking) return;
    const closeOnly = isNewTab(tab.url);
    if (!closeOnly && !isWebUrl(tab.url)) return;
    // A missing clock, or one in the future (the system clock moved back),
    // is never idle.
    if (!Number.isFinite(tab.lastViewedAt) || tab.lastViewedAt > now) return;
    if (now - tab.lastViewedAt < thresholdMs) return;
    survivors.push({ id: tab.id, closeOnly, index, lastViewedAt: tab.lastViewedAt });
  });

  survivors.sort((a, b) => (
    a.lastViewedAt !== b.lastViewedAt ? a.lastViewedAt - b.lastViewedAt : a.index - b.index
  ));
  return survivors.slice(0, perSweepLimit).map(({ id, closeOnly }) => ({ id, closeOnly }));
}

let entrySeq = 0;

/**
 * An archive entry: an explicit allow-list, never a spread of the tab.
 * Snapshots, page state, back stacks and openers must never reach disk
 * (Reopen Closed Tab §2.1.1).
 */
function buildArchiveEntry(tab, { now, spaceName = null } = {}) {
  if (!tab || tab.private || !isWebUrl(tab.url)) return null;
  const entry = {
    id: `arch-${now}-${++entrySeq}`,
    url: tab.url,
    title: typeof tab.title === 'string' ? tab.title : '',
    favicon: validFavicon(tab.favicon) ?? null,
    archivedAt: now,
    lastViewedAt: Number.isFinite(tab.lastViewedAt) ? tab.lastViewedAt : now,
  };
  const customTitle = normalizeTabName(tab.customTitle);
  if (customTitle) entry.customTitle = customTitle;
  if (typeof spaceName === 'string' && spaceName) entry.spaceName = spaceName;
  return entry;
}

/** Newest first, malformed and expired entries dropped, capped. */
function expireArchive(entries, { now, ttlMs = ARCHIVE_TTL_MS, cap = MAX_ARCHIVE_ENTRIES } = {}) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && typeof e.id === 'string' && isWebUrl(e.url)
      && Number.isFinite(e.archivedAt) && now - e.archivedAt <= ttlMs)
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, cap);
}

/** What a renderer may see of an entry. */
function projectArchive(entries) {
  return (entries ?? []).map((e) => ({
    id: e.id,
    url: e.url,
    title: e.customTitle || e.title || '',
    favicon: e.favicon ?? null,
    archivedAt: e.archivedAt,
    spaceName: e.spaceName ?? null,
  }));
}

/** Case-insensitive substring match over title, custom name and URL. */
function searchArchive(entries, query) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return [...(entries ?? [])];
  return (entries ?? []).filter((e) => [e.title, e.customTitle, e.url]
    .some((field) => typeof field === 'string' && field.toLowerCase().includes(q)));
}

module.exports = {
  TAB_ARCHIVE_DELAY_MS,
  ARCHIVE_TTL_MS,
  MAX_ARCHIVE_ENTRIES,
  ARCHIVE_GRACE_MS,
  ARCHIVE_PER_SWEEP,
  archiveCandidates,
  buildArchiveEntry,
  expireArchive,
  projectArchive,
  searchArchive,
};
