// Loading the browser registry and resolving each entry to a real executable.
//
// Resolution is injected with an `exists` predicate so the whole thing is
// unit-testable on a machine that has none of these browsers installed — which
// includes CI, and includes any Linux box where this code is being edited.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const REGISTRY_PATH = path.join(__dirname, '..', 'browsers.json');

/** Normalize a string-or-array field to an array. */
const candidates = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * Resolve a registry entry against the filesystem.
 *
 * @param {object} entry
 * @param {(p: string) => boolean} exists
 * @returns {object} entry plus {installed, binary?, bundlePath?, resolutionError?}
 */
function resolveBrowserPaths(entry, exists) {
  if (entry.supported === false) {
    return { ...entry, installed: false, resolutionError: 'unsupported' };
  }

  const tried = [];
  for (const bundle of candidates(entry.bundlePath)) {
    if (!exists(bundle)) {
      tried.push(bundle);
      continue;
    }
    for (const name of candidates(entry.executableName)) {
      const binary = path.join(bundle, 'Contents', 'MacOS', name);
      if (exists(binary)) return { ...entry, installed: true, bundlePath: bundle, binary };
      tried.push(binary);
    }
  }
  return {
    ...entry,
    installed: false,
    resolutionError: tried.length
      ? `not found (tried: ${tried.join(', ')})`
      : 'no bundlePath/executableName configured',
  };
}

/**
 * @param {{registryPath?: string, exists?: (p: string) => boolean}} [options]
 * @returns {{browsers: object[], byId: Map<string, object>}}
 */
function loadRegistry(options = {}) {
  const registryPath = options.registryPath || REGISTRY_PATH;
  const exists = options.exists || ((p) => fs.existsSync(p));
  const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const browsers = raw.browsers.map((entry) => resolveBrowserPaths(entry, exists));
  return { browsers, byId: new Map(browsers.map((b) => [b.id, b])) };
}

/**
 * Pick the entries to run.
 *
 * An explicitly requested browser that is missing is an error — silently
 * dropping it would produce a report whose absent row looks like a deliberate
 * omission. With no selection, every installed browser runs.
 *
 * @param {object[]} browsers
 * @param {string[]|null} requestedIds
 * @returns {{selected: object[], skipped: Array<{id: string, reason: string}>}}
 */
function selectBrowsers(browsers, requestedIds) {
  if (requestedIds && requestedIds.length) {
    const byId = new Map(browsers.map((b) => [b.id, b]));
    const selected = [];
    for (const id of requestedIds) {
      const entry = byId.get(id);
      if (!entry) throw new Error(`Unknown browser id: ${id}`);
      if (!entry.installed) {
        throw new Error(`${entry.label} was requested but is not runnable: ${entry.resolutionError}`);
      }
      selected.push(entry);
    }
    return { selected, skipped: [] };
  }

  const selected = browsers.filter((b) => b.installed);
  const skipped = browsers
    .filter((b) => !b.installed)
    .map((b) => ({ id: b.id, reason: b.resolutionError }));
  return { selected, skipped };
}

/**
 * The bundle's marketing version, e.g. "1.21.13".
 *
 * A memory number is not citable without it. Zen in particular ships every few
 * days on a moving Firefox base, so "Zen used X" is meaningless a fortnight
 * later — and it is the only way to notice that a row labelled as the stable
 * build was actually a nightly.
 *
 * `defaults` is used rather than reading Info.plist directly because bundles
 * ship it in binary plist format as often as XML. Failure is not fatal: an
 * unknown version is recorded as null and rendered as "?".
 *
 * @param {string} bundlePath
 * @returns {Promise<string|null>}
 */
function bundleVersion(bundlePath) {
  return new Promise((resolve) => {
    if (!bundlePath) return resolve(null);
    execFile(
      '/usr/bin/defaults',
      ['read', path.join(bundlePath, 'Contents', 'Info'), 'CFBundleShortVersionString'],
      { timeout: 10_000, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : String(stdout).trim() || null)
    );
  });
}

module.exports = { REGISTRY_PATH, resolveBrowserPaths, loadRegistry, selectBrowsers, bundleVersion };
