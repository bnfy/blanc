'use strict';

// Tab group names keep the case the user typed and compare without regard to
// it (spec 2026-10-16-island-lower-section-design.md §9). Until v1.36 every
// name was saved lowercase; recase* give those a capital first letter once.
// Pure: no Electron.

const MAX_GROUP_NAME = 40;

/** A storable name: trimmed and capped, case kept. */
function normalizeGroupName(raw) {
  return String(raw ?? '').trim().slice(0, MAX_GROUP_NAME);
}

/** The comparison key: two names with the same key are the same group. */
function groupNameKey(name) {
  return normalizeGroupName(name).toLowerCase();
}

function sameGroupName(a, b) {
  return groupNameKey(a) === groupNameKey(b);
}

function capitalizeFirst(name) {
  const text = String(name ?? '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Groups with capitalized names, and whether any changed. Only a name saved
 * all lowercase is touched: one with any capital was set by a build that
 * keeps case ("iOS", "eBay"), so a pass that runs again after a lost stamp
 * (a downgrade, a restored backup) leaves it alone. */
function recaseGroups(groups) {
  if (!Array.isArray(groups)) return { groups, changed: false };
  let changed = false;
  const next = groups.map((group) => {
    if (!group || typeof group.name !== 'string' || group.name !== group.name.toLowerCase()) return group;
    const name = capitalizeFirst(group.name);
    if (name === group.name) return group;
    changed = true;
    return { ...group, name };
  });
  return { groups: changed ? next : groups, changed };
}

/** session.json: every window's groups and the flat rollback mirror's. A
 * newer format than this build writes is left alone. */
function recaseSessionData(data) {
  if (!data || typeof data !== 'object' || (Number.isInteger(data.version) && data.version > 2)) {
    return { data, changed: false };
  }
  let changed = false;
  const next = { ...data };
  if (Array.isArray(data.windows)) {
    next.windows = data.windows.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const result = recaseGroups(entry.groups);
      if (!result.changed) return entry;
      changed = true;
      return { ...entry, groups: result.groups };
    });
  }
  const mirror = recaseGroups(data.groups);
  if (mirror.changed) {
    changed = true;
    next.groups = mirror.groups;
  }
  return { data: changed ? next : data, changed };
}

/** workspaces.json: every Space and every recently deleted one. */
function recaseWorkspacesFile(file) {
  if (!file || typeof file !== 'object') return { file, changed: false };
  let changed = false;
  const recaseRecord = (record) => {
    if (!record || typeof record !== 'object') return record;
    const result = recaseGroups(record.groups);
    if (!result.changed) return record;
    changed = true;
    return { ...record, groups: result.groups };
  };
  const next = { ...file };
  if (Array.isArray(file.workspaces)) next.workspaces = file.workspaces.map(recaseRecord);
  if (Array.isArray(file.deleted)) {
    next.deleted = file.deleted.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const workspace = recaseRecord(entry.workspace);
      return workspace === entry.workspace ? entry : { ...entry, workspace };
    });
  }
  return { file: changed ? next : file, changed };
}

module.exports = {
  MAX_GROUP_NAME,
  normalizeGroupName,
  groupNameKey,
  sameGroupName,
  capitalizeFirst,
  recaseSessionData,
  recaseWorkspacesFile,
};
