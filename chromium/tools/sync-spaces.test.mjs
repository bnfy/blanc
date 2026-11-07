// Shared Spaces through the runner's shim: two phones on one account, each a fake of what Java does,
// against the real Worker code. Run with `node --test chromium/tools/sync-spaces.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Phone} from '../tests/android/support/spaces-phone.mjs';

const require = createRequire(import.meta.url);
const {peer} = require('../tests/android/support/sync-peer.cjs');
const {createSyncFixture} = require('../../test/desktop/support/sync-fixture.js');

// The Worker allows an account 30 reads a minute, and these passes take milliseconds.
let fixture;
const forgetLimits = () => { for (const key of [...fixture.env.records.keys()]) if (/^(rl|ip):/.test(key)) fixture.env.records.delete(key); };
const settled = () => new Promise(done => setTimeout(done, 20));

async function pair(worker) {
  const a = new Phone('A', worker.url, forgetLimits), b = new Phone('B', worker.url, forgetLimits);
  assert.equal((await a.device.sync.startNew({handle: 'spaces'})).ok, true);
  const {code} = await a.device.sync.beginPairing();
  assert.equal((await b.device.sync.joinWithCode(code)).ok, true);
  return {a, b};
}

// Phone A shows a shared Space; phone B has turned the switch on and holds it too.
async function shared(worker) {
  const {a, b} = await pair(worker);
  a.addRow('space-a', 'Work', ['https://one.example/', 'https://two.example/']);
  a.show('space-a', ['https://one.example/', 'https://two.example/']);
  await a.push();
  const made = await a.call('spaces.apply', {enabled: true, selections: [{id: 'space-a', mode: 'copy'}]});
  assert.equal(made.ok, true, JSON.stringify(made));
  await a.pass();
  await b.push();
  assert.equal((await b.call('spaces.apply', {enabled: true, selections: []})).ok, true);
  await b.pass();
  await settled();
  return {a, b};
}

const withWorker = body => async () => {
  const worker = fixture = await createSyncFixture();
  try { await body(worker); } finally { await worker.close(); }
};

test('a shared Space reaches the other phone as a Space of its own', withWorker(async worker => {
  const {a, b} = await shared(worker);
  const row = b.rows.find(item => item.name === 'Work');
  assert.ok(row, JSON.stringify(b.rows));
  assert.deepEqual(row.urls, ['https://one.example/', 'https://two.example/']);
  assert.equal(row.sharedLink, 'active');
  assert.equal(a.rows[0].sharedId, row.sharedId);
  assert.ok(a.tabs.every(tab => /^[0-9a-f]{32}$/.test(tab.shared)), JSON.stringify(a.tabs));
}));

test('a tab added on one phone reaches the other, hidden or shown, quietly', withWorker(async worker => {
  const {a, b} = await shared(worker);
  const row = b.rows.find(item => item.name === 'Work');
  b.show(row.id, []);
  b.tabs = row.urls.map((url, index) => ({local: `b${index}`, shared: row.tabIds[index], url, title: ''}));
  await b.push();
  a.tabs.push({local: 'new', url: 'https://three.example/', title: 'Three'});
  await a.push();
  await a.pass();
  await b.pass();
  const added = b.tabs.find(tab => tab.url === 'https://three.example/');
  assert.ok(added, JSON.stringify(b.tabs));
  assert.equal(added.quiet, true);
  assert.equal(b.tabs.filter(tab => tab.url === 'https://one.example/').length, 1);
}));

test('a remote close of the tab on screen waits, and the others go', withWorker(async worker => {
  const {a, b} = await shared(worker);
  const row = b.rows.find(item => item.name === 'Work');
  b.show(row.id, []);
  b.tabs = row.urls.map((url, index) => ({local: `b${index}`, shared: row.tabIds[index], url, title: ''}));
  await b.push([b.tabs[0].shared]);
  a.tabs = [];
  await a.push();
  await a.pass();
  await b.pass();
  assert.deepEqual(b.tabs.map(tab => tab.url), ['https://one.example/']);
}));

test('a switch in progress holds everything: nothing is read from or done to the tabs', withWorker(async worker => {
  const {a, b} = await shared(worker);
  const row = b.rows.find(item => item.name === 'Work');
  b.show(row.id, []);
  b.tabs = row.urls.map((url, index) => ({local: `b${index}`, shared: row.tabIds[index], url, title: ''}));
  await b.push();
  await b.call('spaces.hold');
  b.applied = [];
  a.tabs = a.tabs.slice(0, 1);
  await a.push();
  await a.pass();
  await b.pass();
  assert.deepEqual(b.applied, []);
  assert.equal(b.tabs.length, 2);
  // The switch ends: the waiting close lands.
  await b.push();
  await settled();
  await b.push();
  assert.equal(b.tabs.length, 1);
}));

test('a background run with no window keeps the Space as it is', withWorker(async worker => {
  const {a, b} = await shared(worker);
  const spaceId = a.rows[0].sharedId;
  // Blanc killed, then started by the background job: its stores, and no tabs from Java.
  const restarted = peer('A', worker.url, {stores: a.device.stores});
  const open = setInterval(() => { restarted.sync.resetRequestWindowForTest(); forgetLimits(); }, 100);
  try { await restarted.sync.syncNow(); } finally { clearInterval(open); }
  await b.pass();
  const blob = b.device.module('shared-spaces').snapshot(b.device.sync.sharedContext()).blobs[spaceId].blob;
  assert.equal(Object.values(blob.tabs).filter(tab => tab.deleted.v).length, 0);
  assert.deepEqual([...restarted.context.__require('shim:spaces').visible()], [spaceId]);
}));

test('deleting a Space takes it off the other phone and frees the account', withWorker(async worker => {
  const {a, b} = await shared(worker);
  await a.call('spaces.metadata', 'space-a', {deleted: true});
  await a.pass();
  await b.pass();
  assert.equal(b.rows.some(row => row.name === 'Work'), false, JSON.stringify(b.rows));
  assert.equal((await b.call('spaces.status')).spaces, 0);
}));

test('turning the switch off keeps the Space here, dormant, and the other phone unchanged', withWorker(async worker => {
  const {a, b} = await shared(worker);
  assert.equal((await a.call('spaces.apply', {enabled: false})).ok, true);
  assert.equal(a.rows[0].sharedLink, 'dormant');
  await a.pass();
  await b.pass();
  assert.ok(b.rows.some(row => row.name === 'Work'));
  const preview = await a.call('spaces.preview', {local: true});
  assert.equal(preview.choices[0].mode, 'rejoin');
}));

test('a stale push is refused, so a change the runner made is never overwritten', withWorker(async worker => {
  const {a} = await shared(worker);
  const answer = await a.call('spaces.push', {revision: 0, rows: [], shownId: null, capture: null});
  assert.equal(answer.stale, true);
  assert.equal(a.rows.length, 1);
}));
