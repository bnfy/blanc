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
  isOverlaySender,
  randomUUID,
  setTimer,
  clearTimer,
  timeoutMs,
}) {
  let pending = null;

  function settle(index, reason, { shareAudio = false } = {}) {
    const request = pending;
    if (!request) return;
    pending = null;
    clearTimer(request.timer);
    if (getOverlayMode() === 'display-share-picker') {
      try { hideOverlay(); } catch { /* a dying window has nothing left to hide */ }
    }
    request.resolve({
      source: validIndex(index, request.sources.length) ? request.sources[index] : null,
      shareAudio: validIndex(index, request.sources.length)
        && request.canShareAudio
        && shareAudio === true,
      reason,
    });
  }

  function requestPick({
    sources,
    rows,
    origin,
    webContentsId,
    canShareAudio = false,
  }) {
    if (pending) settle(null, 'mode-replaced');
    if (!Array.isArray(sources) || sources.length === 0) {
      return Promise.resolve({ source: null, shareAudio: false, reason: 'no-sources' });
    }
    if (!Array.isArray(rows) || rows.length !== sources.length) {
      throw new TypeError('display-share rows must correspond one-to-one with sources');
    }

    return new Promise((resolve) => {
      const requestId = randomUUID();
      pending = {
        requestId,
        sources,
        webContentsId,
        canShareAudio: !!canShareAudio,
        resolve,
        timer: null,
      };

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
        pending = null;
        if (getOverlayMode() === 'display-share-picker') {
          try { hideOverlay(); } catch { /* already gone */ }
        }
        resolve({ source: null, shareAudio: false, reason: 'window-closed' });
        return;
      }
      pending.timer = setTimer(() => settle(null, 'timeout'), timeoutMs);
    });
  }

  function handleReply(event, payload) {
    if (!isOverlaySender(event) || !pending) return;
    if (getOverlayMode() !== 'display-share-picker') return;
    if (!payload || payload.requestId !== pending.requestId) return;

    const index = Object.prototype.hasOwnProperty.call(payload, 'index')
      ? payload.index
      : undefined;
    if (index === null) return settle(null, 'dismissed');
    if (!validIndex(index, pending.sources.length)) {
      return settle(null, 'invalid-reply');
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'shareAudio')
      && typeof payload.shareAudio !== 'boolean'
    ) {
      return settle(null, 'invalid-reply');
    }
    settle(index, 'selected', { shareAudio: payload.shareAudio === true });
  }

  function cancelForWebContents(webContentsId, reason) {
    if (pending?.webContentsId !== webContentsId) return false;
    settle(null, reason);
    return true;
  }

  return {
    requestPick,
    settle,
    handleReply,
    cancelForWebContents,
    isPending: () => pending !== null,
  };
}

module.exports = {
  createDisplaySharePickerController,
  PICK_REASONS,
  validIndex,
};
