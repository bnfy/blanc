'use strict';

// No Electron import: only the injected adapter can resolve native frames,
// windows and sources. Nothing here accepts renderer-provided authorization.
function trustedDisplayOrigin(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' || (url.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return url.origin;
  } catch {}
  return null;
}

function createDisplayCaptureController({ resolveContext, choose, acquireAudio,
  nativePicker = false, onGrant = () => {}, onPending = () => {}, onError = () => {},
  timeoutMs = 120_000 }) {
  const records = new Map();
  const pendingOwners = new Map();
  let serial = 0;
  const frameKey = (frame) => `${frame.processId}:${frame.routingId}`;

  function dispose(record) {
    if (records.get(record.key) !== record) return;
    records.delete(record.key);
    if (pendingOwners.get(record.context.ownerKey) === record) pendingOwners.delete(record.context.ownerKey);
    clearTimeout(record.timer);
    record.abort.abort();
    record.audio?.dispose();
    for (const [event, listener] of record.listeners) record.context.wc.removeListener(event, listener);
    onPending(record.context, false);
  }

  async function requestPermission(wc, details) {
    // Missing metadata on stock Electron deliberately remains a denial.
    if (details?.captureApi !== 'get-display-media' || details.videoRequested !== true) return false;
    const context = resolveContext(wc, details);
    if (!context || !context.valid() || !trustedDisplayOrigin(context.origin)) return false;
    const key = frameKey(context.frame);
    if (pendingOwners.has(context.ownerKey) || records.has(key)) return false;
    const record = { key, context, id: ++serial, abort: new AbortController(), listeners: [],
      phase: 'consent', audio: null, selected: null, audioRequested: details.audioRequested === true };
    records.set(key, record);
    pendingOwners.set(context.ownerKey, record);
    onPending(context, true);
    const cancel = () => dispose(record);
    const navigating = (_event, _url, inPlace, isMainFrame, processId, routingId) => {
      if (!inPlace && (isMainFrame || (processId === context.frame.processId && routingId === context.frame.routingId))) cancel();
    };
    for (const [event, fn] of [['destroyed', cancel], ['render-process-gone', cancel], ['did-start-navigation', navigating]]) {
      context.wc.on(event, fn);
      record.listeners.push([event, fn]);
    }
    // Consent timeout rejects; once native selection starts, its lifetime is
    // owned by the OS and the requesting document rather than a timer.
    record.timer = setTimeout(cancel, timeoutMs);
    record.timer.unref?.();
    try {
      const aborted = new Promise((resolve) => record.abort.signal.addEventListener('abort', () => resolve(null), { once: true }));
      const selection = await Promise.race([choose({ ...context, id: record.id,
        audioRequested: record.audioRequested, nativePicker, signal: record.abort.signal }), aborted]);
      if (!selection || record.abort.signal.aborted || !context.valid()) { dispose(record); return false; }
      if (!nativePicker && (!selection.video || typeof selection.video.id !== 'string')) {
        dispose(record); return false;
      }
      record.selected = selection;
      if (!nativePicker && selection.audio === true && record.audioRequested) {
        const acquisition = Promise.resolve().then(() => acquireAudio({ ...context, signal: record.abort.signal }));
        acquisition.then((audio) => { if (record.abort.signal.aborted) audio?.dispose(); }, () => {});
        record.audio = await Promise.race([acquisition, aborted]);
        if (record.abort.signal.aborted) return false;
        if (!record.audio?.source) throw new Error('Computer audio could not start. Retry with audio unchecked.');
      }
      if (record.abort.signal.aborted || !context.valid()) {
        record.audio?.dispose(); dispose(record); return false;
      }
      clearTimeout(record.timer);
      record.phase = 'selection';
      onGrant(context, ['display', ...((nativePicker ? record.audioRequested : !!record.audio) ? ['systemAudio'] : [])]);
      return true;
    } catch (error) {
      if (!record.abort.signal.aborted) onError(context, error);
      dispose(record);
      return false;
    }
  }

  function select(request, callback) {
    const record = request.frame && records.get(frameKey(request.frame));
    if (nativePicker || !record || record.phase !== 'selection'
        || request.frame !== record.context.frame || !record.context.valid()
        || trustedDisplayOrigin(request.securityOrigin) !== record.context.origin
        || request.userGesture !== true) {
      if (record) dispose(record);
      callback({}); return;
    }
    record.phase = 'granted';
    try {
      callback({ video: record.selected.video,
        ...(record.audio ? { audio: record.audio.source, enableLocalEcho: false } : {}) });
      record.audio?.start?.();
    } catch (error) { dispose(record); onError(record.context, error); }
  }

  function settle(wc, frame, outcome) {
    const record = frame && records.get(frameKey(frame));
    if (!record || record.context.wc !== wc) return;
    if (outcome === 'rejected') { dispose(record); return; }
    if (outcome !== 'resolved' || record.phase === 'consent') return;
    record.phase = 'active';
    if (pendingOwners.get(record.context.ownerKey) === record) pendingOwners.delete(record.context.ownerKey);
    onPending(record.context, false);
  }

  function stopped(wc, frame) {
    const record = frame && records.get(frameKey(frame));
    if (record && record.context.wc === wc && record.phase === 'active') dispose(record);
  }
  function cancelContents(wc) {
    for (const record of records.values()) if (record.context.wc === wc) dispose(record);
  }
  function stopAudio(wc) {
    for (const record of records.values()) if (record.context.wc === wc) record.audio?.dispose();
  }
  return { requestPermission, select, settle, stopped, cancelContents, stopAudio, nativePicker,
    dispose: () => { for (const record of records.values()) dispose(record); } };
}

module.exports = { createDisplayCaptureController, trustedDisplayOrigin };
