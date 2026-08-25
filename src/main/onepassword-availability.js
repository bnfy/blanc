'use strict';

// The first production release is macOS-only. Keep platform expansion behind
// this one pure boundary so a future Windows/Linux rollout requires an
// explicit code and test change instead of accidentally surfacing dormant UI.
function isOnePasswordAvailable(platform = process.platform) {
  return platform === 'darwin';
}

module.exports = { isOnePasswordAvailable };
