'use strict';

// Tab loading background: pure policy, Electron-free. tab-view.js and main.js
// hand in the view and how the tab is themed.
//
// A WebContentsView's background color is two things at once: what the view
// shows before the page's first frame, and the page's own default canvas
// under content that sets no background. White is right for the canvas (every
// browser draws a page that sets no background on white), but in dark mode it
// flashes: before a new tab's first frame, and while an app shell paints its
// empty page before its theme arrives. So a dark or private tab starts on its
// theme's page color and goes back to white at its first document's first
// contentful paint. A page that draws its own background never shows the
// switch, and a page that doesn't still ends up on white.
//
// Only a view's first document waits. Later navigations in the tab keep white:
// Chromium holds the previous page on screen until the next one paints, and a
// dark canvas there would blink on every light page that sets no background.

/** The `bg` token's dark and private values (tokens/tokens.json), the color
 *  of the window behind the tab and of Blanc's own pages. */
const DARK_LOADING_BACKGROUND = '#0e0e0e';
const PRIVATE_LOADING_BACKGROUND = '#0a0a0a';
/** Chromium's default page canvas, and Electron's default for a view. */
const PAGE_BACKGROUND = '#ffffff';
/** Navigations that end without a document of their own (a download, a
 *  navigation replaced by another) report net::ERR_ABORTED. */
const ERR_ABORTED = -3;

/** Its own isolated world: 999 is the session preloads', 1001 the 1Password
 *  fill's and 1002 Dark Reader's. */
const FIRST_CONTENT_WORLD_ID = 1003;
/** How long a document that paints no content of its own (a page that is all
 *  iframe, say) may stay on the dark canvas once it is visible, in ms. */
const FIRST_CONTENT_FALLBACK_MS = 3000;
/** Resolves at the document's first contentful paint, or once it has been
 *  visible for FIRST_CONTENT_FALLBACK_MS. A background tab paints nothing,
 *  so its wait starts when it is shown. Reads only paint timing. */
const FIRST_CONTENT_SCRIPT = `new Promise((resolve) => {
  const name = 'first-contentful-paint';
  if (performance.getEntriesByName(name).length) return resolve(true);
  new PerformanceObserver((list, observer) => {
    if (!list.getEntriesByName(name).length) return;
    observer.disconnect();
    resolve(true);
  }).observe({ type: 'paint', buffered: true });
  const giveUp = () => setTimeout(() => resolve(false), ${FIRST_CONTENT_FALLBACK_MS});
  if (document.visibilityState === 'visible') return giveUp();
  document.addEventListener('visibilitychange', function shown() {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', shown);
    giveUp();
  });
})`;

/** view -> removes the listeners of a load still waiting to settle */
const pending = new WeakMap();

/**
 * The color a tab should show while its first document loads, or null to
 * leave the view white. Private tabs always use the private theme.
 * @param {{dark?: boolean, private?: boolean}} theme
 */
function loadingBackground({ dark = false, private: isPrivate = false } = {}) {
  if (isPrivate) return PRIVATE_LOADING_BACKGROUND;
  return dark ? DARK_LOADING_BACKGROUND : null;
}

/**
 * Put a view on its loading background until the next document it commits
 * paints content. Call it before the view's first load (or a reload that
 * rebuilds its renderer). Returns whether the view was changed.
 * @param {{webContents?: object, setBackgroundColor: (color: string) => void}|null} view
 * @param {{dark?: boolean, private?: boolean}} theme
 */
function primeLoadingBackground(view, theme) {
  const color = loadingBackground(theme);
  const wc = view?.webContents;
  if (!color || !wc || wc.isDestroyed()) return false;
  pending.get(view)?.();
  let latest = 0;
  let done = false;
  const cleanup = () => {
    done = true;
    pending.delete(view);
    wc.removeListener('did-navigate', onCommit);
    wc.removeListener('did-fail-load', onFail);
  };
  const settle = () => {
    if (done) return;
    cleanup();
    if (!wc.isDestroyed()) view.setBackgroundColor(PAGE_BACKGROUND);
  };
  function onCommit() {
    const wait = ++latest;
    // A wait that cannot run fails open: white is how every page looked
    // before this, and an unstyled page must not stay on dark.
    const finish = () => { if (wait === latest) settle(); };
    Promise.resolve()
      .then(() => wc.executeJavaScriptInIsolatedWorld(FIRST_CONTENT_WORLD_ID, [{ code: FIRST_CONTENT_SCRIPT }]))
      .then(finish, finish);
  }
  function onFail(_event, errorCode, _description, _url, isMainFrame) {
    if (isMainFrame && errorCode !== ERR_ABORTED) settle();
  }
  wc.on('did-navigate', onCommit);
  wc.on('did-fail-load', onFail);
  pending.set(view, cleanup);
  view.setBackgroundColor(color);
  return true;
}

module.exports = {
  DARK_LOADING_BACKGROUND,
  PRIVATE_LOADING_BACKGROUND,
  PAGE_BACKGROUND,
  FIRST_CONTENT_WORLD_ID,
  FIRST_CONTENT_FALLBACK_MS,
  FIRST_CONTENT_SCRIPT,
  loadingBackground,
  primeLoadingBackground,
};
