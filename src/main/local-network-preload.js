'use strict';
if ((window.location.protocol === 'http:' || window.location.protocol === 'https:') && window.top === window) {

// Truthful navigator.permissions.query for Local Network Access (spec
// docs/superpowers/specs/2026-11-17-local-network-access-design.md §6).
// Blanc's strict check handler reads undecided as denied, so a page that asks
// first (Okta FastPass) gives up before it ever connects and never sees
// Blanc's prompt. This patch answers the three names from Blanc's stored
// decisions: 'prompt' while undecided. It authorizes nothing: every
// connection still goes through Blanc's request gate, and a bridge that
// doesn't answer falls back to the original query.
//
// A session preload of its own, not part of capture-preload.js: the capture
// preloads are hash-pinned per platform (capture-runtime-lock.json). It wraps
// whatever query exists, so the capture shim's patch keeps working. Session
// preloads reach main frames only, which the guard above makes explicit.
// Sandboxed session preloads can't require relative modules, so the page-realm
// function lives in these bytes; tests extract and run the marked function.
const { ipcRenderer, webFrame } = require('electron');

const QUERY_CHANNEL = 'local-network:permission-query';
const CHANGED_CHANNEL = 'local-network:permission-changed';
const NAMES = ['loopback-network', 'local-network', 'local-network-access'];
const STATES = ['granted', 'denied', 'prompt'];

// >>> mainworld
function installLocalNetworkQuery(scope) {
  const root = scope || globalThis;
  const permissions = root.navigator && root.navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') return false;
  const marker = Symbol.for('blanc.localNetworkQuery.v1');
  if (permissions[marker]) return false;
  const NAMES = ['loopback-network', 'local-network', 'local-network-access'];
  const STATES = ['granted', 'denied', 'prompt'];
  const realQuery = permissions.query.bind(permissions);
  const pending = new Map();
  let nextId = 1;
  const parse = (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 256) return null;
    try { return JSON.parse(event.detail); } catch { return null; }
  };
  root.addEventListener('blanc:lna-state', (event) => {
    const payload = parse(event);
    const resolve = payload && pending.get(payload.id);
    if (!resolve) return;
    pending.delete(payload.id);
    resolve(payload.state);
  });
  const bridged = (name) => new Promise((resolve) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, resolve);
    root.setTimeout(() => { if (pending.delete(id)) resolve(null); }, 1500);
    try {
      root.dispatchEvent(new root.CustomEvent('blanc:lna-query', { detail: JSON.stringify({ id, name }) }));
    } catch {
      if (pending.delete(id)) resolve(null);
    }
  });
  // One live status per name: it reflects the current state and fires a real
  // 'change' event when Blanc's decision changes (the Permissions contract).
  const live = new Map();
  const statusFor = (name, state) => {
    const existing = live.get(name);
    if (existing) { existing.fire(state); return existing.status; }
    const status = new root.EventTarget();
    let current = state;
    let onchange = null;
    const relay = (event) => { if (typeof onchange === 'function') onchange.call(status, event); };
    Object.defineProperties(status, {
      name: { value: name, enumerable: true },
      state: { get: () => current, enumerable: true },
      onchange: {
        get: () => onchange,
        set: (value) => {
          const next = typeof value === 'function' ? value : null;
          if (next === onchange) return;
          if (onchange && !next) status.removeEventListener('change', relay);
          if (!onchange && next) status.addEventListener('change', relay);
          onchange = next;
        },
        enumerable: true,
      },
    });
    const fire = (next) => {
      if (next === current) return;
      current = next;
      status.dispatchEvent(new root.Event('change'));
    };
    live.set(name, { status, fire });
    return status;
  };
  root.addEventListener('blanc:lna-changed', (event) => {
    const payload = parse(event);
    if (!payload || typeof payload.states !== 'object' || !payload.states) return;
    for (const name of NAMES) {
      const state = payload.states[name];
      if (STATES.includes(state)) live.get(name)?.fire(state);
    }
  });
  const query = function query(descriptor, ...rest) {
    const name = descriptor && descriptor.name;
    if (!NAMES.includes(name)) return realQuery(descriptor, ...rest);
    return bridged(name).then((state) => (
      STATES.includes(state) ? statusFor(name, state) : realQuery(descriptor, ...rest)
    ));
  };
  Object.defineProperty(permissions, 'query', { value: query, configurable: true, writable: true });
  Object.defineProperty(permissions, marker, { value: true });
  return true;
}
// <<< mainworld

window.addEventListener('blanc:lna-query', async (event) => {
  if (typeof event.detail !== 'string' || event.detail.length > 256) return;
  let payload;
  try { payload = JSON.parse(event.detail); } catch { return; }
  const id = payload && payload.id;
  const name = payload && payload.name;
  if (!Number.isInteger(id) || !NAMES.includes(name)) return;
  let state = null;
  try { state = await ipcRenderer.invoke(QUERY_CHANNEL, name); } catch {}
  if (!STATES.includes(state)) state = null;
  window.dispatchEvent(new CustomEvent('blanc:lna-state', { detail: JSON.stringify({ id, state }) }));
});

ipcRenderer.on(CHANGED_CHANNEL, (_event, states) => {
  if (!states || typeof states !== 'object') return;
  const clean = {};
  for (const name of NAMES) if (STATES.includes(states[name])) clean[name] = states[name];
  window.dispatchEvent(new CustomEvent('blanc:lna-changed', { detail: JSON.stringify({ states: clean }) }));
});

webFrame.executeJavaScript(`(${installLocalNetworkQuery.toString()})(globalThis)`).catch(() => {});
}
