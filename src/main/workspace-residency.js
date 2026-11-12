'use strict';

// Only these fields move with a workspace. Native chrome, prompts, Glance and
// Recently Closed stay on the window. Actual views/sleepSnapshots never enter
// this module's projections or any persistence payload.
const SESSION_FIELDS = ['tabOrder', 'activeTabId', 'groups', 'closedSlot', 'closedSlotIds', 'workspaceId', 'activationHistory', 'lastActiveByCluster', 'splits'];
function transferSession(source, target, { tabs, registry }) {
  if (target.tabOrder.length) throw new Error('Workspace destination is occupied');
  // Validate the complete move before changing either runtime. A defensive
  // membership error must leave the caller enough intact state to roll back;
  // clearing the source first turns the guard itself into data loss.
  const members = source.tabOrder.map((id) => {
    const tab = tabs.get(id);
    if (!tab) throw new Error('Workspace membership is invalid');
    return [id, tab];
  });
  for (const field of SESSION_FIELDS) target[field] = source[field];
  source.tabOrder = []; source.activeTabId = null; source.groups = []; source.splits = []; source.closedSlot = 0; source.closedSlotIds = [];
  source.workspaceId = null; source.activationHistory = []; source.lastActiveByCluster = new Map();
  for (const [id, tab] of members) {
    tab.runtimeId = target.id;
    registry.attachTab(target, id);
  }
  source.surfaceGeneration += 1; target.surfaceGeneration += 1;
}
/** The set-aside tabs to quiet after a switch, in order, so switching
 * never has to stop for a limit (spec D22): at most `maxSets` set-aside
 * spaces keep loaded tabs, and at most `maxLiveTabs` stay loaded across them.
 * The space set aside longest ago gives way first, the one just left last;
 * within a space, its least recently used tabs go first. Every loaded tab
 * counts (`isLive`), but only tabs Quiet Tabs would quiet (`canQuiet`: its
 * sleepCandidates policy) are planned; the rest stay loaded, over budget. */
function roomPlan(residents, { isLive, canQuiet = () => true, lastActiveAt, maxSets = 2, maxLiveTabs = 16 }) {
  const loaded = residents
    .map((r) => ({ since: r.residentSince ?? 0, live: r.tabOrder.filter(isLive).sort((a, b) => lastActiveAt(a) - lastActiveAt(b)) }))
    .filter((r) => r.live.length)
    .sort((a, b) => b.since - a.since); // newest first
  const kept = loaded.slice(0, maxSets);
  const older = loaded.slice(maxSets).reverse(); // oldest space first
  const plan = older.flatMap((r) => r.live.filter(canQuiet));
  // Older spaces' tabs that cannot be quieted stay loaded, so they count too.
  const staying = older.reduce((n, r) => n + r.live.filter((id) => !canQuiet(id)).length, 0);
  let over = kept.reduce((n, r) => n + r.live.length, 0) + staying - maxLiveTabs;
  for (const r of [...kept].reverse()) { // the older of the kept spaces first
    if (over <= 0) break;
    const take = r.live.filter(canQuiet).slice(0, over);
    plan.push(...take); over -= take.length;
  }
  return plan;
}
/** The set-aside spaces to release (save, then close) so that at most
 * `maxSetAside` remain, whatever Quiet Tabs is doing (off, or out of
 * snapshots): the oldest first, never one with protected work, which stays
 * and still counts. A released space reopens from its saved tabs. */
function releasePlan(residents, { maxSetAside = 6, isProtected }) {
  let over = residents.length - maxSetAside;
  if (over <= 0) return [];
  const release = [];
  for (const r of [...residents].sort((a, b) => (a.residentSince ?? 0) - (b.residentSince ?? 0))) {
    if (over <= 0) break;
    if (isProtected(r)) continue;
    release.push(r); over -= 1;
  }
  return release;
}
/** Release set-aside spaces beyond the cap, oldest first, one at a time.
 * Each candidate is probed (async: unsaved typing, an unload warning) and then
 * rechecked synchronously (still set aside, no sound, camera or prompt) with
 * no await before `release`, so protection that starts while another space
 * is being probed, or during its own probe, is never missed. A candidate that
 * fails either check is skipped and still counts. Returns how many went. */
async function releaseOverCap(getResidents, { maxSetAside = 6, probe, recheck, release, stop = () => false }) {
  const skipped = new Set();
  let released = 0;
  for (;;) {
    if (stop()) break;
    const [next] = releasePlan(getResidents(), { maxSetAside, isProtected: (r) => skipped.has(r) });
    if (!next) break;
    const unsafe = await probe(next);
    if (stop()) break;
    if (unsafe || !recheck(next) || !release(next)) { skipped.add(next); continue; }
    released += 1;
  }
  return released;
}
/** The window an Undo may rebind to a restored workspace: one the delete
 * unbound that is still open, visible, in no workspace and not mid-switch —
 * and only while no other window holds the workspace (single-window binding). */
function undoRebindTarget(runtimeIds, runtimes, workspaceId) {
  if (runtimes.some((r) => r.workspaceId === workspaceId)) return null;
  const wanted = new Set(runtimeIds);
  return runtimes.find((r) => wanted.has(r.id) && r.workspaceId == null && !r.closing && !r.resident && !r.workspaceTransition) ?? null;
}

module.exports = { transferSession, roomPlan, releasePlan, releaseOverCap, undoRebindTarget, SESSION_FIELDS };
