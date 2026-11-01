// Inherited document policy for page-opened tabs (design note
// electron-44-9-sandbox-flags-design.md, owner decision 4a, October 23 2026).
//
// A tab a page opened (link with a target, Ctrl/Cmd-click, middle-click,
// window.open) may carry its opener's HTML/CSP sandbox. Electron 44.9+
// applies those flags only to the WebContents it creates itself and no longer
// lets Blanc read or reapply them (electron/electron#55030). So every such tab
// is marked `inheritsDocumentPolicy` from birth, the mark never clears, and
// Blanc never builds a marked tab a fresh WebContents for its page. Where a
// rebuild would be needed the tab is kept `inert`: it stays in place, loads
// only Blanc's explanation page, and offers no way to load the page itself.
//
// Saved formats carry a stamp. A stamped record needs an explicit boolean per
// tab; anything else is malformed and restores inert. Unstamped records are
// legacy and restore as they always have (4a: an accepted, unresolved risk).
//
// No electron imports: unit-tested under node --test.

const DOCUMENT_POLICY_VERSION = 1;
const INERT_KIND = 'inert';

/** Whether a fresh WebContentsView may be built for this tab record. */
function mayBuildFreshView(tab) {
  return !(tab?.inheritsDocumentPolicy === true && tab?.inert !== true);
}

/** Blanc's explanation page for an inert tab. Shares the error page, which
 * persistableUrl() already unwraps back to the real address. */
function inertPageUrl(url, title = '') {
  const q = new URLSearchParams({ kind: INERT_KIND, url: String(url ?? '') });
  if (typeof title === 'string' && title) q.set('title', title.slice(0, 200));
  return `blanc://error/?${q}`;
}

/** Exactly Blanc's inert explanation page, parsed rather than prefix-matched:
 * the blanc scheme, host `error` with no credentials or port, path `/`, no
 * fragment, and a single `kind=inert`. `blanc://error@newtab/` (host
 * `newtab`) and an ordinary error page that could offer Retry both fail. */
function isInertPageUrl(url) {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'blanc:' || parsed.username || parsed.password) return false;
  if (parsed.hostname !== 'error' || parsed.port || parsed.pathname !== '/' || parsed.hash) return false;
  const kinds = parsed.searchParams.getAll('kind');
  return kinds.length === 1 && kinds[0] === INERT_KIND;
}

/** What an inert tab's view may show: its explanation page and nothing else,
 * so no link, favorite, history step, redirect or recovery page reaches the
 * page itself or offers to load it. */
function inertViewMayShow(url) {
  return isInertPageUrl(url);
}

/** The stamp and marker column a saved multi-tab record writes beside `urls`. */
function stampedColumn(tabList) {
  return {
    documentPolicy: DOCUMENT_POLICY_VERSION,
    inheritsDocumentPolicy: (tabList ?? []).map((tab) => tab?.inheritsDocumentPolicy === true),
  };
}

/** Marker for tab `index` of a saved record. Stamped: true and false mean what
 * they say; a missing or non-boolean value is malformed and counts as marked.
 * Unstamped (legacy): unmarked, restoring as before (4a). */
function restoredMarker(record, index) {
  if (record?.documentPolicy === undefined) return false;
  if (record.documentPolicy !== DOCUMENT_POLICY_VERSION) return true;
  const column = record.inheritsDocumentPolicy;
  return (Array.isArray(column) ? column[index] : undefined) !== false;
}

/** A saved record's stamp and marker column as normalizers carry them: legacy
 * stays legacy (no keys), and anything that isn't a boolean becomes null so
 * restoredMarker() still treats it as malformed. */
function savedPolicyColumns(source) {
  if (source?.documentPolicy === undefined) return {};
  const column = Array.isArray(source.inheritsDocumentPolicy) ? source.inheritsDocumentPolicy : [];
  return {
    documentPolicy: source.documentPolicy,
    inheritsDocumentPolicy: column.map((value) => (typeof value === 'boolean' ? value : null)),
  };
}

/** The stamp for a single saved entry (archive and closed-tab entries). */
function stampedEntry(tab) {
  return { documentPolicy: DOCUMENT_POLICY_VERSION, inheritsDocumentPolicy: tab?.inheritsDocumentPolicy === true };
}

/** Marker for a single saved entry: the same rules, stamp on the entry. */
function restoredEntryMarker(entry) {
  if (entry?.documentPolicy === undefined) return false;
  if (entry.documentPolicy !== DOCUMENT_POLICY_VERSION) return true;
  return entry.inheritsDocumentPolicy !== false;
}

module.exports = {
  DOCUMENT_POLICY_VERSION,
  mayBuildFreshView,
  inertPageUrl,
  isInertPageUrl,
  inertViewMayShow,
  stampedColumn,
  restoredMarker,
  savedPolicyColumns,
  stampedEntry,
  restoredEntryMarker,
};
