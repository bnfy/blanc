// Pure naming/options seam for Electron's native window-state persistence.
// Main-window runtime ids already survive session restore, so the same native
// window gets the same persistence key without putting platform geometry into
// session.json (whose rollback mirror deliberately stays browser-data-only).

const WINDOW_STATE_NAME_PREFIX = 'blanc-window-';

function windowStateName(runtimeId) {
  const id = String(runtimeId ?? '');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error(`Invalid window runtime id: ${id}`);
  }
  return `${WINDOW_STATE_NAME_PREFIX}${id}`;
}

function windowStatePersistenceOptions(runtimeId) {
  return {
    name: windowStateName(runtimeId),
    windowStatePersistence: {
      bounds: true,
      displayMode: true,
    },
  };
}

/** Persist live windows across a real app quit (and the primary macOS window
 * across Dock close), but forget a secondary window that the user explicitly
 * removed from Blanc's saved session. Kept pure so the lifecycle policy is
 * covered without loading Electron or matching main.js source text. */
function shouldClearPersistedWindowState({ isQuitting, isPrimaryWindow }) {
  return !isQuitting && !isPrimaryWindow;
}

module.exports = {
  WINDOW_STATE_NAME_PREFIX,
  shouldClearPersistedWindowState,
  windowStateName,
  windowStatePersistenceOptions,
};
