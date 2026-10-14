'use strict';

// Only these fields move with a workspace. Native chrome, prompts, Glance and
// Recently Closed stay on the window. Actual views/sleepSnapshots never enter
// this module's projections or any persistence payload.
const SESSION_FIELDS = ['tabOrder', 'activeTabId', 'groups', 'workspaceId', 'activationHistory', 'lastActiveByCluster'];
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
  source.tabOrder = []; source.activeTabId = null; source.groups = [];
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
 * within a space, its least recently used tabs go first. This is only the
 * plan: Quiet Tabs may still refuse a tab (unsaved work), which stays loaded. */
function roomPlan(residents, { isLive, lastActiveAt, maxSets = 2, maxLiveTabs = 16 }) {
  const loaded = residents
    .map((r) => ({ since: r.residentSince ?? 0, live: r.tabOrder.filter(isLive).sort((a, b) => lastActiveAt(a) - lastActiveAt(b)) }))
    .filter((r) => r.live.length)
    .sort((a, b) => b.since - a.since); // newest first
  const kept = loaded.slice(0, maxSets);
  const plan = loaded.slice(maxSets).reverse().flatMap((r) => r.live); // oldest space first
  let over = kept.reduce((n, r) => n + r.live.length, 0) - maxLiveTabs;
  for (const r of [...kept].reverse()) { // the older of the kept spaces first
    if (over <= 0) break;
    const take = r.live.slice(0, over);
    plan.push(...take); over -= take.length;
  }
  return plan;
}
/** The window an Undo may rebind to a restored workspace: one the delete
 * unbound that is still open, visible, in no workspace and not mid-switch —
 * and only while no other window holds the workspace (single-window binding). */
function undoRebindTarget(runtimeIds, runtimes, workspaceId) {
  if (runtimes.some((r) => r.workspaceId === workspaceId)) return null;
  const wanted = new Set(runtimeIds);
  return runtimes.find((r) => wanted.has(r.id) && r.workspaceId == null && !r.closing && !r.resident && !r.workspaceTransition) ?? null;
}

module.exports = { transferSession, roomPlan, undoRebindTarget, SESSION_FIELDS };
