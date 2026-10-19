'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TAB_ARCHIVE_DELAY_MS,
  ARCHIVE_TTL_MS,
  MAX_ARCHIVE_ENTRIES,
  ARCHIVE_GRACE_MS,
  ARCHIVE_PER_SWEEP,
  archiveCandidates,
  buildArchiveEntry,
  expireArchive,
  projectArchive,
  searchArchive,
} = require('../../src/main/tab-archive');

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const DELAY = 12 * HOUR;

// An idle, loose, ordinary web tab: the one shape that may be archived.
function idleTab(id, overrides = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    lastViewedAt: NOW - DELAY - 1,
    ...overrides,
  };
}

const ids = (candidates) => candidates.map((c) => c.id);

test('the constants match the spec', () => {
  assert.deepEqual(Object.keys(TAB_ARCHIVE_DELAY_MS), ['off', '12h', '1d', '7d', '30d']);
  assert.equal(TAB_ARCHIVE_DELAY_MS.off, null);
  assert.equal(TAB_ARCHIVE_DELAY_MS['12h'], 43_200_000);
  assert.equal(TAB_ARCHIVE_DELAY_MS['1d'], 86_400_000);
  assert.equal(TAB_ARCHIVE_DELAY_MS['7d'], 604_800_000);
  assert.equal(TAB_ARCHIVE_DELAY_MS['30d'], 2_592_000_000);
  assert.equal(ARCHIVE_TTL_MS, 2_592_000_000);
  assert.equal(MAX_ARCHIVE_ENTRIES, 500);
  assert.equal(ARCHIVE_GRACE_MS, 600_000);
  assert.equal(ARCHIVE_PER_SWEEP, 20);
});

test('returns nothing when thresholdMs is null', () => {
  assert.deepEqual(archiveCandidates([idleTab('a')], { now: NOW, thresholdMs: null }), []);
});

test('returns nothing before graceUntil', () => {
  const got = archiveCandidates([idleTab('a')], { now: NOW, thresholdMs: DELAY, graceUntil: NOW + 1 });
  assert.deepEqual(got, []);
});

test('archives only ungrouped unpinned non-private tabs', () => {
  const tabs = [
    idleTab('pinned', { pinned: true }),
    idleTab('grouped', { groupId: 'g1' }),
    idleTab('private', { private: true }),
    idleTab('plain'),
  ];
  assert.deepEqual(ids(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY })), ['plain']);
});

test('skips active, Glance-visible, busy and prompt-pending tabs', () => {
  const tabs = [
    idleTab('active'),
    idleTab('glance'),
    idleTab('audible', { audible: true }),
    idleTab('media', { usedMedia: true }),
    idleTab('capturing', { capturing: true }),
    idleTab('sharing', { displayShareBlocking: true }),
    idleTab('loading', { isLoading: true }),
    idleTab('waking', { waking: true }),
    idleTab('sleeping', { sleeping: true }),
    idleTab('prompt'),
    idleTab('popupParent'),
  ];
  const got = archiveCandidates(tabs, {
    now: NOW,
    thresholdMs: DELAY,
    activeTabId: 'active',
    visibleTabIds: new Set(['glance']),
    permissionPendingTabIds: new Set(['prompt']),
    popupChildCounts: new Map([['popupParent', 1]]),
  });
  assert.deepEqual(got, []);
});

test('does not exempt opener families', () => {
  const tabs = [idleTab('child', { openerTabId: 'opener' }), idleTab('opener', { lastViewedAt: NOW })];
  assert.deepEqual(ids(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY })), ['child']);
});

test('a quiet tab is still eligible', () => {
  const tabs = [idleTab('quiet', { asleep: true })];
  assert.deepEqual(ids(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY })), ['quiet']);
});

test('marks blanc://newtab as closeOnly', () => {
  const tabs = [idleTab('blank', { url: 'blanc://newtab/' }), idleTab('web')];
  assert.deepEqual(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY }), [
    { id: 'blank', closeOnly: true },
    { id: 'web', closeOnly: false },
  ]);
});

test('skips tabs with no archivable URL', () => {
  const tabs = [idleTab('internal', { url: 'blanc://history/' }), idleTab('empty', { url: '' })];
  assert.deepEqual(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY }), []);
});

test('treats a future lastViewedAt as not idle', () => {
  const tabs = [idleTab('future', { lastViewedAt: NOW + 60_000 })];
  assert.deepEqual(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY }), []);
});

test('treats a missing lastViewedAt as not idle', () => {
  const tabs = [idleTab('missing', { lastViewedAt: undefined }), idleTab('nan', { lastViewedAt: Number.NaN })];
  assert.deepEqual(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY }), []);
});

test('a tab viewed just under the delay ago stays', () => {
  const tabs = [idleTab('recent', { lastViewedAt: NOW - DELAY + 1 })];
  assert.deepEqual(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY }), []);
});

test('orders oldest-viewed first and stops at perSweepLimit', () => {
  const tabs = Array.from({ length: 25 }, (_, i) => idleTab(`t${i}`, { lastViewedAt: NOW - DELAY - 1 - i }));
  const got = ids(archiveCandidates(tabs, { now: NOW, thresholdMs: DELAY }));
  assert.equal(got.length, 20);
  assert.deepEqual(got.slice(0, 3), ['t24', 't23', 't22']);
  assert.equal(got.at(-1), 't5');
});

test('buildArchiveEntry keeps only allow-listed keys', () => {
  const entry = buildArchiveEntry(idleTab('a', {
    snapshot: { entries: [] },
    pageState: 'AAAA',
    openerTabId: 'o',
    groupId: 'g1',
    customTitle: 'Mine',
    favicon: 'not-an-icon',
  }), { now: NOW, spaceName: 'Research' });
  assert.deepEqual(Object.keys(entry).sort(), [
    'archivedAt', 'customTitle', 'favicon', 'id', 'lastViewedAt', 'spaceName', 'title', 'url',
  ]);
  assert.equal(entry.archivedAt, NOW);
  assert.equal(entry.customTitle, 'Mine');
  assert.equal(entry.spaceName, 'Research');
  assert.equal(entry.favicon, null, 'an invalid icon is dropped, never stored raw');
});

test('buildArchiveEntry omits customTitle and spaceName when there are none', () => {
  const entry = buildArchiveEntry(idleTab('a'), { now: NOW });
  assert.equal('customTitle' in entry, false);
  assert.equal('spaceName' in entry, false);
});

test('buildArchiveEntry gives distinct ids to entries made in the same millisecond', () => {
  const a = buildArchiveEntry(idleTab('a'), { now: NOW });
  const b = buildArchiveEntry(idleTab('a'), { now: NOW });
  assert.notEqual(a.id, b.id);
});

test('buildArchiveEntry refuses private and non-http tabs', () => {
  assert.equal(buildArchiveEntry(idleTab('p', { private: true }), { now: NOW }), null);
  assert.equal(buildArchiveEntry(idleTab('n', { url: 'blanc://newtab/' }), { now: NOW }), null);
  assert.equal(buildArchiveEntry(idleTab('f', { url: 'file:///etc/hosts' }), { now: NOW }), null);
  assert.equal(buildArchiveEntry(null, { now: NOW }), null);
});

test('expireArchive drops entries older than 30 days and keeps the newest 500', () => {
  const fresh = Array.from({ length: 510 }, (_, i) => ({ id: `e${i}`, url: 'https://a.test/', archivedAt: NOW - i }));
  const stale = { id: 'old', url: 'https://a.test/', archivedAt: NOW - ARCHIVE_TTL_MS - 1 };
  const kept = expireArchive([stale, ...fresh], { now: NOW });
  assert.equal(kept.length, 500);
  assert.equal(kept[0].id, 'e0');
  assert.equal(kept.at(-1).id, 'e499');
  assert.equal(kept.some((e) => e.id === 'old'), false);
});

test('expireArchive drops malformed entries', () => {
  const kept = expireArchive([null, { id: 'x' }, { id: 'y', url: 'https://a.test/', archivedAt: NOW }], { now: NOW });
  assert.deepEqual(kept.map((e) => e.id), ['y']);
});

test('projectArchive prefers customTitle and omits lastViewedAt', () => {
  const [row] = projectArchive([{
    id: 'a', url: 'https://a.test/', title: 'Page', customTitle: 'Mine', favicon: null,
    archivedAt: NOW, lastViewedAt: NOW - 1, spaceName: 'Work',
  }]);
  assert.deepEqual(row, { id: 'a', url: 'https://a.test/', title: 'Mine', favicon: null, archivedAt: NOW, spaceName: 'Work' });
});

test('searchArchive matches title, customTitle and url, ignoring case', () => {
  const entries = [
    { id: '1', url: 'https://news.test/', title: 'Morning Paper' },
    { id: '2', url: 'https://code.test/', title: 'Repo', customTitle: 'My Project' },
    { id: '3', url: 'https://maps.test/', title: 'Directions' },
  ];
  assert.deepEqual(searchArchive(entries, 'PAPER').map((e) => e.id), ['1']);
  assert.deepEqual(searchArchive(entries, 'project').map((e) => e.id), ['2']);
  assert.deepEqual(searchArchive(entries, 'maps.test').map((e) => e.id), ['3']);
  assert.equal(searchArchive(entries, '').length, 3);
});
