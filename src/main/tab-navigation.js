'use strict';

// Keep programmatic native navigation calls from overlapping on one guest.
// A newer request cancels an in-flight load, waits for its promise to settle,
// then rechecks the guest identity/owner before starting. No page data is held.
const navigations = new WeakMap();
function queueTabNavigation(wc, { run, isCurrent, startImmediately = false }) {
  if (!wc || wc.isDestroyed()) return Promise.resolve(false);
  let state = navigations.get(wc);
  const fresh = !state;
  if (!state) {
    state = { generation: 0, running: 0, tail: Promise.resolve() };
    navigations.set(wc, state);
  }
  const generation = ++state.generation;
  if (state.running && wc.isLoadingMainFrame()) wc.stop();
  const navigate = async () => {
    // Leave the previous native event stack before another navigation call.
    if (!startImmediately || !fresh) await new Promise(resolve => setImmediate(resolve));
    if (generation !== state.generation || wc.isDestroyed() || !isCurrent()) return false;
    state.running = generation;
    try {
      await run(wc);
      return true;
    } catch {
      return false; // did-fail-load owns presentation; cancellation is routine
    } finally {
      if (state.running === generation) state.running = 0;
    }
  };
  const previous = state.tail;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  state.tail = pending;
  // Only a brand-new guest starts synchronously. Its initial navigation
  // belongs before activation/focus broadcasts, as in the original path.
  if (startImmediately && fresh) navigate().then(finish, () => finish(false));
  else previous.then(navigate, navigate).then(finish, () => finish(false));
  return pending;
}

function tabNavigationSuperseded(wc) {
  const state = navigations.get(wc);
  return !!state?.running && state.running !== state.generation;
}

function shouldPresentTabLoadFailure(wc, code, url) {
  return !!url && code !== -3 && !tabNavigationSuperseded(wc) &&
    !/^blanc:\/\/error(?:[/?#]|$)/i.test(url);
}

function reloadContents(wc, bypassCache = false) {
  return new Promise(resolve => {
    const finish = () => {
      for (const name of ['did-stop-loading', 'destroyed', 'will-prevent-unload']) wc.removeListener(name, finish);
      resolve();
    };
    for (const name of ['did-stop-loading', 'destroyed', 'will-prevent-unload']) wc.once(name, finish);
    try {
      if (bypassCache) wc.reloadIgnoringCache();
      else wc.reload();
    } catch {
      finish();
    }
  });
}

module.exports = { queueTabNavigation, shouldPresentTabLoadFailure, reloadContents };
