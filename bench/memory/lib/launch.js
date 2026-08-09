// Per-engine launch drivers.
//
// Every browser gets: a throwaway profile directory, the same URL set, and no
// flags that would change its process model. That last constraint is why there
// is no --disable-gpu, --single-process or --disable-extensions here — each of
// those would move the memory number by a large margin and turn the comparison
// into a measurement of our own flags.
//
// Opening N tabs is the part that genuinely differs by engine:
//
//   chromium  positional URLs open one tab each. Straightforward.
//   gecko     positional URLs do NOT reliably open more than the first tab, so
//             the tab set is seeded through the profile's own user.js as a
//             pipe-separated startup homepage — Gecko's documented way of
//             restoring several tabs at startup, and deterministic.
//   blanc     urlsFromArgv() in src/main/main.js maps each http(s) argument
//             through openExternalUrl() -> createTab(), so positional URLs
//             behave like Chromium's. Note main.js also creates one
//             blanc://newtab at startup, so Blanc ends on N+1 tabs; the
//             registry records that as extraBlankTabs and the report discloses
//             it rather than quietly comparing N against N+1.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** Prefs shared by every Gecko profile: keep first-run pages, update checks and
 *  telemetry pings from adding tabs or background work mid-measurement.
 *
 *  `extraPrefs` comes from the registry entry and is applied last (last write
 *  wins in user.js), so a fork shipping its own onboarding — Zen's welcome flow
 *  is separate from Mozilla's about:welcome and untouched by
 *  browser.aboutwelcome.enabled — can suppress it with a JSON edit. Without
 *  this hook the registry's "adding a browser is a JSON edit" contract is false
 *  for any Gecko fork whose first-run surface is not Mozilla's. */
function geckoUserJs(urls, extraPrefs = {}) {
  // A leading about:blank absorbs whatever the browser does to the first
  // startup tab. Zen replaces it with its own workspace/new-tab surface, so the
  // first workload URL was silently dropped — observed twice, deterministically,
  // always the first entry, with a fully settled process tree. Firefox gets the
  // same treatment rather than a Zen-only special case: it keeps the two Gecko
  // browsers structurally identical, which is the point of running Firefox as
  // the control for Zen, and one blank tab costs nothing measurable.
  const startupUrls = urls.length ? ['about:blank', ...urls] : [];
  const prefs = [
    ['browser.startup.page', 1],
    ['browser.startup.homepage', startupUrls.join('|')],
    // Suppress the what's-new / import / default-browser interruptions, each of
    // which would otherwise open an extra tab and skew the tab count.
    ['browser.startup.firstrunSkipsHomepage', false],
    ['browser.aboutwelcome.enabled', false],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionPolicyBypassNotification', true],
    ['browser.sessionstore.resume_from_crash', false],
    ['app.update.auto', false],
    ['browser.tabs.warnOnClose', false],
    // Gecko's tab unloader discards inactive background tabs under memory
    // pressure. Chromium does not act at these timescales, so leaving it live
    // would hand a discount to the Gecko rows alone — and because discarding
    // *helps* the series flatten, settle detection would record it as a clean
    // result rather than as tabs quietly disappearing.
    ['browser.tabs.unloadOnLowMemory', false],
  ];
  for (const [key, value] of Object.entries(extraPrefs)) prefs.push([key, value]);
  return prefs
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n') + '\n';
}

/**
 * Build the argv and profile side effects for a launch, without performing it.
 * Split out from `launch()` so the whole command construction is unit-testable
 * on any platform.
 *
 * @param {object} browser registry entry
 * @param {{profileDir: string, urls: string[]}} context
 * @returns {{args: string[], files: Array<{path: string, contents: string}>, tabCount: number}}
 */
function buildLaunchPlan(browser, context) {
  const { profileDir, urls } = context;
  const extra = Number(browser.extraBlankTabs) || 0;

  if (browser.family === 'chromium' || browser.family === 'blanc') {
    const args = [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(browser.extraArgs || []),
      ...urls,
    ];
    return { args, files: [], tabCount: urls.length + extra };
  }

  if (browser.family === 'gecko') {
    // The leading about:blank in geckoUserJs means a Gecko browser that honours
    // every entry ends on N+1 tabs; one that consumes the first (Zen) ends on N.
    // Either way no workload page is lost, and the per-page column divides by
    // workload pages rather than by this count.
    // Single-dash forms, which are what Mozilla documents, and no
    // `-new-instance`: that option is Linux/Windows-only and macOS Firefox
    // answered this argv with a "Profile Missing — your Firefox profile cannot
    // be loaded" dialog. It earns nothing here either, since `-no-remote`
    // already forces a separate instance and every cell has its own profile
    // directory.
    const args = [
      '-profile', profileDir,
      '-no-remote',
      ...(browser.extraArgs || []),
    ];
    const files = [{
      path: path.join(profileDir, 'user.js'),
      contents: geckoUserJs(urls, browser.extraPrefs || {}),
    }];
    return { args, files, tabCount: urls.length + extra };
  }

  throw new Error(`No launch driver for browser family: ${browser.family}`);
}

/**
 * Files that must not survive being copied out of a warmed template profile.
 *
 * Gecko writes a lock into the profile while it runs, and the warm-up run is
 * ended with a signal rather than a clean menu quit — so the template can carry
 * a lock naming a process that no longer exists. Firefox then rejects the
 * copied profile with "profile cannot be loaded", which is how a browser ends
 * up producing no rows at all while every other family works.
 *
 * `lock` is a symlink on macOS, so unlink rather than anything cleverer.
 *
 * @returns {string[]}
 */
function staleProfileArtifacts(browser, profileDir) {
  if (browser.family !== 'gecko') return [];
  return [
    path.join(profileDir, 'lock'),
    path.join(profileDir, '.parentlock'),
    path.join(profileDir, 'sessionstore.jsonlz4'),
    path.join(profileDir, 'sessionstore-backups'),
  ];
}

/** Absolute path to the executable inside a macOS .app bundle. */
function executablePath(browser) {
  if (browser.binary) return browser.binary;
  if (!browser.bundlePath || !browser.executableName) {
    throw new Error(`Browser ${browser.id} needs either binary, or bundlePath + executableName`);
  }
  return path.join(browser.bundlePath, 'Contents', 'MacOS', browser.executableName);
}

/**
 * Launch a browser with a fresh profile and the given URLs.
 *
 * The process is spawned directly rather than through `open(1)` deliberately:
 * `open` hands off to LaunchServices and returns immediately, leaving us
 * without the root pid that the whole process-tree attribution depends on.
 *
 * @returns {Promise<{pid: number, child: import('node:child_process').ChildProcess, tabCount: number, argv: string[]}>}
 */
async function launch(browser, { profileDir, urls }) {
  const plan = buildLaunchPlan(browser, { profileDir, urls });
  fs.mkdirSync(profileDir, { recursive: true });
  for (const file of plan.files) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.contents);
  }

  const bin = executablePath(browser);
  if (!fs.existsSync(bin)) {
    throw new Error(`${browser.label}: executable not found at ${bin}`);
  }

  // stderr is captured rather than discarded. When a browser refuses to start,
  // its own message is the whole diagnosis — Firefox's "Profile Missing" cost
  // two wrong guesses because the harness was throwing that output away.
  // stdout stays ignored: browsers are chatty there and it says nothing useful.
  const child = spawn(bin, plan.args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    // Keep it in our process group so an aborted run cannot orphan a browser
    // holding a gigabyte of the tester's RAM.
    detached: false,
  });
  child.on('error', () => {}); // surfaced by the caller's liveness check instead

  // Drained continuously so a chatty browser cannot fill the pipe and block,
  // but only the tail is retained.
  let stderr = '';
  const MAX_STDERR = 4000;
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR);
    });
    child.stderr.on('error', () => {});
  }

  return {
    pid: child.pid,
    child,
    tabCount: plan.tabCount,
    argv: [bin, ...plan.args],
    stderr: () => stderr.trim(),
  };
}

/** True while the pid exists and we may signal it. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Ask a browser to exit, then insist — across its whole process tree.
 *
 * Signalling only the root is not enough. A helper whose parent has gone is
 * re-parented to launchd and survives, and because process attribution unions
 * the descendant walk with bundle-path matching, a survivor from one cell is
 * charged to the next cell using the same bundle. That is not hypothetical
 * here: `blanc` and `blanc-noblock` are two registry ids pointing at the same
 * /Applications/Blanc.app, and rotation places them adjacent.
 *
 * `pids` is the process set the caller last measured, so the sweep covers
 * helpers that have already been re-parented away from the root.
 *
 * The profile is disposable, so a hard kill after the grace period costs
 * nothing and keeps a wedged browser from stalling a long matrix run.
 */
async function quit(pid, { pids = [], graceMs = 8000, pollMs = 250 } = {}) {
  const tree = [...new Set([pid, ...pids].filter(Boolean))];
  const alive = () => tree.filter((p) => isAlive(p));
  if (!alive().length) return { killed: false, remaining: [] };

  // Ask the root first: a graceful browser shutdown reaps its own helpers, and
  // signalling helpers directly can make the root treat it as a crash.
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already gone — fall through to the sweep */
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!alive().length) return { killed: false, remaining: [] };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  for (const p of alive()) {
    try {
      process.kill(p, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  // Give the kernel a moment so a caller that immediately re-snapshots does not
  // see the corpses it just reaped.
  await new Promise((resolve) => setTimeout(resolve, 250));
  return { killed: true, remaining: alive() };
}

module.exports = {
  geckoUserJs,
  staleProfileArtifacts,
  buildLaunchPlan,
  executablePath,
  launch,
  isAlive,
  quit,
};
