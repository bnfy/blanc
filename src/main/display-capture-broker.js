'use strict';

const {
  CHROME_DISPLAY_CAPTURE_HELPER_URL,
  CHROME_INDEX_URL,
} = require('./chrome-protocol');

const HELPER_PARTITION = 'blanc-display-capture-helper';

// Page-facing getDisplayMedia names the helper may surface. Unknown reasons
// stay AbortError so callers never see free-form strings as error names.
const CAPTURE_DOM_ERROR_NAMES = new Set([
  'NotAllowedError',
  'AbortError',
  'NotReadableError',
  'OverconstrainedError',
  'InvalidStateError',
  'NotFoundError',
  'SecurityError',
  'TypeError',
]);

function pageErrorNameForReason(reason) {
  if (reason === 'cancel') return 'NotAllowedError';
  if (CAPTURE_DOM_ERROR_NAMES.has(reason)) return reason;
  return 'AbortError';
}

/** Temporary gate-diagnosis logging; keep messages structured and free of SDP/PII. */
function logCapture(event, detail = {}) {
  try {
    const safe = {};
    for (const [key, value] of Object.entries(detail || {})) {
      if (value == null) continue;
      if (typeof value === 'string' && value.length > 120) {
        safe[key] = `${value.slice(0, 120)}…`;
        continue;
      }
      if (key === 'sdp' || key === 'offer' || key === 'candidate') continue;
      safe[key] = value;
    }
    console.error(`[display-capture] ${event}`, JSON.stringify(safe));
  } catch {
    console.error(`[display-capture] ${event}`);
  }
}

function createHelperAuthority() {
  const tokens = new WeakSet();

  function authorize(wc) {
    if (wc) tokens.add(wc);
  }

  function revoke(wc) {
    if (wc) tokens.delete(wc);
  }

  function isAuthorizedHelperSender(wc, url) {
    if (!wc || typeof wc.isDestroyed !== 'function' || wc.isDestroyed() === true) return false;
    if (url !== CHROME_DISPLAY_CAPTURE_HELPER_URL) return false;
    let current;
    try { current = wc.getURL(); } catch { return false; }
    if (current !== CHROME_DISPLAY_CAPTURE_HELPER_URL) return false;
    return tokens.has(wc);
  }

  return { authorize, revoke, isAuthorizedHelperSender };
}

function createHelperSession({ sessionFactory, setupChromeProtocol, net }) {
  const ses = sessionFactory.fromPartition(HELPER_PARTITION);
  setupChromeProtocol({ session: ses, net });
  return ses;
}

function attachHelperWindow({
  BrowserWindow,
  session: helperSession,
  preloadPath,
  lockPrivilegedNavigation,
  authority,
}) {
  const win = new BrowserWindow({
    show: false,
    width: 100,
    height: 100,
    webPreferences: {
      session: helperSession,
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  lockPrivilegedNavigation(win.webContents, CHROME_DISPLAY_CAPTURE_HELPER_URL);
  authority.authorize(win.webContents);
  win.webContents.on('destroyed', () => authority.revoke(win.webContents));
  win.loadURL(CHROME_DISPLAY_CAPTURE_HELPER_URL);
  return win;
}

function installDisplayCaptureBroker({
  ipcMain,
  registry,
  evaluateAdmission,
  parseDisplayMediaOptions,
  filterSignaling,
  collectLocalAddresses,
  helperWc,
  helperSession,
  desktopCapturer,
  showPicker,
  hidePicker,
  authority,
  readTrustedFacts,
  isOverlaySender,
  isPackaged = true,
  stubPicker = false,
  handlePickerIpc = true,
  timeoutMs = 30_000,
} = {}) {
  const pending = new Map();
  const helperJobs = new Map();
  let acquireTail = Promise.resolve();

  const enqueueAcquire = (fn) => {
    const run = acquireTail.then(fn, fn);
    acquireTail = run.catch(() => {});
    return run;
  };

  const localAddresses = () => (
    typeof collectLocalAddresses === 'function' ? collectLocalAddresses() : new Set(['127.0.0.1', '::1'])
  );

  const failPending = (requestId, errorName, extra = {}) => {
    const wait = pending.get(requestId);
    if (!wait) return;
    clearTimeout(wait.timer);
    pending.delete(requestId);
    hidePicker?.(requestId);
    logCapture('fail-pending', {
      requestId,
      shareId: wait.shareId,
      errorName,
      reason: extra.reason || null,
      alreadyResolved: wait.resolved === true,
    });
    if (wait.resolved === true) {
      try {
        wait.event?.sender?.send?.('display-capture:abort', {
          shareId: wait.shareId,
          reason: extra.reason || errorName,
        });
      } catch {}
      return;
    }
    wait.resolved = true;
    wait.resolve({ ok: false, errorName, ...extra });
  };

  const pageOwnsShare = (event, shareId) => {
    if (typeof shareId !== 'string' || !shareId || !event?.sender) return false;
    const rec = registry.getShare?.(shareId);
    if (!rec) return false;
    const wait = pending.get(rec.requestId) || helperJobs.get(shareId)?.wait;
    if (wait?.event?.sender && event.sender !== wait.event.sender) return false;
    if (rec.webContentsId != null && event.sender.id != null && event.sender.id !== rec.webContentsId) {
      return false;
    }
    const frameId = event.senderFrame?.frameTreeNodeId;
    if (rec.frameId != null && frameId !== rec.frameId) return false;
    if (rec.documentGeneration != null) {
      const bound = wait?.trusted?.documentGeneration;
      if (bound != null && bound !== rec.documentGeneration) return false;
      try {
        const facts = readTrustedFacts?.(event);
        if (facts && facts.documentGeneration != null && facts.documentGeneration !== rec.documentGeneration) {
          return false;
        }
      } catch {}
    }
    return true;
  };

  const startupReady = new Map();
  const acquireHolds = new Map();
  const nativeArmed = new Set();
  const cancelledNative = new Set();
  let activeCaptureGrant = null;
  let captureGeneration = 0;

  const releaseAcquire = (shareId) => {
    const resolve = acquireHolds.get(shareId);
    if (!resolve) return;
    acquireHolds.delete(shareId);
    resolve();
  };

  const holdAcquire = (shareId) => new Promise((resolve) => {
    acquireHolds.set(shareId, resolve);
  });

  const settleNativeAcquire = (shareId) => {
    nativeArmed.delete(shareId);
    if (!cancelledNative.has(shareId)) return;
    cancelledNative.delete(shareId);
    releaseAcquire(shareId);
  };

  const releaseAcquireAndNative = (shareId) => {
    nativeArmed.delete(shareId);
    cancelledNative.delete(shareId);
    releaseAcquire(shareId);
  };

  const denyDisplayMedia = (_request, callback) => {
    callback({});
    for (const shareId of [...cancelledNative]) settleNativeAcquire(shareId);
  };

  const revokeCaptureHandler = (shareId) => {
    if (activeCaptureGrant && shareId && activeCaptureGrant.shareId !== shareId) return;
    captureGeneration += 1;
    activeCaptureGrant = null;
    if (helperSession?.setDisplayMediaRequestHandler) {
      helperSession.setDisplayMediaRequestHandler(denyDisplayMedia);
    }
  };

  const installCaptureHandler = ({ shareId, source, computerAudio }) => {
    const generation = ++captureGeneration;
    activeCaptureGrant = { shareId, source, computerAudio, generation };
    nativeArmed.add(shareId);
    logCapture('install-handler', {
      shareId,
      computerAudio: computerAudio === true,
      sourceId: typeof source?.id === 'string' ? source.id : null,
    });
    helperSession.setDisplayMediaRequestHandler((_request, callback) => {
      const live = activeCaptureGrant;
      if (!live || live.shareId !== shareId || live.generation !== generation) {
        logCapture('handler-stale-deny', { shareId, generation });
        callback({});
        settleNativeAcquire(shareId);
        return;
      }
      activeCaptureGrant = null;
      logCapture('handler-grant', {
        shareId,
        computerAudio: live.computerAudio === true,
        sourceId: typeof live.source?.id === 'string' ? live.source.id : null,
      });
      callback({
        video: live.source,
        ...(live.computerAudio ? { audio: 'loopback' } : {}),
      });
      if (helperSession?.setDisplayMediaRequestHandler) {
        helperSession.setDisplayMediaRequestHandler(denyDisplayMedia);
      }
    });
  };

  const requiredPageTracksReady = (shareId) => {
    const rec = registry.getShare?.(shareId);
    const job = helperJobs.get(shareId);
    if (!rec || !job) return false;
    const kinds = startupReady.get(shareId) || new Set();
    if (!kinds.has('video')) return false;
    if (job.computerAudio === true && !kinds.has('audio')) return false;
    return true;
  };

  const clearStartupOnceReady = (shareId) => {
    if (!requiredPageTracksReady(shareId)) return;
    const rec = registry.getShare(shareId);
    const wait = pending.get(rec?.requestId);
    if (!wait) return;
    clearTimeout(wait.timer);
    pending.delete(rec.requestId);
  };

  const stopShareNow = (shareId, reason) => {
    const rec = registry.listShares().find((row) => row.shareId === shareId);
    const job = helperJobs.get(shareId);
    const hadPending = rec && pending.has(rec.requestId);
    logCapture('stop-share', {
      shareId,
      reason,
      requestId: rec?.requestId || null,
      hadPending: !!hadPending,
      computerAudio: job?.computerAudio === true,
      pageErrorName: pageErrorNameForReason(reason),
    });
    registry.stopShare(shareId);
    if (helperWc && !helperWc.isDestroyed?.()) {
      helperWc.send('display-capture-helper:signal', { type: 'stop', shareId, reason });
    }
    if (rec?.requestId) failPending(rec.requestId,
      pageErrorNameForReason(reason), { reason });
    if (rec && job?.wait?.resolved && !hadPending) {
      try { job.wait.event.sender.send('display-capture:abort', { shareId, reason }); } catch {}
    }
    helperJobs.delete(shareId);
    startupReady.delete(shareId);
    revokeCaptureHandler(shareId);
    if (reason !== 'helper-gone' && nativeArmed.has(shareId)) {
      cancelledNative.add(shareId);
      return rec;
    }
    releaseAcquireAndNative(shareId);
    return rec;
  };

  const armTimeout = (requestId) => {
    const wait = pending.get(requestId);
    if (!wait) return;
    wait.timer = setTimeout(() => {
      const row = registry.listShares().find((item) => item.requestId === requestId);
      if (row) stopShareNow(row.shareId, 'timeout');
      else failPending(requestId, 'AbortError', { reason: 'timeout' });
    }, timeoutMs);
  };

  const bindPageLifecycle = (event, requestId, shareId) => {
    const wc = event.sender;
    if (!wc?.on) return;
    const gone = () => stopShareNow(shareId, 'page-gone');
    wc.on('render-process-gone', gone);
    wc.on('destroyed', gone);
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && isInPlace === false) stopShareNow(shareId, 'navigation');
    });
    const frame = event.senderFrame;
    frame?.on?.('destroyed', () => stopShareNow(shareId, 'frame-gone'));
  };

  if (helperWc?.on) {
    helperWc.on('render-process-gone', () => {
      for (const row of registry.listShares()) stopShareNow(row.shareId, 'helper-gone');
    });
    helperWc.on('destroyed', () => {
      for (const row of registry.listShares()) stopShareNow(row.shareId, 'helper-gone');
    });
  }

  const sendFilteredToHelper = (payload) => {
    if (!helperWc || helperWc.isDestroyed?.()) return false;
    if (!authority.isAuthorizedHelperSender(helperWc, CHROME_DISPLAY_CAPTURE_HELPER_URL)) return false;
    helperWc.send('display-capture-helper:signal', payload);
    return true;
  };

  ipcMain.handle('display-capture:request', async (event, payload) => {
    const parsed = parseDisplayMediaOptions(payload?.options);
    if (!parsed.ok) return { ok: false, errorName: parsed.errorName };
    const trusted = readTrustedFacts(event) || {};
    const admission = evaluateAdmission({
      userActivationActive: payload?.userActivationActive === true,
      displayCaptureAllowed: payload?.displayCaptureAllowed === true,
      documentFocused: trusted.documentFocused === true,
      documentVisible: trusted.documentVisible === true,
      frameAlive: trusted.frameAlive === true,
    });
    if (!admission.ok) return { ok: false, errorName: 'NotAllowedError', reason: admission.reason };
    const started = registry.beginRequest({
      tabId: trusted.tabId,
      webContentsId: trusted.webContentsId,
      frameId: trusted.frameId,
      origin: trusted.origin,
      documentGeneration: trusted.documentGeneration,
      audioRequested: parsed.audioRequested,
    });
    if (started.error) return { ok: false, errorName: 'InvalidStateError', reason: started.error };
    registry.admit(started.requestId);
    const shareRow = registry.listShares().find((row) => row.requestId === started.requestId);
    bindPageLifecycle(event, started.requestId, shareRow.shareId);
    return await new Promise((resolve) => {
      pending.set(started.requestId, {
        resolve,
        event,
        parsed,
        trusted,
        shareId: shareRow.shareId,
        cancelled: false,
      });
      armTimeout(started.requestId);
      if (stubPicker && isPackaged !== true) {
        Promise.resolve().then(() => {
          ipcMain.emit?.('display-capture:picker-resolve', {
            sender: { getURL: () => 'blanc-chrome://overlay/' },
          }, {
            requestId: started.requestId,
            sourceId: trusted.sources?.[0]?.id || 'screen:stub',
            computerAudioApproved: parsed.audioRequested,
            surfaceLabel: trusted.sources?.[0]?.name || 'Screen',
            surfaceKind: 'screen',
          });
        });
      } else {
        showPicker?.(started.requestId, {
          origin: trusted.origin,
          audioRequested: parsed.audioRequested,
          sources: trusted.sources || [],
        });
      }
    });
  });

  const resolvePicker = async (_event, payload, portalSource = null) => {
    if (!isOverlaySender?.(_event, payload?.requestId)) return;
    const requestId = payload?.requestId;
    const wait = pending.get(requestId);
    if (!wait || wait.cancelled) return;
    const approved = registry.approve(requestId, {
      sourceId: payload.sourceId,
      computerAudioApproved: payload.computerAudioApproved === true,
      surfaceLabel: payload.surfaceLabel,
      surfaceKind: payload.surfaceKind,
    });
    if (!approved) {
      failPending(requestId, 'AbortError', { reason: 'stale' });
      return;
    }
    hidePicker?.(requestId);
    const job = {
      shareId: approved.shareId,
      sourceId: payload.sourceId,
      computerAudio: approved.computerAudio,
      videoConstraints: wait.parsed.videoConstraints,
    };
    helperJobs.set(approved.shareId, { ...job, wait });
    await new Promise((resolveSetup) => {
      enqueueAcquire(async () => {
        let held = null;
        try {
          const stillPending = () => {
            const current = pending.get(requestId);
            return !!(current && current.cancelled !== true);
          };
          if (!stillPending()) {
            if (helperWc && !helperWc.isDestroyed?.()) {
              helperWc.send('display-capture-helper:signal', { type: 'stop', shareId: approved.shareId, reason: 'cancel' });
            }
            return;
          }
          if (typeof payload.sourceId !== 'string' || !payload.sourceId) {
            stopShareNow(approved.shareId, 'no-source');
            return;
          }
          if (helperSession?.setDisplayMediaRequestHandler && desktopCapturer?.getSources) {
            let sources = [];
            try {
              sources = portalSource ? [portalSource]
                : await desktopCapturer.getSources({ types: ['screen', 'window'] });
            } catch {
              stopShareNow(approved.shareId, 'no-source');
              return;
            }
            if (!stillPending()) {
              stopShareNow(approved.shareId, 'cancel');
              return;
            }
            const source = sources.find((item) => item.id === payload.sourceId);
            if (!source) {
              stopShareNow(approved.shareId, 'no-source');
              return;
            }
            installCaptureHandler({
              shareId: approved.shareId,
              source,
              computerAudio: approved.computerAudio,
            });
          }
          if (!stillPending()) {
            stopShareNow(approved.shareId, 'cancel');
            return;
          }
          if (helperWc && !helperWc.isDestroyed?.()) {
            held = holdAcquire(approved.shareId);
            helperWc.send('display-capture-helper:authorize', job);
          }
        } finally {
          resolveSetup();
        }
        if (held) await held;
      });
    });
  };

  if (handlePickerIpc) {
    ipcMain.on('display-capture:picker-resolve', (event, payload) => resolvePicker(event, payload));
  }

  ipcMain.on('display-capture:signal', (event, payload) => {
    const shareId = payload?.shareId;
    if (!pageOwnsShare(event, shareId)) return;
    if (payload.type === 'failed') { stopShareNow(shareId, 'relay-failed'); return; }
    if (payload?.type === 'candidate' || payload?.sdp || payload?.candidate) {
      const raw = payload.sdp || payload.candidate || payload.line;
      const filtered = filterSignaling(raw, { localAddresses: localAddresses() });
      if (!filtered.ok) return;
      sendFilteredToHelper({
        type: payload.type || (payload.sdp ? 'answer' : 'candidate'),
        shareId,
        sdp: filtered.sdp,
        candidate: filtered.candidate,
      });
      return;
    }
    if (payload?.type === 'answer' && payload.sdp) {
      const filtered = filterSignaling(payload.sdp, { localAddresses: localAddresses() });
      if (!filtered.ok) return;
      sendFilteredToHelper({ type: 'answer', shareId, sdp: filtered.sdp });
    }
  });

  ipcMain.on('display-capture:track-added', (event, payload) => {
    if (!pageOwnsShare(event, payload?.shareId) || !payload?.trackKey) return;
    registry.addConsumer(payload.shareId, { kind: payload.kind, trackKey: payload.trackKey });
  });

  ipcMain.on('display-capture:track-ready', (event, payload) => {
    if (!pageOwnsShare(event, payload?.shareId)) return;
    if (payload?.kind !== 'video' && payload?.kind !== 'audio') return;
    if (!startupReady.has(payload.shareId)) startupReady.set(payload.shareId, new Set());
    startupReady.get(payload.shareId).add(payload.kind);
    clearStartupOnceReady(payload.shareId);
  });

  ipcMain.on('display-capture:track-stopped', (event, payload) => {
    if (!pageOwnsShare(event, payload?.shareId) || !payload?.trackKey) return;
    const result = registry.removeConsumer(payload.shareId, {
      kind: payload.kind,
      trackKey: payload.trackKey,
    });
    if (result.releasedKind || result.shareEnded) {
      helperWc?.send('display-capture-helper:signal', {
        type: 'release',
        shareId: payload.shareId,
        kind: result.releasedKind,
        shareEnded: result.shareEnded,
      });
    }
    if (result.shareEnded) helperJobs.delete(payload.shareId);
  });

  ipcMain.on('display-capture-helper:signal', (event, payload) => {
    if (!authority.isAuthorizedHelperSender(event.sender, CHROME_DISPLAY_CAPTURE_HELPER_URL)) return;
    const shareId = payload?.shareId;
    const job = helperJobs.get(shareId);
    if (payload?.type === 'diag') {
      logCapture(`helper-diag:${payload.event || 'unknown'}`, {
        shareId,
        name: payload?.name || null,
        message: typeof payload?.message === 'string' ? payload.message : null,
        computerAudio: payload?.computerAudio,
        video: payload?.video || null,
        audio: payload?.audio || null,
      });
      return;
    }
    if (payload?.type === 'ended' || payload?.type === 'error') {
      logCapture('helper-signal', {
        type: payload?.type,
        shareId,
        name: payload?.name || null,
        reason: payload?.reason || null,
        message: typeof payload?.message === 'string' ? payload.message : null,
      });
      if (shareId) {
        stopShareNow(shareId, payload?.reason || payload?.name || 'helper');
        settleNativeAcquire(shareId);
      }
      return;
    }
    if (payload?.type !== 'offer') return;
    logCapture('helper-offer', {
      shareId,
      video: payload.tracks?.video === true,
      audio: payload.tracks?.audio === true,
      computerAudio: job?.computerAudio === true,
    });
    if (!job) {
      if (shareId && helperWc && !helperWc.isDestroyed?.()) {
        helperWc.send('display-capture-helper:signal', { type: 'stop', shareId, reason: 'late' });
      }
      if (shareId) releaseAcquireAndNative(shareId);
      return;
    }
    const found = [...pending.entries()].find(([, v]) => v.shareId === shareId);
    const requestId = found?.[0];
    const pendingWait = found?.[1];
    if (!pendingWait || pendingWait.cancelled) {
      helperWc.send('display-capture-helper:signal', { type: 'stop', shareId, reason: 'late' });
      registry.stopShare(shareId);
      helperJobs.delete(shareId);
      startupReady.delete(shareId);
      releaseAcquireAndNative(shareId);
      return;
    }
    if (payload.tracks?.video !== true) {
      stopShareNow(shareId, 'no-video');
      return;
    }
    if (pendingWait.parsed.audioRequested && job.computerAudio && payload.tracks?.audio !== true) {
      stopShareNow(shareId, 'no-audio');
      return;
    }
    const filtered = filterSignaling(payload.sdp, { localAddresses: localAddresses() });
    if (!filtered.ok) {
      stopShareNow(shareId, 'ice');
      return;
    }
    if (pendingWait.resolved !== true) {
      pendingWait.resolved = true;
      pendingWait.resolve({
        ok: true,
        shareId,
        offer: filtered.sdp,
        computerAudio: job.computerAudio,
      });
    }
    releaseAcquireAndNative(shareId);
  });

  ipcMain.on('display-capture-helper:stopped', (event, payload) => {
    if (!authority.isAuthorizedHelperSender(event.sender, CHROME_DISPLAY_CAPTURE_HELPER_URL)) return;
    const shareId = payload?.shareId;
    if (typeof shareId !== 'string' || !shareId) return;
    if (payload.nativeSettled !== true) return;
    settleNativeAcquire(shareId);
  });

  ipcMain.on('display-capture:stop', (event, payload) => {
    const url = (() => { try { return event.sender.getURL(); } catch { return ''; } })();
    const trusted = event?.sender === helperWc
      || isOverlaySender?.(event)
      || url === CHROME_INDEX_URL;
    if (!trusted) return;
    if (typeof payload?.shareId === 'string' && payload.shareId) {
      stopShareNow(payload.shareId, 'stop');
    }
  });

  return {
    cancelAcquisition(requestId) {
      const wait = pending.get(requestId);
      if (wait) wait.cancelled = true;
      const row = registry.listShares().find((item) => item.requestId === requestId);
      if (row) stopShareNow(row.shareId, 'cancel');
      else failPending(requestId, 'AbortError', { reason: 'cancel' });
    },
    noteNavigation(shareId) { stopShareNow(shareId, 'navigation'); },
    noteFrameGone(shareId) { stopShareNow(shareId, 'frame-gone'); },
    noteRendererGone(shareId) { stopShareNow(shareId, 'page-gone'); },
    noteHelperGone() {
      for (const row of registry.listShares()) stopShareNow(row.shareId, 'helper-gone');
    },
    noteSourceEnded(shareId) { stopShareNow(shareId, 'source-ended'); },
    expire(requestId) {
      const row = registry.listShares().find((item) => item.requestId === requestId);
      if (row) stopShareNow(row.shareId, 'timeout');
      else failPending(requestId, 'AbortError', { reason: 'timeout' });
    },
    stopShare(shareId) { stopShareNow(shareId, 'stop'); },
    resolvePicker,
  };
}

module.exports = {
  HELPER_PARTITION,
  createHelperAuthority,
  createHelperSession,
  attachHelperWindow,
  installDisplayCaptureBroker,
  pageErrorNameForReason,
  logCapture,
  isAuthorizedHelperSender: (wc, url, authority) => authority.isAuthorizedHelperSender(wc, url),
};
