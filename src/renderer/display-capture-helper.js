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
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: job.videoConstraints || true,
    audio: job.computerAudio === true,
  });
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
