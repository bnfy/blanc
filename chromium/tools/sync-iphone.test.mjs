// What the iPhone writes (ios/Blanc/BlancTests/Sync/Fixtures/iphone-written.json, pinned by
// AndroidWireTests.swift), read by Android's runner on the real Worker code. Run with
// `node --test chromium/tools/sync-iphone.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Phone} from '../tests/android/support/spaces-phone.mjs';

const require = createRequire(import.meta.url);
const {createSyncFixture} = require('../../test/desktop/support/sync-fixture.js');
const {deriveKeys, encrypt, decrypt} = require('../../src/main/sync-crypto.js');
// Device ids are UUIDs: tab sync drops any other.
const IPHONE = '0f0e0d0c-0b0a-4908-8706-050403020100';
const written = fs.readFileSync(new URL('../../ios/Blanc/BlancTests/Sync/Fixtures/iphone-written.json', import.meta.url), 'utf8');

test('Android reads a tab, a closed page and a sent page the iPhone wrote', async () => {
  const worker = await createSyncFixture();
  try {
    const forget = () => { for (const key of [...worker.env.records.keys()]) if (/^(rl|ip):/.test(key)) worker.env.records.delete(key); };
    const account = {handle: 'iphone-wire', passphrase: 'correct horse battery staple'};
    const pixel = new Phone('Pixel', worker.url, forget);
    assert.equal((await pixel.device.sync.enable(account)).ok, true);
    pixel.device.sync.setSyncTabs(true);
    pixel.device.sync.setSyncSpaces(true);
    // The phone's tab list: until it's there, the session store waits, as on a phone that hasn't drawn yet.
    await pixel.call('phone.setTabs', []);
    await pixel.pass();
    const own = pixel.device.sync.sharedContext().deviceId;
    // The fixture's fixed time, moved to now: these stores expire what's old.
    const entries = JSON.parse(written.replaceAll('1800000000000', String(Date.now() - 1000)).replaceAll('android-phone', own));
    const {accountId, key} = deriveKeys(account.handle, account.passphrase);
    // Through the Worker's own API, as the iPhone's client writes: next to what's there.
    for (const store of ['session', 'closed', 'sends']) {
      const url = `${worker.url}/v1/blob/${accountId}/${store}`;
      const current = await fetch(url);
      const held = current.ok ? await current.json() : null;
      const payload = held ? JSON.parse(decrypt(key, held.blob)) : {devices: {}};
      payload.devices[IPHONE] = entries[store];
      const put = await fetch(url, {method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ifVersion: held?.version ?? null, blob: encrypt(key, JSON.stringify(payload))})});
      assert.equal(put.status, 200, `${store}: ${await put.text()}`);
      forget();
    }
    await pixel.pass();
    const remote = await pixel.call('sync.listRemoteDevices');
    assert.deepEqual(remote.find(device => device.deviceId === IPHONE)?.tabs.map(tab => tab.url), ['https://iphone-tab.example/']);
    assert.deepEqual((await pixel.call('closed.inbox')).map(row => row.url), ['https://iphone-closed.example/']);
    assert.deepEqual((await pixel.call('sync.listSentToThisDevice')).map(item => item.url), ['https://iphone-sent.example/']);
  } finally {
    await worker.close();
  }
});
