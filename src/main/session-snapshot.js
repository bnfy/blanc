// Pure session-snapshot helpers shared by persistSession (main.js) and tab
// sync (tabsync.js). No electron imports — main.js isn't loadable under
// node --test, so the shared entry-building logic lives here instead
// (sync-wipe.js is the precedent). See the tab-sync design spec §4.

const MAX_SYNC_TABS = 500;
const MAX_SYNC_URL = 2048;
const MAX_SYNC_TITLE = 200;

/** The address worth persisting for a tab: the real destination behind our
 * error page (so the next launch retries it), else the url as-is. Null for
 * a tab with no committed url yet. */
function persistableUrl(url) {
  if (!url) return null;
  if (url.startsWith('blanc://error')) {
    try {
      return new URL(url).searchParams.get('url') || url;
    } catch {
      return url;
    }
  }
  return url;
}

const MAX_META_TITLE = 200;
const MAX_META_FAVICON = 8192;
const { validFavicon } = require('./bookmark-validate');
const { normalizeTabName, displayTitle } = require('./tab-name');

/** Session metadata carries only the same fixed-size PNG data accepted by
 * Favorites; live remote sources never survive a restart. */
function persistableFavicon(favicon) { return validFavicon(favicon); }

/** session.json's meta entry for one tab (Quiet Tabs spec §10.1): what the
 * pill and the rail draw for a tab restored quiet, before it has any
 * webContents. Empty title for a tab sitting on our own error page —
 * persistableUrl() unwraps that url back to the real destination, and the
 * title showing there is Blanc's error copy, not the site's. */
function sessionTabMeta(tab) {
  const onErrorPage = typeof tab?.url === 'string' && tab.url.startsWith('blanc://error');
  const title = !onErrorPage && typeof tab?.title === 'string'
    ? tab.title.slice(0, MAX_META_TITLE)
    : '';
  const meta = { title, favicon: persistableFavicon(tab?.favicon) };
  // F46: only a renamed tab carries the key, so every other entry is written
  // exactly as before and older builds simply ignore it.
  const customTitle = normalizeTabName(tab?.customTitle);
  if (customTitle) meta.customTitle = customTitle;
  return meta;
}

/** clearSessionMeta's rewrite of one window's meta column (F46). Page titles
 * and icons are history and go; a name the person typed is theirs, like a
 * group name, and stays. Null when nothing is worth keeping, so the caller
 * deletes the column exactly as it always has. */
function metaAfterHistoryClear(meta) {
  if (!Array.isArray(meta) || !meta.some((m) => normalizeTabName(m?.customTitle))) return null;
  return meta.map((m) => {
    const customTitle = normalizeTabName(m?.customTitle);
    return customTitle ? { title: '', favicon: null, customTitle } : { title: '', favicon: null };
  });
}

/** Exactly persistSession's session.json semantics: private tabs excluded,
 * error urls unwrapped, url-less tabs dropped. Order preserved. */
function persistableEntries(tabList) {
  return (tabList ?? [])
    .filter((t) => t && !t.private)
    .map((t) => {
      const url = persistableUrl(t.url);
      return url ? { id: t.id, url, groupId: t.groupId ?? null, pinned: !!t.pinned } : null;
    })
    .filter(Boolean);
}

/** The synced copy of the session: additionally http(s)-only (file:// paths
 * don't exist on other machines; blanc:// pages aren't worth a row) and
 * bounded. Groups reduced to those the surviving tabs reference, in display
 * order, without device-local presentation state (collapsed). */
function syncSnapshot(tabList, groups) {
  const tabs = (tabList ?? [])
    .filter((t) => t && !t.private)
    .map((t) => {
      const url = persistableUrl(t.url);
      if (!url || !/^https?:\/\//.test(url) || url.length > MAX_SYNC_URL) return null;
      return {
        url,
        // F46: other devices see what this tab is labelled with here.
        title: displayTitle(t).slice(0, MAX_SYNC_TITLE),
        groupId: t.groupId ?? null,
        pinned: !!t.pinned,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_SYNC_TABS);
  const referenced = new Set(tabs.map((t) => t.groupId).filter(Boolean));
  return {
    tabs,
    groups: (groups ?? []).filter((g) => referenced.has(g.id)).map(({ id, name }) => ({ id, name })),
  };
}

module.exports = {
  persistableUrl, persistableEntries, syncSnapshot, sessionTabMeta, metaAfterHistoryClear,
  MAX_SYNC_TABS, MAX_SYNC_URL, MAX_SYNC_TITLE, MAX_META_TITLE, MAX_META_FAVICON,
};
