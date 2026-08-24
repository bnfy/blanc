// Ephemeral main-process store for F39 Bring Your Tabs import sessions.
// No Electron — safe under node --test.
const crypto = require('node:crypto');

const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSION_CANDIDATES = 500;
const MAX_SESSION_GROUPS = 12;

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

function normalizeGroupName(name) {
  const trimmed = String(name ?? '').trim().toLowerCase();
  return trimmed ? trimmed.slice(0, 40) : '';
}

function createTabImportSessionStore({
  now = () => Date.now(),
  randomId = () => crypto.randomUUID(),
  randomBytes = (size) => crypto.randomBytes(size),
} = {}) {
  const sessions = new Map();
  const runtimeIndex = new Map();

  function nextOpaqueId(isTaken) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const id = String(randomId() ?? '');
      if (id && !isTaken(id)) return id;
    }
    throw new Error('random-id-unavailable');
  }

  function nextGeneration(previousGeneration = null) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const generation = Buffer.from(randomBytes(16)).toString('base64url');
      if (generation && generation !== previousGeneration) return generation;
    }
    throw new Error('random-generation-unavailable');
  }

  function getSession(sessionId) {
    return sessions.get(String(sessionId ?? '')) ?? null;
  }

  function assertOwner(session, owner) {
    if (!owner) return true;
    return session.runtimeId === owner.runtimeId && session.profileId === owner.profileId;
  }

  function destroySession(sessionId, reason = 'destroyed') {
    const session = getSession(sessionId);
    if (!session) return false;
    sessions.delete(session.sessionId);
    if (runtimeIndex.get(session.runtimeId) === session.sessionId) {
      runtimeIndex.delete(session.runtimeId);
    }
    session.embeddings = null;
    session.embeddingGeneration = null;
    session.candidates.clear();
    session.previewOrder.length = 0;
    if (session.tabIds) session.tabIds.length = 0;
    session.tabIds = null;
    session.focusTabId = null;
    session.destroyedReason = reason;
    return true;
  }

  function destroyForRuntime(runtimeId, reason = 'runtime-destroyed') {
    const sessionId = runtimeIndex.get(runtimeId);
    if (!sessionId) return false;
    return destroySession(sessionId, reason);
  }

  function ownSession(sessionId, owner, at = now()) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    if (at - session.lastTouchAt >= SESSION_TTL_MS) {
      destroySession(session.sessionId, 'expired');
      return { error: 'session-unavailable' };
    }
    session.lastTouchAt = at;
    return {
      ok: true,
      state: session.state,
      generation: session.generation,
      focusTabId: session.focusTabId,
      tabIds: session.tabIds ? [...session.tabIds] : null,
    };
  }

  function touch(sessionId) {
    const session = getSession(sessionId);
    if (!session) return false;
    session.lastTouchAt = now();
    return true;
  }

  function expireIdleSessions(at = now()) {
    let expired = 0;
    for (const session of sessions.values()) {
      if (at - session.lastTouchAt >= SESSION_TTL_MS) {
        destroySession(session.sessionId, 'expired');
        expired += 1;
      }
    }
    return expired;
  }

  function createSession({
    runtimeId,
    profileId,
    sourceKind,
    sourceLabel,
  }) {
    if (!runtimeId || !profileId) throw new Error('invalid-session-owner');
    const previousSession = getSession(runtimeIndex.get(runtimeId));
    const previousGeneration = previousSession?.generation ?? null;
    destroyForRuntime(runtimeId);
    const stamp = now();
    const session = {
      sessionId: nextOpaqueId((id) => sessions.has(id)),
      generation: nextGeneration(previousGeneration),
      runtimeId,
      profileId,
      sourceKind: String(sourceKind ?? ''),
      sourceLabel: String(sourceLabel ?? ''),
      state: 'ready',
      createdAt: stamp,
      lastTouchAt: stamp,
      candidates: new Map(),
      previewOrder: [],
      embeddings: null,
      embeddingGeneration: null,
      tabIds: null,
      focusTabId: null,
    };
    sessions.set(session.sessionId, session);
    runtimeIndex.set(runtimeId, session.sessionId);
    return { sessionId: session.sessionId, generation: session.generation };
  }

  function assignCandidates(sessionId, rawCandidates, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    if (session.state !== 'ready') return { error: 'session-not-ready' };
    if (!Array.isArray(rawCandidates)) return { error: 'invalid-candidates' };
    if (rawCandidates.length > MAX_SESSION_CANDIDATES) {
      return { error: 'too-many-candidates', count: rawCandidates.length };
    }
    const nextCandidates = new Map();
    const candidateIds = [];
    for (const raw of rawCandidates) {
      if (!raw || typeof raw.url !== 'string') continue;
      const candidateId = nextOpaqueId((id) => nextCandidates.has(id));
      nextCandidates.set(candidateId, {
        candidateId,
        url: raw.url,
        title: typeof raw.title === 'string' && raw.title ? raw.title : raw.url,
        sourceWindow: Number.isInteger(raw.sourceWindow) && raw.sourceWindow > 0
          ? raw.sourceWindow
          : 1,
        sourceTabOrder: Number.isInteger(raw.sourceTabOrder) ? raw.sourceTabOrder : candidateIds.length,
        sourceGroupName: normalizeGroupName(raw.sourceGroupName) || null,
        sourceGroupToken: typeof raw.sourceGroupToken === 'string'
          ? raw.sourceGroupToken.slice(0, 80)
          : null,
        pinned: raw.pinned === true,
        lastActiveAt: Number.isFinite(raw.lastActiveAt) ? raw.lastActiveAt : 0,
        hostname: hostnameFromUrl(raw.url),
        selected: true,
        excluded: false,
      });
      candidateIds.push(candidateId);
    }
    session.candidates = nextCandidates;
    session.previewOrder = [...candidateIds];
    touch(sessionId);
    return { candidateIds };
  }

  function projectCandidates(sessionId, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    touch(sessionId);
    return {
      candidates: session.previewOrder.map((id) => {
        const candidate = session.candidates.get(id);
        if (!candidate) return null;
        return {
          candidateId: id,
          title: candidate.title,
          hostname: candidate.hostname,
          sourceWindow: candidate.sourceWindow,
          sourceTabOrder: candidate.sourceTabOrder,
          sourceGroupName: candidate.sourceGroupName,
          pinned: candidate.pinned,
          selected: candidate.selected,
          excluded: candidate.excluded,
        };
      }).filter(Boolean),
    };
  }

  function setSelection(sessionId, selection = {}, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    if (session.state !== 'ready') return { error: 'session-not-ready' };
    if (!selection || typeof selection !== 'object') return { error: 'invalid-selection' };
    const selectedIds = selection.selectedIds ?? [];
    const excludedIds = selection.excludedIds ?? [];
    if (!Array.isArray(selectedIds) || !Array.isArray(excludedIds)
      || selectedIds.length > MAX_SESSION_CANDIDATES
      || excludedIds.length > MAX_SESSION_CANDIDATES) {
      return { error: 'invalid-selection' };
    }
    const selected = new Set(selectedIds);
    const excluded = new Set(excludedIds);
    for (const [id, candidate] of session.candidates) {
      if (excluded.has(id)) {
        candidate.excluded = true;
        candidate.selected = false;
      } else if (selected.has(id)) {
        candidate.selected = true;
        candidate.excluded = false;
      } else {
        candidate.selected = false;
        candidate.excluded = false;
      }
    }
    touch(sessionId);
    return { ok: true };
  }

  function storeEmbeddings(sessionId, generation, matrix, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    if (session.state !== 'ready') return { error: 'session-not-ready' };
    if (generation !== session.generation) return { error: 'stale-generation' };
    if (!Array.isArray(matrix) || matrix.length > MAX_SESSION_CANDIDATES) {
      return { error: 'invalid-embeddings' };
    }
    session.embeddings = matrix;
    session.embeddingGeneration = generation;
    touch(sessionId);
    return { ok: true };
  }

  function clearEmbeddings(sessionId, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    session.embeddings = null;
    session.embeddingGeneration = null;
    touch(sessionId);
    return { ok: true };
  }

  function selectedCandidateIds(session) {
    return session.previewOrder.filter((id) => {
      const candidate = session.candidates.get(id);
      return candidate && candidate.selected && !candidate.excluded;
    });
  }

  function resolveApply(sessionId, request = {}, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    if (session.state !== 'ready') return { error: 'session-not-ready' };
    if (!request || typeof request !== 'object') return { error: 'invalid-apply-request' };
    const {
      generation,
      groups = [],
      ungroupedCandidateIds = [],
    } = request;
    if (generation !== session.generation) return { error: 'stale-generation' };
    if (!Array.isArray(groups) || groups.length > MAX_SESSION_GROUPS
      || !Array.isArray(ungroupedCandidateIds)
      || ungroupedCandidateIds.length > MAX_SESSION_CANDIDATES) {
      return { error: 'invalid-apply-request' };
    }

    const selectedIds = selectedCandidateIds(session);
    const proposed = [];
    const normalizedGroups = [];
    for (const group of groups) {
      if (!group || typeof group !== 'object' || typeof group.name !== 'string'
        || !Array.isArray(group.candidateIds)
        || group.candidateIds.length > MAX_SESSION_CANDIDATES) {
        return { error: 'invalid-apply-request' };
      }
      const name = normalizeGroupName(group?.name);
      if (!name) return { error: 'invalid-group-name' };
      if (!group.candidateIds.every((id) => typeof id === 'string')) {
        return { error: 'invalid-apply-request' };
      }
      const ids = [...group.candidateIds];
      if (ids.length < 2) return { error: 'invalid-group-size' };
      normalizedGroups.push({ name, candidateIds: ids });
      proposed.push(...ids);
    }
    if (!ungroupedCandidateIds.every((id) => typeof id === 'string')) {
      return { error: 'invalid-apply-request' };
    }
    const ungrouped = [...ungroupedCandidateIds];
    proposed.push(...ungrouped);

    if (proposed.length !== selectedIds.length) return { error: 'candidate-mismatch' };
    const seen = new Set();
    for (const id of proposed) {
      if (!session.candidates.has(id)) return { error: 'unknown-candidate' };
      const candidate = session.candidates.get(id);
      if (!candidate.selected || candidate.excluded) return { error: 'excluded-candidate' };
      if (seen.has(id)) return { error: 'duplicate-candidate' };
      seen.add(id);
    }
    for (const id of selectedIds) {
      if (!seen.has(id)) return { error: 'missing-candidate' };
    }

    const entryFor = (id) => {
      const candidate = session.candidates.get(id);
      return {
        candidateId: id,
        url: candidate.url,
        title: candidate.title,
        favicon: null,
        pinned: candidate.pinned,
      };
    };

    touch(sessionId);
    return {
      ok: true,
      generation: session.generation,
      entries: selectedIds.map(entryFor),
      groups: normalizedGroups,
      ungroupedCandidateIds: ungrouped,
      focusCandidateId: selectedIds[0] ?? null,
    };
  }

  function markTabsApplied(sessionId, generation, result = {}, owner) {
    const session = getSession(sessionId);
    if (!session) return { error: 'session-unavailable' };
    if (!assertOwner(session, owner)) return { error: 'forbidden' };
    if (session.state !== 'ready') return { error: 'session-not-ready' };
    if (generation !== session.generation) return { error: 'stale-generation' };
    if (!result || typeof result !== 'object') return { error: 'invalid-apply-result' };
    const {
      tabIds = [],
      focusTabId = null,
    } = result;
    if (!Array.isArray(tabIds) || tabIds.length === 0
      || tabIds.length > MAX_SESSION_CANDIDATES
      || !tabIds.every((id) => typeof id === 'string' && id)
      || new Set(tabIds).size !== tabIds.length
      || (focusTabId !== null && !tabIds.includes(focusTabId))) {
      return { error: 'invalid-apply-result' };
    }
    session.state = 'tabsApplied';
    session.tabIds = [...tabIds];
    session.focusTabId = focusTabId;
    session.embeddings = null;
    session.embeddingGeneration = null;
    session.candidates.clear();
    session.previewOrder.length = 0;
    touch(sessionId);
    return { ok: true };
  }

  return {
    SESSION_TTL_MS,
    createSession,
    assignCandidates,
    projectCandidates,
    setSelection,
    storeEmbeddings,
    clearEmbeddings,
    resolveApply,
    markTabsApplied,
    ownSession,
    touch,
    expireIdleSessions,
    destroySession,
    destroyForRuntime,
  };
}

module.exports = {
  SESSION_TTL_MS,
  MAX_SESSION_CANDIDATES,
  MAX_SESSION_GROUPS,
  createTabImportSessionStore,
  hostnameFromUrl,
};
