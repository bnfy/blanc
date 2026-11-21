'use strict';

const path = require('node:path');
const { HTML_EXTENSIONS } = require('./local-html-files');

// A scheme of two or more characters, so a drive letter (`C:`) is not one.
const URL_LIKE = /^[a-z][a-z0-9+.-]+:/i;
// A drive-letter path (`C:\` or `C:/`) or a UNC path; never drive-relative.
const WINDOWS_ABSOLUTE = /^(?:[a-z]:[\\/]|\\\\)/i;

/**
 * Default-browser and second-instance handoff accepts web URLs only.
 * Electron's file: implementation gives local documents broader filesystem
 * access than ordinary pages, so paths and every non-web scheme fail closed
 * here. Local HTML files Windows hands over are read separately, by
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

/** Windows hands a file to the app it is opened with as a command-line path
 * (Explorer's Open with, a double-click). Only absolute paths ending in an
 * HTML extension qualify; they go to the same openLocalHtmlFiles path macOS's
 * open-file event uses, which checks the file again and, on ECS builds,
 * shows it in the static preview window (#1630). macOS delivers documents
 * through LaunchServices, and Linux registers for no HTML type, so other
 * platforms read none. path.win32 keeps the rules the same on every test host. */
function localHtmlPathsFromArgv(argv, { platform = process.platform } = {}) {
  if (platform !== 'win32' || !Array.isArray(argv)) return [];
  // Explorer never sends a URL and a file together. A launcher that passes a
  // URL unescaped could append `-- \\host\share\a.html`, so any URL (or
  // other scheme) on the line means no files are read from it.
  if (argv.some((arg) => typeof arg === 'string' && URL_LIKE.test(arg))) return [];
  return argv.filter((arg) => typeof arg === 'string'
    && !arg.includes('\0')
    && WINDOWS_ABSOLUTE.test(arg)
    && HTML_EXTENSIONS.has(path.win32.extname(arg).toLowerCase()));
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
