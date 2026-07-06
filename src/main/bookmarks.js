const crypto = require('crypto');
const { JsonStore } = require('./store');

let store = null;
const ensureStore = () => (store ??= new JsonStore('bookmarks', { items: [] }));

/** Same allow-list/length cap main.js's pickBestFavicon applies to the
 * async-refined favicon — the immediate page-favicon-updated value skips
 * that check, so anything persisted here must be validated independently. */
function validFavicon(favicon) {
  return typeof favicon === 'string' && favicon.length <= 2048 && /^(https?:|data:image\/)/i.test(favicon)
    ? favicon
    : null;
}

function listBookmarks() {
  return [...ensureStore().data.items];
}

function isBookmarked(url) {
  return ensureStore().data.items.some((b) => b.url === url);
}

/** Toggle a bookmark for `url`; returns the new bookmarked state. `favicon`
 * is the tab's favicon URL at the time of favoriting, shown on the start
 * page — a missing/invalid one just falls back to the letter tile there,
 * and `updateFavicon` keeps it fresh afterward as the tab's own favicon
 * resolves or upgrades. */
function toggleBookmark(url, title, favicon) {
  const s = ensureStore();
  if (isBookmarked(url)) {
    s.update((d) => { d.items = d.items.filter((b) => b.url !== url); });
    return false;
  }
  s.update((d) => {
    d.items.push({ id: crypto.randomUUID(), url, title: title || url, favicon: validFavicon(favicon), addedAt: Date.now() });
  });
  return true;
}

/** Patch an existing bookmark's favicon — called as a tab's favicon
 * resolves/upgrades (self-healing a bookmark made before the sharp icon
 * loaded, or one bulk-added while its tab was still loading) and when the
 * start page reports a stored favicon URL as dead (`favicon: null`, so it
 * stops retrying). No-op if `url` isn't bookmarked. */
function updateFavicon(url, favicon) {
  const validated = validFavicon(favicon);
  const s = ensureStore();
  if (!s.data.items.some((b) => b.url === url && b.favicon !== validated)) return;
  s.update((d) => {
    const item = d.items.find((b) => b.url === url);
    if (item) item.favicon = validated;
  });
}

function removeBookmark(id) {
  ensureStore().update((d) => { d.items = d.items.filter((b) => b.id !== id); });
}

module.exports = { listBookmarks, isBookmarked, toggleBookmark, updateFavicon, removeBookmark };
