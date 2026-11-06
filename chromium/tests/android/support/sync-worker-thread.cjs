// The real Worker code, on its own thread: adb and sleep() block the test's thread, and a server
// there would stop answering (see startFixtures).
const {parentPort} = require('node:worker_threads');
const path = require('node:path');
const {createSyncFixture} = require(path.resolve(__dirname, '../../../../test/desktop/support/sync-fixture.js'));

createSyncFixture().then(fixture => parentPort.postMessage({url: fixture.url}));
