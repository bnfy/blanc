'use strict';

/**
 * Evaluate `fn(electron, arg)` in Blanc's main process from its own event-loop
 * turn. Playwright delivers an evaluate through the Node inspector at the main
 * process's next V8 interrupt, which can fall inside a native callback: the
 * focus event a committing navigation fires mid frame-host swap
 * (RenderFrameHostManager::CommitPending). A loadURL made there crashed the
 * whole app in Chromium's NavigationRequest (document-policy-smoke.mjs, Oct
 * 2026). Blanc's own navigations wait a turn (tab-navigation.js), and so do the
 * test hooks (test-call-bridge.js); a direct evaluate that navigates, runs page
 * script, sends input, focuses or closes uses this.
 *
 * `fn` runs in the main process's global scope with the same arguments and
 * result as electronApp.evaluate, so, as there, it may not close over
 * test-side variables.
 */
function inMainTurn(electronApp, fn, arg) {
  return electronApp.evaluate(async (electron, { source, arg }) => {
    await new Promise((resolve) => setImmediate(resolve));
    return (0, eval)(`(${source})`)(electron, arg);
  }, { source: String(fn), arg });
}

module.exports = { inMainTurn };
