'use strict';

// Start Page pins ride in the encrypted settings payload (sync.js). This runs
// two devices' settings stores and pin stores through the same export, merge
// and no-op rules sync.js applies, with the network replaced by one blob.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SYNC = fs.readFileSync(path.join(__dirname, '../../src/main/sync.js'), 'utf8');

function freshDevice(name) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-pin-sync-${name}-`));
  const electronId = require.resolve('electron');
  require.cache[electronId] = {
    id: electronId, filename: electronId, loaded: true,
    exports: { app: { getPath: () => userData, on: () => {}, isPackaged: false }, nativeTheme: {}, safeStorage: {} },
  };
  for (const mod of ['store', 'settings', 'start-page-pins']) {
    delete require.cache[require.resolve(`../../src/main/${mod}`)];
  }
  const settings = require('../../src/main/settings');
  const pins = require('../../src/main/start-page-pins');
  // The same composition sync.js's settings store uses.
  const withPins = new Function('startPagePins', `${SYNC.match(/function withStartPagePins\(payload\) \{[\s\S]*?\n\}/)[0]}; return withStartPagePins;`)(pins);
  return {
    settings,
    pins,
    export: () => withPins(settings.exportForSync()),
    merge: (remote) => {
      settings.mergeFromSync(remote);
      pins.mergeFromSync({
        value: remote?.values?.startPagePins,
        at: remote?.meta?.startPagePins,
        tie: remote?.tieBreakers?.startPagePins,
      });
    },
  };
}

function pass(device, server) {
  if (server.blob) device.merge(server.blob);
  const exported = device.export();
  if (server.blob && device.settings.syncPayloadEquals(exported, server.blob)) return false;
  server.blob = JSON.parse(JSON.stringify(exported));
  return true;
}

test('sync.js sends pins with settings and syncs after a local pin change', () => {
  assert.match(SYNC, /export: \(\) => withStartPagePins\(settings\.exportForSync\(\)\)/);
  assert.match(SYNC, /startPagePins\.onChanged\(\(\) => \{\s*if \(isDefaultLocalProfile\(\)\) onDefaultLocalChange\(\);/);
});

test('a pin made on one Mac reaches the other, and agreeing Macs stop uploading', () => {
  const server = {};
  const macA = freshDevice('a');
  macA.pins.pin({ url: 'https://cnet.com/article/two', title: 'CNET – technology news and reviews' });
  assert.equal(pass(macA, server), true);
  assert.deepEqual(server.blob.values.startPagePins, [{ url: 'https://cnet.com/article/two', title: 'CNET – technology news and reviews' }]);

  const macB = freshDevice('b');
  assert.equal(pass(macB, server), false, 'B adopts A’s list and has nothing new to say');
  assert.deepEqual(macB.pins.listPins().map((pin) => pin.url), ['https://cnet.com/article/two']);

  macB.pins.unpin('https://cnet.com/article/two');
  assert.equal(pass(macB, server), true);
  assert.deepEqual(server.blob.values.startPagePins, []);
});

test('a blob from a Blanc that predates pins is repaired, not obeyed', () => {
  const server = {};
  const mac = freshDevice('repair');
  mac.pins.pin({ url: 'https://kept.test/', title: 'Kept' });
  pass(mac, server);
  // An older Blanc merges, then uploads only the settings it knows.
  delete server.blob.values.startPagePins;
  delete server.blob.meta.startPagePins;
  delete server.blob.tieBreakers.startPagePins;
  assert.equal(pass(mac, server), true, 'the next pass puts the pins back');
  assert.deepEqual(mac.pins.listPins().map((pin) => pin.url), ['https://kept.test/']);
  assert.ok(server.blob.values.startPagePins);
});
