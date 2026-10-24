'use strict';

const CALLBACK_EVENTS = ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived'];
const OBSERVE_EVENTS = ['onSendHeaders', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'];

// One owner for native listeners. Providers may be replaced or disposed without
// removing independent browser policies or another provider's listeners.
// trace (optional, src/main/navigation-trace.js) observes which layer cancelled
// a main-frame request; it never changes a decision.
function createBlockingCoordinator({ trace } = {}) {
  const sessions = new WeakMap();
  // One optional observer of main-frame cancellations made by a provider or a
  // policy failure (never the startup gate). Observation only.
  let cancelObserver = null;
  function ensure(session) {
    if (sessions.has(session)) return sessions.get(session);
    const state = { provider: null, gate: null, beforeSendHeaders: null, observing: false };
    // Diagnostics only on persistent sessions: private browsing (and every
    // other in-memory session) is never traced. Unknown fails closed.
    const traceable = !!trace && typeof session.isPersistent === 'function' && session.isPersistent() === true;
    sessions.set(session, state);
    for (const event of CALLBACK_EVENTS) {
      session.webRequest[event]({ urls: ['<all_urls>'] }, (details, callback) => {
        let settled = false;
        const respond = value => { if (!settled) { settled = true; callback(value || {}); } };
        // Main-frame cancellations at every callback stage, with Chromium's
        // request ID so original loads, redirects and replays stay distinct.
        const traced = source => {
          if (details.resourceType !== 'mainFrame') return;
          if (traceable) trace.record('coordinator-cancel', { source, stage: event, requestId: details.id,
            webContentsId: details.webContentsId, resourceType: details.resourceType, url: details.url, method: details.method });
          if (source !== 'gate') {
            try { cancelObserver?.({ webContentsId: details.webContentsId, url: details.url, source, stage: event }); } catch { /* observation only */ }
          }
        };
        if (event === 'onBeforeRequest' && state.gate?.(details)) { traced('gate'); return respond({ cancel: true }); }
        const run = async () => {
          const policy = event === 'onBeforeSendHeaders' && state.beforeSendHeaders
            ? state.beforeSendHeaders(details) : {};
          if (policy?.requestHeaders) details = { ...details, requestHeaders: policy.requestHeaders };
          const decision = await state.provider?.decide(event, details) || {};
          return { ...policy, ...decision };
        };
        run().then(value => { if (value?.cancel) traced('provider'); respond(value); }, () => { traced('policy-exception'); respond({ cancel: true }); });
      });
    }
    return state;
  }
  function setProvider(session, provider) {
    const state = ensure(session);
    state.provider = provider;
    const observing = typeof provider?.observe === 'function';
    if (observing === state.observing) return;
    state.observing = observing;
    // Only uBO needs the five observation stages. Blanc's network/CSP
    // decisions and independent browser policies keep the three callbacks.
    for (const event of OBSERVE_EVENTS) {
      session.webRequest[event]({ urls: ['<all_urls>'] }, observing ? details => {
        const current = state.provider;
        Promise.resolve().then(() => state.provider === current && current?.observe?.(event, details)).catch(() => {});
      } : null);
    }
  }
  return {
    ensure,
    setProvider,
    setGate: (session, gate) => { ensure(session).gate = gate; },
    setBeforeSendHeaders: (session, policy) => { ensure(session).beforeSendHeaders = policy; },
    observeCancel: observer => { cancelObserver = typeof observer === 'function' ? observer : null; },
  };
}

module.exports = { createBlockingCoordinator, CALLBACK_EVENTS, OBSERVE_EVENTS };
