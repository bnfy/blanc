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
  showOverlay, hideOverlay, getOverlayMode, getRuntimeId = () => null, isOverlaySender,
  randomUUID, setTimer, clearTimer, timeoutMs,
}) {
  const pendingByRuntime = new Map();

  /** Resolve exactly once. State is cleared BEFORE resolving so anything running
   * synchronously off the resolution cannot observe a half-torn-down request. */
  function settleForRuntime(runtimeId, index, reason) {
    const p = pendingByRuntime.get(runtimeId);
    if (!p) return false;                 // already settled, or none open
    pendingByRuntime.delete(runtimeId);
    clearTimer(p.timer);
    // Teardown is BEST-EFFORT and must never prevent settlement. hideOverlay
    // touches a WebContentsView that may already be destroyed — likeliest on
    // exactly the window-closed / render-process-gone routes — and an escaping
    // throw would leave the fill awaiting a promise nothing resolves, which is
    // the wedge this controller exists to prevent.
    if (getOverlayMode(runtimeId) === 'credential-picker') {
      try { hideOverlay(runtimeId); } catch { /* view already gone — nothing to undo */ }
    }
    p.resolve({ index, reason });
    return true;
  }

  function settle(index, reason) {
    return settleForRuntime(getRuntimeId() ?? null, index, reason);
  }

  function requestPick(rows, truncated, host, { runtimeId = null } = {}) {
    const ownerRuntimeId = runtimeId ?? getRuntimeId() ?? null;
    if (pendingByRuntime.has(ownerRuntimeId)) {
      settleForRuntime(ownerRuntimeId, null, 'mode-replaced');
    }
    return new Promise((resolve) => {
      const requestId = randomUUID();
      const request = {
        requestId,
        rowCount: rows.length,
        resolve,
        timer: null,
        runtimeId: ownerRuntimeId,
      };
      pendingByRuntime.set(ownerRuntimeId, request);
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
        pendingByRuntime.delete(ownerRuntimeId);
        if (getOverlayMode(ownerRuntimeId) === 'credential-picker') {
          try { hideOverlay(ownerRuntimeId); } catch { /* already gone — nothing more to undo */ }
        }
        resolve({ index: null, reason: 'window-closed' });
        return;
      }
      request.timer = setTimer(
        () => settleForRuntime(ownerRuntimeId, null, 'timeout'),
        timeoutMs
      );
    });
  }

  /** Two stages. Stage 1 proves the reply belongs to THIS request and failing it
   * changes NO state — otherwise a late reply from a closed picker could cancel
   * a different, live one. Only a stage-1-clean reply may be cancelled by a
   * malformed index. */
  function handleReply(event, payload) {
    if (!isOverlaySender(event)) return;                       // overlay only
    const runtimeId = getRuntimeId() ?? null;
    const pending = pendingByRuntime.get(runtimeId);
    if (!pending) return;
    if (getOverlayMode(runtimeId) !== 'credential-picker') return;
    if (!payload || payload.requestId !== pending.requestId) return;
    const index = Object.prototype.hasOwnProperty.call(payload, 'index') ? payload.index : undefined;
    if (!isValidPickIndex(index, pending.rowCount)) {
      return settleForRuntime(runtimeId, null, 'invalid-reply');
    }
    settleForRuntime(runtimeId, index, index === null ? 'dismissed' : 'selected');
  }

  return {
    requestPick,
    settle,
    settleForRuntime,
    handleReply,
    isPending: () => pendingByRuntime.size > 0,
    isPendingForRuntime: (runtimeId) => pendingByRuntime.has(runtimeId),
  };
}

module.exports = { createPickerController, PICK_REASONS };
