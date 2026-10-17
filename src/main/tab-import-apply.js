// Pure apply planning for F40 Bring Your Tabs. This module resolves opaque
// candidate membership into preview-ordered tab specs;
// Electron-owned mutation remains in main.js.
const { validFavicon } = require('./bookmark-validate');
const { normalizeGroupName: normalizeName, groupNameKey } = require('./group-name-case');

const MAX_CANDIDATES = 500;
const MAX_GROUPS = 12;

/** Group names keep their case; matching ignores it (spec 2026-10-16 §9.1). */
function normalizeGroupName(value) {
  if (typeof value !== 'string') return '';
  return normalizeName(value);
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Existing groups by comparison key, each with the name it is shown as. */
function existingNameSet(existingGroupNames) {
  if (!Array.isArray(existingGroupNames)) return null;
  const names = new Map();
  for (const entry of existingGroupNames) {
    const rawName = typeof entry === 'string' ? entry : entry?.name;
    const name = normalizeGroupName(rawName);
    if (!name) return null;
    if (!names.has(groupNameKey(name))) names.set(groupNameKey(name), name);
  }
  return names;
}

function invalidPlan() {
  return { error: 'invalid-proposal' };
}

function planTabImportApply({
  candidates,
  proposal,
  existingGroupNames = [],
} = {}) {
  if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES
    || !proposal || proposal.version !== 1
    || !Array.isArray(proposal.groups) || proposal.groups.length > MAX_GROUPS
    || !Array.isArray(proposal.ungroupedCandidateIds)) {
    return invalidPlan();
  }

  const existingNames = existingNameSet(existingGroupNames);
  if (!existingNames) return invalidPlan();

  const candidateById = new Map();
  for (const candidate of candidates) {
    const candidateId = candidate?.candidateId;
    if (typeof candidateId !== 'string' || !candidateId
      || candidateById.has(candidateId)
      || typeof candidate.url !== 'string' || !isHttpUrl(candidate.url)) {
      return invalidPlan();
    }
    candidateById.set(candidateId, candidate);
  }

  const seen = new Set();
  const groupNameByCandidateId = new Map();
  const groupByName = new Map();
  for (const group of proposal.groups) {
    const name = normalizeGroupName(group?.name);
    if (!name || !Array.isArray(group?.candidateIds)
      || group.candidateIds.length < 2
      || group.candidateIds.length > MAX_CANDIDATES) {
      return invalidPlan();
    }
    const key = groupNameKey(name);
    let plannedGroup = groupByName.get(key);
    if (!plannedGroup) {
      // A merge keeps the existing group's name; a new group keeps the
      // proposal's first spelling.
      plannedGroup = {
        name: existingNames.get(key) ?? name,
        candidateIds: [],
        action: existingNames.has(key) ? 'merge' : 'create',
      };
      groupByName.set(key, plannedGroup);
    }
    for (const candidateId of group.candidateIds) {
      if (typeof candidateId !== 'string' || !candidateById.has(candidateId)
        || seen.has(candidateId)) {
        return invalidPlan();
      }
      seen.add(candidateId);
      groupNameByCandidateId.set(candidateId, plannedGroup.name);
      plannedGroup.candidateIds.push(candidateId);
    }
  }

  for (const candidateId of proposal.ungroupedCandidateIds) {
    if (typeof candidateId !== 'string' || !candidateById.has(candidateId)
      || seen.has(candidateId)) {
      return invalidPlan();
    }
    seen.add(candidateId);
  }
  if (seen.size !== candidates.length) return invalidPlan();

  const tabs = [];
  for (const candidate of candidates) {
    if (!seen.has(candidate.candidateId)) return invalidPlan();
    const title = typeof candidate.title === 'string' && candidate.title
      ? candidate.title
      : candidate.url;
    const favicon = validFavicon(candidate.favicon);
    tabs.push({
      candidateId: candidate.candidateId,
      url: candidate.url,
      title,
      favicon,
      groupName: groupNameByCandidateId.get(candidate.candidateId) ?? null,
      pinned: candidate.pinned === true,
    });
  }

  return {
    tabs,
    groups: [...groupByName.values()],
    focusCandidateId: candidates[0]?.candidateId ?? null,
  };
}

module.exports = {
  MAX_CANDIDATES,
  MAX_GROUPS,
  normalizeGroupName,
  planTabImportApply,
};
