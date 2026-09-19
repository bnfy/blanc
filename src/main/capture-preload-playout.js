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
    // Diagnostic: tracks returned from brokered getDisplayMedia (and clones).
    const brokeredAudioTracks = new WeakSet();
    const sitePeerConnections = new Set();
    const emitBridge = (name, payload) => {
      window.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(payload) }));
    };
    const stopAudioPlayout = (share) => {
      const playout = share?.audioPlayout;
      if (!playout) return;
      share.audioPlayout = null;
      playout.cancel?.();
      try { playout.element?.pause(); } catch {}
      try { if (playout.element) playout.element.srcObject = null; } catch {}
      try { playout.element?.remove(); } catch {}
      // This internal clone is not a page consumer or permission grant.
      try { if (playout.track) trackStop.call(playout.track); } catch {}
    };
    const startAudioPlayout = (share, track) => {
      const playout = { element: null, track: null, cancel: null };
      share.audioPlayout = playout;
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        // Main's track-ready timeout can clear before media playback starts.
        const timer = setTimeout(() => {
          finish(new DOMException('Receiver audio playback timed out', 'AbortError'));
        }, 5000);
        playout.cancel = () => finish(new DOMException('Share ended', 'AbortError'));
        try {
          // Chromium may receive RTP but discard it without starting audio
          // playout. An attached muted media element starts this receive path;
          // a zero-gain WebAudio graph did not in the packaged diagnostic.
          // A native clone keeps it alive if the page stops the original while
          // retaining another clone, without counting this sink as a consumer.
          playout.track = trackClone.call(track);
          const element = document.createElement('audio');
          playout.element = element;
          element.muted = true;
          element.defaultMuted = true;
          element.volume = 0;
          element.hidden = true;
          element.tabIndex = -1;
          element.setAttribute('aria-hidden', 'true');
          element.setAttribute('playsinline', '');
          element.srcObject = new MediaStream([playout.track]);
          document.documentElement.appendChild(element);
          Promise.resolve(element.play()).then(() => finish(), () => {
            finish(new DOMException('Receiver audio playback failed', 'NotReadableError'));
          });
        } catch {
          finish(new DOMException('Receiver audio playback failed', 'NotReadableError'));
        }
      });
    };
    const markBrokeredAudio = (track) => {
      if (track && track.kind === 'audio') brokeredAudioTracks.add(track);
    };
    const trackIdentity = (track) => {
      let settings = null;
      try { settings = track.getSettings?.() || null; } catch {}
      return {
        label: typeof track.label === 'string' ? track.label.slice(0, 80) : null,
        muted: track.muted === true,
        enabled: track.enabled !== false,
        readyState: track.readyState,
        echoCancellation: settings?.echoCancellation ?? null,
        autoGainControl: settings?.autoGainControl ?? null,
        noiseSuppression: settings?.noiseSuppression ?? null,
      };
    };
    // Single-track peak (handoff async only). Multi-track probes use
    // sampleTracksParallel so windows share one clock.
    const sampleTrackPeak = async (track, ms) => {
      const [row] = await sampleTracksParallel([{ role: 'track', track }], ms);
      if (!row) return { error: 'no-track' };
      if (row.error) return { error: row.error, readyState: track?.readyState || null };
      return {
        peak: row.peak,
        sampleStartedAt: row.sampleStartedAt,
        sampleEndedAt: row.sampleEndedAt,
        ...trackIdentity(track),
      };
    };
    const sampleTracksParallel = async (items, ms) => {
      const duration = Math.max(50, Math.min(Number(ms) || 400, 2000));
      if (typeof AudioContext !== 'function') {
        return items.map((item) => ({
          role: item.role,
          error: 'no-AudioContext',
          sampleStartedAt: null,
          sampleEndedAt: null,
        }));
      }
      const sessions = [];
      for (const item of items) {
        const track = item.track;
        if (!track || track.readyState !== 'live') {
          sessions.push({
            role: item.role,
            item,
            error: 'no-live-audio',
            analyser: null,
            ctx: null,
            buf: null,
            peak: 0,
          });
          continue;
        }
        try {
          const tmp = new MediaStream([track]);
          const ctx = new AudioContext();
          const source = ctx.createMediaStreamSource(tmp);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          sessions.push({
            role: item.role,
            item,
            error: null,
            analyser,
            ctx,
            buf: new Float32Array(analyser.fftSize),
            peak: 0,
          });
        } catch (err) {
          sessions.push({
            role: item.role,
            item,
            error: String(err && err.name || err),
            analyser: null,
            ctx: null,
            buf: null,
            peak: 0,
          });
        }
      }
      const sampleStartedAt = Date.now();
      const live = sessions.filter((s) => s.analyser);
      if (live.length) {
        const deadline = sampleStartedAt + duration;
        while (Date.now() < deadline) {
          for (const session of live) {
            session.analyser.getFloatTimeDomainData(session.buf);
            for (let i = 0; i < session.buf.length; i += 1) {
              const v = session.buf[i];
              if (v > session.peak) session.peak = v;
              else if (-v > session.peak) session.peak = -v;
            }
          }
          await new Promise((r) => setTimeout(r, 20));
        }
      }
      const sampleEndedAt = Date.now();
      for (const session of sessions) {
        try { await session.ctx?.close(); } catch {}
      }
      return sessions.map((session) => {
        if (session.error) {
          return {
            role: session.role,
            index: session.item.index,
            error: session.error,
            sampleStartedAt,
            sampleEndedAt,
          };
        }
        return {
          role: session.role,
          index: session.item.index,
          peak: session.peak,
          sampleStartedAt,
          sampleEndedAt,
          ...trackIdentity(session.item.track),
        };
      });
    };
    const snapshotBrokeredSenderRtp = async (sender) => {
      if (!sender || typeof sender.getStats !== 'function') return null;
      try {
        const stats = await sender.getStats();
        for (const report of stats.values()) {
          const kind = report.kind || report.mediaType;
          if (report.type !== 'outbound-rtp') continue;
          if (kind && kind !== 'audio') continue;
          // RTCOutboundRtpStreamStats: bytesSent/packetsSent only.
          // totalAudioEnergy/audioLevel belong to audio-source / inbound
          // stats — never invent them here as transmitted-audio proof.
          return {
            statsId: report.id || null,
            ssrc: report.ssrc ?? null,
            bytesSent: report.bytesSent ?? null,
            packetsSent: report.packetsSent ?? null,
          };
        }
      } catch {}
      return null;
    };
    // Register site PeerConnections so Meet outbound senders can be probed.
    try {
      const NativePC = window.RTCPeerConnection;
      if (typeof NativePC === 'function' && !NativePC.__blancCaptureEnergyPatched) {
        window.RTCPeerConnection = class BlancCaptureEnergyPC extends NativePC {
          constructor(...args) {
            super(...args);
            sitePeerConnections.add(this);
            try {
              this.addEventListener('connectionstatechange', () => {
                if (this.connectionState === 'closed') sitePeerConnections.delete(this);
              });
            } catch {}
          }
        };
        window.RTCPeerConnection.__blancCaptureEnergyPatched = true;
      }
    } catch {}
    // Packaged Meet triple probe: page-received broker track + Meet outbound
    // brokered senders. Analyser windows run in parallel on one clock.
    // sender.track peaks are sender-*input* only. Bound outbound-rtp
    // bytes/packets deltas are transmission *activity*, not audible proof.
    // Audible end-to-end remains the receiver listening check.
    window.__blancCaptureEnergyProbe = async (ms = 400) => {
      const duration = Math.max(50, Math.min(Number(ms) || 400, 2000));
      let pageTrack = null;
      for (const share of activeShares.values()) {
        for (const track of share.tracks) {
          if (track.kind === 'audio' && track.readyState === 'live') {
            pageTrack = track;
            break;
          }
        }
        if (pageTrack) break;
      }
      const brokeredSenders = [];
      const audioSenders = [];
      for (const pc of [...sitePeerConnections]) {
        let connectionState = null;
        try { connectionState = pc.connectionState; } catch { continue; }
        if (connectionState === 'closed') {
          sitePeerConnections.delete(pc);
          continue;
        }
        try {
          for (const sender of pc.getSenders()) {
            const track = sender.track;
            if (!track || track.kind !== 'audio') continue;
            audioSenders.push({ pc, sender, track, connectionState });
            if (!brokeredAudioTracks.has(track)) continue;
            brokeredSenders.push({ pc, sender, track, connectionState });
          }
        } catch {}
      }
      const senderAttachment = {
        sitePcCount: sitePeerConnections.size,
        audioSenderCount: audioSenders.length,
        brokeredSenderCount: audioSenders.filter((row) => brokeredAudioTracks.has(row.track)).length,
        otherAudioSenderCount: audioSenders.filter((row) => !brokeredAudioTracks.has(row.track)).length,
        brokeredExactMatchCount: pageTrack
          ? audioSenders.filter((row) => row.track === pageTrack).length
          : 0,
      };

      let outboundAttribution = 'inconclusive-no-brokered-sender';
      if (brokeredSenders.length > 0) outboundAttribution = 'brokered-sender-matched';

      const rtpBefore = [];
      for (const row of brokeredSenders) {
        rtpBefore.push(await snapshotBrokeredSenderRtp(row.sender));
      }

      const parallelItems = [];
      if (pageTrack) parallelItems.push({ role: 'page', track: pageTrack });
      for (let i = 0; i < brokeredSenders.length; i += 1) {
        parallelItems.push({ role: 'meet-outbound-input', track: brokeredSenders[i].track, index: i });
      }
      const parallel = await sampleTracksParallel(parallelItems, duration);

      const rtpAfter = [];
      for (const row of brokeredSenders) {
        rtpAfter.push(await snapshotBrokeredSenderRtp(row.sender));
      }

      const pageSample = parallel.find((row) => row.role === 'page') || (
        pageTrack ? null : { error: 'no-page-share-audio', activeShares: activeShares.size }
      );
      const page = pageSample || { error: 'no-page-share-audio', activeShares: activeShares.size };

      const meetOutboundBrokered = brokeredSenders.map((row, i) => {
        const input = parallel.find((s) => s.role === 'meet-outbound-input' && s.index === i)
          || { error: 'missing-sample' };
        const before = rtpBefore[i];
        const after = rtpAfter[i];
        let rtpDelta = null;
        let rtpBound = false;
        if (before && after) {
          rtpBound = true;
          const num = (a, b) => (typeof a === 'number' && typeof b === 'number' ? b - a : null);
          rtpDelta = {
            statsId: after.statsId,
            ssrc: after.ssrc,
            bytesSent: num(before.bytesSent, after.bytesSent),
            packetsSent: num(before.packetsSent, after.packetsSent),
            // Audible energy is not an outbound-rtp field; leave unknown.
            audibleEnergy: 'unknown',
            before,
            after,
          };
        }
        return {
          connectionState: row.connectionState,
          // Analyser on sender.track = input to the sender, not proof of encode/send.
          senderInput: input,
          rtpDelta,
          rtpBound,
        };
      });

      if (brokeredSenders.length > 0 && meetOutboundBrokered.every((row) => !row.rtpBound)) {
        outboundAttribution = 'inconclusive-no-rtp-for-brokered-sender';
      }

      const result = {
        page,
        meetOutboundBrokered,
        senderAttachment,
        outboundAttribution,
        sampleWindowMs: duration,
        sampleStartedAt: parallel[0]?.sampleStartedAt ?? null,
        sampleEndedAt: parallel[0]?.sampleEndedAt ?? null,
        sitePcCount: sitePeerConnections.size,
        activeShareCount: activeShares.size,
        // End-to-end audible audio is not decided by this probe.
        audibleEndToEnd: 'receiver-listening',
      };
      try {
        const inputPeaks = meetOutboundBrokered
          .map((row) => row.senderInput?.peak)
          .filter((v) => typeof v === 'number');
        const bytesDeltas = meetOutboundBrokered
          .map((row) => row.rtpDelta?.bytesSent)
          .filter((v) => typeof v === 'number');
        const packetsDeltas = meetOutboundBrokered
          .map((row) => row.rtpDelta?.packetsSent)
          .filter((v) => typeof v === 'number');
        emitBridge('blanc:display-capture-page-diag', {
          event: 'energy-probe',
          pagePeak: typeof page.peak === 'number' ? page.peak : null,
          pageError: page.error || null,
          meetOutboundCount: meetOutboundBrokered.length,
          meetOutboundInputPeakMax: inputPeaks.length ? Math.max(...inputPeaks) : null,
          meetOutboundRtpBytesDeltaMax: bytesDeltas.length ? Math.max(...bytesDeltas) : null,
          meetOutboundRtpPacketsDeltaMax: packetsDeltas.length ? Math.max(...packetsDeltas) : null,
          audibleEnergy: 'unknown',
          outboundAttribution,
          senderAttachment,
          sampleStartedAt: result.sampleStartedAt,
          sampleEndedAt: result.sampleEndedAt,
          sitePcCount: sitePeerConnections.size,
        });
      } catch {}
      return result;
    };
    window.addEventListener('blanc:display-capture-abort', (event) => {
      if (typeof event.detail !== 'string') return;
      let payload;
      try { payload = JSON.parse(event.detail); } catch { return; }
      const share = activeShares.get(payload?.shareId);
      if (!share) return;
      activeShares.delete(payload.shareId);
      stopAudioPlayout(share);
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
      if (kind === 'audio') markBrokeredAudio(track);
      const releaseConsumer = () => {
        share?.tracks.delete(track);
        if (share && ![...share.tracks].some((item) => item.kind === 'audio' && item.readyState === 'live')) {
          stopAudioPlayout(share);
        }
        if (share && share.tracks.size === 0) {
          share.pc.close();
          activeShares.delete(shareId);
        }
      };
      try { track.addEventListener('ended', releaseConsumer); } catch {}
      const stop = track.stop.bind(track);
      track.stop = function stopBrokered() {
        stop();
        releaseConsumer();
        emitBridge('blanc:display-capture-track-stopped', { shareId, kind, trackKey });
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
        const share = { pc, tracks: new Set(), audioPlayout: null };
        activeShares.set(result.shareId, share);
        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'failed') {
            emitBridge('blanc:display-capture-signal', { shareId: result.shareId, type: 'failed' });
          }
        });
        const tracks = [];
        const requiredAudio = result.computerAudio === true;
        let audioPlayoutReady = !requiredAudio;
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
            if (!requiredTracksLive() || !audioPlayoutReady) return;
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
            // An already-queued event must not recreate a sink after teardown.
            if (activeShares.get(result.shareId) !== share) {
              try { trackStop.call(event.track); } catch {}
              return;
            }
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
            if (kind === 'audio' && requiredAudio && !share.audioPlayout) {
              startAudioPlayout(share, event.track).then(() => {
                audioPlayoutReady = true;
                tryReady();
              }, (error) => finish(error));
            }
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
          stopAudioPlayout(share);
          pc.close();
          for (const track of tracks) track.stop();
          activeShares.delete(result.shareId);
          emitBridge('blanc:display-capture-signal', { shareId: result.shareId, type: 'failed' });
          throw error;
        }
        // Meet-boundary diagnostics only: page-received audio identity at
        // handoff. Async energy must not delay resolve (Meet inspects immediately).
        try {
          for (const track of tracks) {
            if (track.kind !== 'audio') continue;
            let settings = null;
            try { settings = track.getSettings?.() || null; } catch { settings = null; }
            emitBridge('blanc:display-capture-page-diag', {
              event: 'audio-handoff',
              shareId: result.shareId,
              label: typeof track.label === 'string' ? track.label.slice(0, 80) : null,
              readyState: track.readyState,
              muted: track.muted === true,
              enabled: track.enabled !== false,
              contentHint: typeof track.contentHint === 'string' ? track.contentHint : null,
              echoCancellation: settings?.echoCancellation ?? null,
              autoGainControl: settings?.autoGainControl ?? null,
              noiseSuppression: settings?.noiseSuppression ?? null,
              sampleRate: settings?.sampleRate ?? null,
              channelCount: settings?.channelCount ?? null,
              displaySurface: displaySurface,
              computerAudio: requiredAudio,
            });
            void sampleTrackPeak(track, 400).then((sample) => {
              if (sample.error) return;
              emitBridge('blanc:display-capture-page-diag', {
                event: 'audio-energy',
                shareId: result.shareId,
                peak: sample.peak,
                readyState: track.readyState,
                muted: track.muted === true,
                enabled: track.enabled !== false,
              });
            });
          }
        } catch {}
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
  window.addEventListener('blanc:display-capture-page-diag', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 2048) return;
    let payload;
    try { payload = JSON.parse(event.detail); } catch { return; }
    ipcRenderer.send('display-capture:page-diag', payload);
  });
  webFrame.executeJavaScript(CAPTURE_MAINWORLD_SOURCE).catch(() => {});
}
