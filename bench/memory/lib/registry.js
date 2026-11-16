// Loading the browser registry and resolving each entry to a real executable.
//
// Resolution is injected with an `exists` predicate so the whole thing is
// unit-testable on a machine that has none of these browsers installed — which
// includes CI, and includes any Linux box where this code is being edited.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const winps = require('./winps');

const REGISTRY_PATH = path.join(__dirname, '..', 'browsers.json');

/** Normalize a string-or-array field to an array. */
const candidates = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * Expand %NAME% references the way Windows does, case-insensitively.
 *
 * A variable that is not set is reported rather than left in place: probing the
 * literal path "%ProgramFiles(x86)%\Google\..." can never succeed, and listing
 * it as "not found" would send the next person looking at the wrong thing.
 *
 * @param {string} text
 * @param {Record<string, string|undefined>} env
 * @returns {{value: string, missing: string[]}}
 */
function expandEnv(text, env) {
  const lower = new Map(Object.entries(env || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const missing = [];
  const value = String(text).replace(/%([^%]+)%/g, (whole, name) => {
    const found = lower.get(name.toLowerCase());
    if (!found) {
      missing.push(name);
      return whole;
    }
    return found;
  });
  return { value, missing };
}

/**
 * Resolve a Windows entry. A browser with no `windows` block is "not installed",
 * never run from its macOS path: a missing block means nobody has checked that
 * browser on Windows, and an unchecked process layout can mis-attribute memory.
 *
 * The block overrides the macOS fields it names (`bundlePath`, `executableName`,
 * `extraArgs`, `notes`, ...). `notes` replaces rather than appends, because the
 * shared ones are written about macOS (Brave's Sparkle updater lives in the app
 * bundle) and would be wrong on Windows.
 */
function resolveWindowsPaths(entry, exists, env) {
  const { windows, ...base } = entry;
  if (!windows) {
    return { ...base, installed: false, resolutionError: 'no Windows build configured for this browser' };
  }
  const merged = { ...base, ...windows };

  const tried = [];
  for (const raw of candidates(merged.bundlePath)) {
    const expanded = expandEnv(raw, env);
    if (expanded.missing.length) {
      tried.push(`${raw} (unset: ${expanded.missing.join(', ')})`);
      continue;
    }
    const dir = expanded.value;
    if (!exists(dir)) {
      tried.push(dir);
      continue;
    }
    for (const name of candidates(merged.executableName)) {
      const binary = path.win32.join(dir, name);
      if (exists(binary)) return { ...merged, installed: true, bundlePath: dir, binary };
      tried.push(binary);
    }
  }
  return {
    ...merged,
    installed: false,
    resolutionError: tried.length
      ? `not found (tried: ${tried.join(', ')})`
      : 'no bundlePath/executableName configured',
  };
}

/**
 * Resolve a registry entry against the filesystem.
 *
 * @param {object} entry
 * @param {(p: string) => boolean} exists
 * @param {{platform?: string, env?: Record<string, string|undefined>}} [options]
 *   platform defaults to macOS so the result is the same on any host
 * @returns {object} entry plus {installed, binary?, bundlePath?, resolutionError?}
 */
function resolveBrowserPaths(entry, exists, options = {}) {
  if (entry.supported === false) {
    return { ...entry, installed: false, resolutionError: 'unsupported' };
  }
  if (options.platform === 'win32') {
    return resolveWindowsPaths(entry, exists, options.env || process.env);
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
 * @param {{registryPath?: string, exists?: (p: string) => boolean, platform?: string, env?: object}} [options]
 *   platform defaults to the machine running this process
 * @returns {{browsers: object[], byId: Map<string, object>}}
 */
function loadRegistry(options = {}) {
  const registryPath = options.registryPath || REGISTRY_PATH;
  const exists = options.exists || ((p) => fs.existsSync(p));
  const platform = options.platform || process.platform;
  const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const browsers = raw.browsers.map((entry) =>
    resolveBrowserPaths(entry, exists, { platform, env: options.env })
  );
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

/** The PowerShell that reads one executable's product version. */
function versionScript(binary) {
  return `(Get-Item -LiteralPath ${winps.psQuote(binary)}).VersionInfo.ProductVersion`;
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
 * On Windows the version is the executable's own ProductVersion resource, which
 * is what Chrome, Edge and Blanc stamp with their marketing version.
 *
 * @param {string} bundlePath
 * @param {{platform?: string, binary?: string}} [options]
 * @returns {Promise<string|null>}
 */
function bundleVersion(bundlePath, options = {}) {
  if (options.platform === 'win32') {
    if (!options.binary) return Promise.resolve(null);
    return winps
      .runPowerShell(versionScript(options.binary))
      .then((r) => (r.ok ? r.stdout.trim() || null : null));
  }
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

module.exports = {
  REGISTRY_PATH,
  resolveBrowserPaths,
  loadRegistry,
  selectBrowsers,
  versionScript,
  bundleVersion,
};
