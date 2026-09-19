'use strict';

function migrationChecklistState({
  firstRunComplete,
  dismissed,
  syncComplete,
  tabsComplete,
} = {}) {
  const syncDone = syncComplete === true;
  const tabsDone = tabsComplete === true;
  const completedCount = Number(syncDone) + Number(tabsDone);

  return {
    visible: firstRunComplete === true && dismissed === false && completedCount < 2,
    completedCount,
    syncComplete: syncDone,
    tabsComplete: tabsDone,
  };
}

function migrationChecklistForTab(checklist, tab, defaultProfileId) {
  if (!checklist || !tab || tab.private || tab.profileId !== defaultProfileId) return null;
  return { ...checklist };
}

module.exports = { migrationChecklistState, migrationChecklistForTab };
