// Throttled download-progress logging and a stall watchdog for electron-updater.
// electron-updater has no download timeout; a wedged transfer looks identical to a
// slow one unless we log progress and abort when bytes stop moving.

/** Log at most once per interval unless percent jumps by this much. */
const PROGRESS_LOG_INTERVAL_MS = 15 * 1000;
const PROGRESS_LOG_PERCENT_STEP = 5;

/** No download-progress for this long while a download is armed → cancel + retry. */
const DOWNLOAD_STALL_MS = 120 * 1000;

function formatBytes(n) {
  const bytes = Number(n);
  if (!Number.isFinite(bytes) || bytes < 0) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSecond) {
  const bps = Number(bytesPerSecond);
  if (!Number.isFinite(bps) || bps <= 0) return '0 B/s';
  return `${formatBytes(bps)}/s`;
}

/**
 * Returns { note(progress) } that logs percent/bytes/speed at a throttled rate.
 * Pure aside from the injected logger.
 */
function createDownloadProgressLogger({
  log,
  minIntervalMs = PROGRESS_LOG_INTERVAL_MS,
  percentStep = PROGRESS_LOG_PERCENT_STEP,
  now = Date.now,
} = {}) {
  let lastLoggedAt = 0;
  let lastLoggedPercent = -1;

  function note(progress) {
    if (!log) return;
    const percent = Number(progress?.percent);
    const transferred = progress?.transferred;
    const total = progress?.total;
    const bytesPerSecond = progress?.bytesPerSecond;
    const t = now();

    const percentFinite = Number.isFinite(percent);
    const bigEnoughJump = percentFinite && lastLoggedPercent >= 0
      ? percent - lastLoggedPercent >= percentStep
      : percentFinite && lastLoggedPercent < 0;
    const intervalElapsed = t - lastLoggedAt >= minIntervalMs;

    if (!intervalElapsed && !bigEnoughJump) return;

    lastLoggedAt = t;
    if (percentFinite) lastLoggedPercent = percent;

    const pct = percentFinite ? `${percent.toFixed(1)}%` : '?%';
    log(
      `download progress: ${pct} (${formatBytes(transferred)} / ${formatBytes(total)}, ${formatSpeed(bytesPerSecond)})`,
    );
  }

  function reset() {
    lastLoggedAt = 0;
    lastLoggedPercent = -1;
  }

  return { note, reset };
}

/**
 * Arms while a download is expected; touch() on each progress tick; onStall()
 * fires once if touch() goes silent for stallMs. disarm() clears state.
 */
function createDownloadStallWatchdog({
  stallMs = DOWNLOAD_STALL_MS,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onStall,
} = {}) {
  let armed = false;
  let lastTouchAt = 0;
  let timer = null;
  let stallReported = false;

  function schedule() {
    if (timer != null) clearTimer(timer);
    if (!armed) return;
    const elapsed = now() - lastTouchAt;
    const delay = Math.max(0, stallMs - elapsed);
    timer = setTimer(() => {
      timer = null;
      if (!armed || stallReported) return;
      if (now() - lastTouchAt >= stallMs) {
        stallReported = true;
        onStall?.();
      }
    }, delay);
  }

  function arm() {
    armed = true;
    stallReported = false;
    lastTouchAt = now();
    schedule();
  }

  function touch() {
    if (!armed) return;
    lastTouchAt = now();
    stallReported = false;
    schedule();
  }

  function disarm() {
    armed = false;
    stallReported = false;
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  }

  return { arm, touch, disarm };
}

function shouldArmDownloadStallWatchdog(result, {
  alreadyDownloading = false,
  alreadyDownloaded = false,
  verificationInProgress = false,
} = {}) {
  // alreadyDownloaded covers a cached installer from a previous session:
  // electron-updater emits update-downloaded during checkForUpdates() *before*
  // that promise resolves, so arming here would watch a transfer that is already
  // done and false-trigger a stall after DOWNLOAD_STALL_MS of silence.
  // verificationInProgress covers repeated manual checks after the bytes finish:
  // those checks can return a cancellation token even though PowerShell is now
  // validating the installer and no more download-progress events can arrive.
  return Boolean(
    result?.isUpdateAvailable
    && result.cancellationToken
    && !alreadyDownloading
    && !alreadyDownloaded
    && !verificationInProgress
  );
}

module.exports = {
  PROGRESS_LOG_INTERVAL_MS,
  PROGRESS_LOG_PERCENT_STEP,
  DOWNLOAD_STALL_MS,
  formatBytes,
  formatSpeed,
  createDownloadProgressLogger,
  createDownloadStallWatchdog,
  shouldArmDownloadStallWatchdog,
};
