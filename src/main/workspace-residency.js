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
function residencyCapacity(runtimes, incoming, outgoingTabs, liveContents, { maxSets = 2, maxLiveTabs = 16 } = {}) {
  const residents = runtimes.filter((r) => r.resident && r !== incoming);
  const liveCount = residents.reduce((n, r) => n + r.tabOrder.filter((id) => liveContents(id)).length, 0)
    + outgoingTabs.filter((tab) => !tab.private && liveContents(tab.id)).length;
  return residents.length < maxSets && liveCount <= maxLiveTabs;
}
module.exports = { transferSession, residencyCapacity, SESSION_FIELDS };
