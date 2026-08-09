// Observing which of the requested pages a browser actually loaded.
//
// The memory-growth floor this replaces as the primary check was a proxy, and a
// coarse one: it infers "the pages loaded" from the total being meaningfully
// above idle, which cannot distinguish two pages from ten. A browser that
// loaded a fifth of the workload would clear a 15% floor comfortably and be
// published as a very efficient browser.
//
// So instead of inferring, read what the browser itself recorded. Every browser
// here keeps a visit log inside its own profile, and because the profile is
// throwaway and per-cell, that log is about this cell:
//
//   blanc     history.json  — Blanc's own JsonStore (src/main/history.js)
//   chromium  Default/History — SQLite, `visits` joined to `urls`
//   gecko     places.sqlite   — SQLite, `moz_historyvisits` joined to `moz_places`
//
// Three things that look like details and are not:
//
//   1. Match per requested page, not per host. Hostname-only matching collapses
//      three Wikipedia articles into one check, so loading one of them reports
//      full success. Keys are host + path.
//   2. Read VISITS, not URL rows. Places' moz_places and Chromium's urls are
//      catalogues of URLs the browser knows about — bookmarks, referenced
//      links, prepopulated entries — not proof that anything was loaded. Both
//      queries join the visit table.
//   3. Filter by cell start time. Every cell is copied from a warmed template
//      profile, so without a time boundary a page visited during warm-up could
//      satisfy a cell in which it never loaded.
//
// Read after the browser has quit, so pending writes and any WAL are flushed.
//
// What this proves and does not prove: a visit record means the browser
// navigated to the URL, not that the page rendered completely. That is much
// stronger than "memory went up" and weaker than "the page was fully painted".

const fs = require('node:fs');
const path = require('node:path');

/** Seconds between the Windows/Chromium epoch (1601-01-01) and the Unix epoch. */
const CHROME_EPOCH_OFFSET_SECONDS = 11_644_473_600;

/**
 * Hostname of a URL, lowercased with a leading `www.` removed.
 *
 * @param {string} url
 * @returns {string|null}
 */
function hostOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * A comparison key that identifies a *page*, not just a site.
 *
 * Host plus path, with the query string and fragment dropped and a trailing
 * slash normalized away. Dropping the query is what makes this tolerant of the
 * tracking parameters and session ids sites append on arrival; keeping the path
 * is what stops three articles on one host collapsing into a single check.
 *
 * A cross-origin redirect (a URL that lands on a different host or path) will
 * not match, and the cell fails. That is the intended direction: a loud false
 * negative that gets the workload URL corrected, rather than a silent false
 * positive that gets published.
 *
 * @param {string} url
 * @returns {string|null}
 */
function normalizeUrlKey(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return null;
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${host}${pathname}`;
  } catch {
    return null;
  }
}

/**
 * Where a browser of this family keeps its visit log, and how to read it.
 *
 * @param {object} browser
 * @param {string} profileDir
 * @returns {{kind: 'json'|'sqlite', file: string, sql?: string, since?: Function}|null}
 */
function historyLocation(browser, profileDir) {
  switch (browser.family) {
    case 'blanc':
      return { kind: 'json', file: path.join(profileDir, 'history.json') };
    case 'chromium':
      return {
        kind: 'sqlite',
        file: path.join(profileDir, 'Default', 'History'),
        // `urls` alone is a catalogue; `visits` is the evidence.
        sql: 'SELECT u.url AS url FROM urls u JOIN visits v ON v.url = u.id WHERE v.visit_time >= ?',
        // Chromium timestamps are microseconds since 1601-01-01, which exceeds
        // Number.MAX_SAFE_INTEGER, so the bound value must be a BigInt.
        since: (ms) => BigInt(Math.floor(ms / 1000) + CHROME_EPOCH_OFFSET_SECONDS) * 1_000_000n,
      };
    case 'gecko':
      return {
        kind: 'sqlite',
        file: path.join(profileDir, 'places.sqlite'),
        // moz_places is the shared history/bookmarks catalogue — a row there
        // can be a bookmark with no visit at all. moz_historyvisits is what
        // records an actual navigation.
        sql:
          'SELECT p.url AS url FROM moz_places p ' +
          'JOIN moz_historyvisits v ON v.place_id = p.id WHERE v.visit_date >= ?',
        // PRTime: microseconds since the Unix epoch.
        since: (ms) => Math.floor(ms) * 1000,
      };
    default:
      return null;
  }
}

/**
 * Files that constitute a family's visit log, including SQLite sidecars.
 *
 * The template profile is copied wholesale into every cell, so these are
 * removed from the copy first. Deleting the database but leaving a `-wal`
 * behind would let SQLite replay warm-up visits into a fresh database.
 *
 * @returns {string[]}
 */
function historyArtifacts(browser, profileDir) {
  const location = historyLocation(browser, profileDir);
  if (!location) return [];
  if (location.kind === 'json') return [location.file];
  return [location.file, `${location.file}-wal`, `${location.file}-shm`, `${location.file}-journal`];
}

/**
 * Page keys recorded in Blanc's history store since `sinceMs`.
 *
 * @param {string} text contents of history.json
 * @param {number} sinceMs
 * @returns {Set<string>}
 */
function keysFromBlancHistory(text, sinceMs = 0) {
  const keys = new Set();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return keys;
  }
  for (const entry of (parsed && parsed.entries) || []) {
    if (!entry || typeof entry.url !== 'string') continue;
    if (Number.isFinite(sinceMs) && sinceMs > 0) {
      const at = Number(entry.visitedAt);
      if (!Number.isFinite(at) || at < sinceMs) continue;
    }
    const key = normalizeUrlKey(entry.url);
    if (key) keys.add(key);
  }
  return keys;
}

/** Page keys from a Chromium/Gecko visit table. */
function keysFromSqlite(file, sql, sinceValue) {
  // Required lazily so a --dry-run on a machine that never touches SQLite does
  // not emit Node's experimental-feature warning.
  const { DatabaseSync } = require('node:sqlite');
  const keys = new Set();
  let db;
  try {
    // Opened read-write on purpose: a read-only open cannot replay a WAL, and
    // the most recent navigations are exactly the ones still in it. The profile
    // is disposable and the browser has already exited.
    db = new DatabaseSync(file);
    for (const row of db.prepare(sql).all(sinceValue)) {
      const key = typeof row.url === 'string' ? normalizeUrlKey(row.url) : null;
      if (key) keys.add(key);
    }
  } finally {
    try {
      if (db) db.close();
    } catch {
      /* nothing useful to do */
    }
  }
  return keys;
}

/**
 * Compare requested pages against the pages the browser recorded visiting.
 *
 * Keyed per requested URL, so N pages on one host are N separate checks.
 *
 * @param {Set<string>} observedKeys
 * @param {string[]} urls
 * @returns {{requested: number, loaded: number, missing: string[]}}
 */
function comparePages(observedKeys, urls) {
  const wanted = new Map();
  for (const url of urls || []) {
    const key = normalizeUrlKey(url);
    if (key && !wanted.has(key)) wanted.set(key, url);
  }

  // How many pages this workload requests from each host.
  const perHost = new Map();
  for (const key of wanted.keys()) {
    const host = key.split('/')[0];
    perHost.set(host, (perHost.get(host) || 0) + 1);
  }
  const observedHosts = new Set([...observedKeys].map((k) => k.split('/')[0]));

  // Path-exact matching is only *needed* where a host is requested more than
  // once — three Wikipedia articles have to be three checks, or loading one
  // reports complete success. Where a host appears once, the host alone
  // identifies the page, and insisting on the path turns an ordinary redirect
  // into a false failure: dailymail.co.uk/home/index.html geo-redirects to
  // /ushome/index.html, which failed every adheavy cell for both Blanc
  // variants identically.
  const missing = [...wanted.entries()]
    .filter(([key]) => {
      const host = key.split('/')[0];
      return perHost.get(host) > 1 ? !observedKeys.has(key) : !observedHosts.has(host);
    })
    .map(([, url]) => url);

  return { requested: wanted.size, loaded: wanted.size - missing.length, missing };
}

/**
 * Read a finished cell's profile and report which requested pages it visited.
 *
 * Call after the browser has quit.
 *
 * @param {object} browser
 * @param {string} profileDir
 * @param {string[]} urls
 * @param {{sinceMs?: number}} [options] cell start time, so warm-up visits in the
 *   copied template profile cannot satisfy this cell
 * @returns {{ok: boolean, requested: number, loaded: number, missing: string[], reason?: string}}
 */
function observeLoadedPages(browser, profileDir, urls, options = {}) {
  const sinceMs = Number.isFinite(options.sinceMs) ? options.sinceMs : 0;
  const wantedCount = comparePages(new Set(), urls).requested;
  if (!wantedCount) return { ok: true, requested: 0, loaded: 0, missing: [] };

  const fail = (reason) => ({
    ok: false,
    requested: wantedCount,
    loaded: 0,
    missing: [...new Set(urls)],
    reason,
  });

  const location = historyLocation(browser, profileDir);
  if (!location) return fail(`no visit-log location known for the ${browser.family} family`);
  if (!fs.existsSync(location.file)) {
    // An absent visit log is itself evidence: a browser that loaded ten pages
    // wrote one. Treating it as "cannot check, carry on" is the hole this
    // whole mechanism exists to close.
    return fail(`no visit log at ${location.file} — the browser recorded no navigation at all`);
  }

  let keys;
  try {
    keys =
      location.kind === 'json'
        ? keysFromBlancHistory(fs.readFileSync(location.file, 'utf8'), sinceMs)
        : keysFromSqlite(location.file, location.sql, location.since(sinceMs));
  } catch (error) {
    // Deliberately no fallback to an unfiltered query: a schema this code does
    // not understand must fail the cell, not silently weaken the check.
    return fail(`could not read the visit log: ${error.message}`);
  }

  const compared = comparePages(keys, urls);
  return { ok: compared.missing.length === 0, ...compared };
}

/**
 * Did the browser actually get far enough to initialise its profile?
 *
 * Loaded cells prove this by visiting pages, but an idle cell has nothing to
 * check — it passes on liveness and a process count alone. A Firefox stuck on a
 * "profile cannot be loaded" dialog satisfies both, and was recorded as a
 * legitimate 131 MiB idle measurement.
 *
 * Gecko creates places.sqlite during startup, and the runner deletes it from
 * the copied template, so its presence afterwards is proof the browser really
 * started against this profile. Only claimed for Gecko: the Chromium families
 * have no marker this reliable at idle, and a false failure is its own kind of
 * wrong.
 *
 * @returns {{ok: boolean, reason?: string}}
 */
function profileInitialized(browser, profileDir) {
  if (browser.family !== 'gecko') return { ok: true };
  const file = path.join(profileDir, 'places.sqlite');
  if (fs.existsSync(file)) return { ok: true };
  return {
    ok: false,
    reason:
      'the browser never initialised this profile (no places.sqlite was created) — ' +
      'it most likely showed a profile error dialog instead of starting, which an ' +
      'idle cell would otherwise record as a valid measurement',
  };
}

/**
 * Can visit logs be read for every one of these browsers on this Node?
 *
 * `node:sqlite` is still experimental, so a different Node build could lack it.
 * Discovering that per-cell would mean launching browsers for forty minutes and
 * failing every one of them; this is called during preflight instead.
 *
 * @param {object[]} browsers
 * @returns {{ok: boolean, reason?: string}}
 */
function checkReadable(browsers) {
  const families = new Set(browsers.map((b) => b.family));
  const unknown = [...families].filter((f) => !historyLocation({ family: f }, '/x'));
  if (unknown.length) {
    return { ok: false, reason: `no visit-log location known for family: ${unknown.join(', ')}` };
  }
  if (![...families].some((f) => f === 'chromium' || f === 'gecko')) return { ok: true };
  try {
    require('node:sqlite');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        'node:sqlite is unavailable on this Node build, so Chromium and Gecko visit logs ' +
        `cannot be read and no cell could be verified (${error.message}). ` +
        'Use a Node with SQLite support, or restrict the run to --browsers=blanc.',
    };
  }
}

module.exports = {
  hostOf,
  normalizeUrlKey,
  checkReadable,
  historyLocation,
  profileInitialized,
  historyArtifacts,
  keysFromBlancHistory,
  keysFromSqlite,
  comparePages,
  observeLoadedPages,
};
