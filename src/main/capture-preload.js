// Session-wide preload relaying main-world capture instrumentation to main
// (spec §4). Separate file from chrome-compat-preload.js on purpose: that
// script's documented property is that it exposes NO IPC; this one does, and
// it is the only thing it does. Per the §4.1 spike this only ever runs in
// main frames on our configuration; the guard makes that explicit.
//
// The main-world source is INLINE because sandboxed session preloads have a
// restricted require (electron + a few node built-ins — no relative modules).
// capture-mainworld.js re-exports the exact string below by reading this file
// between the >>> mainworld markers, so the vm unit tests exercise the
// SHIPPED bytes and there is no second copy to drift.
const { ipcRenderer, webFrame } = require('electron');

// >>> mainworld
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

  // Truthful permissions.query for mic/camera (preflight compatibility).
  // Blanc's strict check handler deliberately reports undecided as denied,
  // so sites that query before asking declare the device blocked and never
  // reach the prompt. This patch answers those two names from Blanc's own
  // stored decisions over the preload bridge — 'prompt' when undecided —
  // and DOES NOT touch authorization: getUserMedia still runs the same
  // request handler, and any bridge failure falls back to the real
  // (strict) query. Display truth only, same doctrine as the capture patch.
  const permissions = navigator.permissions;
  if (permissions && typeof permissions.query === 'function') {
    const realQuery = permissions.query.bind(permissions);
    const pending = new Map();
    let nextQueryId = 1;
    window.addEventListener('blanc:permission-state', (event) => {
      if (typeof event.detail !== 'string' || event.detail.length > 128) return;
      let payload;
      try { payload = JSON.parse(event.detail); } catch { return; }
      const resolve = payload && pending.get(payload.id);
      if (!resolve) return;
      pending.delete(payload.id);
      resolve(payload.state);
    });
    const bridgedState = (mediaType) => new Promise((resolve) => {
      const id = nextQueryId;
      nextQueryId += 1;
      pending.set(id, resolve);
      setTimeout(() => {
        if (pending.delete(id)) resolve(null);
      }, 1500);
      try {
        window.dispatchEvent(new CustomEvent('blanc:permission-query', {
          detail: JSON.stringify({ id, mediaType }),
        }));
      } catch {
        if (pending.delete(id)) resolve(null);
      }
    });
    // Live statuses (Permissions contract): every object handed out reflects
    // the CURRENT state and fires a real EventTarget 'change' event when main
    // pushes a new decision. One canonical object per media type keeps this
    // bounded without evicting an object that page code may still retain.
    const liveStatuses = new Map();
    const makeStatus = (name, mediaType, state) => {
      const existing = liveStatuses.get(mediaType);
      if (existing) {
        existing.fire(state);
        return existing.status;
      }

      const status = new EventTarget();
      let currentState = state;
      let onchange = null;
      const onchangeListener = (event) => {
        if (typeof onchange === 'function') onchange.call(status, event);
      };
      Object.defineProperties(status, {
        name: { value: name, enumerable: true },
        state: { get: () => currentState, enumerable: true },
        onchange: {
          get: () => onchange,
          set: (value) => {
            const next = typeof value === 'function' ? value : null;
            if (next === onchange) return;
            const hadHandler = typeof onchange === 'function';
            const hasHandler = typeof next === 'function';
            onchange = next;
            if (!hadHandler && hasHandler) status.addEventListener('change', onchangeListener);
            else if (hadHandler && !hasHandler) status.removeEventListener('change', onchangeListener);
          },
          enumerable: true,
        },
      });
      const fire = (next) => {
        if (next === currentState) return;
        currentState = next;
        status.dispatchEvent(new Event('change'));
      };
      liveStatuses.set(mediaType, { status, fire });
      return status;
    };
    window.addEventListener('blanc:permission-changed', (event) => {
      if (typeof event.detail !== 'string' || event.detail.length > 128) return;
      let payload;
      try { payload = JSON.parse(event.detail); } catch { return; }
      const mediaType = payload && payload.mediaType;
      const state = payload && payload.state;
      if (mediaType !== 'audio' && mediaType !== 'video') return;
      if (state !== 'granted' && state !== 'denied' && state !== 'prompt') return;
      liveStatuses.get(mediaType)?.fire(state);
    });
    permissions.query = function query(descriptor, ...rest) {
      const name = descriptor && descriptor.name;
      const mediaType = name === 'microphone' ? 'audio' : name === 'camera' ? 'video' : null;
      if (!mediaType) return realQuery(descriptor, ...rest);
      return bridgedState(mediaType).then((state) => {
        if (state !== 'granted' && state !== 'denied' && state !== 'prompt') {
          return realQuery(descriptor, ...rest);
        }
        return makeStatus(name, mediaType, state);
      });
    };
  }

  if (navigator.mediaDevices) {
    let nextTrackKey = 1;
    let nextRequestId = 1;
    const pendingShare = new Map();
    const activeShares = new Map();
    const emitBridge = (name, payload) => {
      window.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(payload) }));
    };
    window.addEventListener('blanc:display-capture-abort', (event) => {
      if (typeof event.detail !== 'string') return;
      let payload;
      try { payload = JSON.parse(event.detail); } catch { return; }
      const share = activeShares.get(payload?.shareId);
      if (!share) return;
      activeShares.delete(payload.shareId);
      share.pc.close();
      for (const track of share.tracks) {
        const wasLive = track.readyState === 'live';
        track.stop();
        if (wasLive) track.dispatchEvent?.(new Event('ended'));
      }
    });
    window.addEventListener('blanc:display-capture-result', (event) => {
      if (typeof event.detail !== 'string') return;
      let payload;
      try { payload = JSON.parse(event.detail); } catch { return; }
      const resolve = pendingShare.get(payload && payload.id);
      if (!resolve) return;
      pendingShare.delete(payload.id);
      resolve(payload);
    });
    const wrapTrack = (track, shareId, kind, trackKey, displaySurface) => {
      const share = activeShares.get(shareId);
      share?.tracks.add(track);
      const stop = track.stop.bind(track);
      track.stop = function stopBrokered() {
        stop();
        share?.tracks.delete(track);
        emitBridge('blanc:display-capture-track-stopped', { shareId, kind, trackKey });
        if (share && share.tracks.size === 0) {
          share.pc.close();
          activeShares.delete(shareId);
        }
      };
      const clone = track.clone.bind(track);
      track.clone = function cloneBrokered() {
        const nextKey = 't-' + (nextTrackKey++);
        const copy = wrapTrack(clone(), shareId, kind, nextKey, displaySurface);
        emitBridge('blanc:display-capture-track-added', { shareId, kind, trackKey: nextKey });
        if (copy.readyState === 'live') {
          emitBridge('blanc:display-capture-track-ready', { shareId, kind, trackKey: nextKey });
        }
        return copy;
      };
      // Relayed WebRTC tracks omit native capture metadata. Meet/Teams read
      // displaySurface after getDisplayMedia; expose the picker enum only.
      if (kind === 'video' && typeof displaySurface === 'string' && displaySurface) {
        const mergeSurface = (base) => {
          const out = base && typeof base === 'object' ? { ...base } : {};
          out.displaySurface = displaySurface;
          return out;
        };
        try {
          const getSettings = track.getSettings?.bind(track);
          track.getSettings = () => mergeSurface(getSettings ? getSettings() : {});
        } catch {}
        try {
          const getConstraints = track.getConstraints?.bind(track);
          track.getConstraints = () => mergeSurface(getConstraints ? getConstraints() : {});
        } catch {}
        try {
          const getCapabilities = track.getCapabilities?.bind(track);
          track.getCapabilities = () => mergeSurface(getCapabilities ? getCapabilities() : {});
        } catch {}
      }
      return track;
    };
    navigator.mediaDevices.getDisplayMedia = function getDisplayMedia(options) {
      const video = options && options.video;
      if (video === false || (video !== undefined && video !== true && (typeof video !== 'object' || video === null))) {
        return Promise.reject(new TypeError('Failed to execute getDisplayMedia: video must not be false'));
      }
      const id = nextRequestId++;
      return new Promise((resolve, reject) => {
        pendingShare.set(id, resolve);
        try {
          emitBridge('blanc:display-capture-request', { id, options: options || {} });
        } catch (err) {
          pendingShare.delete(id);
          reject(err);
        }
      }).then(async (result) => {
        if (!result || result.ok !== true) {
          if (result && result.errorName === 'TypeError') throw new TypeError(result.message || 'getDisplayMedia');
          const err = new DOMException(result && result.reason || 'NotAllowedError', result && result.errorName || 'NotAllowedError');
          throw err;
        }
        const pc = new RTCPeerConnection({ iceServers: [] });
        activeShares.set(result.shareId, { pc, tracks: new Set() });
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'failed') {
            emitBridge('blanc:display-capture-signal', { shareId: result.shareId, type: 'failed' });
          }
        });
        const tracks = [];
        const requiredAudio = result.computerAudio === true;
        const displaySurface = typeof result.displaySurface === 'string' && result.displaySurface
          ? result.displaySurface
          : 'monitor';
        // Live clears the broker startup timeout. Prefer unmuted video with
        // non-zero dimensions before resolving to the site (Meet inspects
        // settings immediately), but never block past a short deadline —
        // unbounded unmute waits hung packaged Mac shares while the helper
        // was already sending.
        const PUBLISH_WAIT_MS = 2000;
        const trackIsLive = (track) => !!track && track.readyState === 'live';
        const videoHasDimensions = (track) => {
          try {
            const settings = track.getSettings?.() || {};
            return Number(settings.width) > 0 && Number(settings.height) > 0;
          } catch {
            return false;
          }
        };
        const videoIsPublishable = (track) => (
          trackIsLive(track) && track.muted !== true && videoHasDimensions(track)
        );
        const got = new Promise((resolve, reject) => {
          let settled = false;
          let publishTimer = null;
          let deadlineArmed = false;
          const finish = (err) => {
            if (settled) return;
            settled = true;
            if (publishTimer) {
              try { clearTimeout(publishTimer); } catch {}
              publishTimer = null;
            }
            try { window.removeEventListener('blanc:display-capture-abort', onAbort); } catch {}
            if (err) reject(err);
            else resolve();
          };
          const failLost = () => {
            finish(new DOMException('AbortError', 'AbortError'));
          };
          const onAbort = (event) => {
            if (typeof event.detail !== 'string') return;
            let payload;
            try { payload = JSON.parse(event.detail); } catch { return; }
            if (payload && payload.shareId === result.shareId) {
              finish(new DOMException(payload.reason || 'AbortError', 'AbortError'));
            }
          };
          const requiredTracksLive = () => {
            const video = tracks.find((item) => item.kind === 'video');
            if (!trackIsLive(video)) return false;
            if (requiredAudio) {
              const audio = tracks.find((item) => item.kind === 'audio');
              if (!trackIsLive(audio)) return false;
            }
            return true;
          };
          // A required track that already arrived and then ended is lost —
          // do not keep waiting for siblings (that hung when audio died first).
          const requiredTrackLost = () => {
            const video = tracks.find((item) => item.kind === 'video');
            if (video && !trackIsLive(video)) return true;
            if (requiredAudio) {
              const audio = tracks.find((item) => item.kind === 'audio');
              if (audio && !trackIsLive(audio)) return true;
            }
            return false;
          };
          const tryReady = () => {
            if (requiredTrackLost()) {
              failLost();
              return;
            }
            if (!requiredTracksLive()) return;
            const video = tracks.find((item) => item.kind === 'video');
            if (videoIsPublishable(video)) {
              finish();
              return;
            }
            // Dimensions often arrive after unmute with no second event — poll
            // until publishable or the short deadline, then resolve live-only.
            // If any required track ends while waiting, reject (do not hang).
            if (!deadlineArmed) {
              deadlineArmed = true;
              const startedAt = Date.now();
              const tick = () => {
                if (settled) return;
                if (requiredTrackLost()) {
                  failLost();
                  return;
                }
                const liveVideo = tracks.find((item) => item.kind === 'video');
                if (requiredTracksLive() && videoIsPublishable(liveVideo)) {
                  finish();
                  return;
                }
                if (Date.now() - startedAt >= PUBLISH_WAIT_MS) {
                  if (requiredTracksLive()) finish();
                  else failLost();
                  return;
                }
                publishTimer = setTimeout(tick, 50);
              };
              publishTimer = setTimeout(tick, 50);
            }
          };
          window.addEventListener('blanc:display-capture-abort', onAbort);
          pc.ontrack = (event) => {
            const kind = event.track.kind;
            const trackKey = 't-' + (nextTrackKey++);
            wrapTrack(event.track, result.shareId, kind, trackKey, displaySurface);
            emitBridge('blanc:display-capture-track-added', { shareId: result.shareId, kind, trackKey });
            tracks.push(event.track);
            const maybeReady = () => {
              if (trackIsLive(event.track)) {
                emitBridge('blanc:display-capture-track-ready', { shareId: result.shareId, kind, trackKey });
              }
              tryReady();
            };
            try { event.track.addEventListener('unmute', maybeReady); } catch {}
            try { event.track.addEventListener('ended', maybeReady); } catch {}
            maybeReady();
          };
        });
        const negotiate = async () => {
          await pc.setRemoteDescription({ type: 'offer', sdp: result.offer });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pc.iceGatheringState !== 'complete') {
            await new Promise((resolve) => {
              pc.addEventListener('icegatheringstatechange', () => {
                if (pc.iceGatheringState === 'complete') resolve();
              });
            });
          }
          emitBridge('blanc:display-capture-signal', {
            shareId: result.shareId,
            type: 'answer',
            sdp: pc.localDescription.sdp,
          });
        };
        try {
          // Abort must also reject while SDP/ICE setup is still waiting.
          await Promise.all([negotiate(), got]);
        } catch (error) {
          pc.close();
          for (const track of tracks) track.stop();
          activeShares.delete(result.shareId);
          emitBridge('blanc:display-capture-signal', { shareId: result.shareId, type: 'failed' });
          throw error;
        }
        return new MediaStream(tracks);
      });
    };
  }
})();`;
// <<< mainworld

if (process.isMainFrame) {
  window.addEventListener('blanc:capture-report', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 512) return;
    ipcRenderer.send('capture:report', event.detail);
  });
  ipcRenderer.on('capture:stop', () => {
    window.dispatchEvent(new CustomEvent('blanc:capture-stop-request'));
  });
  ipcRenderer.on('capture:permission-changed', (_event, payload) => {
    const mediaType = payload?.mediaType;
    const state = payload?.state;
    if (mediaType !== 'audio' && mediaType !== 'video') return;
    if (state !== 'granted' && state !== 'denied' && state !== 'prompt') return;
    window.dispatchEvent(new CustomEvent('blanc:permission-changed', {
      detail: JSON.stringify({ mediaType, state }),
    }));
  });
  window.addEventListener('blanc:permission-query', async (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 128) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    const id = payload?.id;
    const mediaType = payload?.mediaType;
    if (!Number.isInteger(id)) return;
    if (mediaType !== 'audio' && mediaType !== 'video') return;
    let state = null;
    try { state = await ipcRenderer.invoke('capture:permission-query', mediaType); } catch {}
    window.dispatchEvent(new CustomEvent('blanc:permission-state', {
      detail: JSON.stringify({ id, state }),
    }));
  });

  const readIsolatedPolicy = () => {
    try {
      if (document.permissionsPolicy && typeof document.permissionsPolicy.allowsFeature === 'function') {
        return document.permissionsPolicy.allowsFeature('display-capture') === true;
      }
    } catch {}
    try {
      if (document.featurePolicy && typeof document.featurePolicy.allowsFeature === 'function') {
        return document.featurePolicy.allowsFeature('display-capture') === true;
      }
    } catch {}
    return null;
  };
  window.addEventListener('blanc:display-capture-request', async (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 2048) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    if (!Number.isInteger(payload?.id)) return;
    const displayCaptureAllowed = readIsolatedPolicy();
    let result = { id: payload.id, ok: false, errorName: 'NotAllowedError', reason: 'policy' };
    if (displayCaptureAllowed === true) {
      try {
        result = {
          id: payload.id,
          ...await ipcRenderer.invoke('display-capture:request', {
            userActivationActive: navigator.userActivation?.isActive === true,
            displayCaptureAllowed: true,
            options: payload.options,
          }),
        };
      } catch {
        result = { id: payload.id, ok: false, errorName: 'NotAllowedError', reason: 'ipc' };
      }
    }
    window.dispatchEvent(new CustomEvent('blanc:display-capture-result', {
      detail: JSON.stringify(result),
    }));
  });
  ipcRenderer.on('display-capture:abort', (_event, payload) => {
    if (!payload || typeof payload.shareId !== 'string') return;
    window.dispatchEvent(new CustomEvent('blanc:display-capture-abort', {
      detail: JSON.stringify({ shareId: payload.shareId, reason: payload.reason || 'AbortError' }),
    }));
  });
  window.addEventListener('blanc:display-capture-signal', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 65536) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    ipcRenderer.send('display-capture:signal', payload);
  });
  window.addEventListener('blanc:display-capture-track-stopped', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 512) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    ipcRenderer.send('display-capture:track-stopped', payload);
  });
  window.addEventListener('blanc:display-capture-track-added', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 512) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    ipcRenderer.send('display-capture:track-added', payload);
  });
  window.addEventListener('blanc:display-capture-track-ready', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 512) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    ipcRenderer.send('display-capture:track-ready', payload);
  });
  webFrame.executeJavaScript(CAPTURE_MAINWORLD_SOURCE).catch(() => {});
}
