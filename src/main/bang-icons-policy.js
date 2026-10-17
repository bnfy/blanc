'use strict';

// When Blanc may ask its own icon server for a bang site's icon, and the
// records of the bounded on-device store. Pure: no Electron, no I/O, so the
// rules are unit-tested on their own. Design:
// docs/superpowers/specs/2026-10-17-bang-icons-in-app-design.md.

const SERVER_ORIGIN = 'https://blanc.day';
// The server's first lookup for a site can take several seconds.
const FETCH_TIMEOUT_MS = 8000;
const MAX_IN_FLIGHT = 4;
// A timeout, 5xx or network failure may be tried again this long after the
// last attempt, at most this many more times in one app run.
const RETRY_AFTER_MS = 30000;
const MAX_RETRIES_PER_RUN = 2;
// The server keeps its copies this long; a kept copy older than this is
// asked for again, so a withdrawn icon leaves and a redesign arrives.
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const STORE_CAP = 300;
// The overlay asks only for rows that stay on screen this long.
const VISIBLE_DELAY_MS = 300;

function iconUrl(host) {
  return `${SERVER_ORIGIN}/bang-icons/${host}`;
}

/** Every host in the bundled catalog, lowercased as the server lists them. */
function catalogHostSet(catalog) {
  const hosts = new Set();
  for (const entry of catalog || []) {
    if (typeof entry?.[3] === 'string' && entry[3]) hosts.add(entry[3].toLowerCase());
  }
  return hosts;
}

/** The person's own bangs' hosts: never sent to the server. */
function customHostSet(customBangs, Bangs) {
  const hosts = new Set();
  for (const bang of customBangs || []) {
    const host = typeof bang?.template === 'string' ? Bangs.templateHost(bang.template) : '';
    if (host) hosts.add(host.toLowerCase());
  }
  return hosts;
}

function storedState(record, now) {
  if (!record) return 'missing';
  return now - record.fetchedAt > REFRESH_AFTER_MS ? 'stale' : 'fresh';
}

/** What this app run has learned per host: in flight, a definite 404, or
 * failures with the time of the last attempt. Never persisted. */
function createRunState() {
  const inFlight = new Set();
  const notFound = new Set();
  const failures = new Map();
  return {
    canAsk(host, now) {
      if (inFlight.has(host) || notFound.has(host)) return false;
      const failed = failures.get(host);
      if (!failed) return true;
      return failed.count <= MAX_RETRIES_PER_RUN && now - failed.at >= RETRY_AFTER_MS;
    },
    started(host) {
      inFlight.add(host);
    },
    finished(host, outcome, now) {
      inFlight.delete(host);
      if (outcome === 'not-found') {
        notFound.add(host);
        failures.delete(host);
      } else if (outcome === 'failed') {
        failures.set(host, { count: (failures.get(host)?.count ?? 0) + 1, at: now });
      } else {
        failures.delete(host);
      }
    },
  };
}

function mayFetch({ host, enabled, setupComplete, privateActive, catalogHosts, customHosts, record, run, now }) {
  if (!enabled || !setupComplete || privateActive) return false;
  if (typeof host !== 'string' || !catalogHosts.has(host) || customHosts.has(host)) return false;
  if (storedState(record, now) === 'fresh') return false;
  return run.canAsk(host, now);
}

// Records are ordered most recently used first.
function putRecord(records, host, icon, now) {
  const rest = records.filter((record) => record.host !== host);
  return [{ host, icon, fetchedAt: now, usedAt: now }, ...rest].slice(0, STORE_CAP);
}

function dropRecord(records, host) {
  return records.filter((record) => record.host !== host);
}

function touchRecords(records, hosts, now) {
  const used = new Set(hosts);
  const front = [];
  const rest = [];
  for (const record of records) {
    if (used.has(record.host)) front.push({ ...record, usedAt: now });
    else rest.push(record);
  }
  return [...front, ...rest];
}

module.exports = {
  SERVER_ORIGIN,
  FETCH_TIMEOUT_MS,
  MAX_IN_FLIGHT,
  RETRY_AFTER_MS,
  MAX_RETRIES_PER_RUN,
  REFRESH_AFTER_MS,
  STORE_CAP,
  VISIBLE_DELAY_MS,
  iconUrl,
  catalogHostSet,
  customHostSet,
  storedState,
  createRunState,
  mayFetch,
  putRecord,
  dropRecord,
  touchRecords,
};
