'use strict';

// A session has only one onBeforeRequest listener. Keep blocker state and
// site exceptions in this single policy, including after runtime toggles.
function createBeforeRequestPolicy({ isBlockingEnabled, isExcepted, blockRequest }) {
  return (details, callback) => {
    if (!isBlockingEnabled() || isExcepted(details)) return callback({});
    blockRequest(details, callback);
  };
}

module.exports = { createBeforeRequestPolicy };
