// Pure policy behind the context menu's "View Page Source" item — extracted
// so it's unit-testable without Electron (context-menu.js reaches settings.js,
// which needs electron's `app`). Same pattern as external-protocols.js and
// utility-pages.js.
//
// Chromium serves `view-source:` itself: line numbers, syntax highlighting,
// and the raw bytes the server sent, which is what makes it worth having
// alongside Inspect Element (DevTools shows the live DOM, so it hides
// comments and anything the page's own scripts rewrote).

const VIEW_SOURCE_PREFIX = 'view-source:';

/**
 * May this URL be offered as "View Page Source"?
 *
 * http(s) ONLY, and that restriction is load-bearing rather than cosmetic:
 * a main-process `view-source:file:///…` navigation genuinely loads, so
 * without this gate the item would expose local files on any page Blanc
 * opened from disk. `blanc://` internal pages ship with the app and the
 * blank new tab has no source at all — Chrome excludes its own `chrome://`
 * pages the same way. Already-wrapped `view-source:` URLs are excluded too,
 * so the item can't nest on itself. Anything unparseable falls through.
 *
 * @param {string} url - the page URL the context menu was invoked on
 * @returns {boolean}
 */
function canViewSource(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { VIEW_SOURCE_PREFIX, canViewSource };
