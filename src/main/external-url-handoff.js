'use strict';

const { externalUrlActivationPlan, webUrlsFromArgv } = require('./startup-urls');

/** OS URL delivery is independent of app activation and chrome loading.
 * Pin each warm request to its receiving runtime; cold requests resolve only
 * after session restore has chosen the startup window/profile. No page-load
 * await belongs here: a selected tab should be visible while it loads. */
function createExternalUrlHandoff({
  application, isReady, isQuitting, getRuntime, ensureWindow, isWindowReady, withRuntime,
  createTab, activateTab, revealWindow,
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
    let cancelled = false;
    let window = null;
    const dispose = () => {
      for (const remove of listeners) remove();
      listeners.length = 0;
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
      if (window && focused !== window) cancel();
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
        const runtime = getRuntime(entry.runtime);
        entry.runtime = runtime;
        ensureWindow(runtime);
        entry.intent?.trackWindow(runtime.window);
        if (!isWindowReady(runtime)) {
          pending.push(entry);
          continue;
        }
        withRuntime(runtime, () => {
          const id = createTab(entry.url);
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

  function open(urls) {
    if (isQuitting()) return;
    const plan = externalUrlActivationPlan(webUrlsFromArgv(urls));
    if (!plan.length) return;
    const intent = createRevealIntent();
    const runtime = isReady() ? getRuntime() : null;
    pending.push(...plan.map(({ url, activate }) => ({ url, runtime, intent: activate ? intent : null })));
    flush();
  }

  return { open, flush };
}

module.exports = { createExternalUrlHandoff };
