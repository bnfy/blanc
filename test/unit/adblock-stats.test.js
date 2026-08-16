'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  currentWeekStart,
  dayIndex,
  normalizeWeekStats,
  rollWeekStats,
  recordBlocked,
  barHeights,
} = require('../../src/main/adblock-stats');

// Wed 2026-08-12 15:00 local — the week it belongs to starts Mon 2026-08-10.
const WED = new Date(2026, 7, 12, 15, 0, 0);
const MON = new Date(2026, 7, 10, 0, 0, 0);

test('currentWeekStart is the preceding Monday 00:00 local', () => {
  assert.equal(currentWeekStart(WED), MON.getTime());
  assert.equal(currentWeekStart(MON), MON.getTime());
});

// Monday-based so the buckets line up with currentWeekStart; Date.getDay()
// is Sunday-based, hence the shift.
test('dayIndex is Monday-based', () => {
  assert.equal(dayIndex(MON), 0);
  assert.equal(dayIndex(WED), 2);
  assert.equal(dayIndex(new Date(2026, 7, 16)), 6); // Sunday
});

// Installs upgrading from the pre-buckets {weekStart, blocked} shape must not
// crash the chart; they start the week at zero and self-heal next Monday.
test('normalizeWeekStats seeds legacy and malformed shapes with zeroed days', () => {
  const legacy = { weekStart: MON.getTime(), blocked: 41 };
  const fixed = normalizeWeekStats(legacy);
  assert.deepEqual(fixed.days, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(fixed.blocked, 41);
  assert.deepEqual(
    normalizeWeekStats({ weekStart: 0, blocked: 0, days: [1, 2] }).days,
    [0, 0, 0, 0, 0, 0, 0],
  );
  assert.equal(normalizeWeekStats({ weekStart: 0, blocked: -3 }).blocked, 0);
});

test('rollWeekStats resets blocked and days on a new week, not within one', () => {
  const data = { weekStart: currentWeekStart(MON), blocked: 9, days: [9, 0, 0, 0, 0, 0, 0] };
  rollWeekStats(data, WED);
  assert.equal(data.blocked, 9); // same week — untouched
  const nextMonday = new Date(2026, 7, 17, 8, 0, 0);
  rollWeekStats(data, nextMonday);
  assert.equal(data.weekStart, currentWeekStart(nextMonday));
  assert.equal(data.blocked, 0);
  assert.deepEqual(data.days, [0, 0, 0, 0, 0, 0, 0]);
});

test("recordBlocked bumps the weekly total and today's bucket together", () => {
  const data = { weekStart: currentWeekStart(WED), blocked: 0, days: [0, 0, 0, 0, 0, 0, 0] };
  recordBlocked(data, WED);
  recordBlocked(data, WED);
  assert.equal(data.blocked, 2);
  assert.deepEqual(data.days, [0, 0, 2, 0, 0, 0, 0]);
});

test('barHeights normalizes to the busiest day', () => {
  assert.deepEqual(barHeights([0, 5, 10, 0, 0, 0, 0]), [0, 50, 100, 0, 0, 0, 0]);
});

// The chart reports what happened. A full bar for a day that blocked nothing
// would be a lie — the DS prototype's 100% today-bar is stub data, where that
// day happened to be the week's max.
test('barHeights is all zero for a week with nothing blocked', () => {
  assert.deepEqual(barHeights([0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0]);
});
