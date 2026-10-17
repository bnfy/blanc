'use strict';

// Site icons for the ⌘L panel's bang rows: the device-level store of icons
// fetched from Blanc's icon server, and the queue that asks it. The rules
// live in bang-icons-policy.js; the network reader and the conversion to the
// stored 32px PNG are passed in (favicon-network.js, favicon-sanitizer.js).
// Design: docs/superpowers/specs/2026-10-17-bang-icons-in-app-design.md.

const policy = require('./bang-icons-policy');

/**
 * @param {{
 *   store: { data: { records?: Array<{host:string, icon:string, fetchedAt:number, usedAt:number}> }, update(fn: Function): void },
 *   readIconBytes: Function,
 *   sanitizeIconBytes: Function,
 *   catalogHosts: Set<string>,
 *   now?: () => number,
 * }} options
 */
function createBangIcons({ store, readIconBytes, sanitizeIconBytes, catalogHosts, now = Date.now }) {
  let run = policy.createRunState();
  const listeners = new Set();
  const queue = [];
  let requested = [];
  let active = 0;
  // Bumped by clear(): a fetch that started before it must not refill the
  // store the person just emptied.
  let generation = 0;
  let reader = readIconBytes;

  const records = () => (Array.isArray(store.data.records) ? store.data.records : []);
  const recordFor = (host) => records().find((record) => record.host === host) ?? null;
  const setRecords = (next) => store.update((data) => { data.records = next; });
  const emit = (host, icon) => {
    for (const listener of listeners) {
      try { listener(host, icon); } catch { /* one window's failure stays its own */ }
    }
  };

  async function fetchOne(host) {
    const startedIn = generation;
    requested.push(host);
    let outcome = 'failed';
    try {
      const result = await reader(policy.iconUrl(host), {
        timeoutMs: policy.FETCH_TIMEOUT_MS,
        maxRedirects: 0,
        statusResult: true,
      });
      if (result?.bytes) {
        const icon = await sanitizeIconBytes(result.contentType, result.bytes);
        if (icon) {
          outcome = 'ok';
          if (startedIn === generation) {
            setRecords(policy.putRecord(records(), host, icon, now()));
            emit(host, icon);
          }
        }
      } else if (result?.status === 404 || result?.status === 410) {
        outcome = 'not-found';
        if (startedIn === generation) {
          if (recordFor(host)) setRecords(policy.dropRecord(records(), host));
          emit(host, null);
        }
      }
    } catch {
      outcome = 'failed';
    }
    run.finished(host, outcome, now());
  }

  function pump() {
    while (active < policy.MAX_IN_FLIGHT && queue.length) {
      const host = queue.shift();
      active += 1;
      fetchOne(host).finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  return {
    /** The stored server copy for a host, if any. */
    held(host) {
      const record = recordFor(host);
      if (!record || typeof record.icon !== 'string') return null;
      return { icon: record.icon, stale: policy.storedState(record, now()) === 'stale' };
    },

    /** Ask the server for each host the rules allow; `ctx` is decided by main
     * at call time (bangs on, setup saved, the window's tab private or not,
     * the person's own bang hosts). */
    request(hosts, ctx) {
      for (const host of hosts) {
        const allowed = policy.mayFetch({
          host,
          enabled: ctx.enabled,
          setupComplete: ctx.setupComplete,
          privateActive: ctx.privateActive,
          catalogHosts,
          customHosts: ctx.customHosts,
          record: recordFor(host),
          run,
          now: now(),
        });
        if (!allowed) continue;
        run.started(host);
        queue.push(host);
      }
      pump();
    },

    /** Least recently used is dropped first: drawing a row counts as use. */
    touch(hosts) {
      const held = hosts.filter((host) => recordFor(host));
      if (held.length) setRecords(policy.touchRecords(records(), held, now()));
    },

    /** Recent bangs were cleared (any history clear): the icons go with them. */
    clear() {
      generation += 1;
      // Queued hosts never started: release them so they can be asked again.
      for (const host of queue.splice(0)) run.finished(host, 'ok', now());
      setRecords([]);
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Acceptance test hooks only (src/main/test-hook.js, test mode).
    setFetcherForTest(fetcher) {
      reader = fetcher;
    },
    requestedHosts() {
      return requested.slice();
    },
    storedHostsForTest() {
      return records().map((record) => record.host);
    },
    resetForTest() {
      this.clear();
      run = policy.createRunState();
      requested = [];
      reader = async () => null;
    },
  };
}

module.exports = { createBangIcons };
