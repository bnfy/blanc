// The runner's bundle is shipping's sync from the pinned tag plus the shims, and in a bare V8
// context, with nothing of Node's, it syncs against the real Worker code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {bundle, hashHeader, sha256} from './build-sync-bundle.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.resolve(here, '../blanc/services/sync_runner');
const {peer} = require('../tests/android/support/sync-peer.cjs');
const {createSyncFixture} = require('../../test/desktop/support/sync-fixture.js');
const tag = (t => t.bundleTag ?? t.shippingTag)(JSON.parse(fs.readFileSync(path.resolve(here, '../tracker.json'), 'utf8')));

test('the committed bundle and its hash are what the tag and the shims produce', () => {
  const text = bundle(tag);
  assert.equal(fs.readFileSync(path.join(runner, 'generated/sync-bundle.js'), 'utf8'), text);
  assert.equal(fs.readFileSync(path.join(runner, 'bundle_hash.h'), 'utf8'), hashHeader(sha256(text)));
});

test('every shipped module in the bundle is byte for byte the tag\'s', () => {
  const text = fs.readFileSync(path.join(runner, 'generated/sync-bundle.js'), 'utf8');
  const root = path.resolve(here, '../..');
  for (const file of ['src/main/sync.js', 'src/main/sync-crypto.js', 'src/main/bookmarks.js', 'src/main/settings.js', 'src/main/shared-spaces-model.js'])
    assert.ok(text.includes(execFileSync('git', ['-C', root, 'show', `${tag}:${file}`], {encoding: 'utf8', maxBuffer: 1e8})), file);
});

test('Buffer matches Node on what sync encodes', () => {
  const Bare = peer('prelude', 'http://127.0.0.1:1').context.Buffer;
  for (const text of ['', 'plain', 'é€😀', 'lone \ud83d surrogate', '\u0000\u007f\u0080\u07ff\u0800\uffff']) {
    for (const encoding of ['hex', 'base64', 'base64url']) assert.equal(Bare.from(text).toString(encoding), Buffer.from(text).toString(encoding), text);
    assert.equal(Bare.from(Bare.from(text).toString('base64'), 'base64').toString(), Buffer.from(text).toString(), text);
    assert.equal(Bare.byteLength(text), Buffer.byteLength(text), text);
  }
  for (const hex of ['ff', 'c0af', 'e28', 'f09f98', 'eda080', 'f4908080', 'c3a9ff'])
    assert.equal(Bare.from(hex, 'hex').toString(), Buffer.from(hex, 'hex').toString(), hex);
});

const urls = device => [...device.module('bookmarks').listBookmarks()].map(b => b.url).sort();

test('two devices pair and sync a Favorite both ways', async () => {
  const worker = await createSyncFixture();
  try {
    const first = peer('First', worker.url), second = peer('Second', worker.url);
    assert.equal((await first.sync.startNew({handle: 'tester'})).ok, true);
    first.module('bookmarks').saveFavorite('https://example.org/first', 'First');
    await first.pass();
    first.sync.resetRequestWindowForTest();
    const pairing = await first.sync.beginPairing();
    assert.equal((await second.sync.joinWithCode(pairing.code)).ok, true);
    await second.pass();
    assert.deepEqual(urls(second), ['https://example.org/first']);
    second.module('bookmarks').saveFavorite('https://example.org/second', 'Second');
    await second.pass();
    await first.pass();
    assert.deepEqual(urls(first), ['https://example.org/first', 'https://example.org/second']);
    assert.ok(first.stores['sync.json'], 'stores reach the host');
    assert.ok(!Buffer.from(first.stores['sync.json']).toString().includes(pairing.code));
  } finally {
    await worker.close();
  }
});

test('a setting this bundle does not know survives a merge and is published again', async () => {
  const device = peer('Keeps', 'http://127.0.0.1:1');
  const settings = device.module('settings');
  settings.mergeFromSync({values: {futureSetting: 'kept', theme: 'dark'}, meta: {futureSetting: 5, theme: 6}, tieBreakers: {futureSetting: 'z'}});
  const out = settings.exportForSync();
  assert.equal(out.values.futureSetting, 'kept');
  assert.equal(out.meta.futureSetting, 5);
  assert.equal(out.tieBreakers.futureSetting, 'z');
  assert.equal(settings.getSettings().futureSetting, undefined, 'never applied');
  settings.mergeFromSync({values: {futureSetting: 'older'}, meta: {futureSetting: 4}});
  assert.equal(settings.exportForSync().values.futureSetting, 'kept', 'an older clock loses');
  const again = peer('Again', 'http://127.0.0.1:1', {stores: device.stores});
  assert.equal(again.module('settings').exportForSync().values.futureSetting, 'kept', 'kept across a restart');
});

test('a value this version cannot hold for a known setting is published as it came', () => {
  const device = peer('Newer enum', 'http://127.0.0.1:1');
  const settings = device.module('settings');
  settings.mergeFromSync({values: {theme: 'sepia'}, meta: {theme: 7}, tieBreakers: {theme: 'z'}});
  assert.notEqual(settings.getSettings().theme, 'sepia', 'never applied');
  assert.equal(settings.exportForSync().values.theme, 'sepia');
  settings.setSettings({theme: 'dark'});
  assert.equal(settings.exportForSync().values.theme, 'dark', 'a change here wins with its newer clock');
});

test('runner.flush saves a pending store now', async () => {
  const device = peer('Flush', 'http://127.0.0.1:1');
  device.module('bookmarks').saveFavorite('https://example.org/flushed', 'Flushed');
  assert.equal(device.stores['bookmarks.json'], undefined, 'still debounced');
  await new Promise(done => device.context.__call('runner.flush', '[]', done));
  assert.match(Buffer.from(device.stores['bookmarks.json']).toString(), /flushed/);
});

test('a call is saved before it answers', async () => {
  const device = peer('Saved', 'http://127.0.0.1:1');
  const answer = await new Promise(done => device.context.__call('bookmarks.saveFavorite', '["https://example.org/kept","Kept"]', (ok, value) => done({ok, value})));
  assert.equal(answer.ok, true);
  const saved = JSON.parse(Buffer.from(device.stores['bookmarks.json']).toString());
  assert.deepEqual(saved.items.map(item => item.url), ['https://example.org/kept']);
});

test('Recently closed is only there with the Spaces switch on', async () => {
  const worker = await createSyncFixture();
  try {
    const device = peer('Closes', worker.url);
    assert.equal((await device.sync.startNew({handle: 'closer'})).ok, true);
    const call = (method, args = []) => new Promise(done => device.context.__call(method, JSON.stringify(args), (ok, value) => done({ok, value: JSON.parse(value)})));
    const item = {id: 'row-1', url: 'https://example.org/closed', title: 'Closed', closedAt: Date.now(), spaceId: null};
    assert.equal((await call('closed.add', [item])).value, false);
    assert.deepEqual((await call('closed.inbox')).value, []);
    device.sync.setSyncSpaces(true);
    assert.equal((await call('closed.add', [item])).value, true);
    const own = device.module('synced-closed').rebind(device.sync.sharedContext().accountId).data.devices;
    assert.deepEqual(Object.values(own).flatMap(entry => [...entry.items]).map(row => row.id), ['row-1']);
    // Clear all needs only Sync on, as on the iPhone: this phone's entry empties with the switch off.
    device.sync.setSyncSpaces(false);
    await call('closed.clear');
    const cleared = device.module('synced-closed').rebind(device.sync.sharedContext().accountId).data.devices;
    assert.deepEqual(Object.values(cleared).flatMap(entry => [...entry.items]), []);
  } finally {
    await worker.close();
  }
});

test('a pairing code survives the save after its own call', async () => {
  const worker = await createSyncFixture();
  try {
    const device = peer('Pairs', worker.url);
    await device.sync.startNew({handle: 'tester'});
    device.sync.resetRequestWindowForTest();
    const call = (method, args = []) => new Promise(done => device.context.__call(method, JSON.stringify(args), (ok, value) => done({ok, value: JSON.parse(value)})));
    const {value} = await call('sync.beginPairing');
    assert.equal(value.ok, true);
    await call('bookmarks.listBookmarks');
    assert.equal((await call('sync.pairingState')).value.active, true);
    const other = peer('Joins', worker.url);
    assert.equal((await other.sync.joinWithCode(value.code)).ok, true);
  } finally {
    await worker.close();
  }
});
