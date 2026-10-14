// Pure naming/options seam for Electron's native window-state persistence,
// plus the rule for what closing a window does to the saved session.
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

/** What a user's close of one window does to Blanc's saved session, decided
 * when the close begins. Quit and forced closes never ask.
 * - 'dock': the macOS primary window. Its workspace survives for Dock reopen,
 *   so the saved session is left as it is.
 * - 'quit': the last open window on Windows or Linux. Closing it quits Blanc
 *   (window-all-closed), so the window and its tabs stay saved, as Quit
 *   keeps them.
 * - 'remove': any other window. It leaves the saved session (F32-1). */
function windowCloseSessionEffect({ platform, isPrimaryWindow, otherOpenWindows }) {
  if (platform === 'darwin') return isPrimaryWindow ? 'dock' : 'remove';
  return otherOpenWindows > 0 ? 'remove' : 'quit';
}

/** Persist live windows across a real app quit (and the primary macOS window
 * across Dock close, and the last Windows/Linux window, whose close quits),
 * but forget a secondary window that the user explicitly removed from Blanc's
 * saved session. Kept pure so the lifecycle policy is covered without loading
 * Electron or matching main.js source text. */
function shouldClearPersistedWindowState({ isQuitting, isPrimaryWindow, closeEffect = null }) {
  return !isQuitting && !isPrimaryWindow && closeEffect !== 'quit';
}

module.exports = {
  WINDOW_STATE_NAME_PREFIX,
  shouldClearPersistedWindowState,
  windowCloseSessionEffect,
  windowStateName,
  windowStatePersistenceOptions,
};
