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
  webFrame.executeJavaScript(CAPTURE_MAINWORLD_SOURCE).catch(() => {});
}
