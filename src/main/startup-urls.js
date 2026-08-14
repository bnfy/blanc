'use strict';

/**
 * Default-browser and second-instance handoff accepts web URLs only.
 * Electron's file: implementation gives local documents broader filesystem
 * access than ordinary pages, so paths and every non-web scheme fail closed.
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
