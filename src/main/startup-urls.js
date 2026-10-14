'use strict';

/**
 * Default-browser and second-instance handoff accepts web URLs only.
 * Electron's file: implementation gives local documents broader filesystem
 * access than ordinary pages, so paths and every non-web scheme fail closed.
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

/** Open a multi-URL handoff without pretending every intermediate tab was
 * selected by the user. All URLs load, but only the final one becomes active. */
function externalUrlActivationPlan(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map((url, index) => ({
    url,
    activate: index === urls.length - 1,
  }));
}

module.exports = { externalUrlActivationPlan, webUrlsFromArgv };
