const MAX_CRASH_EVENTS = 50;
const EVENT_KINDS = new Set(['renderer', 'child-process', 'unclean-exit']);
const SURFACES = new Set(['chrome', 'overlay', 'utility-sheet', 'tab', 'unknown']);

function safeToken(value, fallback = 'unknown') {
  const token = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(token) ? token : fallback;
}

function safeTime(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeExitCode(value) {
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
    ? value
    : null;
}

function sanitizeEvent(value) {
  if (!value || typeof value !== 'object' || !EVENT_KINDS.has(value.kind)) return null;
  const at = safeTime(value.at);
  if (at === null) return null;

  if (value.kind === 'unclean-exit') {
    const previousStartedAt = safeTime(value.previousStartedAt);
    return previousStartedAt === null
      ? null
      : { at, kind: 'unclean-exit', previousStartedAt };
  }

  const event = {
    at,
    kind: value.kind,
    reason: safeToken(value.reason),
  };
  const exitCode = safeExitCode(value.exitCode);
  if (exitCode !== null) event.exitCode = exitCode;
  if (value.kind === 'renderer') {
    event.surface = SURFACES.has(value.surface) ? value.surface : 'unknown';
  } else {
    event.processType = safeToken(value.processType);
  }
  return event;
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(sanitizeEvent).filter(Boolean).slice(-MAX_CRASH_EVENTS);
}

function validCurrentRun(value) {
  return !!(value &&
    typeof value === 'object' &&
    safeTime(value.startedAt) !== null);
}

function appendEvent(data, event) {
  data.version = 1;
  const sanitized = sanitizeEvent(event);
  data.events = sanitized
    ? [...normalizeEvents(data.events), sanitized].slice(-MAX_CRASH_EVENTS)
    : normalizeEvents(data.events);
}

function createCrashLedger(store, { now = Date.now } = {}) {
  if (!store || typeof store.updateAndFlush !== 'function' || !store.data) {
    throw new TypeError('a flushable JSON store is required');
  }

  function startSession() {
    const at = now();
    const currentRun = { startedAt: at };
    return store.updateAndFlush((data) => {
      if (validCurrentRun(data.currentRun)) {
        appendEvent(data, {
          at,
          kind: 'unclean-exit',
          previousStartedAt: data.currentRun.startedAt,
        });
        data.recoveryPending = true;
      } else {
        data.version = 1;
        data.events = normalizeEvents(data.events);
        data.recoveryPending = data.recoveryPending === true;
      }
      data.currentRun = currentRun;
    });
  }

  function hasActiveSession() {
    return validCurrentRun(store.data.currentRun);
  }

  function hasPendingRecovery() {
    return store.data.recoveryPending === true;
  }

  function endSession() {
    return store.updateAndFlush((data) => {
      data.version = 1;
      data.events = normalizeEvents(data.events);
      data.currentRun = null;
      data.recoveryPending = data.recoveryPending === true;
    });
  }

  function resolveRecovery() {
    return store.updateAndFlush((data) => {
      data.version = 1;
      data.events = normalizeEvents(data.events);
      if (!validCurrentRun(data.currentRun)) data.currentRun = null;
      data.recoveryPending = false;
    });
  }

  function recordRenderer({ surface = 'unknown', reason, exitCode } = {}) {
    const event = sanitizeEvent({
      at: now(),
      kind: 'renderer',
      surface,
      reason,
      exitCode,
    });
    return store.updateAndFlush((data) => appendEvent(data, event));
  }

  function recordChildProcess({ type, reason, exitCode } = {}) {
    const event = sanitizeEvent({
      at: now(),
      kind: 'child-process',
      processType: type,
      reason,
      exitCode,
    });
    return store.updateAndFlush((data) => appendEvent(data, event));
  }

  function clear() {
    return store.updateAndFlush((data) => {
      data.version = 1;
      data.events = [];
      if (!validCurrentRun(data.currentRun)) data.currentRun = null;
      data.recoveryPending = data.recoveryPending === true;
    });
  }

  function snapshot() {
    return normalizeEvents(store.data.events).map((event) => ({ ...event }));
  }

  return {
    startSession,
    endSession,
    hasActiveSession,
    hasPendingRecovery,
    recordRenderer,
    recordChildProcess,
    resolveRecovery,
    clear,
    snapshot,
  };
}

function isoTime(value) {
  const time = safeTime(value);
  return time === null ? null : new Date(time).toISOString();
}

function safeVersion(value) {
  const text = String(value ?? '').trim();
  return /^[a-zA-Z0-9._ -]{1,80}$/.test(text) ? text : 'unknown';
}

function buildDiagnosticsReport({ generatedAt, appInfo = {}, systemInfo = {}, events = [] } = {}) {
  const crashes = normalizeEvents(events).map((event) => {
    const projected = { ...event, at: isoTime(event.at) };
    if (event.kind === 'unclean-exit') {
      projected.previousStartedAt = isoTime(event.previousStartedAt);
    }
    return projected;
  });
  return {
    schemaVersion: 1,
    generatedAt: isoTime(generatedAt) ?? new Date(0).toISOString(),
    application: {
      name: 'Blanc',
      version: safeVersion(appInfo.version),
      packaged: !!appInfo.packaged,
      electron: safeVersion(appInfo.electron),
      chromium: safeVersion(appInfo.chromium),
      node: safeVersion(appInfo.node),
    },
    system: {
      platform: safeToken(systemInfo.platform),
      architecture: safeToken(systemInfo.architecture),
      release: safeVersion(systemInfo.release),
    },
    crashLedger: {
      eventCount: crashes.length,
      events: crashes,
    },
    privacy: {
      localOnlyUntilExported: true,
      excluded: [
        'URLs and page titles',
        'browsing history and downloads',
        'favorites and profile names',
        'cookies, site data, and permissions',
        'install IDs, sync credentials, and license keys',
      ],
    },
  };
}

module.exports = {
  MAX_CRASH_EVENTS,
  buildDiagnosticsReport,
  createCrashLedger,
  normalizeEvents,
  sanitizeEvent,
};
