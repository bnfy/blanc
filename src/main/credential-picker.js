'use strict';
// SPIKE (1Password fill feasibility) — remove before release.
//
// The exactly-once owner of credential-picker resolution. Every route that can
// end a picker goes through `settle`, or the fill would await a promise that
// never resolves and wedge the single-flight flag. Electron collaborators are
// injected so the lifecycle contracts are testable without a window.
const { isValidPickIndex } = require('./onepassword');

/** Closed reason enum. Focus policy is derived from it, so there is no default. */
const PICK_REASONS = Object.freeze([
  'selected', 'dismissed', 'escape', 'invalid-reply',
  'mode-replaced', 'hidden', 'blur', 'tab-changed', 'window-closed', 'timeout',
]);

function createPickerController({
  showOverlay, hideOverlay, getOverlayMode, isOverlaySender,
  randomUUID, setTimer, clearTimer, timeoutMs,
}) {
  let pending = null; // { requestId, rowCount, resolve, timer }

  /** Resolve exactly once. State is cleared BEFORE resolving so anything running
   * synchronously off the resolution cannot observe a half-torn-down request. */
  function settle(index, reason) {
    const p = pending;
    if (!p) return;                       // already settled, or none open
    pending = null;
    clearTimer(p.timer);
    if (getOverlayMode() === 'credential-picker') hideOverlay();
    p.resolve({ index, reason });
  }

  function requestPick(rows, truncated, host) {
    return new Promise((resolve) => {
      const requestId = randomUUID();
      pending = { requestId, rowCount: rows.length, resolve, timer: null };
      // showOverlay can also THROW — and it can throw PARTWAY THROUGH. The real
      // one assigns overlayMode and overlayPrefill before addChildView/send/
      // focus, any of which can fail on a dying window. So a throw does not
      // mean "nothing happened": vault rows may already be sitting in
      // overlayPrefill. Clear the request AND best-effort tear the overlay back
      // down, rather than only dropping our own state.
      let shown = false;
      try {
        shown = showOverlay('credential-picker', { prefill: { requestId, host, rows, truncated } });
      } catch {
        shown = false;
      }
      if (shown !== true) {
        pending = null;
        if (getOverlayMode() === 'credential-picker') {
          try { hideOverlay(); } catch { /* already gone — nothing more to undo */ }
        }
        resolve({ index: null, reason: 'window-closed' });
        return;
      }
      pending.timer = setTimer(() => settle(null, 'timeout'), timeoutMs);
    });
  }

  /** Two stages. Stage 1 proves the reply belongs to THIS request and failing it
   * changes NO state — otherwise a late reply from a closed picker could cancel
   * a different, live one. Only a stage-1-clean reply may be cancelled by a
   * malformed index. */
  function handleReply(event, payload) {
    if (!isOverlaySender(event)) return;                       // overlay only
    if (!pending) return;
    if (getOverlayMode() !== 'credential-picker') return;
    if (!payload || payload.requestId !== pending.requestId) return;
    const index = Object.prototype.hasOwnProperty.call(payload, 'index') ? payload.index : undefined;
    if (!isValidPickIndex(index, pending.rowCount)) return settle(null, 'invalid-reply');
    settle(index, index === null ? 'dismissed' : 'selected');
  }

  return { requestPick, settle, handleReply, isPending: () => pending !== null };
}

module.exports = { createPickerController, PICK_REASONS };
