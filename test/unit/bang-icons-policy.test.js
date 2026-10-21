'use strict';

// Site icons on the ⌘L panel's bang rows: the rules for when Blanc's icon
// server may be asked, and the bounded on-device store's records. Design:
// docs/superpowers/specs/2026-10-17-bang-icons-in-app-design.md.
const assert = require('node:assert/strict');
const test = require('node:test');

const Bangs = require('../../src/renderer/pages/bangs');
const policy = require('../../src/main/bang-icons-policy');

const {
  REFRESH_AFTER_MS,
  RETRY_AFTER_MS,
  STORE_CAP,
  createRunState,
  mayFetch,
  putRecord,
  touchRecords,
  dropRecord,
  storedState,
  iconUrl,
  catalogHostSet,
  customHostSet,
} = policy;

const NOW = 1_800_000_000_000;

function baseline(overrides = {}) {
  return {
    host: 'www.youtube.com',
    enabled: true,
    setupComplete: true,
    privateActive: false,
    catalogHosts: new Set(['www.youtube.com']),
    customHosts: new Set(),
    record: null,
    run: createRunState(),
    now: NOW,
    ...overrides,
  };
}

test('the server URL and the pinned values match the design', () => {
  assert.equal(iconUrl('www.youtube.com'), 'https://blanc.day/bang-icons/www.youtube.com');
  assert.equal(policy.FETCH_TIMEOUT_MS, 8000);
  assert.equal(policy.MAX_IN_FLIGHT, 4);
  assert.equal(RETRY_AFTER_MS, 30000);
  assert.equal(policy.MAX_RETRIES_PER_RUN, 2);
  assert.equal(REFRESH_AFTER_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(STORE_CAP, 300);
  assert.equal(policy.VISIBLE_DELAY_MS, 300);
});

test('mayFetch refuses when bangs are off, before setup, in a private tab, for a non-catalog host and for a custom template host', () => {
  assert.equal(mayFetch(baseline()), true);
  assert.equal(mayFetch(baseline({ enabled: false })), false);
  assert.equal(mayFetch(baseline({ setupComplete: false })), false);
  assert.equal(mayFetch(baseline({ privateActive: true })), false);
  assert.equal(mayFetch(baseline({ host: 'intranet.example' })), false);
  assert.equal(mayFetch(baseline({ customHosts: new Set(['www.youtube.com']) })), false);
});

test('mayFetch allows a missing or stale record and refuses a fresh one', () => {
  const stale = { host: 'www.youtube.com', icon: 'data:x', fetchedAt: NOW - REFRESH_AFTER_MS - 1, usedAt: NOW };
  const fresh = { host: 'www.youtube.com', icon: 'data:x', fetchedAt: NOW - 1000, usedAt: NOW };
  assert.equal(storedState(null, NOW), 'missing');
  assert.equal(storedState(stale, NOW), 'stale');
  assert.equal(storedState(fresh, NOW), 'fresh');
  assert.equal(mayFetch(baseline({ record: stale })), true);
  assert.equal(mayFetch(baseline({ record: fresh })), false);
});

test('a 404 rules a host out for the run', () => {
  const run = createRunState();
  run.started('h');
  run.finished('h', 'not-found', 0);
  assert.equal(run.canAsk('h', 10 ** 12), false);
});

test('a failure may retry twice, 30 s apart', () => {
  const run = createRunState();
  run.started('h');
  run.finished('h', 'failed', 0);
  assert.equal(run.canAsk('h', 29999), false);
  assert.equal(run.canAsk('h', 30000), true);
  run.started('h');
  run.finished('h', 'failed', 30000);
  assert.equal(run.canAsk('h', 60000), true);
  run.started('h');
  run.finished('h', 'failed', 60000);
  assert.equal(run.canAsk('h', 10 ** 12), false, 'three failures end the run for that host');
});

test('a success resets the failure count', () => {
  const run = createRunState();
  run.started('h');
  run.finished('h', 'failed', 0);
  run.started('h');
  run.finished('h', 'ok', 40000);
  assert.equal(run.canAsk('h', 40001), true);
});

test('a host in flight cannot be asked again', () => {
  const run = createRunState();
  assert.equal(run.canAsk('h', 0), true);
  run.started('h');
  assert.equal(run.canAsk('h', 0), false);
  assert.equal(mayFetch(baseline({ host: 'www.youtube.com', run: (() => { const r = createRunState(); r.started('www.youtube.com'); return r; })() })), false);
  run.finished('h', 'ok', 0);
  assert.equal(run.canAsk('h', 0), true);
});

test('putRecord keeps 300 records, most recent first, replacing an existing host', () => {
  let records = [];
  for (let i = 0; i < STORE_CAP + 5; i += 1) records = putRecord(records, `h${i}.example`, `icon${i}`, NOW + i);
  assert.equal(records.length, STORE_CAP);
  assert.equal(records[0].host, `h${STORE_CAP + 4}.example`);
  assert.equal(records.at(-1).host, 'h5.example', 'the least recently used are dropped');
  records = putRecord(records, 'h100.example', 'new', NOW + 1000);
  assert.equal(records.length, STORE_CAP);
  assert.deepEqual(records[0], { host: 'h100.example', icon: 'new', fetchedAt: NOW + 1000, usedAt: NOW + 1000 });
  assert.equal(records.filter((r) => r.host === 'h100.example').length, 1);
});

test('touchRecords moves used hosts to the front', () => {
  let records = ['a', 'b', 'c'].map((host, i) => ({ host, icon: host, fetchedAt: i, usedAt: i }));
  records = touchRecords(records, ['c', 'missing'], NOW);
  assert.deepEqual(records.map((r) => r.host), ['c', 'a', 'b']);
  assert.equal(records[0].usedAt, NOW);
  assert.equal(records[0].fetchedAt, 2, 'using an icon is not refreshing it');
});

test('dropRecord removes one host', () => {
  const records = [{ host: 'a' }, { host: 'b' }];
  assert.deepEqual(dropRecord(records, 'a').map((r) => r.host), ['b']);
});

test('catalog and custom host sets', () => {
  const catalog = [['yt', [], 'YouTube', 'www.YouTube.com', 'https://www.youtube.com/results?search_query=%s', 0, 'https://www.youtube.com/']];
  assert.deepEqual([...catalogHostSet(catalog)], ['www.youtube.com']);
  const custom = [{ code: 'mine', name: 'Mine', template: 'https://Intranet.Example/?q=%s' }, null];
  assert.deepEqual([...customHostSet(custom, Bangs)], ['intranet.example']);
});

test('templateHost is exported and returns the template\'s lowercased host', () => {
  assert.equal(Bangs.templateHost('https://Search.Example/find?q=%s'), 'search.example');
  assert.equal(Bangs.templateHost('not a url %s'), '');
});
