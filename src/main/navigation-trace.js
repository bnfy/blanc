'use strict';
// Default-off diagnostics for startup and profile navigation gating: which
// layer refused a main-frame request, when the gate opened and replayed it,
// and how the tab then handled the load failure. Observation only: callers'
// decisions never depend on it, and a recording failure is swallowed.
//
// Enabled only when BLANC_NAVIGATION_TRACE names an absolute path to a file
// that does not exist yet (created owner-only, never overwritten). Records an
// allowlisted set of fields; URLs are reduced to scheme or host, never path,
// query or page content. Bounded to MAX_EVENTS per process.
const fs = require('node:fs');
const path = require('node:path');

const MAX_EVENTS = 2000;
const FIELDS = ['webContentsId', 'method', 'queued', 'code', 'outcome', 'source', 'reason', 'count', 'gate'];

function traceHost(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.host : parsed.protocol;
  } catch {
    return null;
  }
}

function createNavigationTrace(env = process.env, { now = () => Date.now(), write } = {}) {
  const target = env.BLANC_NAVIGATION_TRACE;
  if (typeof target !== 'string' || !path.isAbsolute(target)) return { enabled: false, record() {} };
  let fd = null;
  let count = 0;
  const sink = write || (line => {
    if (fd === null) fd = fs.openSync(target, 'wx', 0o600);
    fs.writeSync(fd, line);
  });
  return {
    enabled: true,
    record(event, fields = {}) {
      if (count >= MAX_EVENTS || typeof event !== 'string') return;
      count += 1;
      try {
        const entry = { t: now(), event };
        if (typeof fields.url === 'string') entry.host = traceHost(fields.url);
        for (const key of FIELDS) {
          const value = fields[key];
          if (['string', 'number', 'boolean'].includes(typeof value)) entry[key] = value;
        }
        sink(`${JSON.stringify(entry)}\n`);
      } catch {
        // Diagnostics never affect navigation or blocking.
      }
    },
  };
}

const navigationTrace = createNavigationTrace();
module.exports = { createNavigationTrace, navigationTrace, traceHost, MAX_EVENTS };
