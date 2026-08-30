// The single home of internal-page names. KNOWN_PAGES is every hostname
// blanc:// serves (pages.js 404s anything else); UTILITY_PAGES is the
// subset that belongs in the utility sheet (design:
// docs/superpowers/specs/2026-07-22-utility-sheet-design.md §4) — every
// route into a tab checks it. The rest (newtab, error, auth, mahjong)
// open as ordinary tab pages.
const KNOWN_PAGES = new Set(['newtab', 'bookmarks', 'history', 'downloads', 'settings', 'error', 'auth', 'shortcuts', 'mahjong']);
const UTILITY_PAGES = new Set(['bookmarks', 'history', 'downloads', 'settings', 'shortcuts']);

/** Exact-host blanc:// match: true only for the five sheet pages. */
function isUtilityUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'blanc:' && UTILITY_PAGES.has(u.host);
  } catch {
    return false;
  }
}

module.exports = { KNOWN_PAGES, UTILITY_PAGES, isUtilityUrl };
