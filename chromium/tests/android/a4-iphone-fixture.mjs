// Writes what the Android phone puts on the wire, for the iPhone's own decoders to read
// (ios/Blanc/BlancTests/Sync/AndroidWireTests.swift): the sync bundle with the phone's platform,
// against the real Worker code, and each store as the Worker holds it. Run it after a change to
// what the phone writes:
//
//   node chromium/tests/android/a4-iphone-fixture.mjs
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Phone} from './support/spaces-phone.mjs';

const require = createRequire(import.meta.url);
const {createSyncFixture} = require('../../../test/desktop/support/sync-fixture.js');
const {deriveKeys} = require('../../../src/main/sync-crypto.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dest = path.join(root, 'ios/Blanc/BlancTests/Sync/Fixtures/android-written.json');
const account = {handle: 'android-wire', passphrase: 'correct horse battery staple'};

const worker = await createSyncFixture();
const forget = () => { for (const key of [...worker.env.records.keys()]) if (/^(rl|ip):/.test(key)) worker.env.records.delete(key); };
const pixel = new Phone('Pixel', worker.url, forget);
const desk = new Phone('Desk', worker.url, forget, 'darwin');
if (!(await pixel.device.sync.enable(account)).ok) throw Error('account');
if (!(await desk.device.sync.enable(account)).ok) throw Error('second device');
pixel.device.sync.setSyncTabs(true);
desk.device.sync.setSyncTabs(true);
await pixel.call('phone.setTabs', [{url: 'https://tab.example/', title: 'A tab'}]);
pixel.addRow('space-a', 'Work', ['https://space.example/']);
pixel.show('space-a', ['https://space.example/']);
await pixel.push();
if (!(await pixel.call('spaces.apply', {enabled: true, selections: [{id: 'space-a', mode: 'copy'}]})).ok) throw Error('share');
await pixel.call('closed.add', {id: 'c'.repeat(32), url: 'https://closed.example/', title: 'Closed', closedAt: Date.now(), spaceId: null});
await pixel.pass();
await desk.pass();
await pixel.pass();
const target = pixel.device.sync.listSendTargets()[0];
if (!target) throw Error('no device to send to');
const sent = await pixel.device.sync.sendTab({url: 'https://sent.example/', title: 'Sent', to: target.id});
if (sent.status !== 'sent') throw Error(`send: ${JSON.stringify(sent)}`);
await pixel.pass();

const {accountId, key} = deriveKeys(account.handle, account.passphrase);
const stores = {};
for (const [name, record] of worker.env.records) {
  const match = /^blob:([^:]+):(.+)$/.exec(name);
  if (match?.[1] === accountId) stores[match[2]] = JSON.parse(typeof record === 'string' ? record : JSON.stringify(record)).blob;
}
const context = pixel.device.sync.sharedContext();
const blobs = pixel.device.module('shared-spaces').rebind(context.accountId).data.blobs;
const fixture = {contentKey: key.toString('hex'), deviceId: context.deviceId, sentTo: target.id, now: Date.now(), stores,
  spaceBlob: Object.values(blobs)[0].blob};
fs.writeFileSync(dest, `${JSON.stringify(fixture, null, 2)}\n`);
await worker.close();
process.exit(0);
