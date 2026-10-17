'use strict';

// Sync, Bring your tabs and Make your first space are always listed. "Make
// Blanc your default" joins them only where Blanc can ask the OS for the
// role (default-browser-status.js: packaged, not Linux).
const BASE_TASKS = 3;

function migrationChecklistState({
  firstRunComplete,
  dismissed,
  syncComplete,
  tabsComplete,
  spaceComplete,
  defaultAvailable,
  defaultComplete,
} = {}) {
  const defaultShown = defaultAvailable === true;
  const defaultDone = defaultShown && defaultComplete === true;
  const syncDone = syncComplete === true;
  const tabsDone = tabsComplete === true;
  const spaceDone = spaceComplete === true;
  const taskCount = BASE_TASKS + Number(defaultShown);
  const completedCount = Number(defaultDone) + Number(syncDone) + Number(tabsDone) + Number(spaceDone);

  return {
    visible: firstRunComplete === true && dismissed === false && completedCount < taskCount,
    completedCount,
    taskCount,
    defaultAvailable: defaultShown,
    defaultComplete: defaultDone,
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

/** The same one-time patch for "Make Blanc your default": a checklist that
 * already retired with its three tasks done stays retired. Whether Blanc is
 * already the default is noted separately, on every launch. Null once
 * applied. */
function defaultTaskIntroduction(settings = {}) {
  if (settings.defaultChecklistIntroduced === true) return null;
  const retired = settings.syncMigrationCompleted === true
    && settings.tabImportCompleted === true
    && settings.spaceMigrationCompleted === true;
  return {
    defaultChecklistIntroduced: true,
    ...(retired ? { migrationChecklistDismissed: true } : {}),
  };
}

function migrationChecklistForTab(checklist, tab, defaultProfileId) {
  if (!checklist || !tab || tab.private || tab.profileId !== defaultProfileId) return null;
  return { ...checklist };
}

module.exports = {
  migrationChecklistState,
  spaceTaskIntroduction,
  defaultTaskIntroduction,
  migrationChecklistForTab,
};
