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
// throwaway and per-cell, that log contains this cell's navigations and nothing
// else:
//
//   blanc     history.json — Blanc's own JsonStore (src/main/history.js)
//   chromium  Default/History — SQLite, table `urls`
//   gecko     places.sqlite  — SQLite, table `moz_places`
//
// Read after the browser has quit, so pending writes and any WAL are flushed.
//
// What this proves and does not prove: a visit record means the browser
// navigated to the URL, not that the page rendered completely. That is a much
// stronger statement than "memory went up", and a much weaker one than "the
// page was fully painted". It is enough to catch every failure this harness
// actually needs to catch — a gated navigation, a hijacked argv, a startup
// homepage that never opened.

const fs = require('node:fs');
const path = require('node:path');

/**
 * Hostname of a URL, lowercased with a leading `www.` removed.
 *
 * Matching on host rather than the full URL is deliberate: pages redirect,
 * append query parameters and rewrite paths, so exact-URL matching would report
 * false failures for pages that loaded perfectly well.
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
 * Where a browser of this family keeps its visit log, relative to the profile.
 *
 * @param {object} browser
 * @param {string} profileDir
 * @returns {{kind: 'json'|'sqlite', file: string, table?: string, column?: string}|null}
 */
function historyLocation(browser, profileDir) {
  switch (browser.family) {
    case 'blanc':
      return { kind: 'json', file: path.join(profileDir, 'history.json') };
    case 'chromium':
      return {
        kind: 'sqlite',
        file: path.join(profileDir, 'Default', 'History'),
        table: 'urls',
        column: 'url',
      };
    case 'gecko':
      return {
        kind: 'sqlite',
        file: path.join(profileDir, 'places.sqlite'),
        table: 'moz_places',
        column: 'url',
      };
    default:
      return null;
  }
}

/**
 * Hosts recorded in Blanc's history store.
 *
 * @param {string} text contents of history.json
 * @returns {Set<string>}
 */
function hostsFromBlancHistory(text) {
  const hosts = new Set();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return hosts;
  }
  for (const entry of (parsed && parsed.entries) || []) {
    const host = entry && typeof entry.url === 'string' ? hostOf(entry.url) : null;
    if (host) hosts.add(host);
  }
  return hosts;
}

/** Hosts recorded in a Chromium/Gecko SQLite visit log. */
function hostsFromSqlite(file, table, column) {
  // Required lazily so a --dry-run on a machine that never touches SQLite does
  // not emit Node's experimental-feature warning.
  const { DatabaseSync } = require('node:sqlite');
  const hosts = new Set();
  let db;
  try {
    // Opened read-write on purpose: a read-only open cannot replay a WAL, and
    // the most recent navigations are exactly the ones still in it. The profile
    // is disposable and the browser has already exited.
    db = new DatabaseSync(file);
    for (const row of db.prepare(`SELECT ${column} AS url FROM ${table}`).all()) {
      const host = typeof row.url === 'string' ? hostOf(row.url) : null;
      if (host) hosts.add(host);
    }
  } finally {
    try {
      if (db) db.close();
    } catch {
      /* nothing useful to do */
    }
  }
  return hosts;
}

/**
 * Compare requested URLs against the hosts the browser recorded visiting.
 *
 * @param {Set<string>} observedHosts
 * @param {string[]} urls
 * @returns {{requested: number, loaded: number, missing: string[]}}
 */
function comparePages(observedHosts, urls) {
  const wanted = [...new Set(urls.map(hostOf).filter(Boolean))];
  const missing = wanted.filter((host) => !observedHosts.has(host));
  return { requested: wanted.length, loaded: wanted.length - missing.length, missing };
}

/**
 * Read a finished cell's profile and report which requested pages it visited.
 *
 * Call after the browser has quit.
 *
 * @param {object} browser
 * @param {string} profileDir
 * @param {string[]} urls
 * @returns {{ok: boolean, requested: number, loaded: number, missing: string[], reason?: string}}
 */
function observeLoadedPages(browser, profileDir, urls) {
  const wanted = [...new Set((urls || []).map(hostOf).filter(Boolean))];
  if (!wanted.length) return { ok: true, requested: 0, loaded: 0, missing: [] };

  const location = historyLocation(browser, profileDir);
  if (!location) {
    return {
      ok: false,
      requested: wanted.length,
      loaded: 0,
      missing: wanted,
      reason: `no visit-log location known for the ${browser.family} family`,
    };
  }
  if (!fs.existsSync(location.file)) {
    // An absent visit log is itself evidence: a browser that loaded ten pages
    // wrote one. Treating it as "cannot check, carry on" is the hole this
    // whole mechanism exists to close.
    return {
      ok: false,
      requested: wanted.length,
      loaded: 0,
      missing: wanted,
      reason: `no visit log at ${location.file} — the browser recorded no navigation at all`,
    };
  }

  let hosts;
  try {
    hosts =
      location.kind === 'json'
        ? hostsFromBlancHistory(fs.readFileSync(location.file, 'utf8'))
        : hostsFromSqlite(location.file, location.table, location.column);
  } catch (error) {
    return {
      ok: false,
      requested: wanted.length,
      loaded: 0,
      missing: wanted,
      reason: `could not read the visit log: ${error.message}`,
    };
  }

  const compared = comparePages(hosts, urls);
  return { ok: compared.missing.length === 0, ...compared };
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
  checkReadable,
  historyLocation,
  hostsFromBlancHistory,
  hostsFromSqlite,
  comparePages,
  observeLoadedPages,
};
