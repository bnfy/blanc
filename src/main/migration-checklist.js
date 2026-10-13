'use strict';

const TASKS = 3;

function migrationChecklistState({
  firstRunComplete,
  dismissed,
  syncComplete,
  tabsComplete,
  spaceComplete,
} = {}) {
  const syncDone = syncComplete === true;
  const tabsDone = tabsComplete === true;
  const spaceDone = spaceComplete === true;
  const completedCount = Number(syncDone) + Number(tabsDone) + Number(spaceDone);

  return {
    visible: firstRunComplete === true && dismissed === false && completedCount < TASKS,
    completedCount,
    syncComplete: syncDone,
    tabsComplete: tabsDone,
    spaceComplete: spaceDone,
  };
}

/** One-time settings patch when the checklist gained "Make your first space"
 * (F41): a checklist that had already retired with both earlier tasks done
 * stays retired (spec D16), and someone who already has a space in Personal
 * finds the task done. Null once applied. */
function spaceTaskIntroduction(settings = {}, { hasSpaces = false } = {}) {
  if (settings.spaceChecklistIntroduced === true) return null;
  const retired = settings.syncMigrationCompleted === true && settings.tabImportCompleted === true;
  return {
    spaceChecklistIntroduced: true,
    ...(retired ? { migrationChecklistDismissed: true } : {}),
    ...(hasSpaces ? { spaceMigrationCompleted: true } : {}),
  };
}

function migrationChecklistForTab(checklist, tab, defaultProfileId) {
  if (!checklist || !tab || tab.private || tab.profileId !== defaultProfileId) return null;
  return { ...checklist };
}

module.exports = { MIGRATION_CHECKLIST_TASKS: TASKS, migrationChecklistState, spaceTaskIntroduction, migrationChecklistForTab };
