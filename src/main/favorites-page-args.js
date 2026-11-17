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

/** A folder path, or null for the top level. bookmarks.js validates it. */
const pagePath = (value) => (value === null || value === undefined ? null : String(value).slice(0, MAX_ARG));

module.exports = { pageIds, pageKeys, pagePath };
