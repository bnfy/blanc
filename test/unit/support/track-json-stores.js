'use strict';
// JsonStore's routine saves are written off the main thread, and a store
// queues a rewrite behind any write in flight. A test that removes its
// temporary userData while one is still running races it: on Windows the open
// temp file makes the removal fail (ENOTEMPTY), and a queued rewrite recreates
// the folder everywhere. Call trackJsonStores() after mocking electron and
// before requiring anything that creates a store; await settle() in teardown
// before removing the folder.

function trackJsonStores() {
  const storeModule = require('../../../src/main/store');
  const stores = [];
  storeModule.JsonStore = class extends storeModule.JsonStore {
    constructor(...args) {
      super(...args);
      stores.push(this);
    }
  };
  return {
    async settle() {
      // Write any pending save now rather than after the folder is gone, then
      // wait out the writes already in flight.
      for (const store of stores) store.flushPending();
      for (const store of stores) await store.settled();
    },
  };
}

module.exports = { trackJsonStores };
