'use strict';

// What the Favorites page may send to the manager's calls (pages.js), cut to
// size before it reaches bookmarks.js. Pure: no Electron.

const MAX_IDS = 5000;
const MAX_KEYS = 20000;
const MAX_ARG = 200;

const shortStrings = (value, max) => (Array.isArray(value) ? value : [])
  .filter((item) => typeof item === 'string' && item.length <= MAX_ARG)
  .slice(0, max);

/** Favorite ids. */
const pageIds = (value) => shortStrings(value, MAX_IDS);

/** A folder's order, as the keys the tree gives each child. */
const pageKeys = (value) => shortStrings(value, MAX_KEYS);

/** A folder path, or null for the top level. Anything but a string is
 * refused ('' fails bookmarks.js validation), never read as the top level. */
const pagePath = (value) => {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.slice(0, MAX_ARG) : '';
};

/** One favorite's edit: its id, and the name and address typed. A field that
 * isn't a string is left out (kept as it is), and each is cut to a size
 * bookmark-validate then checks properly. */
const pageEdit = (id, changes) => {
  const fields = changes && typeof changes === 'object' ? changes : {};
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : undefined);
  return [
    typeof id === 'string' ? id.slice(0, MAX_ARG) : '',
    { title: text(fields.title, 2000), url: text(fields.url, 8192) },
  ];
};

module.exports = { pageIds, pageKeys, pagePath, pageEdit };
