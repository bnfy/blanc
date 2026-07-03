const crypto = require('crypto');
const { JsonStore } = require('./store');

let store = null;
const ensureStore = () => (store ??= new JsonStore('bookmarks', { items: [] }));

function listBookmarks() {
  return [...ensureStore().data.items];
}

function isBookmarked(url) {
  return ensureStore().data.items.some((b) => b.url === url);
}

/** Toggle a bookmark for `url`; returns the new bookmarked state. */
function toggleBookmark(url, title) {
  const s = ensureStore();
  if (isBookmarked(url)) {
    s.update((d) => { d.items = d.items.filter((b) => b.url !== url); });
    return false;
  }
  s.update((d) => {
    d.items.push({ id: crypto.randomUUID(), url, title: title || url, addedAt: Date.now() });
  });
  return true;
}

function removeBookmark(id) {
  ensureStore().update((d) => { d.items = d.items.filter((b) => b.id !== id); });
}

module.exports = { listBookmarks, isBookmarked, toggleBookmark, removeBookmark };
