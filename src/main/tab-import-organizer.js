// Pure on-device tab-import organizer: source-group preservation, legacy
// folder anchors, embedding clusters, naming, and proposal validation.
// No Electron.
const crypto = require('node:crypto');

const CLUSTER_THRESHOLD = 0.72;
const MIN_GROUP_SIZE = 2;
const MAX_GROUPS = 12;
const MAX_TITLE_CODE_POINTS = 240;
const MAX_GROUP_NAME_LEN = 40;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'the', 'to', 'was', 'with', 'www', 'com', 'org', 'net', 'https',
  'http', 'new', 'tab', 'page', 'home', 'login', 'sign', 'account',
]);

const GENERIC_GROUP_NAMES = new Set([
  'misc', 'stuff', 'other', 'other 2', 'imported tabs', 'imported', 'tabs',
  'bookmarks', 'untitled', 'group', 'folder',
]);

const TRACKING_LIKE = /^(utm_|fbclid|gclid)/i;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_NUMBER = /^\d{6,}$/;

function sanitizeText(value, maxLen) {
  const collapsed = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  return [...collapsed].slice(0, maxLen).join('');
}

function sanitizeFolderParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts
    .map((part) => sanitizeText(part, 100))
    .filter(Boolean)
    .slice(0, 16);
}

function sanitizeCandidateInput(candidate) {
  return {
    candidateId: String(candidate?.candidateId ?? ''),
    title: sanitizeText(candidate?.title, MAX_TITLE_CODE_POINTS),
    hostname: sanitizeText(candidate?.hostname, MAX_GROUP_NAME_LEN),
    folderPath: sanitizeFolderParts(candidate?.folderPath),
    sourceGroupName: normalizeGroupName(candidate?.sourceGroupName) || null,
  };
}

function normalizeGroupName(name) {
  const collapsed = sanitizeText(name, MAX_GROUP_NAME_LEN).toLowerCase();
  return collapsed ? collapsed.slice(0, MAX_GROUP_NAME_LEN) : '';
}

function isUsableToken(token) {
  if (!token || token.length < 2) return false;
  const lower = token.toLowerCase();
  if (STOP_WORDS.has(lower)) return false;
  if (GENERIC_GROUP_NAMES.has(lower)) return false;
  if (UUID_LIKE.test(token)) return false;
  if (LONG_NUMBER.test(token)) return false;
  if (TRACKING_LIKE.test(token)) return false;
  if (/\.(html|php|aspx?|jsp)$/i.test(token)) return false;
  return true;
}

function tokenizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(isUsableToken);
}

function hostnameLabels(hostname) {
  return String(hostname ?? '')
    .toLowerCase()
    .split('.')
    .filter(isUsableToken);
}

function scoreTokens(members) {
  const scores = new Map();
  const bump = (token, weight) => {
    if (!isUsableToken(token)) return;
    scores.set(token, (scores.get(token) ?? 0) + weight);
  };
  for (const member of members) {
    for (const part of member.folderPath ?? []) bump(part, 4);
    for (const token of tokenizeTitle(member.title)) bump(token, 2);
    for (const label of hostnameLabels(member.hostname)) bump(label, 1);
  }
  return scores;
}

function folderDisplayName(folderPath) {
  if (!Array.isArray(folderPath) || !folderPath.length) return null;
  const segments = folderPath
    .map((part) => normalizeGroupName(part))
    .filter(Boolean);
  if (!segments.length) return null;
  const joined = normalizeGroupName(segments.join(' '));
  if (joined && !GENERIC_GROUP_NAMES.has(joined)) return joined;
  const leaf = segments[segments.length - 1];
  return leaf && !GENERIC_GROUP_NAMES.has(leaf) ? leaf : null;
}

function deriveGroupName(members) {
  const folderMember = members.find((member) => member.folderPath?.length);
  if (folderMember) {
    const folderName = folderDisplayName(folderMember.folderPath);
    if (folderName) return folderName;
  }

  const scores = scoreTokens(members);
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token);
  if (!ranked.length) return null;

  const titleTokens = ranked.filter((token) =>
    members.some((member) => tokenizeTitle(member.title).includes(token)));
  const topTitleScore = titleTokens.length ? scores.get(titleTokens[0]) ?? 0 : 0;
  if (titleTokens.length < 2 && topTitleScore < 4) return null;
  const parts = [];
  for (const token of ranked) {
    if (parts.includes(token)) continue;
    parts.push(token);
    const candidate = parts.join(' ');
    if (candidate.length > MAX_GROUP_NAME_LEN) break;
    if (GENERIC_GROUP_NAMES.has(candidate)) continue;
    if (parts.length >= 3) break;
  }
  const name = normalizeGroupName(parts.join(' '));
  if (!name || GENERIC_GROUP_NAMES.has(name)) return null;
  return name;
}

function folderPathKey(folderPath) {
  return JSON.stringify(folderPath ?? []);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function minInternalSimilarity(indices, matrix, threshold) {
  let min = 1;
  for (let i = 0; i < indices.length; i += 1) {
    for (let j = i + 1; j < indices.length; j += 1) {
      const sim = cosineSimilarity(matrix[indices[i]], matrix[indices[j]]);
      min = Math.min(min, sim);
      if (sim < threshold) return sim;
    }
  }
  return min;
}

function makeSuggestion(name, candidateIds, confidence, randomId) {
  const normalized = normalizeGroupName(name);
  if (!normalized || candidateIds.length < MIN_GROUP_SIZE) return null;
  return {
    suggestionId: randomId(),
    name: normalized,
    candidateIds: [...candidateIds],
    confidence,
  };
}

function folderAnchorGroups(candidates, randomId, {
  includeUnfoldered = false,
} = {}) {
  const buckets = new Map();
  for (const candidate of candidates) {
    if (!candidate.folderPath?.length) continue;
    const key = folderPathKey(candidate.folderPath);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(candidate);
  }

  const groups = [];
  const ungrouped = [];
  const anchoredIds = new Set();

  for (const members of buckets.values()) {
    if (members.length < MIN_GROUP_SIZE) {
      ungrouped.push(...members.map((m) => m.candidateId));
      continue;
    }
    const name = folderDisplayName(members[0].folderPath) ?? deriveGroupName(members);
    const group = makeSuggestion(
      name,
      members.map((m) => m.candidateId),
      'high',
      randomId,
    );
    if (!group) {
      ungrouped.push(...members.map((m) => m.candidateId));
      continue;
    }
    groups.push(group);
    for (const member of members) anchoredIds.add(member.candidateId);
  }

  if (includeUnfoldered) {
    for (const candidate of candidates) {
      if (!candidate.folderPath?.length && !anchoredIds.has(candidate.candidateId)) {
        ungrouped.push(candidate.candidateId);
      }
    }
  }

  return { groups, ungrouped, anchoredIds };
}

function clusterIndices(matrix, threshold) {
  const clusters = matrix.map((_, index) => [index]);
  while (clusters.length > 1) {
    let bestSim = -1;
    let bestPair = null;
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        for (const left of clusters[i]) {
          for (const right of clusters[j]) {
            const sim = cosineSimilarity(matrix[left], matrix[right]);
            if (sim >= threshold && sim > bestSim) {
              bestSim = sim;
              bestPair = [i, j];
            }
          }
        }
      }
    }
    if (!bestPair) break;
    const [i, j] = bestPair;
    clusters[i] = [...clusters[i], ...clusters[j]];
    clusters.splice(j, 1);
  }
  return clusters;
}

function embeddingGroups(candidates, embeddingMatrix, threshold, randomId) {
  if (!Array.isArray(embeddingMatrix) || embeddingMatrix.length !== candidates.length) {
    return { groups: [], ungrouped: candidates.map((c) => c.candidateId) };
  }

  const clusters = clusterIndices(embeddingMatrix, threshold);
  const groups = [];
  const ungrouped = [];

  for (const indices of clusters) {
    if (indices.length < MIN_GROUP_SIZE) {
      ungrouped.push(...indices.map((index) => candidates[index].candidateId));
      continue;
    }
    const members = indices.map((index) => candidates[index]);
    const minSim = minInternalSimilarity(indices, embeddingMatrix, threshold);
    const confidence = minSim >= threshold ? 'high' : 'review';
    const name = deriveGroupName(members);
    const group = makeSuggestion(
      name,
      members.map((m) => m.candidateId),
      confidence,
      randomId,
    );
    if (!group) {
      ungrouped.push(...members.map((m) => m.candidateId));
      continue;
    }
    groups.push(group);
  }

  return { groups, ungrouped };
}

function capGroups(groups, ungrouped) {
  if (groups.length <= MAX_GROUPS) {
    return { groups, ungroupedCandidateIds: ungrouped };
  }
  const ranked = [...groups].sort((a, b) => b.candidateIds.length - a.candidateIds.length);
  const kept = ranked.slice(0, MAX_GROUPS);
  const dropped = ranked.slice(MAX_GROUPS);
  const extra = [];
  for (const group of dropped) extra.push(...group.candidateIds);
  return {
    groups: kept,
    ungroupedCandidateIds: [...ungrouped, ...extra],
  };
}

function finalizeProposal(groups, ungrouped) {
  const capped = capGroups(groups, ungrouped);
  return {
    version: 1,
    groups: capped.groups,
    ungroupedCandidateIds: capped.ungroupedCandidateIds,
  };
}

function proposeFromFolders(candidates, {
  randomId = () => crypto.randomUUID(),
} = {}) {
  const sanitized = candidates.map(sanitizeCandidateInput).filter((c) => c.candidateId);
  const { groups, ungrouped } = folderAnchorGroups(sanitized, randomId, {
    includeUnfoldered: true,
  });
  return finalizeProposal(groups, ungrouped);
}

function proposeFromSourceGroups(candidates, {
  randomId = () => crypto.randomUUID(),
} = {}) {
  const sanitized = candidates.map(sanitizeCandidateInput).filter((candidate) => candidate.candidateId);
  const buckets = new Map();
  for (const candidate of sanitized) {
    if (!candidate.sourceGroupName) continue;
    if (!buckets.has(candidate.sourceGroupName)) buckets.set(candidate.sourceGroupName, []);
    buckets.get(candidate.sourceGroupName).push(candidate);
  }
  const groupedIds = new Set();
  const groups = [];
  for (const [name, members] of buckets) {
    if (members.length < MIN_GROUP_SIZE) continue;
    const group = makeSuggestion(
      name,
      members.map((member) => member.candidateId),
      'high',
      randomId,
    );
    if (!group) continue;
    groups.push(group);
    for (const member of members) groupedIds.add(member.candidateId);
  }
  return finalizeProposal(
    groups,
    sanitized
      .filter((candidate) => !groupedIds.has(candidate.candidateId))
      .map((candidate) => candidate.candidateId),
  );
}

function proposeFromEmbeddings(candidates, embeddingMatrix, {
  threshold = CLUSTER_THRESHOLD,
  randomId = () => crypto.randomUUID(),
} = {}) {
  const sanitized = candidates.map(sanitizeCandidateInput).filter((c) => c.candidateId);
  const anchored = folderAnchorGroups(sanitized, randomId);
  const remaining = sanitized.filter((c) => !anchored.anchoredIds.has(c.candidateId));
  const remainingIndices = remaining.map((candidate) =>
    sanitized.findIndex((item) => item.candidateId === candidate.candidateId));
  const remainingMatrix = remainingIndices.map((index) => embeddingMatrix[index]);
  const clustered = embeddingGroups(remaining, remainingMatrix, threshold, randomId);
  return finalizeProposal(
    [...anchored.groups, ...clustered.groups],
    [...anchored.ungrouped, ...clustered.ungrouped],
  );
}

function validateProposal(proposal, {
  selectedIds = [],
  excludedIds = [],
} = {}) {
  if (!proposal || proposal.version !== 1) return { ok: false, reason: 'invalid-version' };
  const excluded = new Set(excludedIds.map(String));
  const expected = selectedIds.map(String).filter((id) => !excluded.has(id));
  const seen = new Set();
  const groups = Array.isArray(proposal.groups) ? proposal.groups : [];
  const ungrouped = Array.isArray(proposal.ungroupedCandidateIds)
    ? proposal.ungroupedCandidateIds.map(String)
    : [];

  if (groups.length > MAX_GROUPS) return { ok: false, reason: 'too-many-groups' };

  for (const group of groups) {
    const name = normalizeGroupName(group?.name);
    if (!name) return { ok: false, reason: 'invalid-name' };
    if (GENERIC_GROUP_NAMES.has(name)) return { ok: false, reason: 'generic-name' };
    const ids = Array.isArray(group?.candidateIds) ? group.candidateIds.map(String) : [];
    if (ids.length < MIN_GROUP_SIZE) return { ok: false, reason: 'group-too-small' };
    for (const id of ids) {
      if (excluded.has(id)) return { ok: false, reason: 'excluded-candidate' };
      if (!expected.includes(id)) return { ok: false, reason: 'unknown-candidate' };
      if (seen.has(id)) return { ok: false, reason: 'duplicate-candidate' };
      seen.add(id);
    }
  }

  for (const id of ungrouped) {
    if (excluded.has(id)) return { ok: false, reason: 'excluded-candidate' };
    if (!expected.includes(id)) return { ok: false, reason: 'unknown-candidate' };
    if (seen.has(id)) return { ok: false, reason: 'duplicate-candidate' };
    seen.add(id);
  }

  for (const id of expected) {
    if (!seen.has(id)) return { ok: false, reason: 'missing-candidate' };
  }

  return { ok: true, proposal };
}

module.exports = {
  CLUSTER_THRESHOLD,
  MIN_GROUP_SIZE,
  MAX_GROUPS,
  sanitizeCandidateInput,
  deriveGroupName,
  proposeFromSourceGroups,
  proposeFromFolders,
  proposeFromEmbeddings,
  validateProposal,
  cosineSimilarity,
};
