'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('earliestBucketById', async () => {
  const { earliestBucketById } =
    await import('../../cloudflare/ping-worker/scripts/backfill-first-seen.mjs');
  const m = earliestBucketById([
    'seen:month:2026-08:aaa',
    'seen:month:2026-07:aaa',
    'seen:day:2026-08-25:aaa',
    'seen:day:2026-08-25:bbb',
    'seen:month:2026-08:bbb',
    'seen:week:2026-W35:ccc', // week-only ids are skipped (months are the roster)
  ]);
  assert.equal(m.get('aaa'), '2026-07'); // earliest month beats later day
  assert.equal(m.get('bbb'), '2026-08'); // 'YYYY-MM' sorts before 'YYYY-MM-DD'
  assert.equal(m.has('ccc'), false);
  assert.equal(m.size, 2);
});
