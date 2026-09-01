'use strict';

// Session-wide preload so WebRTC tracking begins before page scripts and also
// reaches Chromium-created target=_blank children and auxiliary popups. The
// page receives no bridge; only a standards API setter is applied in main world.
//
// This file intentionally imports only Electron. Sandboxed session preloads
// cannot require relative modules, so the page-realm function and the two IPC
// channel names must live in these shipped bytes. Unit tests extract and run
// the marked function below so they exercise the production implementation.
const { ipcRenderer, webFrame } = require('electron');

const GET_CHANNEL = 'webrtc:audio-buffer:get';
const UPDATE_CHANNEL = 'webrtc:audio-buffer:update';
const TARGET_MS = Object.freeze({ automatic: null, stable: 400, resilient: 1000 });
const targetFor = (mode) => (
  Object.prototype.hasOwnProperty.call(TARGET_MS, mode) ? TARGET_MS[mode] : null
);

// >>> mainworld
function installWebrtcAudioBuffer(targetMs, scope) {
  const root = scope || globalThis;
  const stateKey = Symbol.for('blanc.webrtcAudioBuffer.v2');
  const existing = root[stateKey];
  if (existing?.version === 2) {
    if (targetMs == null && typeof existing.uninstall === 'function') {
      return existing.uninstall();
    }
    if (typeof existing.update === 'function') {
      existing.update(targetMs);
      return true;
    }
  }

  // Automatic is Chromium's untouched behavior. Do not patch page globals
  // merely to write the default value.
  if (targetMs == null || typeof root.RTCPeerConnection !== 'function') return false;

  const PeerWeakRef = root.WeakRef || (typeof WeakRef === 'function' ? WeakRef : null);
  const PeerFinalizationRegistry = root.FinalizationRegistry
    || (typeof FinalizationRegistry === 'function' ? FinalizationRegistry : null);
  const peerRefs = new Set();
  const refByPeer = new WeakMap();
  const listened = new WeakSet();
  const listenersByPeer = new WeakMap();
  const patches = [];
  let currentTarget = targetMs;
  const finalizer = PeerFinalizationRegistry
    ? new PeerFinalizationRegistry((ref) => peerRefs.delete(ref))
    : null;

  const normalizedTarget = (value) => (
    value == null
      ? null
      : Number.isFinite(value) && value >= 0 && value <= 4000
        ? value
        : null
  );

  const applyReceiver = (receiver) => {
    if (receiver?.track?.kind !== 'audio' || !('jitterBufferTarget' in receiver)) return;
    try {
      receiver.jitterBufferTarget = currentTarget;
    } catch {
      // An engine may expose the draft property without accepting writes.
      // Calls must continue normally if that happens.
    }
  };

  const apply = (peer) => {
    let receivers = [];
    try { receivers = peer.getReceivers(); } catch {}
    for (const receiver of receivers || []) applyReceiver(receiver);
  };

  const forget = (peer) => {
    const listeners = listenersByPeer.get(peer);
    if (listeners) {
      try { peer.removeEventListener('track', listeners.track); } catch {}
      try { peer.removeEventListener('connectionstatechange', listeners.state); } catch {}
      listenersByPeer.delete(peer);
    }
    listened.delete(peer);
    const ref = refByPeer.get(peer);
    if (ref) {
      peerRefs.delete(ref);
      try { finalizer?.unregister(ref); } catch {}
      refByPeer.delete(peer);
    }
  };

  const forEachPeer = (visit) => {
    for (const ref of [...peerRefs]) {
      const peer = ref.deref();
      if (!peer) {
        peerRefs.delete(ref);
        continue;
      }
      if (peer.connectionState === 'closed') {
        forget(peer);
        continue;
      }
      visit(peer);
    }
  };

  const remember = (peer) => {
    if (refByPeer.has(peer)) return;
    // Chromium versions exposing jitterBufferTarget also expose WeakRef. Keep
    // a bounded fallback for older engines so tracking can never become an
    // unbounded strong-reference leak.
    if (!PeerWeakRef && peerRefs.size >= 64) peerRefs.delete(peerRefs.values().next().value);
    const ref = PeerWeakRef ? new PeerWeakRef(peer) : { deref: () => peer };
    refByPeer.set(peer, ref);
    peerRefs.add(ref);
    try { finalizer?.register(peer, ref, ref); } catch {}
  };

  const register = (peer) => {
    if (!peer || typeof peer.getReceivers !== 'function') return;
    remember(peer);
    if (!listened.has(peer)) {
      listened.add(peer);
      try {
        const track = () => apply(peer);
        const state = () => {
          if (peer.connectionState === 'closed') forget(peer);
        };
        peer.addEventListener('track', track);
        peer.addEventListener('connectionstatechange', state);
        listenersByPeer.set(peer, { track, state });
      } catch {}
    }
    apply(peer);
  };

  const proto = root.RTCPeerConnection.prototype;
  const patchMethod = (name, makeReplacement) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor || typeof descriptor.value !== 'function') return false;
    const replacement = makeReplacement(descriptor.value);
    try {
      Object.defineProperty(replacement, 'name', {
        value: descriptor.value.name,
        configurable: true,
      });
    } catch {}
    try {
      Object.defineProperty(proto, name, { ...descriptor, value: replacement });
      patches.push({ name, descriptor, replacement });
      return true;
    } catch {
      return false;
    }
  };

  const update = (nextTarget) => {
    currentTarget = normalizedTarget(nextTarget);
    forEachPeer(apply);
    return true;
  };

  const uninstall = () => {
    currentTarget = null;
    forEachPeer(apply);
    // Never overwrite a site's own wrapper if it layered one after Blanc.
    // In that rare case the observer stays inert until the next navigation.
    const canRestore = patches.every(({ name, replacement }) =>
      Object.getOwnPropertyDescriptor(proto, name)?.value === replacement);
    if (!canRestore) return false;
    forEachPeer(forget);
    for (const { name, descriptor } of [...patches].reverse()) {
      try { Object.defineProperty(proto, name, descriptor); } catch { return false; }
    }
    peerRefs.clear();
    try { delete root[stateKey]; } catch {}
    return true;
  };

  const state = Object.freeze({ version: 2, update, uninstall });
  try {
    Object.defineProperty(root, stateKey, {
      value: state,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  } catch {
    return false;
  }

  patchMethod('setRemoteDescription', (original) => function (...args) {
    register(this);
    const result = original.apply(this, args);
    Promise.resolve(result).then(() => register(this), () => {});
    return result;
  });

  patchMethod('addTransceiver', (original) => function (...args) {
    const transceiver = original.apply(this, args);
    register(this);
    applyReceiver(transceiver?.receiver);
    return transceiver;
  });

  if (patches.length === 0) {
    try { delete root[stateKey]; } catch {}
    return false;
  }
  return true;
}
// <<< mainworld

const sourceFor = (mode) => (
  `(${installWebrtcAudioBuffer.toString()})(${JSON.stringify(targetFor(mode))}, globalThis)`
);

if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
  let pending = null;
  const apply = (mode) => {
    const run = () => webFrame.executeJavaScript(sourceFor(mode));
    // The first installation runs immediately at preload time. Later setting
    // changes serialize behind it so rapid writes cannot finish out of order.
    pending = pending
      ? pending.catch(() => {}).then(run)
      : run();
    pending.catch(() => {});
  };

  let initialMode = 'automatic';
  try {
    initialMode = ipcRenderer.sendSync(GET_CHANNEL);
  } catch {}
  // Preserve genuinely untouched Chromium globals for Automatic documents.
  if (targetFor(initialMode) != null) apply(initialMode);

  ipcRenderer.on(UPDATE_CHANNEL, (_event, mode) => apply(mode));
}
