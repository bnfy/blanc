'use strict';

const { externalUrlActivationPlan, webUrlsFromArgv } = require('./startup-urls');

/** OS URL delivery is independent of app activation and chrome loading.
 * Pin each warm request to its receiving runtime; cold requests resolve only
 * after session restore has chosen the startup window/profile. No page-load
 * await belongs here: a selected tab should be visible while it loads. */
function createExternalUrlHandoff({
  isReady, isQuitting, getRuntime, ensureWindow, isWindowReady, withRuntime,
  createTab, activateTab, revealWindow,
}) {
  let pending = [];
  let generation = 0;
  let flushing = false;

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
        if (!isWindowReady(runtime)) {
          pending.push(entry);
          continue;
        }
        withRuntime(runtime, () => {
          const id = createTab(entry.url);
          if (id == null || !entry.activate || entry.generation !== generation) return;
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
    generation += 1;
    const runtime = isReady() ? getRuntime() : null;
    pending.push(...plan.map((entry) => ({ ...entry, runtime, generation })));
    flush();
  }

  return { open, flush };
}

module.exports = { createExternalUrlHandoff };
