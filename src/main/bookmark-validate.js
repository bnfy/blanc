// Pure, Electron-free validators shared by bookmark-import.js, bookmark-data.js
// and bookmarks.js. Kept out of bookmarks.js so importing them can't drag in
// the JsonStore singleton (which needs Electron's app at construction), which
// would make these untestable under `node --test`.

const { validIconData } = require('./tabicons-model');

/** Privileged renderers receive inert, dimension-checked PNG pixels only. */
function validFavicon(favicon) {
  return validIconData(favicon);
}

/** A storable folder name, or null (= ungrouped). null is ONLY ever an
 * explicit ungroup — callers must treat a null result from a non-null input
 * as "reject", not "ungroup". */
function validFolder(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100 ? trimmed : null;
}

/** Case-insensitive folder identity key. Work and work are one folder. */
function folderKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

// A favorite's name and address as a person types them on the Favorites page.
const MAX_TITLE_LENGTH = 500;
const MAX_URL_LENGTH = 4096;

/** A typed name, trimmed and cut to size; '' when blank (the caller then
 * names the favorite by its address, as saving does). */
function editableTitle(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TITLE_LENGTH).trim() : '';
}

/** A typed address as a favorite stores it, or null. Favorites are web pages
 * only (main saves nothing else), so anything but http(s) is refused. A bare
 * name such as example.com or localhost:3000 is read as https://; an address
 * with a name and password in it is refused. */
function editableAddress(value) {
  if (typeof value !== 'string') return null;
  const typed = value.trim();
  if (!typed || typed.length > MAX_URL_LENGTH || /\s/.test(typed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname || parsed.username || parsed.password) return null;
  return parsed.href.length <= MAX_URL_LENGTH ? parsed.href : null;
}

module.exports = { validFavicon, validFolder, folderKey, editableTitle, editableAddress, MAX_TITLE_LENGTH };
