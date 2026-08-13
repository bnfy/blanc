// The main-world capture instrumentation, exported as a source string so the
// preload can inject it with webFrame.executeJavaScript and unit tests can
// vm-run it against doubles. SECURITY NOTE (spec §9): everything in here runs
// in the page's world and is forgeable by the page. Its reports REFINE
// DISPLAY STATE toward off; they are not security truth. The unspoofable
// on-signal is the main-process permission grant; macOS's system capture
// indicator is the authoritative malicious-page backstop.
const CAPTURE_MAINWORLD_SOURCE = `(() => {
  if (navigator.__blancCapturePatched) return;
  Object.defineProperty(navigator, '__blancCapturePatched', { value: true });

  const registered = new Set();

  const emit = (payload) => {
    try {
      window.dispatchEvent(new CustomEvent('blanc:capture-report', {
        detail: JSON.stringify(payload),
      }));
    } catch {}
  };

  const snapshot = () => {
    let audioLive = 0;
    let videoLive = 0;
    for (const track of registered) {
      if (track.readyState !== 'live') continue;
      if (track.kind === 'audio') audioLive += 1;
      else if (track.kind === 'video') videoLive += 1;
    }
    emit({ type: 'snapshot', audioLive, videoLive });
  };

  const register = (track) => {
    if (!track || registered.has(track)) return;
    registered.add(track);
    try { track.addEventListener('ended', snapshot); } catch {}
  };

  const scopesOf = (constraints) => {
    const scopes = [];
    if (constraints && constraints.audio) scopes.push('audio');
    if (constraints && constraints.video) scopes.push('video');
    return scopes;
  };

  // stop() fires no 'ended' event — it must be patched to be seen at all.
  const trackStop = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function stop(...args) {
    const result = trackStop.apply(this, args);
    if (registered.has(this)) snapshot();
    return result;
  };
  const trackClone = MediaStreamTrack.prototype.clone;
  MediaStreamTrack.prototype.clone = function clone(...args) {
    const copy = trackClone.apply(this, args);
    if (registered.has(this)) { register(copy); snapshot(); }
    return copy;
  };
  const streamClone = MediaStream.prototype.clone;
  MediaStream.prototype.clone = function clone(...args) {
    const copy = streamClone.apply(this, args);
    let tracked = false;
    for (const track of this.getTracks()) if (registered.has(track)) tracked = true;
    if (tracked) { for (const track of copy.getTracks()) register(track); snapshot(); }
    return copy;
  };

  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = function getUserMedia(constraints, ...rest) {
    return gum(constraints, ...rest).then((stream) => {
      for (const track of stream.getTracks()) register(track);
      // Snapshot FIRST: the settlement confirms the grant anchor in main,
      // after which the frame counts carry the truth — they must already be
      // nonzero or the chip blinks off between the two messages.
      snapshot();
      emit({ type: 'settlement', outcome: 'resolved', scopes: scopesOf(constraints) });
      return stream;
    }, (err) => {
      emit({ type: 'settlement', outcome: 'rejected', scopes: scopesOf(constraints) });
      throw err;
    });
  };

  window.addEventListener('blanc:capture-stop-request', () => {
    for (const track of registered) { try { track.stop(); } catch {} }
    snapshot();
  });

  window.addEventListener('pagehide', () => {
    emit({ type: 'snapshot', audioLive: 0, videoLive: 0 });
  });
})();`;

module.exports = { CAPTURE_MAINWORLD_SOURCE };
