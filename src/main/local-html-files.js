'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const HTML_EXTENSIONS = new Set(['.htm', '.html', '.xht', '.xhtm', '.xhtml']);

function hasHtmlExtension(filePath) {
  return typeof filePath === 'string'
    && HTML_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Convert only an existing, regular local HTML document selected by macOS.
 * Requiring an absolute path keeps command-line fragments and working-directory
 * accidents out of this trust boundary. realpath also gives the tab one stable
 * canonical URL when the Finder item is a symlink. */
function localHtmlUrlFromPath(filePath, {
  realpath = fs.realpathSync.native ?? fs.realpathSync,
  stat = fs.statSync,
} = {}) {
  if (typeof filePath !== 'string' || filePath.includes('\0') || !path.isAbsolute(filePath)) return null;
  if (!hasHtmlExtension(filePath)) return null;
  try {
    const canonical = realpath(filePath);
    if (!hasHtmlExtension(canonical) || !stat(canonical).isFile()) return null;
    return pathToFileURL(canonical).href;
  } catch {
    return null;
  }
}

function localHtmlUrlsFromPaths(paths) {
  if (!Array.isArray(paths)) return [];
  return paths.map((filePath) => localHtmlUrlFromPath(filePath)).filter(Boolean);
}

/** A saved grant is usable only for the same canonical, still-existing file.
 * An unmarked or noncanonical file URL cannot become a restored tab. */
function restorableLocalHtmlUrl(value) {
  if (!isSupportedLocalHtmlUrl(value)) return null;
  try {
    const parsed = new URL(value);
    return localHtmlUrlFromPath(fileURLToPath(parsed)) === parsed.href ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Defense in depth at createTab(): the caller must also opt into local-file
 * loading, and even then only one of the declared HTML document types passes. */
function isSupportedLocalHtmlUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) return false;
    return hasHtmlExtension(fileURLToPath(parsed));
  } catch {
    return false;
  }
}

module.exports = {
  HTML_EXTENSIONS,
  hasHtmlExtension,
  isSupportedLocalHtmlUrl,
  localHtmlUrlFromPath,
  localHtmlUrlsFromPaths,
  restorableLocalHtmlUrl,
};
