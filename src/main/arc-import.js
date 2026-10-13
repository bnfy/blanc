'use strict';

// F45 Arc Spaces import: one read-and-apply session at a time. The parsed
// sidebar stays here in main; the Bring Your Tabs page sees only names,
// counts and opaque ids. Electron-free: reading and every store mutation
// arrive as injected functions from main. Each selected Space becomes one
// Blanc space, for everyone.

const crypto = require('node:crypto');
const { planArcSpacesImport } = require('./arc-sidebar');

function createArcImportService({
  readDetected,
  chooseAndRead,
  spaceRoom,
  createSpaces,
  importFavorites,
  untitledName = (n) => `Space ${n}`,
  randomId = () => crypto.randomUUID(),
} = {}) {
  let session = null;

  function project(parsed, source) {
    const sessionId = randomId();
    const ids = new Map();
    let untitled = 0;
    const spaces = parsed.spaces.map((space, index) => {
      const id = `space-${index + 1}`;
      ids.set(id, space.sourceSpaceId);
      const base = space.name ?? untitledName(untitled += 1);
      const count = (predicate) => space.tabs.filter(predicate).length;
      return {
        id,
        name: base,
        tabCount: space.tabs.length,
        pinnedCount: count((tab) => tab.section === 'pinned' && tab.folderKey === null),
        todayCount: count((tab) => tab.section === 'today' && tab.folderKey === null),
        folderCount: space.folders.length,
        separateProfile: space.arcProfile === 'custom',
      };
    });
    session = { sessionId, parsed, ids };
    return {
      sessionId,
      source,
      spaces,
      favoritesCount: parsed.favorites.length,
      skippedCount: parsed.skippedCount,
      remainingSlots: spaceRoom().remainingSlots,
    };
  }

  async function read(source) {
    const parsed = source === 'file' ? await chooseAndRead() : await readDetected();
    if (parsed?.cancelled) return { cancelled: true };
    if (!parsed || parsed.error) return { error: parsed?.error ?? 'unreadable' };
    if (!parsed.spaces.some((space) => space.tabs.length) && !parsed.favorites.length) {
      return { error: 'empty' };
    }
    return project(parsed, source === 'file' ? 'file' : 'arc');
  }

  async function apply(sessionId, request = {}) {
    if (!session || session.sessionId !== String(sessionId ?? '')) return { error: 'session-unavailable' };
    const requested = Array.isArray(request.spaceIds) ? request.spaceIds.map(String) : [];
    const selectedSpaceIds = [];
    for (const id of new Set(requested)) {
      const source = session.ids.get(id);
      if (!source) return { error: 'invalid-selection' };
      selectedSpaceIds.push(source);
    }
    const withFavorites = request.favorites === true && session.parsed.favorites.length > 0;
    if (!selectedSpaceIds.length && !withFavorites) return { error: 'nothing-selected' };

    let created = [];
    let droppedCount = 0;
    let emptyCount = 0;
    if (selectedSpaceIds.length) {
      const room = spaceRoom();
      const plan = planArcSpacesImport({
        spaces: session.parsed.spaces,
        selectedSpaceIds,
        existingWorkspaceNames: room.existingNames,
        remainingSlots: room.remainingSlots,
        untitledName,
        randomId,
      });
      if (plan.error) return { error: plan.error };
      if (plan.noRoom.length) {
        return { error: 'no-room', remainingSlots: room.remainingSlots, selectedCount: plan.planned.length + plan.noRoom.length };
      }
      emptyCount = plan.empty.length;
      if (plan.planned.length) {
        const result = await createSpaces(plan.planned.map(({ name, capture }) => ({ name, capture })));
        if (!result?.ok) return { error: result?.error ?? 'apply-failed' };
        created = plan.planned.map(({ name }) => name);
        droppedCount = plan.planned.reduce((sum, entry) => sum + entry.droppedCount, 0);
      }
    }

    let favorites = null;
    if (withFavorites) {
      favorites = await importFavorites(session.parsed.favorites.map(({ url, title }) => ({ url, title, folder: 'Arc' })));
    }
    session = null;
    return {
      ok: true,
      created,
      droppedCount,
      emptyCount,
      favoritesAdded: favorites?.added ?? 0,
      favoritesSkipped: favorites?.skipped ?? 0,
    };
  }

  return {
    read,
    apply,
    cancel(sessionId) {
      if (session && session.sessionId === String(sessionId ?? '')) session = null;
      return { ok: true };
    },
    /** The sheet closed: drop whatever was read, whichever session it was. */
    discard() { session = null; },
    /** Test support: whether a parsed sidebar is still held. */
    hasSession: () => !!session,
  };
}

module.exports = { createArcImportService };
