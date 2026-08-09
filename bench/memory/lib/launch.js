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
 *  telemetry pings from adding tabs or background work mid-measurement. */
function geckoUserJs(urls) {
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
  ];
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
    const files = [{ path: path.join(profileDir, 'user.js'), contents: geckoUserJs(urls) }];
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
 * Ask a browser to exit, then insist. The profile is disposable, so a hard kill
 * after the grace period costs nothing and keeps a wedged browser from stalling
 * a long matrix run.
 */
async function quit(pid, { graceMs = 8000, pollMs = 250 } = {}) {
  if (!pid || !isAlive(pid)) return { killed: false };
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return { killed: false };
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return { killed: false };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
  return { killed: true };
}

module.exports = {
  geckoUserJs,
  buildLaunchPlan,
  executablePath,
  launch,
  isAlive,
  quit,
};
