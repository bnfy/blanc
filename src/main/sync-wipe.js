// Pure decision behind sync.js's disable({ wipeRemote: true }) — extracted so
// the erase-server-copy policy is unit-testable without Electron. The rule it
// pins (2026-07-11 audit): the accountId is the ONLY handle on the server
// copy, so local credentials may be cleared iff the remote DELETE succeeded.
// Clearing after a failed DELETE would strand unreachable ciphertext while
// telling the user it's gone.
/**
 * @param {{ error: true } | { status: number }} outcome - the DELETE attempt:
 *   { error: true } for a network failure, { status } for an HTTP response.
 * @returns {{ clearCredentials: boolean, ok: boolean, error: string | null }} —
 *   `error` is a sync error code (sync-messages.js).
 */
function wipeDecision(outcome) {
  if (outcome.error) {
    return { clearCredentials: false, ok: false, error: 'wipe-offline' };
  }
  const s = outcome.status;
  if (s >= 200 && s < 300) return { clearCredentials: true, ok: true, error: null };
  if (s === 429) return { clearCredentials: false, ok: false, error: 'rate-limited' };
  return { clearCredentials: false, ok: false, error: `wipe-failed:${s}` };
}

module.exports = { wipeDecision };
