// New-install counting: an install is "new" on the day its HASHED id is first
// ever seen. first:<id> never expires — it IS the memory that the install
// exists (value = first-seen bucket, informational only; backfill writes
// coarse month values). new:day:* counters never expire — growth history,
// same convention as active:*. Counter-before-marker ordering matches
// markActive in index.js: a crash between the two risks a one-off overcount,
// never a permanently lost count.
export async function markFirstSeen(kv, hashedId, day, bumpFn) {
  const firstKey = `first:${hashedId}`;
  if ((await kv.get(firstKey)) !== null) return false;
  await bumpFn(kv, `new:day:${day}`);
  await kv.put(firstKey, day);
  return true;
}

// First-day signals (docs/superpowers/specs/2026-10-09-first-day-retention-
// signals-design.md): an install may report, on the UTC day it was first
// seen, that Blanc is its default browser or that it browsed. Only that day
// counts, so a late or replayed event stores nothing. The per-install marker
// only has to outlive D+1 for the next-day join in markNextDayReturn, so it
// expires after two days; the d1had:<signal>:<D> counter never expires
// (growth history). Key families deliberately avoid the return:d1: prefix,
// which /stats reads whole as day -> count.
export const DAY_ONE_SIGNALS = Object.freeze(['default', 'browsed']);
export const DAY_ONE_MARKER_TTL = 2 * 24 * 3600;

export async function markDayOneSignal(kv, hashedId, signal, day, bumpFn) {
  if (!DAY_ONE_SIGNALS.includes(signal)) return false;
  if ((await kv.get(`first:${hashedId}`)) !== day) return false;
  const markerKey = `d1sig:${signal}:${day}:${hashedId}`;
  if ((await kv.get(markerKey)) !== null) return false;
  await bumpFn(kv, `d1had:${signal}:${day}`);
  await kv.put(markerKey, '1', { expirationTtl: DAY_ONE_MARKER_TTL });
  return true;
}

// Next-day return: of the installs first seen on day D, how many launch again
// on day D+1 (UTC). Counted on the install's first ping of D+1 — first:<id>
// already records D, so only returners pay the extra marker write. The
// return:d1:<D> counter never expires (growth history); the ret1: marker only
// needs to outlive day D+1 for dedup, so it expires after two days. A
// backfilled first: value is a coarse month and can never equal a day, so
// pre-tracking installs are never counted.
export const NEXT_DAY_RETURN_MARKER_TTL = 2 * 24 * 3600;

export async function markNextDayReturn(kv, hashedId, day, prevDay, bumpFn) {
  if ((await kv.get(`first:${hashedId}`)) !== prevDay) return false;
  const markerKey = `ret1:${prevDay}:${hashedId}`;
  if ((await kv.get(markerKey)) !== null) return false;
  await bumpFn(kv, `return:d1:${prevDay}`);
  await kv.put(markerKey, '1', { expirationTtl: NEXT_DAY_RETURN_MARKER_TTL });
  // Split the return by install-day signal: two reads, paid only by returners.
  await Promise.all(DAY_ONE_SIGNALS.map(async (signal) => {
    if ((await kv.get(`d1sig:${signal}:${prevDay}:${hashedId}`)) !== null) {
      await bumpFn(kv, `d1ret:${signal}:${prevDay}`);
    }
  }));
  return true;
}
