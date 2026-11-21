'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { HTML_EXTENSIONS } = require('./local-html-files');

// A scheme of two or more characters, so a drive letter (`C:`) is not one.
const URL_LIKE = /^[a-z][a-z0-9+.-]+:/i;
// A drive-letter path (`C:\` or `C:/`) or a UNC path; never drive-relative.
const WINDOWS_ABSOLUTE = /^(?:[a-z]:[\\/]|\\\\)/i;

/**
 * Default-browser and second-instance handoff accepts web URLs only.
 * Electron's file: implementation gives local documents broader filesystem
 * access than ordinary pages, so paths and every non-web scheme fail closed
 * here. Local HTML files Windows and Linux hand over are read separately, by
 * localHtmlPathsFromArgv below.
 *
 * On Windows, several URLs need `Blanc.exe -- URL1 URL2`. Electron exits
 * with -1 before main.js runs if any argument follows a URL without a `--`
 * first (its CVE-2018-1000006 guard), and Chromium moves switches ahead of
 * plain arguments, so even two URLs trip it. Blanc's own registrations pass
 * one URL ("%1"). The separator is skipped here like any other non-URL.
 */
function webUrlsFromArgv(argv) {
  if (!Array.isArray(argv)) return [];
  return argv.filter(
    (arg) => typeof arg === 'string' && /^https?:\/\//i.test(arg)
  );
}

/** Windows and Linux hand a file to the app it is opened with on the command
 * line (Explorer's Open with or a double-click; a file manager's Open With
 * through the desktop entry's `%U`). Only absolute paths ending in an HTML
 * extension qualify. GLib and KDE file managers turn a local file into a path
 * for `%U`; a launcher that passes URIs through (xdg-open on some desktops, a
 * script) sends a `file:` URI instead, so Linux accepts one naming a local
 * HTML file too. They go to the same
 * openLocalHtmlFiles path macOS's open-file event uses, which checks the file
 * again and, on ECS builds, shows it in the static preview window (#1630).
 * macOS delivers documents through LaunchServices, so it reads none here.
 * path.win32 and path.posix keep the rules the same on every test host. */
function localHtmlPathsFromArgv(argv, { platform = process.platform } = {}) {
  if (!Array.isArray(argv)) return [];
  if (platform === 'win32') return windowsHtmlPaths(argv);
  if (platform === 'linux') return linuxHtmlPaths(argv);
  return [];
}

function windowsHtmlPaths(argv) {
  // Explorer never sends a URL and a file together. A launcher that passes a
  // URL unescaped could append `-- \\host\share\a.html`, so any URL (or
  // other scheme) on the line means no files are read from it.
  if (argv.some((arg) => typeof arg === 'string' && URL_LIKE.test(arg))) return [];
  return argv.filter((arg) => typeof arg === 'string'
    && !arg.includes('\0')
    && WINDOWS_ABSOLUTE.test(arg)
    && HTML_EXTENSIONS.has(path.win32.extname(arg).toLowerCase()));
}

function linuxHtmlPaths(argv) {
  // As on Windows, a file manager never sends a web URL and a file together,
  // so any scheme other than file: on the line means no files are read.
  const isFileUri = (arg) => /^file:/i.test(arg);
  if (argv.some((arg) => typeof arg === 'string' && URL_LIKE.test(arg) && !isFileUri(arg))) return [];
  const paths = [];
  for (const arg of argv) {
    if (typeof arg !== 'string') continue;
    const candidate = isFileUri(arg) ? posixPathFromFileUri(arg) : arg;
    if (candidate
      && !candidate.includes('\0')
      && path.posix.isAbsolute(candidate)
      && HTML_EXTENSIONS.has(path.posix.extname(candidate).toLowerCase())) paths.push(candidate);
  }
  return paths;
}

/** A local file: URI as GLib writes it (`file:///…`), decoded to its path.
 * A missing `//` (which the URL parser would quietly read as a root path), a
 * host other than localhost, an encoded `/`, or a query or fragment (which a
 * file manager percent-encodes) means it is not one. */
function posixPathFromFileUri(value) {
  if (!/^file:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.search || parsed.hash) return null;
    return fileURLToPath(parsed, { windows: false });
  } catch {
    return null;
  }
}

/** Open a multi-URL handoff without pretending every intermediate tab was
 * selected by the user. All URLs load, but only the final one becomes active. */
function externalUrlActivationPlan(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map((url, index) => ({
    url,
    activate: index === urls.length - 1,
  }));
}

module.exports = { externalUrlActivationPlan, localHtmlPathsFromArgv, webUrlsFromArgv };
