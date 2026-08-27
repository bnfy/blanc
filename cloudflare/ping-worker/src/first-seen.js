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
