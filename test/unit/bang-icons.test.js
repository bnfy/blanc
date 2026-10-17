'use strict';

// The main-process bang icon service: the on-device store, the request queue
// and the outcomes of asking Blanc's icon server. Network and conversion are
// fakes; the rules come from the real bang-icons-policy module.
const assert = require('node:assert/strict');
const test = require('node:test');

const { createBangIcons } = require('../../src/main/bang-icons');
const { REFRESH_AFTER_MS } = require('../../src/main/bang-icons-policy');

const NOW = 1_800_000_000_000;
const ALLOW = { enabled: true, setupComplete: true, privateActive: false, customHosts: new Set() };

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function fakeStore(records = []) {
  return { data: { records }, update(fn) { fn(this.data); } };
}

function harness({ records = [], hosts = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example'] } = {}) {
  const calls = [];
  const pending = new Map();
  const store = fakeStore(records);
  const service = createBangIcons({
    store,
    catalogHosts: new Set(hosts),
    now: () => NOW,
    readIconBytes: (url, options) => {
      calls.push({ url, options });
      const d = deferred();
      pending.set(url.split('/').pop(), d);
      return d.promise;
    },
    sanitizeIconBytes: async (contentType, bytes) => (bytes ? VALID_ICON : null),
  });
  const changes = [];
  service.onChange((host, icon) => changes.push([host, icon]));
  const settle = () => new Promise((r) => setImmediate(r));
  return { calls, pending, store, service, changes, settle };
}

test('held returns a stored icon and marks it stale after 30 days', () => {
  const { service } = harness({
    records: [
      { host: 'a.example', icon: VALID_ICON, fetchedAt: NOW - 1000, usedAt: NOW },
      { host: 'b.example', icon: VALID_ICON, fetchedAt: NOW - REFRESH_AFTER_MS - 1, usedAt: NOW },
    ],
  });
  assert.deepEqual(service.held('a.example'), { icon: VALID_ICON, stale: false });
  assert.deepEqual(service.held('b.example'), { icon: VALID_ICON, stale: true });
  assert.equal(service.held('c.example'), null);
});

test('request fetches the server URL with the endpoint options', () => {
  const { service, calls } = harness();
  service.request(['a.example'], ALLOW);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://blanc.day/bang-icons/a.example');
  assert.deepEqual(calls[0].options, { timeoutMs: 8000, maxRedirects: 0, statusResult: true });
});

test('a fetched icon is stored and emitted once', async () => {
  const { service, pending, store, changes, settle } = harness();
  service.request(['a.example'], ALLOW);
  pending.get('a.example').resolve({ contentType: 'image/png', bytes: Buffer.from('A') });
  await settle();
  const icon = VALID_ICON;
  assert.deepEqual(changes, [['a.example', icon]]);
  assert.equal(store.data.records[0].host, 'a.example');
  assert.equal(store.data.records[0].icon, icon);
  service.request(['a.example'], ALLOW);
  assert.deepEqual(service.requestedHosts(), ['a.example'], 'a fresh copy is not asked for again');
});

test('a host already in flight is not fetched twice', () => {
  const { service, calls } = harness();
  service.request(['a.example'], ALLOW);
  service.request(['a.example'], ALLOW);
  assert.equal(calls.length, 1);
});

test('no more than four fetches run at once', async () => {
  const { service, calls, pending, settle } = harness();
  service.request(['a.example', 'b.example', 'c.example', 'd.example', 'e.example', 'f.example'], ALLOW);
  assert.equal(calls.length, 4);
  pending.get('a.example').resolve(null);
  await settle();
  assert.equal(calls.length, 5, 'a finished fetch lets a queued one start');
});

test('request rechecks private per call', () => {
  const { service, calls } = harness();
  service.request(['a.example'], { ...ALLOW, privateActive: true });
  assert.equal(calls.length, 0);
  service.request(['a.example'], ALLOW);
  assert.equal(calls.length, 1);
});

test('custom and unknown hosts are never fetched', () => {
  const { service, calls } = harness();
  service.request(['intranet.example', 'a.example'], { ...ALLOW, customHosts: new Set(['a.example']) });
  assert.equal(calls.length, 0);
});

test('a refresh 404 drops the stored copy and emits null', async () => {
  const { service, pending, store, changes, settle } = harness({
    records: [{ host: 'a.example', icon: VALID_ICON, fetchedAt: NOW - REFRESH_AFTER_MS - 1, usedAt: NOW }],
  });
  service.request(['a.example'], ALLOW);
  pending.get('a.example').resolve({ status: 404 });
  await settle();
  assert.deepEqual(store.data.records, []);
  assert.deepEqual(changes, [['a.example', null]]);
  service.request(['a.example'], ALLOW);
  assert.deepEqual(service.requestedHosts(), ['a.example'], 'a 404 is not asked again this run');
});

test('a refresh failure keeps the stored copy', async () => {
  const { service, pending, store, changes, settle } = harness({
    records: [{ host: 'a.example', icon: VALID_ICON, fetchedAt: NOW - REFRESH_AFTER_MS - 1, usedAt: NOW }],
  });
  service.request(['a.example'], ALLOW);
  pending.get('a.example').resolve({ status: 503 });
  await settle();
  assert.equal(store.data.records[0].icon, VALID_ICON);
  assert.deepEqual(changes, []);
});

test('a fetch finishing after clear is discarded', async () => {
  const { service, pending, store, changes, settle } = harness({
    records: [{ host: 'b.example', icon: VALID_ICON, fetchedAt: NOW, usedAt: NOW }],
  });
  service.request(['a.example'], ALLOW);
  service.clear();
  assert.deepEqual(store.data.records, []);
  pending.get('a.example').resolve({ contentType: 'image/png', bytes: Buffer.from('A') });
  await settle();
  assert.deepEqual(store.data.records, []);
  assert.deepEqual(changes, []);
});

test('touch moves used hosts to the front of the store', () => {
  const { service, store } = harness({
    records: [
      { host: 'a.example', icon: VALID_ICON, fetchedAt: 1, usedAt: 1 },
      { host: 'b.example', icon: VALID_ICON, fetchedAt: 1, usedAt: 1 },
    ],
  });
  service.touch(['b.example']);
  assert.deepEqual(store.data.records.map((r) => r.host), ['b.example', 'a.example']);
  assert.equal(store.data.records[0].usedAt, NOW);
});

test('a reader that throws counts as a failure', async () => {
  const store = fakeStore();
  const service = createBangIcons({
    store,
    catalogHosts: new Set(['a.example']),
    now: () => NOW,
    readIconBytes: async () => { throw new Error('boom'); },
    sanitizeIconBytes: async () => 'X',
  });
  service.request(['a.example'], ALLOW);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(store.data.records, []);
});

test('a host still queued when history is cleared can be asked again', async () => {
  const { service, calls, pending, settle } = harness();
  service.request(['a.example', 'b.example', 'c.example', 'd.example', 'e.example'], ALLOW);
  assert.equal(calls.length, 4);
  service.clear();
  for (const host of ['a.example', 'b.example', 'c.example', 'd.example']) pending.get(host).resolve(null);
  await settle();
  service.request(['e.example'], ALLOW);
  assert.ok(calls.some((call) => call.url.endsWith('/e.example')), 'e.example was dropped from the queue, not stuck in flight');
});

test('test hooks list stored hosts and reset the run between scenarios', async () => {
  const { service, calls, pending, settle } = harness();
  service.request(['a.example'], ALLOW);
  pending.get('a.example').resolve({ status: 404 });
  await settle();
  assert.deepEqual(service.storedHostsForTest(), []);
  service.request(['b.example'], ALLOW);
  pending.get('b.example').resolve({ contentType: 'image/png', bytes: Buffer.from('B') });
  await settle();
  assert.deepEqual(service.storedHostsForTest(), ['b.example']);
  service.resetForTest();
  assert.deepEqual(service.requestedHosts(), []);
  assert.deepEqual(service.storedHostsForTest(), []);
  service.request(['a.example'], ALLOW);
  assert.deepEqual(service.requestedHosts(), ['a.example'], 'a 404 from before the reset is forgotten');
  assert.equal(calls.length, 2, 'the reset stub answers without the network');
});

// A real 32×32 PNG data URL (the history test fixture), so stored records pass
// the PNG-only check on read.
const VALID_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAABr0lEQVR4nLTWsUrDQBgH8O/7cmpr1aFj8Rmq+BSiaAdBqnZQfAlx8EnsIO1UcKhDfQkdbJd20EFBUKgFO0TTXM7vEhDR1ia55JZLLnC/u/93kBPKb57nSSkPj4+a9UZn5iQ3IhcUAYJxEzw7+k0IUT2vZmwcXvaXREG6nwrQXEBeu+5QPxASePC6feG0OpZYVK4EYwN5B9wpTyFpA7WJ/VLNbrUTMWivsm+POA1dBiJiTZHKNyvZjaJ0hygsHlAQv1kPnd5j935zp8TrRAVs6AkRsuWie/vi9J5IZEDHGHMfVnf2dLXjzd0McuUVfWq45okatOBYy1bho9V+K9VB11uHpQ69Ecyz4vPuOdLhetrpGIQ6F+TTkpKhp/CTTcugoEvPoO+nlAz6+ZKGQb/eEzfo71CyBo0dTdCgCeOJGROBpIz/gESMKYC5MR0wNEIBJkZYILYRAYhnRANiGJGBsMZVJbvOxnscIJSBmG8ezJfW8BnOIG7zz4niHDgNzoSTCWrKRnCTg6hFnr4Pxf94DGYPrtVGwBhjqwaOhOAuisY7GGNc3w12GzCS4C+fjS8AAAD///R8eLkAAAAGSURBVAMAqMIc5gOIAroAAAAASUVORK5CYII=';

test('held never hands the chrome anything but a valid stored PNG', () => {
  const { service } = harness({
    records: [
      { host: 'a.example', icon: 'data:image/svg+xml;base64,PHN2Zy8+', fetchedAt: NOW, usedAt: NOW },
      { host: 'b.example', icon: 'not an icon', fetchedAt: NOW, usedAt: NOW },
      { host: 'c.example', icon: VALID_ICON, fetchedAt: NOW, usedAt: NOW },
    ],
  });
  assert.equal(service.held('a.example'), null, 'an SVG data URL from a hand-edited file is ignored');
  assert.equal(service.held('b.example'), null);
  assert.deepEqual(service.held('c.example'), { icon: VALID_ICON, stale: false });
});

test('a stored record without a valid time is stale, so it gets refreshed', () => {
  const { service, calls } = harness({
    records: [{ host: 'a.example', icon: VALID_ICON, usedAt: NOW }],
  });
  assert.deepEqual(service.held('a.example'), { icon: VALID_ICON, stale: true });
  service.request(['a.example'], ALLOW);
  assert.equal(calls.length, 1);
});
