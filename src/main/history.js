const { JsonStore } = require('./store');
const { validFavicon } = require('./bookmark-validate');
const { rankTopSites, siteKey } = require('./top-sites');

// Newest entries first. Capped so the JSON file can't grow unbounded.
const MAX_ENTRIES = 5000;
// One inert 32px PNG per recently seen hostname. This is appearance metadata,
// not a second visit log: there are no counts or timestamps, it never syncs,
// and clearing history clears it too.
const MAX_SITE_ICONS = 256;

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'history', { entries: [], siteIcons: [] }, { scope: 'profile' }
));

const isRecordable = (url) => /^https?:\/\//.test(url);

function pruneSiteIconsWithoutHistory(data) {
  const retained = new Set(
    (Array.isArray(data.entries) ? data.entries : [])
      .map((entry) => siteKey(entry?.url))
      .filter(Boolean),
  );
  data.siteIcons = (Array.isArray(data.siteIcons) ? data.siteIcons : [])
    .filter((record) => typeof record?.key === 'string' && retained.has(record.key));
}

/** Record a visit; consecutive reloads of the same URL update the existing entry. */
function addVisit(url, title) {
  if (!isRecordable(url)) return;
  ensureStore().update((d) => {
    const last = d.entries[0];
    if (last && last.url === url) {
      last.visitedAt = Date.now();
      if (title) last.title = title;
      return;
    }
    d.entries.unshift({ url, title: title || url, visitedAt: Date.now() });
    if (d.entries.length > MAX_ENTRIES) {
      d.entries.length = MAX_ENTRIES;
      pruneSiteIconsWithoutHistory(d);
    }
  });
}

/** Pages report their real <title> after the navigation is recorded. */
function updateTitle(url, title) {
  if (!title) return;
  ensureStore().update((d) => {
    const entry = d.entries.find((e) => e.url === url);
    if (entry) entry.title = title;
  });
}

function listHistory({ query = '', limit = 500 } = {}) {
  const q = query.trim().toLowerCase();
  const entries = ensureStore().data.entries;
  const filtered = q
    ? entries.filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    : entries;
  return filtered.slice(0, limit);
}

/** Ranked hostname-level candidates for local start-page presentation. */
function listTopSites({ limit, offset } = {}) {
  const data = ensureStore().data;
  const icons = new Map();
  for (const record of Array.isArray(data.siteIcons) ? data.siteIcons : []) {
    const favicon = validFavicon(record?.favicon);
    if (typeof record?.key === 'string' && favicon && !icons.has(record.key)) {
      icons.set(record.key, favicon);
    }
  }
  return rankTopSites(data.entries, { limit, offset }).map((site) => ({
    ...site,
    favicon: icons.get(site.key) ?? null,
  }));
}

/** Remember artwork Chromium already loaded for a normal tab. No lookup is
 * made here; setTabFavicon supplies the sanitized, inert PNG while the user is
 * already visiting the site. */
function cacheSiteIcon(url, favicon) {
  const key = siteKey(url);
  const safeIcon = validFavicon(favicon);
  if (!key || !safeIcon) return false;
  const s = ensureStore();
  const data = s.data;
  // A favicon is appearance metadata for an existing history record, never an
  // independent trace of a site. This also closes the race where Clear History
  // wins while favicon sanitization is still in flight.
  if (!Array.isArray(data.entries) || !data.entries.some((entry) => siteKey(entry?.url) === key)) {
    return false;
  }
  const records = Array.isArray(data.siteIcons) ? data.siteIcons : [];
  if (records[0]?.key === key && records[0]?.favicon === safeIcon) return false;
  s.update((data) => {
    const current = Array.isArray(data.siteIcons) ? data.siteIcons : [];
    data.siteIcons = [
      { key, favicon: safeIcon },
      ...current.filter((record) => record?.key !== key),
    ].slice(0, MAX_SITE_ICONS);
  });
  return true;
}

function removeVisit(url, visitedAt) {
  ensureStore().update((d) => {
    d.entries = d.entries.filter((e) => !(e.url === url && e.visitedAt === visitedAt));
    pruneSiteIconsWithoutHistory(d);
  });
}

function clearHistory() {
  ensureStore().update((d) => {
    d.entries = [];
    d.siteIcons = [];
  });
}

module.exports = {
  MAX_SITE_ICONS,
  addVisit,
  updateTitle,
  listHistory,
  listTopSites,
  cacheSiteIcon,
  removeVisit,
  clearHistory,
};
