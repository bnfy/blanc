const fs = require('node:fs');
const path = require('node:path');

// Updater logging is low-volume (a handful of lines per 30-minute check), so a
// single ~1 MB generation with one rollover is plenty of history without ever
// growing unbounded on a long-lived install. The size is enforced on every
// write, not just at startup, so a session left running for weeks stays bounded.
const MAX_LOG_BYTES = 1024 * 1024;

/**
 * A dependency-free file logger for electron-updater's own diagnostics.
 *
 * electron-updater reports download progress, the "cannot download
 * differentially, fallback to full download" notice, and every error through
 * `autoUpdater.logger`. Left unconfigured that logger is `console`, whose output
 * is invisible in a packaged app — which is exactly why a slow or stalled
 * Windows update left no trace to diagnose. Persisting it to a file turns the
 * next occurrence into evidence. We deliberately avoid pulling in electron-log
 * to keep the shipped dependency/SBOM surface unchanged; electron-updater only
 * ever calls info/warn/error/debug, which is all this provides.
 *
 * Logging is best-effort and must never throw into the update flow. When a file
 * can't be written (unwritable dir, full disk, revoked permission) it falls
 * back to the `console` electron-updater would have used by default, so
 * diagnostics are downgraded, never silently dropped.
 */
function createUpdaterLog(logDir) {
  let file = null;
  let bytes = 0;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    file = path.join(logDir, 'updater.log');
    try {
      bytes = fs.statSync(file).size;
    } catch (_) {
      bytes = 0; // no existing log yet
    }
  } catch (_) {
    file = null;
  }

  function write(level, args) {
    const message = args
      .map((a) => {
        if (typeof a === 'string') return a;
        return (a && a.stack) || (a && a.message) || String(a);
      })
      .join(' ');

    if (file) {
      try {
        if (bytes > MAX_LOG_BYTES) {
          fs.renameSync(file, `${file}.old`); // single-generation rollover
          bytes = 0;
        }
        const line = `${new Date().toISOString()} [${level}] ${message}\n`;
        fs.appendFileSync(file, line);
        bytes += Buffer.byteLength(line);
        return;
      } catch (_) {
        // Fall through to the console fallback below.
      }
    }

    (console[level] || console.log)('[updater]', message);
  }

  return {
    info: (...a) => write('info', a),
    warn: (...a) => write('warn', a),
    error: (...a) => write('error', a),
    debug: (...a) => write('debug', a),
  };
}

module.exports = { createUpdaterLog, MAX_LOG_BYTES };
