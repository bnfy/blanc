'use strict';

const pendingActivations = new WeakMap();
const ACTIVATION_DEADLINE_MS = 2_000;

/** Select a browser runtime, never an auxiliary popup. A closed primary is
 * reusable, but a live most-recently-focused profile/window takes precedence. */
function externalWindowRuntime(runtimes, preferred, primary, lastFocused = preferred) {
  const live = (runtime) => runtimes.includes(runtime) && !runtime.closing
    && runtime.window && !runtime.window.isDestroyed();
  return [preferred, lastFocused, ...runtimes].find(live) ?? primary;
}

/** Request foreground presentation for an explicit OS handoff. The boolean
 * acknowledges a live target, not proof that macOS has completed activation.
 * Unhiding the application and deminiaturizing a window are separate native
 * transitions. Finish focusing the captured window when those transitions
 * settle; ordinary background page activity never enters this helper. */
function bringExternalWindowToFront(application, window, { platform = process.platform } = {}) {
  pendingActivations.get(application)?.();
  if (!window || window.isDestroyed?.()) return false;

  if (platform !== 'darwin') {
    if (window.isMinimized?.()) window.restore();
    window.show?.();
    window.moveTop?.();
    window.focus?.();
    return true;
  }

  let finished = false;
  let requesting = true;
  let focusing = false;
  let immediate;
  let deadline;
  const listeners = [];
  const listen = (emitter, event, fn) => {
    emitter.on(event, fn);
    listeners.push(() => emitter.removeListener(event, fn));
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    clearImmediate(immediate);
    clearTimeout(deadline);
    for (const remove of listeners) remove();
    if (pendingActivations.get(application) === cancel) pendingActivations.delete(application);
  };
  const isComplete = () => !window.isDestroyed() && !application.isHidden()
    && !window.isMinimized() && application.isActive() && window.isFocused();
  const check = () => {
    if (!requesting && !finished && isComplete()) cancel();
  };
  const finishFocus = () => {
    if (finished || requesting || focusing) return;
    if (window.isDestroyed() || application.isHidden()) return cancel();
    if (isComplete()) return cancel();
    if (window.isMinimized()) return;
    focusing = true;
    try {
      if (!application.isActive()) application.focus({ steal: true });
      if (!finished) {
        window.moveTop();
        window.focus();
        check();
      }
    } finally {
      focusing = false;
    }
  };
  pendingActivations.set(application, cancel);
  listen(window, 'restore', finishFocus);
  listen(application, 'did-become-active', finishFocus);
  listen(window, 'focus', check);
  listen(window, 'hide', cancel);
  listen(window, 'minimize', cancel);
  listen(window, 'closed', cancel);
  listen(application, 'before-quit', cancel);
  listen(application, 'will-quit', cancel);
  listen(application, 'did-resign-active', cancel);
  // Selecting another Blanc window is also an explicit change of intent.
  listen(application, 'browser-window-focus', (_event, focused) => {
    if (!requesting && focused !== window) cancel();
  });
  deadline = setTimeout(cancel, ACTIVATION_DEADLINE_MS);
  deadline.unref?.();

  try {
    if (application.isHidden()) application.show();
    if (window.isMinimized()) window.restore();
    window.show();
    application.focus({ steal: true });
    window.moveTop();
    window.focus();
  } catch (error) {
    cancel();
    throw error;
  } finally {
    requesting = false;
  }
  // Always give native callbacks one turn to settle, even if the synchronous
  // focus call appeared to succeed. Further attempts are event-driven only.
  if (!finished) immediate = setImmediate(finishFocus);
  return true;
}

module.exports = { bringExternalWindowToFront, externalWindowRuntime };
