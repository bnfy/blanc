'use strict';

const {
  CHROME_DISPLAY_CAPTURE_HELPER_URL,
  CHROME_INDEX_URL,
} = require('./chrome-protocol');

const HELPER_PARTITION = 'blanc-display-capture-helper';

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
    wait.resolve({ ok: false, errorName, ...extra });
  };

  const stopShareNow = (shareId, reason) => {
    const rec = registry.listShares().find((row) => row.shareId === shareId);
    registry.stopShare(shareId);
    if (helperWc && !helperWc.isDestroyed?.()) {
      helperWc.send('display-capture-helper:signal', { type: 'stop', shareId, reason });
    }
    if (rec?.requestId) failPending(rec.requestId, 'AbortError', { reason });
    helperJobs.delete(shareId);
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

  const resolvePicker = async (_event, payload) => {
    if (!isOverlaySender?.(_event)) return;
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
    await enqueueAcquire(async () => {
      const current = pending.get(requestId);
      if (!current || current.cancelled) {
        if (helperWc && !helperWc.isDestroyed?.()) {
          helperWc.send('display-capture-helper:signal', { type: 'stop', shareId: approved.shareId, reason: 'cancel' });
        }
        return;
      }
      if (helperSession?.setDisplayMediaRequestHandler && desktopCapturer?.getSources) {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const source = sources.find((item) => item.id === payload.sourceId) || sources[0];
        helperSession.setDisplayMediaRequestHandler((_request, callback) => {
          callback({
            video: source,
            ...(approved.computerAudio ? { audio: 'loopback' } : {}),
          });
        });
      }
      if (helperWc && !helperWc.isDestroyed?.()) {
        helperWc.send('display-capture-helper:authorize', job);
      }
    });
  };

  ipcMain.on('display-capture:picker-resolve', resolvePicker);

  ipcMain.on('display-capture:signal', (event, payload) => {
    const wait = [...pending.values()].find((item) => item.event.sender === event.sender)
      || [...helperJobs.values()].find((item) => item.wait?.event.sender === event.sender);
    const shareId = payload?.shareId || wait?.shareId;
    if (!shareId) return;
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

  ipcMain.on('display-capture:track-added', (_event, payload) => {
    if (!payload?.shareId || !payload?.trackKey) return;
    registry.addConsumer(payload.shareId, { kind: payload.kind, trackKey: payload.trackKey });
  });

  ipcMain.on('display-capture:track-stopped', (_event, payload) => {
    if (!payload?.shareId || !payload?.trackKey) return;
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
    if (payload?.type === 'ended' || payload?.type === 'error') {
      if (shareId) stopShareNow(shareId, payload?.reason || payload?.name || 'helper');
      return;
    }
    if (payload?.type !== 'offer') return;
    if (!job) {
      if (shareId && helperWc && !helperWc.isDestroyed?.()) {
        helperWc.send('display-capture-helper:signal', { type: 'stop', shareId, reason: 'late' });
      }
      return;
    }
    const found = [...pending.entries()].find(([, v]) => v.shareId === shareId);
    const requestId = found?.[0];
    const pendingWait = found?.[1];
    if (!pendingWait || pendingWait.cancelled) {
      helperWc.send('display-capture-helper:signal', { type: 'stop', shareId, reason: 'late' });
      registry.stopShare(shareId);
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
    clearTimeout(pendingWait.timer);
    pending.delete(requestId);
    pendingWait.resolve({
      ok: true,
      shareId,
      offer: filtered.sdp,
      computerAudio: job.computerAudio,
    });
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
  isAuthorizedHelperSender: (wc, url, authority) => authority.isAuthorizedHelperSender(wc, url),
};
