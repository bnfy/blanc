// Shared Spaces through the runner's shim: two phones on one account, each a fake of what Java does,
// against the real Worker code. Run with `node --test chromium/tools/sync-spaces.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {peer} = require('../tests/android/support/sync-peer.cjs');
const {createSyncFixture} = require('../../test/desktop/support/sync-fixture.js');

// The Worker allows an account 30 reads a minute, and these passes take milliseconds.
let fixture;
const forgetLimits = () => { for (const key of [...fixture.env.records.keys()]) if (/^(rl|ip):/.test(key)) fixture.env.records.delete(key); };
const settled = () => new Promise(done => setTimeout(done, 20));

// What Java does: holds the library and the shown tabs, answers rows, and takes the runner's changes.
class Phone {
  constructor(name, url) {
    this.tabs = [];          // {local, shared, url, title, pinned, group}
    this.rows = [];
    this.shownId = null;
    this.revision = 0;
    this.nextLocal = 1;
    this.applied = [];
    this.layouts = [];
    this.deleted = [];
    this.refuse = false;
    this.device = peer(name, url, {emit: (event, text) => this.on(event, JSON.parse(text || 'null'))});
  }
  call(method, ...args) {
    return new Promise((done, fail) => this.device.context.__call(method, JSON.stringify(args),
      (ok, value) => ok ? done(JSON.parse(value)) : fail(Error(value))));
  }
  on(event, value) {
    if (event === 'spaces-library') {
      this.revision = value.revision;
      this.rows = value.rows;
      for (const row of this.rows) if (row.id === this.shownId && row.tabIds) {
        row.localIds?.forEach((local, index) => {
          const tab = this.tabs.find(item => item.local === local);
          if (tab) tab.shared = row.tabIds[index];
        });
      }
    }
    if (event === 'spaces-bindings') {
      value.localIds.forEach((local, index) => {
        const tab = this.tabs.find(item => item.local === local);
        if (tab && value.tabIds[index]) tab.shared = value.tabIds[index];
      });
    }
    if (event === 'spaces-layout') this.layouts.push(value);
    if (event === 'spaces-deleted') this.deleted.push(value.id);
    if (event === 'spaces-row') {
      this.applied.push(value.row);
      const ok = !this.refuse && this.applyRow(value.row);
      this.device.context.__call('spaces.rowDone', JSON.stringify([value.token, ok]), () => {});
    }
  }
  applyRow(row) {
    if (row.kind !== 'tabs') return true;
    const tab = this.tabs.find(item => item.shared === row.id);
    if (row.op === 'create') {
      if (!tab) this.tabs.push({local: `n${this.nextLocal++}`, shared: row.id, url: row.record.nav.v.url,
        title: row.record.nav.v.title, pinned: row.record.pinned.v, group: row.record.groupId.v, quiet: row.quiet === true});
      return true;
    }
    if (!tab) return true;
    if (row.op === 'close') this.tabs = this.tabs.filter(item => item !== tab);
    if (row.field === 'nav') tab.url = row.value.v.url;
    if (row.field === 'pinned') tab.pinned = row.value.v;
    if (row.field === 'groupId') tab.group = row.value.v;
    return true;
  }
  capture() {
    if (!this.shownId) return null;
    return {urls: this.tabs.map(tab => tab.url), tabIds: this.tabs.map(tab => tab.shared ?? null), localIds: this.tabs.map(tab => tab.local),
      meta: this.tabs.map(tab => ({title: tab.title})), pinned: this.tabs.map(tab => !!tab.pinned),
      groupIds: this.tabs.map(tab => tab.group ?? null), groups: this.groups ?? [], activeIndex: 0,
      documentPolicy: 1, inheritsDocumentPolicy: this.tabs.map(() => false), localFiles: this.tabs.map(() => false)};
  }
  async push(protectedIds = []) {
    const shown = this.capture();
    const rows = this.rows.map(row => row.id === this.shownId ? {...row, ...shown} : row);
    const answer = await this.call('spaces.push', {revision: this.revision, rows, shownId: this.shownId, capture: shown, protectedIds, recoveryFormat: '{name} · kept here'});
    await settled();
    return answer;
  }
  addRow(id, name, urls) {
    this.rows.push({id, name, color: '#376694', symbol: 'book', urls, tabIds: urls.map(() => null), localIds: urls.map((_, index) => `h${index}`),
      meta: urls.map(() => ({title: ''})), pinned: urls.map(() => false), groupIds: urls.map(() => null), groups: [], activeIndex: 0,
      documentPolicy: 1, inheritsDocumentPolicy: urls.map(() => false), localFiles: urls.map(() => false)});
  }
  show(id, urls) {
    this.shownId = id;
    this.tabs = urls.map(url => ({local: `l${this.nextLocal++}`, url, title: '', pinned: false}));
  }
  async pass() {
    // Spaces take more requests than one window allows; a phone would wait the window out.
    const reopen = () => { this.device.sync.resetRequestWindowForTest(); forgetLimits(); };
    const open = setInterval(reopen, 100);
    reopen();
    try { await this.device.sync.syncNow(); } finally { clearInterval(open); }
    await settled();
  }
}

async function pair(worker) {
  const a = new Phone('A', worker.url), b = new Phone('B', worker.url);
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
