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

module.exports = { webUrlsFromArgv };
