'use strict';

const { shouldBlockChromeWebStoreRequest } = require('./chrome-web-store-guard');
const CALLBACK_EVENTS = ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived'];
const OBSERVE_EVENTS = ['onSendHeaders', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'];

// One owner for native listeners. Providers may be replaced or disposed without
// removing independent browser policies or another provider's listeners.
function createBlockingCoordinator() {
  const sessions = new WeakMap();
  function ensure(session) {
    if (sessions.has(session)) return sessions.get(session);
    const state = { provider: null, gate: null, beforeSendHeaders: null, observing: false };
    sessions.set(session, state);
    for (const event of CALLBACK_EVENTS) {
      session.webRequest[event]({ urls: ['<all_urls>'] }, (details, callback) => {
        let settled = false;
        const respond = value => { if (!settled) { settled = true; callback(value || {}); } };
        if (event === 'onBeforeRequest') {
          if (shouldBlockChromeWebStoreRequest(details)) return respond({ cancel: true });
          if (state.gate?.(details)) return respond({ cancel: true });
        }
        const run = async () => {
          const policy = event === 'onBeforeSendHeaders' && state.beforeSendHeaders
            ? state.beforeSendHeaders(details) : {};
          if (policy?.requestHeaders) details = { ...details, requestHeaders: policy.requestHeaders };
          const decision = await state.provider?.decide(event, details) || {};
          return { ...policy, ...decision };
        };
        run().then(respond, () => respond({ cancel: true }));
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
  };
}

module.exports = { createBlockingCoordinator, CALLBACK_EVENTS, OBSERVE_EVENTS };
