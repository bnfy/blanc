'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const scriptPromise = import('../../cloudflare/sync-worker/scripts/backfill-seen-markers.mjs');
const a = 'a'.repeat(64);
const b = 'b'.repeat(64);

test('one marker per account, with the full 365-day expiry', async () => {
  const { markersForBlobKeys } = await scriptPromise;
  const markers = markersForBlobKeys([`blob:${a}:bookmarks`, `blob:${a}:settings`, `blob:${b}:session`, 'rl:x:1'], 1_000);
  assert.deepEqual(markers, [
    { key: `seen:${a}`, value: JSON.stringify({ touchedAt: 1_000 }), expiration_ttl: 365 * 24 * 60 * 60 },
    { key: `seen:${b}`, value: JSON.stringify({ touchedAt: 1_000 }), expiration_ttl: 365 * 24 * 60 * 60 },
  ]);
});

test('refuses to write when the listing found no accounts', async () => {
  const { markersForBlobKeys } = await scriptPromise;
  assert.throws(() => markersForBlobKeys([], 1_000), /no sync accounts found/);
});

test('verification reports accounts that still lack a marker', async () => {
  const { verifyCounts } = await scriptPromise;
  assert.deepEqual(verifyCounts([`blob:${a}:bookmarks`, `blob:${b}:settings`], [`seen:${a}`]), { accounts: 2, markers: 1, missing: [b] });
  assert.deepEqual(verifyCounts([`blob:${a}:bookmarks`], [`seen:${a}`]), { accounts: 1, markers: 1, missing: [] });
});
