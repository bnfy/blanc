'use strict';

const { externalUrlActivationPlan, webUrlsFromArgv } = require('./startup-urls');
const { localHtmlUrlsFromPaths } = require('./local-html-files');

/** OS URL delivery is independent of app activation and chrome loading.
 * Pin each warm request to its receiving runtime; cold requests resolve only
 * after session restore has chosen the startup window/profile. No page-load
 * await belongs here: a selected tab should be visible while it loads.
 *
 * Link routing (F60): `routeFor(url)` names a web URL's destination (a
 * matched rule's { profileId, spaceId, private }) or null, once per URL when
 * it first flushes, so a cold link sees the restored windows. getRuntime gets
 * that destination with the pinned runtime and keeps a live match; createTab
 * receives it too. Local files are never routed. */
function createExternalUrlHandoff({
  application, isReady, isQuitting, getRuntime, ensureWindow, isWindowReady, withRuntime,
  createTab, activateTab, revealWindow, routeFor = () => null,
}) {
  let pending = [];
  let activeIntent = null;
  let flushing = false;

  // Cancellation must start at delivery, including the wait for new chrome.
  // Cancel only foreground intent: every delivered URL still gets its tab.
  function createRevealIntent() {
    activeIntent?.cancel();
    const initiallyHidden = application.isHidden?.() === true;
    const listeners = [];
    // Windows receiving this handoff's earlier URLs. A routed URL can open a
    // new window that takes focus on its own; that is not the user moving away.
    const companions = new Set();
    let cancelled = false;
    let window = null;
    const dispose = () => {
      for (const remove of listeners) remove();
      listeners.length = 0;
      companions.clear();
      if (activeIntent === intent) activeIntent = null;
    };
    const cancel = () => {
      cancelled = true;
      dispose();
    };
    const listen = (emitter, event, callback = cancel) => {
      emitter.on(event, callback);
      listeners.push(() => emitter.removeListener(event, callback));
    };
    const intent = {
      cancel,
      trackWindow(target) {
        if (cancelled || target === window) return;
        // A replacement can receive the URL, but cannot inherit permission
        // to foreground a window that the user has already closed.
        if (window || !target || target.isDestroyed()) return cancel();
        window = target;
        for (const event of ['hide', 'minimize', 'closed']) listen(window, event);
      },
      allowWindow(target) {
        if (!cancelled && target) companions.add(target);
      },
      consume() {
        // Hiding an already inactive macOS app need not emit resignation or
        // BrowserWindow.hide. Detect that transition before releasing chrome.
        if (!initiallyHidden && application.isHidden?.()) cancel();
        dispose();
        return !cancelled;
      },
    };
    for (const event of ['did-resign-active', 'before-quit', 'will-quit']) {
      listen(application, event);
    }
    listen(application, 'browser-window-focus', (_event, focused) => {
      if (window && focused !== window && !companions.has(focused)) cancel();
    });
    activeIntent = intent;
    return intent;
  }

  function flush() {
    if (flushing || !isReady() || isQuitting()) return;
    flushing = true;
    try {
      const entries = pending;
      pending = [];
      for (const entry of entries) {
        if (entry.destination === undefined) entry.destination = entry.localFile ? null : (routeFor(entry.url) ?? null);
        const runtime = getRuntime(entry.runtime, entry.destination);
        entry.runtime = runtime;
        ensureWindow(runtime);
        if (entry.activate) entry.intent?.trackWindow(runtime.window);
        else entry.intent?.allowWindow(runtime.window);
        if (!isWindowReady(runtime)) {
          pending.push(entry);
          continue;
        }
        withRuntime(runtime, () => {
          const options = entry.localFile ? { allowLocalFile: true }
            : entry.destination ? { destination: entry.destination } : undefined;
          const id = createTab(entry.url, options);
          if (!entry.activate) return;
          const shouldReveal = entry.intent?.consume();
          if (id == null || !shouldReveal) return;
          activateTab(id);
          revealWindow(runtime.window);
        });
      }
    } finally {
      flushing = false;
    }
  }

  function enqueue(urls, { localFiles = false } = {}) {
    if (isQuitting()) return;
    const accepted = localFiles ? localHtmlUrlsFromPaths(urls) : webUrlsFromArgv(urls);
    const plan = externalUrlActivationPlan(accepted);
    if (!plan.length) return;
    const intent = createRevealIntent();
    const runtime = isReady() ? getRuntime() : null;
    pending.push(...plan.map(({ url, activate }) => ({
      url,
      runtime,
      localFile: localFiles,
      destination: undefined,
      activate,
      intent,
    })));
    flush();
  }

  const open = (urls) => enqueue(urls);
  const openLocalFiles = (paths) => enqueue(paths, { localFiles: true });

  return { open, openLocalFiles, flush };
}

module.exports = { createExternalUrlHandoff };
