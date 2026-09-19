// Standards-track WebRTC receive-buffer control. Kept Electron-free so the
// policy and the page-realm hook can be unit-tested without a browser process.

const WEBRTC_AUDIO_BUFFER_TARGET_MS = Object.freeze({
  automatic: null,
  stable: 400,
  resilient: 1000,
});

const WEBRTC_AUDIO_BUFFER_GET_CHANNEL = 'webrtc:audio-buffer:get';
const WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL = 'webrtc:audio-buffer:update';

function webrtcAudioBufferTargetFor(value) {
  return Object.prototype.hasOwnProperty.call(WEBRTC_AUDIO_BUFFER_TARGET_MS, value)
    ? WEBRTC_AUDIO_BUFFER_TARGET_MS[value]
    : WEBRTC_AUDIO_BUFFER_TARGET_MS.automatic;
}

function sendWebrtcAudioBufferMode({ contents, sessions, mode }) {
  const browsingSessions = new Set(sessions || []);
  let sent = 0;
  for (const contentsItem of contents || []) {
    if (
      !contentsItem ||
      contentsItem.isDestroyed() ||
      !browsingSessions.has(contentsItem.session)
    ) continue;
    contentsItem.send(WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL, mode);
    sent += 1;
  }
  return sent;
}

module.exports = {
  WEBRTC_AUDIO_BUFFER_TARGET_MS,
  WEBRTC_AUDIO_BUFFER_GET_CHANNEL,
  WEBRTC_AUDIO_BUFFER_UPDATE_CHANNEL,
  webrtcAudioBufferTargetFor,
  sendWebrtcAudioBufferMode,
};
