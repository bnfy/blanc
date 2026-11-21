// Short site names for the start page's Billboard tiles. Kept pure (no DOM,
// no IPC) and served flat from this directory, so test/unit can run it in a
// vm, the same way type-to-open.js is shared and tested.
(() => {
  'use strict';

  const SEPARATORS = [' – ', ' — ', ' | ', ' · ', ' - '];
  const MAX_SHORT_NAME = 20;

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /** The site's own name from its domain, not whatever subdomain it serves
   * from: "github.com" and "developer.mozilla.org" give "github" and
   * "mozilla". Drops the TLD, then a second-level suffix like the "co" in
   * "bbc.co.uk". */
  function shortLabel(url, title = '') {
    const parts = hostOf(url).split('.').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      if (parts.length > 1 && parts[parts.length - 1].length <= 3) parts.pop();
    }
    return (parts[parts.length - 1] || String(title).trim().split(/\s+/)[0] || '·').toLowerCase();
  }

  /** The title's first segment when it is short enough to read as a name;
   * otherwise the domain label. */
  function shortSiteName(title, url) {
    // Separators are found before trimming, so a title that opens with one
    // has an empty first segment and falls back to the domain.
    const raw = String(title ?? '');
    const cuts = SEPARATORS.map((sep) => raw.indexOf(sep)).filter((index) => index >= 0);
    const first = (cuts.length ? raw.slice(0, Math.min(...cuts)) : raw).trim();
    return first.length >= 1 && first.length <= MAX_SHORT_NAME ? first : shortLabel(url, raw);
  }

  globalThis.blancStartSiteName = Object.freeze({ shortSiteName, shortLabel });
})();
