'use strict';

const helper = window.blancDisplayCaptureHelper;
if (!helper) throw new Error('display-capture helper preload missing');

let pc = null;
let stream = null;
let activeShareId = null;

function waitIce(peer) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') resolve();
    });
  });
}

function teardown() {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  activeShareId = null;
}

async function acquire(job) {
  teardown();
  activeShareId = job.shareId;
  stream = await navigator.mediaDevices.getDisplayMedia({
    video: job.videoConstraints || true,
    audio: job.computerAudio === true,
  });
  const video = stream.getVideoTracks()[0];
  if (!video || video.readyState !== 'live') {
    teardown();
    helper.signal({ type: 'error', shareId: job.shareId, name: 'NotReadableError', message: 'video required' });
    return;
  }
  if (job.videoConstraints) {
    try { await video.applyConstraints(job.videoConstraints); } catch (err) {
      teardown();
      helper.signal({ type: 'error', shareId: job.shareId, name: err.name, message: err.message });
      return;
    }
  }
  if (job.computerAudio === true && !stream.getAudioTracks().some((track) => track.readyState === 'live')) {
    teardown();
    helper.signal({ type: 'error', shareId: job.shareId, name: 'NotReadableError', message: 'audio required' });
    return;
  }
  pc = new RTCPeerConnection({ iceServers: [] });
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
    track.addEventListener('ended', () => {
      helper.signal({ type: 'ended', shareId: job.shareId, kind: track.kind, reason: 'source-ended' });
    });
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  helper.signal({
    type: 'offer',
    shareId: job.shareId,
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
    teardown();
  });
});

helper.onSignal(async (msg) => {
  if (!msg) return;
  if (msg.type === 'stop' || msg.type === 'release' && msg.shareEnded) {
    teardown();
    helper.stopped({ shareId: msg.shareId });
    return;
  }
  if (msg.type === 'release' && msg.kind === 'audio' && stream) {
    for (const track of stream.getAudioTracks()) track.stop();
    return;
  }
  if (!pc) return;
  if (msg.type === 'answer' && msg.sdp) {
    await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    return;
  }
  if (msg.type === 'candidate' && msg.candidate) {
    const raw = String(msg.candidate).replace(/^a=/, '');
    await pc.addIceCandidate({ candidate: raw, sdpMid: '0' });
  }
});

helper.ready();
