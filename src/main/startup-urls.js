'use strict';

const path = require('node:path');
const { HTML_EXTENSIONS } = require('./local-html-files');

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
  return argv.filter((arg) => typeof arg === 'string'
    && !arg.startsWith('-')
    && !arg.includes('\0')
    && path.win32.isAbsolute(arg)
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
