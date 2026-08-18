const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const FOCUS_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Coalesce metadata checks and keep their timing policy independent of
 * Electron so the Windows release contract is unit-testable on the Mac host.
 */
function createUpdateCheckCoordinator({
  checkForUpdates,
  isUpdateDownloaded,
  now = Date.now,
  scheduleInterval = setInterval,
  onAutomaticError = (err) => console.warn('[updater]', err.message),
}) {
  let checkInFlight = null;
  let lastCheckStartedAt = 0;

  function runCheck() {
    if (isUpdateDownloaded()) return Promise.resolve(null);
    if (checkInFlight) return checkInFlight;

    lastCheckStartedAt = now();
    const pending = Promise.resolve().then(checkForUpdates);
    const tracked = pending.finally(() => {
      if (checkInFlight === tracked) checkInFlight = null;
    });
    checkInFlight = tracked;
    return tracked;
  }

  function runAutomaticCheck() {
    runCheck().catch(onAutomaticError);
  }

  function start() {
    runAutomaticCheck();
    return scheduleInterval(runAutomaticCheck, CHECK_INTERVAL_MS);
  }

  function checkOnFocus() {
    if (now() - lastCheckStartedAt < FOCUS_CHECK_MIN_INTERVAL_MS) return;
    runAutomaticCheck();
  }

  return {
    start,
    checkForUpdates: runCheck,
    checkOnFocus,
  };
}

module.exports = {
  CHECK_INTERVAL_MS,
  FOCUS_CHECK_MIN_INTERVAL_MS,
  createUpdateCheckCoordinator,
};
