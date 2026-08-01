'use strict';

// Exactly-once lifecycle owner for the trusted display-source chooser. Electron
// objects stay in `sources`; the renderer receives only the inert `rows`
// projection supplied by main.js.

const PICK_REASONS = Object.freeze([
  'selected',
  'dismissed',
  'escape',
  'invalid-reply',
  'mode-replaced',
  'hidden',
  'blur',
  'tab-changed',
  'navigation',
  'window-closed',
  'timeout',
  'no-sources',
]);

function validIndex(index, length) {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function createDisplaySharePickerController({
  showOverlay,
  hideOverlay,
  getOverlayMode,
  getRuntimeId = () => null,
  isOverlaySender,
  randomUUID,
  setTimer,
  clearTimer,
  timeoutMs,
}) {
  const pendingByRuntime = new Map();

  function settleForRuntime(runtimeId, index, reason, { shareAudio = false } = {}) {
    const request = pendingByRuntime.get(runtimeId);
    if (!request) return false;
    pendingByRuntime.delete(runtimeId);
    clearTimer(request.timer);
    if (getOverlayMode(runtimeId) === 'display-share-picker') {
      try { hideOverlay(runtimeId); } catch { /* a dying window has nothing left to hide */ }
    }
    request.resolve({
      source: validIndex(index, request.sources.length) ? request.sources[index] : null,
      shareAudio: validIndex(index, request.sources.length)
        && request.canShareAudio
        && shareAudio === true,
      reason,
    });
    return true;
  }

  function settle(index, reason, options) {
    return settleForRuntime(getRuntimeId() ?? null, index, reason, options);
  }

  function requestPick({
    sources,
    rows,
    origin,
    webContentsId,
    canShareAudio = false,
    runtimeId = null,
  }) {
    const ownerRuntimeId = runtimeId ?? getRuntimeId() ?? null;
    if (pendingByRuntime.has(ownerRuntimeId)) {
      settleForRuntime(ownerRuntimeId, null, 'mode-replaced');
    }
    if (!Array.isArray(sources) || sources.length === 0) {
      return Promise.resolve({ source: null, shareAudio: false, reason: 'no-sources' });
    }
    if (!Array.isArray(rows) || rows.length !== sources.length) {
      throw new TypeError('display-share rows must correspond one-to-one with sources');
    }

    return new Promise((resolve) => {
      const requestId = randomUUID();
      const request = {
        requestId,
        sources,
        webContentsId,
        canShareAudio: !!canShareAudio,
        runtimeId: ownerRuntimeId,
        resolve,
        timer: null,
      };
      pendingByRuntime.set(ownerRuntimeId, request);

      let shown = false;
      try {
        shown = showOverlay('display-share-picker', {
          prefill: {
            requestId,
            origin,
            rows,
            canShareAudio: !!canShareAudio,
          },
        });
      } catch {
        shown = false;
      }
      if (shown !== true) {
        pendingByRuntime.delete(ownerRuntimeId);
        if (getOverlayMode(ownerRuntimeId) === 'display-share-picker') {
          try { hideOverlay(ownerRuntimeId); } catch { /* already gone */ }
        }
        resolve({ source: null, shareAudio: false, reason: 'window-closed' });
        return;
      }
      request.timer = setTimer(
        () => settleForRuntime(ownerRuntimeId, null, 'timeout'),
        timeoutMs
      );
    });
  }

  function handleReply(event, payload) {
    if (!isOverlaySender(event)) return;
    const runtimeId = getRuntimeId() ?? null;
    const pending = pendingByRuntime.get(runtimeId);
    if (!pending) return;
    if (getOverlayMode(runtimeId) !== 'display-share-picker') return;
    if (!payload || payload.requestId !== pending.requestId) return;

    const index = Object.prototype.hasOwnProperty.call(payload, 'index')
      ? payload.index
      : undefined;
    if (index === null) return settleForRuntime(runtimeId, null, 'dismissed');
    if (!validIndex(index, pending.sources.length)) {
      return settleForRuntime(runtimeId, null, 'invalid-reply');
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'shareAudio')
      && typeof payload.shareAudio !== 'boolean'
    ) {
      return settleForRuntime(runtimeId, null, 'invalid-reply');
    }
    settleForRuntime(runtimeId, index, 'selected', { shareAudio: payload.shareAudio === true });
  }

  function cancelForWebContents(webContentsId, reason) {
    for (const [runtimeId, pending] of pendingByRuntime) {
      if (pending.webContentsId === webContentsId) {
        return settleForRuntime(runtimeId, null, reason);
      }
    }
    return false;
  }

  function cancelForRuntime(runtimeId, reason) {
    return settleForRuntime(runtimeId, null, reason);
  }

  return {
    requestPick,
    settle,
    settleForRuntime,
    handleReply,
    cancelForWebContents,
    cancelForRuntime,
    isPending: () => pendingByRuntime.size > 0,
    isPendingForRuntime: (runtimeId) => pendingByRuntime.has(runtimeId),
  };
}

module.exports = {
  createDisplaySharePickerController,
  PICK_REASONS,
  validIndex,
};
