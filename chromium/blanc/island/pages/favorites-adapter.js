'use strict';
// The Favorites page in its own tab (F63; owner, November 18, 2026).
// Shipping's bookmarks.html runs here as it does in Electron's tab, and this
// file is its window.bowserPages: each call goes to the browser's
// FavoritesHandler (favorites_page.inc), which answers from Chromium's
// bookmark model. It loads first, before the page's own scripts.
(() => {
  if (location.origin !== 'chrome://blanc-prototype' || location.pathname !== '/pages/bookmarks.html' ||
      typeof chrome?.send !== 'function') return;
  let nextId = 0;
  const pending = new Map();
  window.blancFavoritesReply = (id, ok, value) => {
    const task = pending.get(id);
    if (!task) return;
    clearTimeout(task.timer);
    pending.delete(id);
    if (ok) task.resolve(value); else task.reject(new Error(value));
  };
  function request(method, args = [], timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = String(++nextId);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Favorites request timed out')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      chrome.send('blancFavorites', [id, method, args]);
    });
  }
  // shipping's pages:bookmarks:changed and pages:pins:changed.
  const listeners = { bookmarks: new Set(), pins: new Set() };
  window.blancFavoritesEvent = (kind) => {
    for (const callback of [...(listeners[kind] ?? [])]) {
      try { callback(); } catch (error) { console.error(error); }
    }
  };
  const listen = kind => callback => {
    if (typeof callback !== 'function') return () => {};
    listeners[kind].add(callback);
    return () => listeners[kind].delete(callback);
  };
  const text = value => (typeof value === 'string' ? value : '');
  const path = value => (typeof value === 'string' ? value : value == null ? null : '');
  const ids = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string') : []);

  window.bowserPages = {
    bookmarks: {
      capabilities: () => request('capabilities'),
      list: () => request('list'),
      tree: () => request('tree'),
      remove: id => request('remove', [text(String(id ?? ''))]),
      removeMany: list => request('removeMany', [ids(list)]),
      setFolder: (id, folder) => request('setFolder', [String(id ?? ''), path(folder)]),
      renameFolder: (folder, name) => request('renameFolder', [path(folder), text(name)]),
      removeFolder: folder => request('removeFolder', [path(folder)]),
      createFolder: (parent, name) => request('createFolder', [path(parent), text(name)]),
      moveFolder: (folder, parent) => request('moveFolder', [path(folder), path(parent)]),
      move: (list, folder) => request('move', [ids(list), path(folder)]),
      reorder: (folder, keys) => request('reorder', [path(folder), ids(keys)]),
      edit: (id, changes) => request('edit', [String(id ?? ''), {
        ...(typeof changes?.title === 'string' ? { title: changes.title } : {}),
        ...(typeof changes?.url === 'string' ? { url: changes.url } : {}),
      }]),
      clearFavicon: () => Promise.resolve(),
      // Favorites import (F30): the file is chosen and parsed here; the
      // browser merges it, as it does a detected browser's Favorites.
      import: async () => {
        const picked = await window.BlancBookmarkFile.pick();
        return picked.entries ? request('importEntries', [picked.entries], 60000) : picked;
      },
      browserSources: () => request('browserSources', [], 30000),
      importBrowser: id => request('importBrowser', [String(id ?? '')], 60000),
      onChanged: listen('bookmarks'),
    },
    pins: {
      list: () => request('pinsList'),
      pin: (url, title) => request('pinsPin', [String(url ?? ''), text(title)]),
      unpin: url => request('pinsUnpin', [String(url ?? '')]),
      onChanged: listen('pins'),
    },
  };
  // Blanc's other pages open where they always do: History, Downloads,
  // Settings and the tab import in the Island's sheet (the page's nav links
  // and its "Open tabs" choice). A blanc:// address never loads in a tab.
  const openSheet = page => request('openSheet', [page]).catch(() => false);
  window.BlancFavoritesTab = Object.freeze({ openSheet });
  const follow = (event) => {
    if (event.defaultPrevented || event.button !== (event.type === 'auxclick' ? 1 : 0)) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    let url;
    try { url = new URL(link.href); } catch { return; }
    if (url.protocol !== 'blanc:') return;
    event.preventDefault();
    const page = url.hostname === 'favorites' ? 'bookmarks' : url.hostname;
    if (page !== 'bookmarks') openSheet(page);
  };
  window.addEventListener('click', follow, true);
  window.addEventListener('auxclick', follow, true);
})();
