'use strict';

const helper = window.blancDisplayCaptureHelper;
if (!helper) throw new Error('display-capture helper preload missing');

const sessions = new Map();

function waitIce(peer) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') resolve();
    });
  });
}

function remember(shareId, extras = {}) {
  const current = sessions.get(shareId) || { cancelled: false, stream: null, pc: null };
  const next = { ...current, ...extras };
  sessions.set(shareId, next);
  return next;
}

function stopTracks(stream, kind = null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    if (kind && track.kind !== kind) continue;
    track.stop();
  }
}

function teardown(shareId, { keepCancelled = false } = {}) {
  const session = sessions.get(shareId);
  if (!session) return;
  stopTracks(session.stream);
  if (session.pc) session.pc.close();
  if (keepCancelled || session.cancelled) {
    sessions.set(shareId, {
      cancelled: true,
      stream: null,
      pc: null,
      acquiring: session.acquiring === true,
    });
    return;
  }
  sessions.delete(shareId);
}

function markNativeSettled(shareId) {
  remember(shareId, { acquiring: false, stream: null, pc: null });
  helper.stopped({ shareId, nativeSettled: true });
}

function discardLateStream(shareId, stream, pc) {
  stopTracks(stream);
  if (pc) pc.close();
  markNativeSettled(shareId);
}

function helperCaptureAudioConstraint(job) {
  if (job?.computerAudio !== true) return false;
  if (job.systemAudioProcessing === 'off') {
    return {
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
    };
  }
  return true;
}

function desktopSourceConstraints(job) {
  const sourceId = typeof job?.sourceId === 'string' ? job.sourceId : '';
  if (!sourceId) {
    const error = new Error('desktop source required');
    error.name = 'NotFoundError';
    throw error;
  }
  const mandatory = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId,
  };
  return {
    video: { mandatory: { ...mandatory } },
    audio: job.computerAudio === true ? { mandatory: { ...mandatory } } : false,
  };
}

function acquireNativeStream(job) {
  if (job?.captureMethod === 'desktop-source') {
    return navigator.mediaDevices.getUserMedia(desktopSourceConstraints(job));
  }
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: helperCaptureAudioConstraint(job),
  });
}

function logHelper(event, detail = {}) {
  try {
    helper.signal({
      type: 'diag',
      event,
      ...detail,
    });
  } catch {}
  try {
    console.error(`[display-capture-helper] ${event}`, JSON.stringify(detail));
  } catch {
    console.error(`[display-capture-helper] ${event}`);
  }
}

async function acquire(job) {
  const shareId = job?.shareId;
  if (!shareId) {
    helper.signal({ type: 'error', name: 'InvalidStateError', message: 'share required' });
    return;
  }
  const prior = sessions.get(shareId);
  if (prior?.cancelled) {
    markNativeSettled(shareId);
    return;
  }
  if (prior?.stream || prior?.pc) teardown(shareId);
  remember(shareId, { cancelled: false, stream: null, pc: null, acquiring: true });
  const captureMethod = job.captureMethod === 'desktop-source' ? 'getUserMedia' : 'getDisplayMedia';
  const requestedAudio = captureMethod === 'getDisplayMedia'
    ? helperCaptureAudioConstraint(job)
    : job.computerAudio === true;
  logHelper(`${captureMethod}-start`, {
    shareId,
    computerAudio: job.computerAudio === true,
    systemAudioProcessing: job.systemAudioProcessing === 'off' ? 'off' : 'default',
    requestedAudio,
  });
  let stream;
  try {
    stream = await acquireNativeStream(job);
  } catch (err) {
    logHelper(`${captureMethod}-throw`, {
      shareId,
      name: err?.name || null,
      message: typeof err?.message === 'string' ? err.message.slice(0, 120) : null,
    });
    throw err;
  }
  logHelper(`${captureMethod}-ok`, {
    shareId,
    video: stream.getVideoTracks().map((t) => `${t.readyState}:${t.muted}`).join(','),
    audio: stream.getAudioTracks().map((t) => `${t.readyState}:${t.muted}`).join(','),
  });
  // Structured audio identity for Meet system-audio failures: confirm loopback
  // ("System Audio") vs a mic-shaped track, and surface settings enums only.
  for (const track of stream.getAudioTracks()) {
    let settings = null;
    try { settings = track.getSettings?.() || null; } catch { settings = null; }
    logHelper('audio-track', {
      shareId,
      requestedProcessing: job.systemAudioProcessing === 'off' ? 'off' : 'default',
      label: typeof track.label === 'string' ? track.label.slice(0, 80) : null,
      id: typeof track.id === 'string' ? track.id.slice(0, 40) : null,
      readyState: track.readyState,
      muted: track.muted === true,
      enabled: track.enabled !== false,
      contentHint: typeof track.contentHint === 'string' ? track.contentHint : null,
      deviceId: typeof settings?.deviceId === 'string' ? settings.deviceId.slice(0, 40) : null,
      groupId: typeof settings?.groupId === 'string' ? settings.groupId.slice(0, 40) : null,
      sampleRate: settings?.sampleRate ?? null,
      channelCount: settings?.channelCount ?? null,
      echoCancellation: settings?.echoCancellation ?? null,
      autoGainControl: settings?.autoGainControl ?? null,
      noiseSuppression: settings?.noiseSuppression ?? null,
    });
  }
  if (sessions.get(shareId)?.cancelled) {
    discardLateStream(shareId, stream);
    return;
  }
  const video = stream.getVideoTracks()[0];
  if (!video || video.readyState !== 'live') {
    stopTracks(stream);
    helper.signal({ type: 'error', shareId, name: 'NotReadableError', message: 'video required' });
    markNativeSettled(shareId);
    return;
  }
  if (job.videoConstraints) {
    try { await video.applyConstraints(job.videoConstraints); } catch (err) {
      stopTracks(stream);
      helper.signal({ type: 'error', shareId, name: err.name, message: err.message });
      markNativeSettled(shareId);
      return;
    }
    if (sessions.get(shareId)?.cancelled) {
      discardLateStream(shareId, stream);
      return;
    }
  }
  if (job.computerAudio === true && !stream.getAudioTracks().some((track) => track.readyState === 'live')) {
    stopTracks(stream);
    helper.signal({ type: 'error', shareId, name: 'NotReadableError', message: 'audio required' });
    markNativeSettled(shareId);
    return;
  }
  const pc = new RTCPeerConnection({ iceServers: [] });
  if (sessions.get(shareId)?.cancelled) {
    discardLateStream(shareId, stream, pc);
    return;
  }
  remember(shareId, { stream, pc, cancelled: false, acquiring: false });
  let relayFailed = false;
  const failRelay = () => {
    if (relayFailed) return;
    const live = sessions.get(shareId);
    if (!live || live.cancelled || live.pc !== pc) return;
    relayFailed = true;
    helper.signal({
      type: 'error',
      shareId,
      name: 'AbortError',
      message: 'relay-failed',
      reason: 'relay-failed',
    });
    teardown(shareId);
    markNativeSettled(shareId);
  };
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') failRelay();
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    if (pc.iceConnectionState === 'failed') failRelay();
  });
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
    track.addEventListener('ended', () => {
      helper.signal({ type: 'ended', shareId, kind: track.kind, reason: 'source-ended' });
    });
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  const live = sessions.get(shareId);
  if (!live || live.cancelled || live.pc !== pc) {
    discardLateStream(shareId, stream, pc);
    return;
  }
  helper.signal({
    type: 'offer',
    shareId,
    sdp: pc.localDescription.sdp,
    tracks: {
      video: stream.getVideoTracks().some((track) => track.readyState === 'live'),
      audio: stream.getAudioTracks().some((track) => track.readyState === 'live'),
    },
  });
}

helper.onAuthorize((job) => {
  acquire(job).catch((err) => {
    helper.signal({ type: 'error', shareId: job?.shareId, name: err.name, message: err.message });
    if (!job?.shareId) return;
    teardown(job.shareId, { keepCancelled: sessions.get(job.shareId)?.cancelled === true });
    markNativeSettled(job.shareId);
  });
});

window.__probeIceSnapshot = async (shareId) => {
  const session = shareId
    ? sessions.get(shareId)
    : [...sessions.values()].find((item) => item?.pc);
  const pc = session?.pc;
  if (!pc) return { error: 'no-pc' };
  const stats = await pc.getStats();
  const byId = new Map();
  const locals = [];
  const remotes = [];
  const pairs = [];
  const transports = [];
  for (const report of stats.values()) {
    byId.set(report.id, report);
    if (report.type === 'local-candidate') {
      locals.push({
        id: report.id,
        address: report.address || report.ip || null,
        port: report.port || null,
        type: report.candidateType,
        protocol: report.protocol,
      });
    }
    if (report.type === 'remote-candidate') {
      remotes.push({
        id: report.id,
        address: report.address || report.ip || null,
        port: report.port || null,
        type: report.candidateType,
        protocol: report.protocol,
      });
    }
    if (report.type === 'candidate-pair') {
      pairs.push({
        id: report.id,
        state: report.state,
        nominated: report.nominated === true,
        selected: report.selected === true,
        localCandidateId: report.localCandidateId,
        remoteCandidateId: report.remoteCandidateId,
        bytesSent: report.bytesSent,
        bytesReceived: report.bytesReceived,
      });
    }
    if (report.type === 'transport') {
      transports.push({
        id: report.id,
        selectedCandidatePairId: report.selectedCandidatePairId || null,
      });
    }
  }
  const selectedPairId = transports.find((item) => item.selectedCandidatePairId)?.selectedCandidatePairId || null;
  const pair = selectedPairId ? pairs.find((item) => item.id === selectedPairId) || null : null;
  return {
    source: 'transport.selectedCandidatePairId',
    selectedPairId,
    iceConnectionState: pc.iceConnectionState,
    iceGatheringState: pc.iceGatheringState,
    connectionState: pc.connectionState,
    selected: pair ? {
      pair,
      local: locals.find((item) => item.id === pair.localCandidateId) || null,
      remote: remotes.find((item) => item.id === pair.remoteCandidateId) || null,
    } : null,
    transports,
    locals,
    remotes,
    pairs,
  };
};

// Diagnostic only: peak over the first live helper capture audio track.
window.__probeAudioEnergy = async (ms = 400) => {
  const session = [...sessions.values()].find((item) => item?.stream);
  const stream = session?.stream;
  if (!stream) return { error: 'no-stream' };
  const track = stream.getAudioTracks().find((item) => item.readyState === 'live');
  if (!track) return { error: 'no-live-audio' };
  const tmp = new MediaStream([track]);
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(tmp);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const started = Date.now();
  while (Date.now() - started < ms) {
    analyser.getFloatTimeDomainData(buf);
    for (const sample of buf) peak = Math.max(peak, Math.abs(sample));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  try { await ctx.close(); } catch {}
  let settings = null;
  try { settings = track.getSettings?.() || null; } catch {}
  return {
    peak,
    label: typeof track.label === 'string' ? track.label : null,
    muted: track.muted === true,
    enabled: track.enabled !== false,
    readyState: track.readyState,
    echoCancellation: settings?.echoCancellation ?? null,
    autoGainControl: settings?.autoGainControl ?? null,
    noiseSuppression: settings?.noiseSuppression ?? null,
  };
};

helper.onSignal(async (msg) => {
  if (!msg || !msg.shareId) return;
  if (msg.type === 'stop' || (msg.type === 'release' && msg.shareEnded)) {
    const acquiring = sessions.get(msg.shareId)?.acquiring === true;
    remember(msg.shareId, { cancelled: true });
    teardown(msg.shareId, { keepCancelled: true });
    if (!acquiring) markNativeSettled(msg.shareId);
    return;
  }
  const session = sessions.get(msg.shareId);
  if (msg.type === 'release' && (msg.kind === 'audio' || msg.kind === 'video') && session?.stream) {
    stopTracks(session.stream, msg.kind);
    return;
  }
  if (!session?.pc) return;
  if (msg.type === 'answer' && msg.sdp) {
    await session.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    return;
  }
  if (msg.type === 'candidate' && msg.candidate) {
    const raw = String(msg.candidate).replace(/^a=/, '');
    await session.pc.addIceCandidate({ candidate: raw, sdpMid: '0' });
  }
});

helper.ready();
