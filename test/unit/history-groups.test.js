'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { groupByDay, timeLabel } = require('../../src/renderer/pages/history-groups');

// Local-time constructors keep day boundaries in the machine's time zone.
const now = new Date(2026, 8, 27, 10, 0);
const at = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

test('visits group under Today, Yesterday, then the weekday and date, newest first', () => {
  const entries = [
    { url: 'a', visitedAt: at(27, 9) },
    { url: 'b', visitedAt: at(27, 0, 5) },
    { url: 'c', visitedAt: at(26, 23, 59) },
    { url: 'd', visitedAt: at(23, 16) },
  ];
  const groups = groupByDay(entries, now, 'en-US');
  assert.deepEqual(groups.map((group) => [group.label, group.entries.map((entry) => entry.url)]), [
    ['Today', ['a', 'b']],
    ['Yesterday', ['c']],
    ['Wednesday, September 23', ['d']],
  ]);
});

test('a visit from another year names the year', () => {
  const [group] = groupByDay([{ url: 'x', visitedAt: new Date(2025, 11, 31, 12).getTime() }], now, 'en-US');
  assert.equal(group.label, 'Wednesday, December 31, 2025');
});

test('times drop the leading zero', () => {
  // Current ICU puts a narrow no-break space before AM/PM; \s matches it.
  assert.match(timeLabel(at(27, 16, 54), 'en-US'), /^4:54\sPM$/);
  assert.match(timeLabel(at(27, 9, 5), 'en-US'), /^9:05\sAM$/);
});
