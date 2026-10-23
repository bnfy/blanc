'use strict';
// Default-off diagnostics for startup and profile navigation gating: which
// layer refused a main-frame request, when the gate opened and replayed it,
// and how the tab then handled the load failure. Observation only: callers'
// decisions never depend on it, and a recording failure is swallowed.
//
// Enabled only when BOTH are set:
// - BLANC_NAVIGATION_TRACE: an absolute path to a file that does not exist yet
//   (created owner-only, never overwritten);
// - BLANC_NAVIGATION_TRACE_HOSTS: a comma-separated list of fixture hostnames.
// Events about any other host, and any event for a private tab, are dropped.
// Fields are allowlisted; URLs are reduced to host, never path, query or page
// content. Completeness is provable from the file alone: every line carries a
// sequence number; trace-start is written when tracing is enabled; on normal
// exit trace-end records how many event lines were written and how many writes
// failed; trace-truncated marks the per-process cap. A crash or a failed write
// leaves the trace visibly incomplete.
const fs = require('node:fs');
const path = require('node:path');

const MAX_EVENTS = 2000;
const FIELDS = ['webContentsId', 'requestId', 'navEpoch', 'resourceType', 'stage', 'method',
  'queued', 'code', 'outcome', 'source', 'reason', 'count', 'gate'];

function traceHost(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.host : parsed.protocol;
  } catch {
    return null;
  }
}

function fixtureHostname(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function createNavigationTrace(env = process.env, { now = () => Date.now(), write, onExit = handler => process.once('exit', handler) } = {}) {
  const target = env.BLANC_NAVIGATION_TRACE;
  const hosts = new Set(String(env.BLANC_NAVIGATION_TRACE_HOSTS || '').split(',')
    .map(host => host.trim().toLowerCase()).filter(host => /^[a-z0-9.-]+$/.test(host)));
  if (typeof target !== 'string' || !path.isAbsolute(target) || hosts.size === 0) {
    return { enabled: false, record() {} };
  }
  let fd = null;
  let seq = 0;
  let written = 0;
  let failed = 0;
  let accepted = 0;
  let truncated = false;
  const sink = write || (line => {
    if (fd === null) fd = fs.openSync(target, 'wx', 0o600);
    fs.writeSync(fd, line);
  });
  const emit = entry => {
    try { sink(`${JSON.stringify({ seq: seq++, ...entry })}\n`); return true; } catch { return false; }
  };
  emit({ t: now(), event: 'trace-start', maxEvents: MAX_EVENTS, hosts: [...hosts].sort() });
  try {
    onExit(() => { emit({ t: now(), event: 'trace-end', written, failed, truncated }); });
  } catch { /* without an end marker the trace reads as incomplete */ }
  return {
    enabled: true,
    record(event, fields = {}) {
      if (typeof event !== 'string' || truncated) return;
      if (fields.private === true) return;
      if (typeof fields.url === 'string' && !hosts.has(fixtureHostname(fields.url))) return;
      try {
        if (accepted >= MAX_EVENTS) {
          truncated = true;
          emit({ t: now(), event: 'trace-truncated', count: accepted });
          return;
        }
        accepted += 1;
        const entry = { t: now(), event };
        if (typeof fields.url === 'string') entry.host = traceHost(fields.url);
        for (const key of FIELDS) {
          const value = fields[key];
          if (['string', 'number', 'boolean'].includes(typeof value)) entry[key] = value;
        }
        if (emit(entry)) written += 1; else failed += 1;
      } catch {
        failed += 1;
      }
    },
  };
}

const navigationTrace = createNavigationTrace();
module.exports = { createNavigationTrace, navigationTrace, traceHost, MAX_EVENTS };
