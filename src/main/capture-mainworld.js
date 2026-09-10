// Exports the main-world capture instrumentation source for unit tests.
// The authoritative copy lives INLINE in capture-preload.js (sandboxed
// session preloads cannot require relative modules), between the
// `>>> mainworld` / `<<< mainworld` markers; this module extracts those
// exact shipped bytes so the vm tests can never drift from what runs.
// SECURITY NOTE (spec §9): the instrumentation runs in the page's world and
// is forgeable by the page. Its reports REFINE DISPLAY STATE toward off;
// they are not security truth. The unspoofable on-signal is the main-process
// permission grant; macOS's system capture indicator is the authoritative
// malicious-page backstop.
const fs = require('fs');
const path = require('path');
const { captureRuntimeForPlatform } = require('./capture-platform');

function captureMainworldSourceForPlatform(platform = process.platform) {
  const { preload } = captureRuntimeForPlatform(platform);
  const preloadSource = fs.readFileSync(path.join(__dirname, preload), 'utf8');
  const match = preloadSource.match(
    /\/\/ >>> mainworld\nconst CAPTURE_MAINWORLD_SOURCE = `([\s\S]*?)`;\n\/\/ <<< mainworld/
  );
  if (!match) throw new Error(`${preload}: mainworld markers missing or malformed`);
  return match[1];
}

module.exports = {
  CAPTURE_MAINWORLD_SOURCE: captureMainworldSourceForPlatform(),
  captureMainworldSourceForPlatform,
};
