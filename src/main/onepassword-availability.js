'use strict';

// 1Password login fill runs on every desktop platform the pinned SDK can reach
// through the installed 1Password app: macOS, Windows and Linux. Anything else
// fails closed, so a new platform needs an explicit code and test change
// instead of accidentally surfacing dormant UI.
const SUPPORTED_PLATFORMS = new Set(['darwin', 'win32', 'linux']);

function isOnePasswordAvailable(platform = process.platform) {
  return SUPPORTED_PLATFORMS.has(platform);
}

module.exports = { isOnePasswordAvailable };
