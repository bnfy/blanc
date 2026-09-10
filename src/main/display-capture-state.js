'use strict';

function createBrokerRegistry() {
  const byRequest = new Map();
  const byShare = new Map();
  const pendingByTab = new Map();
  const listeners = new Set();
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${++seq}`;
  const notify = () => {
    for (const fn of listeners) {
      try { fn(); } catch {}
    }
  };

  const project = (rec) => ({
    shareId: rec.shareId,
    requestId: rec.requestId,
    tabId: rec.tabId,
    origin: rec.origin,
    surfaceLabel: rec.surfaceLabel,
    surfaceKind: rec.surfaceKind,
    computerAudio: rec.computerAudio === true,
    pending: rec.pending === true,
  });

  function beginRequest({
    tabId,
    webContentsId,
    frameId,
    origin,
    documentGeneration,
    audioRequested,
  } = {}) {
    if (pendingByTab.has(tabId)) return { error: 'pending' };
    const requestId = nextId('req');
    const shareId = nextId('share');
    const rec = {
      requestId,
      shareId,
      tabId,
      webContentsId,
      frameId,
      origin,
      documentGeneration,
      audioRequested: audioRequested === true,
      admitted: false,
      pending: true,
      computerAudio: false,
      surfaceLabel: null,
      surfaceKind: null,
      sourceId: null,
      consumers: new Map(),
    };
    byRequest.set(requestId, rec);
    byShare.set(shareId, rec);
    pendingByTab.set(tabId, requestId);
    notify();
    return { requestId };
  }

  function admit(requestId) {
    const rec = byRequest.get(requestId);
    if (!rec || rec.pending !== true) return;
    rec.admitted = true;
  }

  function drop(rec) {
    byRequest.delete(rec.requestId);
    byShare.delete(rec.shareId);
    if (pendingByTab.get(rec.tabId) === rec.requestId) pendingByTab.delete(rec.tabId);
    notify();
  }

  function invalidateGeneration(webContentsId, documentGeneration) {
    for (const rec of [...byRequest.values()]) {
      if (rec.webContentsId === webContentsId && rec.documentGeneration === documentGeneration) {
        drop(rec);
      }
    }
  }

  function approve(requestId, {
    sourceId,
    computerAudioApproved,
    surfaceLabel,
    surfaceKind,
  } = {}) {
    const rec = byRequest.get(requestId);
    if (!rec || rec.pending !== true || rec.admitted !== true) return null;
    rec.pending = false;
    rec.sourceId = sourceId;
    rec.surfaceLabel = surfaceLabel ?? null;
    rec.surfaceKind = surfaceKind ?? null;
    rec.computerAudio = rec.audioRequested === true && computerAudioApproved === true;
    pendingByTab.delete(rec.tabId);
    notify();
    return project(rec);
  }

  function addConsumer(shareId, { kind, trackKey } = {}) {
    const rec = byShare.get(shareId);
    if (!rec || rec.pending === true) return;
    if (kind !== 'video' && kind !== 'audio') return;
    if (typeof trackKey !== 'string' || !trackKey) return;
    rec.consumers.set(trackKey, kind);
  }

  function removeConsumer(shareId, { kind, trackKey } = {}) {
    const rec = byShare.get(shareId);
    if (!rec) return { releasedKind: null, shareEnded: false };
    if (rec.consumers.get(trackKey) !== kind) return { releasedKind: null, shareEnded: false };
    rec.consumers.delete(trackKey);
    const remaining = [...rec.consumers.values()];
    const releasedKind = remaining.includes(kind) ? null : kind;
    if (releasedKind === 'audio') rec.computerAudio = false;
    const shareEnded = remaining.length === 0;
    if (shareEnded) drop(rec);
    else notify();
    return { releasedKind, shareEnded };
  }

  function stopShare(shareId) {
    const rec = byShare.get(shareId);
    if (!rec) return { shareEnded: false, releasedKinds: [] };
    const releasedKinds = [...new Set(rec.consumers.values())];
    if (rec.pending) releasedKinds.length = 0;
    drop(rec);
    return { shareEnded: true, releasedKinds };
  }

  function tabHasBlockingShare(tabId) {
    if (pendingByTab.has(tabId)) return true;
    for (const rec of byShare.values()) {
      if (rec.tabId === tabId) return true;
    }
    return false;
  }

  function listShares() {
    return [...byShare.values()].map(project);
  }

  function getShare(shareId) {
    const rec = byShare.get(shareId);
    if (!rec) return null;
    return {
      ...project(rec),
      webContentsId: rec.webContentsId,
      frameId: rec.frameId,
      documentGeneration: rec.documentGeneration,
      audioRequested: rec.audioRequested === true,
      consumerKinds: [...rec.consumers.values()],
    };
  }

  return {
    beginRequest,
    admit,
    invalidateGeneration,
    approve,
    addConsumer,
    removeConsumer,
    stopShare,
    tabHasBlockingShare,
    listShares,
    getShare,
    onChange(fn) {
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

module.exports = { createBrokerRegistry };
