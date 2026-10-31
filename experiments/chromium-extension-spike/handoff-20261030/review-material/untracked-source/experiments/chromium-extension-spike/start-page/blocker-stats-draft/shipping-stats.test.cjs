'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const stats = require('./shipping-adblock-stats');

test('reference file is exactly the released implementation', () => {
  const expected = execFileSync('git', ['show', '3b0c000b569ee33a1548dd1b9a60817fae9288a6:src/main/adblock-stats.js'], { cwd: __dirname });
  assert.deepEqual(fs.readFileSync(path.join(__dirname, 'shipping-adblock-stats.js')), expected);
});

test('Monday-local buckets, lazy reset and chart rounding match shipping', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const data = { weekStart: 0, blocked: 0, days: Array(7).fill(0) };
    const sunday = new Date(2026, 9, 25, 23, 59);
    stats.rollWeekStats(data, sunday);
    stats.recordBlocked(data, sunday);
    assert.equal(data.blocked, 1);
    assert.deepEqual(data.days, [0, 0, 0, 0, 0, 0, 1]);
    const monday = new Date(2026, 9, 26, 0, 0);
    stats.rollWeekStats(data, monday);
    assert.equal(data.blocked, 0);
    stats.recordBlocked(data, monday);
    stats.recordBlocked(data, monday);
    stats.recordBlocked(data, new Date(2026, 9, 27, 12));
    assert.deepEqual(data.days, [2, 1, 0, 0, 0, 0, 0]);
    assert.deepEqual(stats.barHeights(data.days), [100, 50, 0, 0, 0, 0, 0]);
    assert.deepEqual(stats.barHeights(Array(7).fill(0)), Array(7).fill(0));
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('calendar weeks survive both daylight-saving clock changes', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    for (const date of [new Date(2026, 2, 8, 12), new Date(2026, 10, 1, 12)]) {
      const monday = new Date(date);
      monday.setDate(monday.getDate() - 6);
      monday.setHours(0, 0, 0, 0);
      assert.equal(stats.currentWeekStart(date), monday.getTime());
      const nextMonday = new Date(date);
      nextMonday.setDate(nextMonday.getDate() + 1);
      nextMonday.setHours(0, 0, 0, 0);
      const hours = (nextMonday.getTime() - monday.getTime()) / 3600000;
      assert.ok(hours === 167 || hours === 169);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('legacy totals remain intact while invalid day buckets are reset', () => {
  const data = { weekStart: 42, blocked: 17, days: [1, 2] };
  stats.normalizeWeekStats(data);
  assert.equal(data.blocked, 17);
  assert.deepEqual(data.days, Array(7).fill(0));
  data.blocked = -1;
  data.days = [0, 0, -1, 0, 0, 0, 0];
  stats.normalizeWeekStats(data);
  assert.equal(data.blocked, 0);
  assert.deepEqual(data.days, Array(7).fill(0));
});
