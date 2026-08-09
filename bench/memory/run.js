#!/usr/bin/env node
// Browser memory benchmark runner.
//
//   node bench/memory/run.js --help
//
// Measures the phys_footprint of each browser's entire process tree after
// loading an identical set of pages, repeated, with the browsers interleaved so
// that drift in the live web is spread evenly across them rather than
// concentrated on whichever one ran last.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const measure = require('./lib/measure');
const proctree = require('./lib/proctree');
const registry = require('./lib/registry');
const launcher = require('./lib/launch');
const pageload = require('./lib/pageload');
const { sampleUntilSettled } = require('./lib/settle');
const { buildMarkdown } = require('./lib/report');
const { formatBytes, summarize } = require('./lib/stats');

const WORKLOADS_PATH = path.join(__dirname, 'workloads.json');

// A loaded cell must sit meaningfully above the same browser's own idle
// baseline. Ten real pages cost far more than 15%; a browser that never loaded
// them sits at roughly idle. See verifyLoaded().
const MIN_LOAD_GROWTH = 0.15;

// Every browser in the registry is multi-process even sitting at a start page.
// A tree smaller than this means process attribution failed, not that the
// browser is frugal — and the difference is an undercount either way.
const MIN_PROCESSES = 2;

// How many trailing samples the reported figure is taken from. The readability
// checks below cover exactly this window, because these are the samples the
// median is computed over.
const REPORTED_WINDOW = 3;

const USAGE = `
Browser memory benchmark (macOS)

  node bench/memory/run.js [options]

Options
  --browsers=a,b        Browser ids to run (default: every installed one)
  --workloads=a,b       Workload keys (default: baseline,mixed)
  --reps=N              Repetitions per cell (default: 3)
  --backend=id          Force a measurement backend: footprint|vmmap|top|ps
  --out=DIR             Output directory (default: bench/memory/results)
  --settle-max=MS       Give up waiting for settle after this long (default: 120000)
  --settle-interval=MS  Sampling interval (default: 5000)
  --warm=BOOL           Warm a template profile per browser first (default: true)
  --registry=PATH       Alternate browsers.json (testing the harness itself)
  --keep-profiles       Do not delete the throwaway profiles (for debugging)
  --dry-run             Print the plan and exit without launching anything
  --probe               Report which measurement backend works here, and exit
  --list                List registry entries and whether they are installed
  --help

Notes
  Run against the packaged /Applications/Blanc.app, never a dev run: an
  unpackaged Blanc appends "-Dev" to its userData path (main.js:144) and
  behaves differently from what ships.

  Quit your everyday browsers first. Pre-existing processes are excluded from
  the totals, but their memory pressure still perturbs the machine.

  Do NOT run the whole harness under sudo: it would launch every browser as
  root, which is not the configuration anyone uses. If the backend cannot read
  hardened browser processes the run aborts on the first cell and says so.
`;

function parseArgs(argv) {
  const options = {
    browsers: null,
    workloads: ['baseline', 'mixed'],
    reps: 3,
    backend: null,
    out: path.join(__dirname, 'results'),
    settleMax: 120_000,
    settleInterval: 5000,
    warm: true,
    registry: null,
    keepProfiles: false,
    dryRun: false,
    probe: false,
    list: false,
    help: false,
  };
  const positive = (value, flag) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${flag} must be a positive number`);
    return n;
  };
  for (const arg of argv) {
    const [key, rawValue] = arg.startsWith('--') ? arg.slice(2).split('=') : [arg, undefined];
    const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    switch (key) {
      case 'browsers': options.browsers = list(rawValue); break;
      case 'workloads': options.workloads = list(rawValue); break;
      case 'reps': {
        const n = Number(rawValue);
        if (!Number.isInteger(n) || n <= 0) throw new Error('--reps must be a positive integer');
        options.reps = n;
        break;
      }
      case 'backend': options.backend = rawValue; break;
      case 'out': options.out = rawValue; break;
      case 'settle-max': options.settleMax = positive(rawValue, 'settle-max'); break;
      case 'settle-interval': options.settleInterval = positive(rawValue, 'settle-interval'); break;
      case 'warm': options.warm = rawValue !== 'false' && rawValue !== '0'; break;
      case 'registry': options.registry = rawValue; break;
      case 'keep-profiles': options.keepProfiles = true; break;
      case 'dry-run': options.dryRun = true; break;
      case 'probe': options.probe = true; break;
      case 'list': options.list = true; break;
      case 'help': case 'h': options.help = true; break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.settleInterval >= options.settleMax) {
    throw new Error('--settle-interval must be smaller than --settle-max');
  }
  return options;
}

/**
 * Rotate the browser order by repetition index.
 *
 * Running the same browser first every time hands it a systematically colder
 * cache and a systematically earlier snapshot of whatever the ad networks are
 * serving today. Rotating spreads that bias evenly.
 */
function rotate(items, by) {
  if (!items.length) return [];
  const offset = ((by % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/** The full ordered list of (rep, workload, browser) cells a run will execute. */
function buildPlan(browsers, workloadKeys, reps) {
  const plan = [];
  for (let rep = 0; rep < reps; rep += 1) {
    for (const workload of workloadKeys) {
      for (const browser of rotate(browsers, rep)) {
        plan.push({ rep, workload, browserId: browser.id });
      }
    }
  }
  return plan;
}

/**
 * Order the requested workloads so 'baseline' runs first, and add it if the
 * caller left it out.
 *
 * The baseline is not optional. Load verification compares a loaded cell
 * against the same browser's idle baseline, so without one every loaded row is
 * unverifiable — and an unverifiable row that gets published anyway is exactly
 * the hole this closes. Baseline cells are also the cheapest in the matrix.
 */
function orderWorkloads(keys) {
  const rest = keys.filter((k) => k !== 'baseline');
  return rest.length ? ['baseline', ...rest] : keys.slice();
}

/**
 * Baselines are keyed per browser AND per repetition.
 *
 * Reusing repetition 1's baseline for every later repetition compares a cell
 * measured 30 minutes later against an idle figure from the start of the run,
 * across whatever the machine drifted through in between. Worse, it makes the
 * error one-directional and invisible: if repetition 1's baseline came out low,
 * every later repetition's growth ratio is inflated and understated cells sail
 * through the check; if it came out high, good cells fail for no reason.
 *
 * Baselines run first within each repetition, so a same-repetition baseline is
 * always available by the time a loaded cell needs it.
 */
const baselineKey = (browserId, rep) => `${browserId}::rep${rep}`;

/**
 * Summarize the trailing samples the reported median is computed from.
 *
 * Checking only the final sample would let an undercounted sample sit inside
 * the reported median while the check passed on a later, fully-readable one.
 * The process count is the window's minimum for the same reason: a tree that
 * was briefly incomplete must not be papered over by a later sample.
 *
 * @param {Array<{processCount: number, missing: number}>} meta
 * @param {number} [windowSize]
 * @returns {{unreadable: number, processCount: number}}
 */
function summarizeWindow(meta, windowSize = REPORTED_WINDOW) {
  const window = (meta || []).slice(-windowSize);
  if (!window.length) return { unreadable: 0, processCount: 0 };
  return {
    unreadable: window.reduce((sum, m) => sum + (m.missing || 0), 0),
    processCount: Math.min(...window.map((m) => m.processCount || 0)),
  };
}

/**
 * Did this cell actually load its pages?
 *
 * This is the harness's defence against every variant of "the browser did not
 * do what we assumed": Blanc gating navigation behind its ad-blocker build, a
 * vendor's welcome tab stealing the argv URLs, a Gecko fork ignoring the
 * startup homepage, a browser refusing --user-data-dir. All of them produce the
 * same artifact — a well-formed, settled, correctly-attributed row that is
 * simply wrong, and wrong in the flattering direction, because a browser that
 * rendered nothing uses very little memory.
 *
 * Rather than encoding a guess about any one browser, compare the cell against
 * that browser's own idle baseline. Ten real pages cost far more than 15%; a
 * browser sitting at its start page does not.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function verifyLoaded({ workload, totalBytes, processCount, baseline, pages }) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return { ok: false, reason: 'measured 0 bytes — the backend read nothing' };
  }
  // Every browser in the registry is multi-process even at idle, so a tree of
  // one means attribution failed, not that the browser is frugal. This is an
  // absolute floor, deliberately not a claim about how process counts scale:
  // preallocated content-process counts vary between engines and versions, so
  // any comparative process-count rule would be unsound.
  if (!Number.isFinite(processCount) || processCount < MIN_PROCESSES) {
    return {
      ok: false,
      reason:
        `only ${processCount} process(es) attributed to this browser — every browser ` +
        'here is multi-process even at idle, so the tree was not found and the total ' +
        'is an undercount',
    };
  }

  // The idle baseline is not exempt: it is the subtrahend of the per-page
  // column and the denominator of the growth net below, so understating it
  // both inflates per-page cost and makes an understated loaded cell pass.
  // Its floors are the two above; it has no pages to check.
  if (workload === 'baseline') return { ok: true };

  // The authoritative check: what the browser itself recorded visiting.
  // Everything else here is a net under it.
  if (!pages || !pages.ok) {
    const detail = pages && pages.reason
      ? pages.reason
      : `${pages ? pages.loaded : 0} of ${pages ? pages.requested : '?'} requested pages ` +
        `were visited (missing: ${pages && pages.missing ? pages.missing.join(', ') : 'unknown'})`;
    return { ok: false, reason: `load not confirmed — ${detail}` };
  }

  if (!baseline || !Number.isFinite(baseline.bytes) || baseline.bytes <= 0) {
    return {
      ok: false,
      reason:
        'no idle baseline for this repetition, so per-page cost cannot be computed — ' +
        'its baseline cell must have failed, and an unverified row is not publishable',
    };
  }

  // Secondary net. Page observation proves navigation happened; it does not
  // prove the pages rendered. A total sitting at idle after ten confirmed
  // navigations means something else is wrong.
  const growth = totalBytes / baseline.bytes - 1;
  if (growth < MIN_LOAD_GROWTH) {
    return {
      ok: false,
      reason:
        `${pages.loaded} pages were visited but the total is only ` +
        `${(growth * 100).toFixed(0)}% above this repetition's idle baseline ` +
        `(${formatBytes(baseline.bytes)}) — navigations were recorded but nothing rendered`,
    };
  }
  return { ok: true };
}

/**
 * Seed a Blanc profile so a fresh run starts in the state a real install is in
 * after its first launch, rather than on the first-run consent screen.
 *
 * `onboardingVersion` matches FIRST_RUN_VERSION in src/main/settings.js. This is
 * Blanc's equivalent of the --no-first-run flag the Chromium browsers get.
 */
function seedBlancProfile(profileDir, { adblockEnabled }) {
  const settings = { onboardingVersion: 1, adblockEnabled, usagePing: false };
  // Both the plain path and the "-Dev" sibling: an unpackaged Blanc relocates
  // its userData to `<dir>-Dev` (main.js:144), and seeding both means a
  // mistakenly-benchmarked dev build fails loudly on its numbers rather than
  // silently on an unexpected first-run screen.
  for (const dir of [profileDir, `${profileDir}-Dev`]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
  }
}

/**
 * Prepare a profile directory for a cell.
 *
 * Creating the directory up front is load-bearing, not incidental: a packaged
 * Blanc copies a legacy ~/Library/Application Support/Bowser profile into any
 * userData path that does not exist yet (main.js:153). An empty directory that
 * already exists suppresses that, keeping the tester's real history, favourites
 * and restorable session out of the benchmark.
 */
function prepareProfile(browser, template) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-bench-${browser.id}-`));
  if (template && fs.existsSync(template)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.cpSync(template, profileDir, { recursive: true });
  }
  fs.mkdirSync(profileDir, { recursive: true });

  if (browser.family === 'blanc') {
    seedBlancProfile(profileDir, { adblockEnabled: browser.requiresProfileSeed !== 'adblockDisabled' });
  } else if (browser.requiresProfileSeed) {
    // Only the blanc family knows how to honour a seed today. A registry entry
    // asking for one it cannot get would otherwise run with the opposite
    // configuration under a label claiming the seed took effect — e.g. a
    // "brave-noshields" row measured with Shields on.
    throw new Error(
      `${browser.label} requests profile seed "${browser.requiresProfileSeed}" but ` +
        `the ${browser.family} family has no seeding support`
    );
  }
  return profileDir;
}

function removeProfile(profileDir) {
  for (const dir of [profileDir, `${profileDir}-Dev`]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Every browser this process has launched and not yet reaped, so a Ctrl-C
// cannot leave several gigabytes of browser running against a profile
// directory we are about to delete.
const liveLaunches = new Set();

async function reapAll() {
  for (const entry of [...liveLaunches]) {
    await launcher.quit(entry.pid, { pids: entry.pids, graceMs: 3000 });
    liveLaunches.delete(entry);
  }
}

/** One measured cell: launch, sample until settled, verify, quit. */
async function runCell({ browser, workload, urls, backend, options, log, baselineFor, onFirstLaunch }) {
  // Re-snapshot immediately before launching rather than once per run: over a
  // 40-minute matrix the tester's own browser spawns and reaps renderers
  // constantly, and a stale snapshot would attribute those to us.
  const preExistingPids = new Set((await proctree.snapshot()).map((r) => r.pid));
  const profileDir = prepareProfile(browser, options.templates && options.templates.get(browser.id));

  let launched = null;
  let tabCount = 0;
  const entry = { pid: null, pids: [] };
  try {
    launched = await launcher.launch(browser, { profileDir, urls });
    entry.pid = launched.pid;
    tabCount = launched.tabCount;
    liveLaunches.add(entry);

    // Fail fast if the browser died on startup, rather than burning the whole
    // settle window sampling a corpse.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!launcher.isAlive(launched.pid)) {
      throw new Error('exited immediately after launch');
    }

    if (onFirstLaunch) await onFirstLaunch(launched.pid);

    // Per-sample metadata, index-aligned with `series`. Recording it per sample
    // rather than keeping only the latest is what makes the readability check
    // below cover the same samples the reported median is computed from.
    const meta = [];
    const read = async () => {
      const rows = await proctree.snapshot();
      const pids = proctree.browserProcessSet(rows, {
        rootPid: launched.pid,
        bundlePath: browser.bundlePath,
        excludePids: preExistingPids,
      });
      entry.pids = pids;
      const { totalBytes, missing } = await measure.sampleTotal(backend, pids);
      meta.push({ processCount: pids.length, missing: missing.length });
      return totalBytes;
    };

    const { series, settled, elapsedMs } = await sampleUntilSettled(read, {
      intervalMs: options.settleInterval,
      maxMs: options.settleMax,
      onSample: (value, index) =>
        log(`      sample ${index}: ${formatBytes(value)} (${meta[index - 1].processCount} procs)`),
    });

    if (!launcher.isAlive(launched.pid)) {
      throw new Error('exited before it could be measured');
    }

    // A tree we could only partially read is not a total.
    const { unreadable, processCount } = summarizeWindow(meta);
    if (unreadable) {
      throw new Error(
        `${unreadable} process reading(s) across the reported window were unreadable by ` +
          `the ${backend.id} backend — the total would be an undercount`
      );
    }

    const totalBytes = summarize(series.slice(-REPORTED_WINDOW)).median;

    // Quit before reading the visit log: pending writes and any WAL only flush
    // on exit, and the log is the authoritative evidence of what loaded.
    await launcher.quit(launched.pid, { pids: entry.pids });
    liveLaunches.delete(entry);
    launched = null;

    const pages = pageload.observeLoadedPages(browser, profileDir, urls);
    if (urls.length) {
      log(`      pages visited: ${pages.loaded}/${pages.requested}` +
        (pages.missing.length ? ` (missing: ${pages.missing.join(', ')})` : ''));
    }

    const verdict = verifyLoaded({
      workload,
      totalBytes,
      processCount,
      baseline: baselineFor,
      pages,
    });
    if (!verdict.ok) throw new Error(verdict.reason);

    return {
      totalBytes,
      processCount,
      settled,
      elapsedMs,
      series,
      tabCount,
      pagesLoaded: pages.loaded,
      pagesRequested: pages.requested,
    };
  } finally {
    if (launched) {
      await launcher.quit(launched.pid, { pids: entry.pids });
      liveLaunches.delete(entry);
    }
    if (!options.keepProfiles) removeProfile(profileDir);
  }
}

/**
 * Build a warmed template profile for a browser.
 *
 * Every measured cell starts from a fresh copy of this, so no cell is racing a
 * one-time setup cost. That matters most for Blanc, which gates all navigation
 * until it has fetched and compiled EasyList+EasyPrivacy (main.js:226, 3751) —
 * on a cold profile that gate is open during the entire sampling window. But
 * the Chromium browsers download component blocklists on first run too, so
 * warming is applied to everyone rather than special-casing one product.
 */
async function warmTemplate(browser, options, log) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-bench-warm-${browser.id}-`));
  fs.mkdirSync(dir, { recursive: true });
  if (browser.family === 'blanc') {
    seedBlancProfile(dir, { adblockEnabled: browser.requiresProfileSeed !== 'adblockDisabled' });
  }
  log(`  warming ${browser.label}…`);
  const launched = await launcher.launch(browser, { profileDir: dir, urls: [] });
  const entry = { pid: launched.pid, pids: [] };
  liveLaunches.add(entry);
  await new Promise((resolve) => setTimeout(resolve, options.warmMs || 45_000));
  await launcher.quit(launched.pid);
  liveLaunches.delete(entry);
  // Let the profile's own writes flush before it is used as a copy source.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return dir;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const startedAt = new Date().toISOString();
  const log = (message) => process.stdout.write(`${message}\n`);
  const { browsers } = registry.loadRegistry({ registryPath: options.registry });

  if (options.list) {
    for (const b of browsers) {
      log(`${b.installed ? '✓' : '·'} ${b.id.padEnd(14)} ${b.label.padEnd(22)} ${b.installed ? b.binary : b.resolutionError}`);
    }
    return;
  }

  if (process.platform !== 'darwin' && !options.dryRun) {
    throw new Error(
      `This benchmark measures macOS phys_footprint and only runs on darwin (this is ${process.platform}). ` +
        'Use --dry-run to validate the plan elsewhere.'
    );
  }

  if (options.probe) {
    const backend = await measure.selectBackend({ only: options.backend });
    log(`backend: ${backend.id}\nmetric:  ${backend.metric}\n${backend.description}`);
    log(
      '\nNote: this probed our own Node process. Whether it can read a hardened,\n' +
        'signed browser is only established on the first real cell, which aborts\n' +
        'the run if it cannot.'
    );
    return;
  }

  const workloadsFile = JSON.parse(fs.readFileSync(WORKLOADS_PATH, 'utf8'));
  for (const key of options.workloads) {
    if (!workloadsFile.workloads[key]) throw new Error(`Unknown workload: ${key}`);
  }
  const workloadKeys = orderWorkloads(options.workloads);
  if (!workloadKeys.length) throw new Error('No workloads selected.');
  if (!options.workloads.includes('baseline') && workloadKeys.includes('baseline')) {
    log('Added the "baseline" workload: load verification and the per-page column both require it.\n');
  }

  const { selected, skipped } = registry.selectBrowsers(browsers, options.browsers);
  if (!selected.length) throw new Error('No runnable browsers found. Try --list.');

  // Preflight rather than per-cell: a run that cannot read visit logs cannot
  // verify anything, and finding that out after launching browsers for forty
  // minutes would waste the whole matrix.
  const readable = pageload.checkReadable(selected);
  if (!readable.ok && !options.dryRun) {
    throw new Error(`Load verification is unavailable: ${readable.reason}`);
  }

  const plan = buildPlan(selected, workloadKeys, options.reps);

  if (options.dryRun) {
    log(`Plan: ${plan.length} cells — ${selected.length} browsers × ${workloadKeys.length} workloads × ${options.reps} reps`);
    for (const cell of plan) log(`  rep ${cell.rep + 1}  ${cell.workload.padEnd(10)} ${cell.browserId}`);
    if (skipped.length) log(`\nSkipped: ${skipped.map((s) => s.id).join(', ')}`);
    return;
  }

  const backend = await measure.selectBackend({ only: options.backend });
  log(`Measuring with ${backend.id} (${backend.metric})\n`);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      log('\nInterrupted — reaping browsers…');
      reapAll().finally(() => process.exit(130));
    });
  }

  // Captured before anything runs: a memory number is not citable without the
  // build it came from, and it is the only way to notice a nightly published
  // under a stable label.
  const versions = new Map();
  for (const browser of selected) {
    versions.set(browser.id, await registry.bundleVersion(browser.bundlePath));
  }

  options.templates = new Map();
  if (options.warm) {
    for (const browser of selected) {
      options.templates.set(browser.id, await warmTemplate(browser, options, log));
    }
    log('');
  }

  // Established once, against the first browser actually launched: selection
  // could only probe our own unhardened Node process.
  let backendValidated = false;
  const validateBackend = async (pid) => {
    if (backendValidated) return;
    backendValidated = true;
    if (await measure.canReadPid(backend, pid)) return;
    throw new Error(
      `The ${backend.id} backend cannot read browser process ${pid}. Browsers ship a ` +
        'hardened runtime and deny task_for_pid to unprivileged callers, so every ' +
        'measurement would be zero.\n' +
        'Fix: re-run with --backend=ps (RSS, indicative only, clearly marked ' +
        'unpublishable in the report), or grant the measurement tool the access it ' +
        'needs. Do NOT run the whole harness under sudo — that launches every ' +
        'browser as root, which is not the configuration anyone uses.'
    );
  };

  const cells = new Map();
  const failures = [];
  const baselineByBrowser = new Map();
  let done = 0;

  for (const cell of plan) {
    const browser = selected.find((b) => b.id === cell.browserId);
    const workload = workloadsFile.workloads[cell.workload];
    done += 1;
    log(`[${done}/${plan.length}] rep ${cell.rep + 1} · ${workload.label} · ${browser.label}`);

    let outcome;
    try {
      outcome = await runCell({
        browser,
        workload: cell.workload,
        urls: workload.urls,
        backend,
        options,
        log,
        baselineFor: baselineByBrowser.get(baselineKey(browser.id, cell.rep)),
        onFirstLaunch: validateBackend,
      });
      log(`      → ${formatBytes(outcome.totalBytes)}${outcome.settled ? '' : ' (never settled)'}\n`);
    } catch (error) {
      // A backend that cannot read browsers makes every remaining cell
      // pointless; anything else is a per-cell failure worth recording.
      if (/cannot read browser process/.test(error.message)) throw error;
      log(`      ✗ ${error.message}\n`);
      failures.push({
        browserId: browser.id,
        label: browser.label,
        workload: cell.workload,
        rep: cell.rep + 1,
        reason: error.message,
      });
      continue;
    }

    if (cell.workload === 'baseline') {
      baselineByBrowser.set(baselineKey(browser.id, cell.rep), {
        bytes: outcome.totalBytes,
        processCount: outcome.processCount,
      });
    }

    const key = `${cell.browserId}::${cell.workload}`;
    if (!cells.has(key)) {
      cells.set(key, {
        browserId: browser.id,
        label: browser.label,
        engine: browser.engine,
        version: versions.get(browser.id) || null,
        bundlePath: browser.bundlePath,
        blocking: browser.blocking,
        blockingClass: browser.blockingClass || 'unknown',
        notes: browser.notes || [],
        workload: cell.workload,
        workloadLabel: workload.label,
        workloadDescription: workload.description,
        workloadPages: workload.urls.length,
        tabCount: outcome.tabCount,
        extraBlankTabs: browser.extraBlankTabs || 0,
        metric: backend.metric,
        backend: backend.id,
        repetitions: [],
      });
    }
    cells.get(key).repetitions.push(outcome);
  }

  if (options.warm && !options.keepProfiles) {
    for (const dir of options.templates.values()) removeProfile(dir);
  }

  const results = [...cells.values()].filter((r) => r.repetitions.length);
  if (!results.length) {
    throw new Error(
      'Every cell failed; nothing to report.' +
        (failures.length ? `\nFirst failure: ${failures[0].reason}` : '')
    );
  }

  // A browser that was asked for and produced nothing is a failed run, not a
  // successful run with fewer columns. Without this, `--browsers=blanc,zen`
  // where every Zen cell dies exits 0 with a clean-looking Blanc-only table,
  // and a reader months later cannot tell that from "Zen was never requested".
  const measured = new Set(results.map((r) => r.browserId));
  const silent = selected.filter((b) => !measured.has(b.id));

  const report = {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      osVersion: os.release(),
      arch: os.arch(),
      totalRamGiB: Math.round(os.totalmem() / 1024 ** 3),
      backend: backend.id,
      metric: backend.metric,
      repetitions: options.reps,
      requestedRepetitions: options.reps,
      workloads: workloadKeys,
      warmedProfiles: options.warm,
      skipped,
      failures,
    },
    results,
  };

  fs.mkdirSync(options.out, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(options.out, `memory-${stamp}.json`);
  const mdPath = path.join(options.out, `memory-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(report));

  log('\nSummary');
  for (const result of results) {
    const stats = summarize(result.repetitions.map((r) => r.totalBytes));
    const short = result.repetitions.length < options.reps
      ? ` (${result.repetitions.length}/${options.reps} reps)`
      : '';
    log(`  ${result.workload.padEnd(10)} ${result.label.padEnd(24)} ${formatBytes(stats.median)}${short}`);
  }
  if (failures.length) log(`\n${failures.length} cell(s) failed — see the report's Failed cells section.`);
  log(`\nWrote ${jsonPath}`);
  log(`Wrote ${mdPath}`);

  if (silent.length) {
    throw new Error(
      `${silent.map((b) => b.label).join(', ')} produced no measurement at all. ` +
        'The report above is incomplete — see its Failed cells section.'
    );
  }
}

if (require.main === module) {
  // `bench:memory -- --list | head` closes the pipe early; a benchmark runner
  // should exit quietly there rather than print a stack trace.
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
  main()
    .catch(async (error) => {
      await reapAll();
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  rotate,
  buildPlan,
  orderWorkloads,
  seedBlancProfile,
  verifyLoaded,
  summarizeWindow,
  baselineKey,
  prepareProfile,
  MIN_LOAD_GROWTH,
  MIN_PROCESSES,
  REPORTED_WINDOW,
};
