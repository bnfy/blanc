'use strict';

// Rolling ads-blocked stats for the start page. Weeks start Monday 00:00
// local; per-day buckets are Monday-indexed so they line up with the week
// boundary. Pure and unit-tested — main.js owns the JsonStore and calls in
// here for every decision, the way tab-sleep.js owns the quieting policy.

const WEEK_DAYS = 7;

const zeroDays = () => new Array(WEEK_DAYS).fill(0);

function currentWeekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function dayIndex(now = new Date()) {
  return (now.getDay() + 6) % 7;
}

/**
 * Repair a stored record in place. Installs upgrading from the original
 * {weekStart, blocked} shape gain zeroed buckets, so their first week under
 * the new build under-reports the chart while the weekly total stays true.
 */
function normalizeWeekStats(data) {
  const daysOk = Array.isArray(data.days)
    && data.days.length === WEEK_DAYS
    && data.days.every((n) => Number.isInteger(n) && n >= 0);
  if (!daysOk) data.days = zeroDays();
  if (!Number.isInteger(data.blocked) || data.blocked < 0) data.blocked = 0;
  return data;
}

function rollWeekStats(data, now = new Date()) {
  const week = currentWeekStart(now);
  if (data.weekStart !== week) {
    data.weekStart = week;
    data.blocked = 0;
    data.days = zeroDays();
  }
}

function recordBlocked(data, now = new Date()) {
  data.blocked += 1;
  data.days[dayIndex(now)] += 1;
}

/**
 * Tally-chart bar heights in percent, normalized to the busiest day. A week
 * that blocked nothing draws no bars at all — including today's. Colour marks
 * today in the chart; height is only ever data.
 */
function barHeights(days) {
  const max = Math.max(...days, 0);
  if (!max) return days.map(() => 0);
  return days.map((n) => Math.round((n / max) * 100));
}

module.exports = {
  currentWeekStart,
  dayIndex,
  normalizeWeekStats,
  rollWeekStats,
  recordBlocked,
  barHeights,
};
