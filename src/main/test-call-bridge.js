'use strict';

/**
 * Install the acceptance-only, idempotent call surface used across Playwright's
 * inspector boundary. Chromium can report `Promise was collected` after the
 * method already ran but before its reply arrived; retaining the promise here
 * and retrying the SAME id returns that original result without repeating a
 * mutation.
 */
function installTestCallBridge(target, methods, { maxEntries = 4096 } = {}) {
  const calls = new Map();

  target.__blancCall = (id, method, args) => {
    if (calls.has(id)) return calls.get(id).promise;
    if (!Number.isSafeInteger(id) || id < 1) return Promise.reject(new Error('invalid test call id'));
    if (typeof method !== 'string' || typeof methods[method] !== 'function') {
      return Promise.reject(new Error(`unknown test method: ${String(method)}`));
    }
    if (!Array.isArray(args)) return Promise.reject(new Error('test call args must be an array'));

    while (calls.size >= maxEntries) calls.delete(calls.keys().next().value);
    const promise = Promise.resolve().then(() => methods[method](...args));
    calls.set(id, { method, promise });
    return promise;
  };

  return target.__blancCall;
}

module.exports = { installTestCallBridge };
