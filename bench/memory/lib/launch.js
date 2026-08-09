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
  const prefs = [
    ['browser.startup.page', 1],
    ['browser.startup.homepage', urls.join('|')],
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
    const args = [
      '--profile', profileDir,
      '--no-remote',
      '--new-instance',
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

  const child = spawn(bin, plan.args, {
    stdio: 'ignore',
    // Keep it in our process group so an aborted run cannot orphan a browser
    // holding a gigabyte of the tester's RAM.
    detached: false,
  });
  child.on('error', () => {}); // surfaced by the caller's liveness check instead

  return { pid: child.pid, child, tabCount: plan.tabCount, argv: [bin, ...plan.args] };
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
  buildLaunchPlan,
  executablePath,
  launch,
  isAlive,
  quit,
};
