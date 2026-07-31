// Versioned, Electron-free persistence model for the browser workspace.
//
// v0 was a single flat session.json record. v1 wraps that record in a stable
// window workspace so later multi-window support can add owners without
// inventing another migration format. Keep this module pure: main.js is not
// loadable under node --test, and migrations need fixture coverage before UI
// wiring.

const SESSION_WORKSPACE_VERSION = 1;
const PRIMARY_WINDOW_ID = 'primary';

function validWindowId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function validGroup(group) {
  return group &&
    typeof group.id === 'string' && group.id.length > 0 && group.id.length <= 128 &&
    typeof group.name === 'string' && group.name.length > 0 && group.name.length <= 128;
}

function normalizeWindowState(input = {}, fallbackId = PRIMARY_WINDOW_ID) {
  const urls = Array.isArray(input.urls)
    ? input.urls.filter((url) => typeof url === 'string' && url.length > 0)
    : [];
  const groupIds = Array.isArray(input.groupIds)
    ? urls.map((_, index) => typeof input.groupIds[index] === 'string' ? input.groupIds[index] : null)
    : urls.map(() => null);
  const pinned = Array.isArray(input.pinned)
    ? urls.map((_, index) => input.pinned[index] === true)
    : urls.map(() => false);
  const activeIndex = Number.isInteger(input.activeIndex)
    ? Math.max(0, Math.min(input.activeIndex, Math.max(0, urls.length - 1)))
    : 0;
  return {
    id: validWindowId(input.id) ? input.id : fallbackId,
    urls,
    activeIndex,
    groups: Array.isArray(input.groups)
      ? input.groups.filter(validGroup).map(({ id, name, collapsed }) => ({ id, name, collapsed: !!collapsed }))
      : [],
    groupIds,
    pinned,
  };
}

function emptyWorkspace() {
  return {
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: PRIMARY_WINDOW_ID,
    windows: [normalizeWindowState({}, PRIMARY_WINDOW_ID)],
  };
}

/**
 * Read v0 or the current version without ever downgrading an unknown newer
 * record. Callers can open a fresh ephemeral workspace while leaving that
 * newer record untouched for the app version that understands it.
 */
function readSessionWorkspace(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (Number.isInteger(source.version) && source.version > SESSION_WORKSPACE_VERSION) {
    return { supported: false, migrated: false, workspace: emptyWorkspace() };
  }

  if (source.version === SESSION_WORKSPACE_VERSION && Array.isArray(source.windows)) {
    const used = new Set();
    const windows = source.windows
      .map((windowState, index) => normalizeWindowState(
        windowState,
        index === 0 ? PRIMARY_WINDOW_ID : 'window-' + (index + 1)
      ))
      .filter((windowState) => {
        if (used.has(windowState.id)) return false;
        used.add(windowState.id);
        return true;
      });
    if (!windows.length) windows.push(normalizeWindowState({}, PRIMARY_WINDOW_ID));
    const activeWindowId = windows.some((windowState) => windowState.id === source.activeWindowId)
      ? source.activeWindowId
      : windows[0].id;
    return {
      supported: true,
      migrated: false,
      workspace: { version: SESSION_WORKSPACE_VERSION, activeWindowId, windows },
    };
  }

  // v0: the flat fields are exactly one primary window. This preserves all
  // legacy URLs/parallel metadata and upgrades them atomically on next save.
  return {
    supported: true,
    migrated: true,
    workspace: {
      version: SESSION_WORKSPACE_VERSION,
      activeWindowId: PRIMARY_WINDOW_ID,
      windows: [normalizeWindowState(source, PRIMARY_WINDOW_ID)],
    },
  };
}

function activeWorkspaceWindow(workspace) {
  const normalized = readSessionWorkspace(workspace);
  return normalized.workspace.windows.find((windowState) =>
    windowState.id === normalized.workspace.activeWindowId
  ) ?? normalized.workspace.windows[0];
}

function replaceWorkspaceWindow(workspace, windowState, { activeWindowId = null } = {}) {
  const parsed = readSessionWorkspace(workspace);
  if (!parsed.supported) return parsed.workspace;
  const replacement = normalizeWindowState(windowState, PRIMARY_WINDOW_ID);
  const windows = parsed.workspace.windows.map((existing) =>
    existing.id === replacement.id ? replacement : existing
  );
  if (!windows.some((existing) => existing.id === replacement.id)) windows.push(replacement);
  const nextActiveWindowId = validWindowId(activeWindowId) && windows.some(
    (existing) => existing.id === activeWindowId
  )
    ? activeWindowId
    : parsed.workspace.activeWindowId;
  return {
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: nextActiveWindowId,
    windows,
  };
}

function removeWorkspaceWindow(workspace, id) {
  const parsed = readSessionWorkspace(workspace);
  if (!parsed.supported || !validWindowId(id) || id === PRIMARY_WINDOW_ID) {
    return parsed.workspace;
  }
  const windows = parsed.workspace.windows.filter((windowState) => windowState.id !== id);
  const activeWindowId = windows.some((windowState) => windowState.id === parsed.workspace.activeWindowId)
    ? parsed.workspace.activeWindowId
    : windows[0]?.id ?? PRIMARY_WINDOW_ID;
  return {
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId,
    windows,
  };
}

function replaceObject(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

module.exports = {
  SESSION_WORKSPACE_VERSION,
  PRIMARY_WINDOW_ID,
  normalizeWindowState,
  emptyWorkspace,
  readSessionWorkspace,
  activeWorkspaceWindow,
  replaceWorkspaceWindow,
  removeWorkspaceWindow,
  replaceObject,
};
