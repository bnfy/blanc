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
const { sampleUntilSettled } = require('./lib/settle');
const { buildMarkdown } = require('./lib/report');
const { formatBytes, summarize } = require('./lib/stats');

const WORKLOADS_PATH = path.join(__dirname, 'workloads.json');

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
`;

function parseArgs(argv) {
  const options = {
    browsers: null,
    workloads: ['baseline', 'mixed'],
    reps: 3,
    backend: null,
    out: path.join(__dirname, 'results'),
    registry: null,
    settleMax: 120_000,
    settleInterval: 5000,
    keepProfiles: false,
    dryRun: false,
    probe: false,
    list: false,
    help: false,
  };
  for (const arg of argv) {
    const [key, rawValue] = arg.startsWith('--') ? arg.slice(2).split('=') : [arg, undefined];
    const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    switch (key) {
      case 'browsers': options.browsers = list(rawValue); break;
      case 'workloads': options.workloads = list(rawValue); break;
      case 'reps': options.reps = Number(rawValue); break;
      case 'backend': options.backend = rawValue; break;
      case 'out': options.out = rawValue; break;
      case 'registry': options.registry = rawValue; break;
      case 'settle-max': options.settleMax = Number(rawValue); break;
      case 'settle-interval': options.settleInterval = Number(rawValue); break;
      case 'keep-profiles': options.keepProfiles = true; break;
      case 'dry-run': options.dryRun = true; break;
      case 'probe': options.probe = true; break;
      case 'list': options.list = true; break;
      case 'help': case 'h': options.help = true; break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isInteger(options.reps) || options.reps < 1) {
    throw new Error('--reps must be a positive integer');
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

/** One measured cell: launch, sample until settled, quit. */
async function runCell({ browser, workload, urls, backend, preExistingPids, options, log }) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-bench-${browser.id}-`));

  // Creating the directory up front is load-bearing, not incidental: a packaged
  // Blanc copies a legacy ~/Library/Application Support/Bowser profile into any
  // userData path that does not exist yet (main.js:153). An empty directory
  // that already exists suppresses that, keeping the tester's real history,
  // favourites and restorable session out of the benchmark.
  fs.mkdirSync(profileDir, { recursive: true });
  if (browser.family === 'blanc') {
    seedBlancProfile(profileDir, { adblockEnabled: browser.requiresProfileSeed !== 'adblockDisabled' });
  }

  let launched = null;
  try {
    launched = await launcher.launch(browser, { profileDir, urls });

    const read = async () => {
      const rows = await proctree.snapshot();
      const pids = proctree.browserProcessSet(rows, {
        rootPid: launched.pid,
        bundlePath: browser.bundlePath,
        excludePids: preExistingPids,
      });
      const { totalBytes } = await measure.sampleTotal(backend, pids);
      read.lastProcessCount = pids.length;
      return totalBytes;
    };

    const { series, settled, elapsedMs } = await sampleUntilSettled(read, {
      intervalMs: options.settleInterval,
      maxMs: options.settleMax,
      onSample: (value, index) =>
        log(`      sample ${index}: ${formatBytes(value)} (${read.lastProcessCount} procs)`),
    });

    if (!launcher.isAlive(launched.pid)) {
      throw new Error(`${browser.label} exited before it could be measured`);
    }

    return {
      // Median of the settled window rather than the single final sample: once
      // the series is flat those samples are equivalent, and taking the median
      // costs nothing while removing one sample's worth of jitter.
      totalBytes: summarize(series.slice(-3)).median,
      processCount: read.lastProcessCount,
      settled,
      elapsedMs,
      series,
      tabCount: launched.tabCount,
    };
  } finally {
    if (launched) await launcher.quit(launched.pid);
    if (!options.keepProfiles) {
      for (const dir of [profileDir, `${profileDir}-Dev`]) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

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
    return;
  }

  const workloadsFile = JSON.parse(fs.readFileSync(WORKLOADS_PATH, 'utf8'));
  for (const key of options.workloads) {
    if (!workloadsFile.workloads[key]) throw new Error(`Unknown workload: ${key}`);
  }

  const { selected, skipped } = registry.selectBrowsers(browsers, options.browsers);
  if (!selected.length) throw new Error('No runnable browsers found. Try --list.');

  const plan = buildPlan(selected, options.workloads, options.reps);

  if (options.dryRun) {
    log(`Plan: ${plan.length} cells — ${selected.length} browsers × ${options.workloads.length} workloads × ${options.reps} reps`);
    for (const cell of plan) log(`  rep ${cell.rep + 1}  ${cell.workload.padEnd(10)} ${cell.browserId}`);
    if (skipped.length) log(`\nSkipped: ${skipped.map((s) => s.id).join(', ')}`);
    return;
  }

  const backend = await measure.selectBackend({ only: options.backend });
  log(`Measuring with ${backend.id} (${backend.metric})\n`);

  // Everything alive right now belongs to the tester, not to us.
  const preExistingPids = new Set((await proctree.snapshot()).map((r) => r.pid));

  const cells = new Map();
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
        preExistingPids,
        options,
        log,
      });
      log(`      → ${formatBytes(outcome.totalBytes)}${outcome.settled ? '' : ' (never settled)'}\n`);
    } catch (error) {
      log(`      ✗ ${error.message}\n`);
      continue;
    }

    const key = `${cell.browserId}::${cell.workload}`;
    if (!cells.has(key)) {
      cells.set(key, {
        browserId: browser.id,
        label: browser.label,
        engine: browser.engine,
        blocking: browser.blocking,
        workload: cell.workload,
        workloadLabel: workload.label,
        workloadDescription: workload.description,
        tabCount: outcome.tabCount,
        extraBlankTabs: browser.extraBlankTabs || 0,
        metric: backend.metric,
        backend: backend.id,
        repetitions: [],
      });
    }
    cells.get(key).repetitions.push(outcome);
  }

  const results = [...cells.values()].filter((r) => r.repetitions.length);
  if (!results.length) throw new Error('Every cell failed; nothing to report.');

  const report = {
    meta: {
      startedAt: new Date().toISOString(),
      osVersion: os.release(),
      arch: os.arch(),
      totalRamGiB: Math.round(os.totalmem() / 1024 ** 3),
      backend: backend.id,
      metric: backend.metric,
      repetitions: options.reps,
      workloads: options.workloads,
      skipped,
    },
    results,
  };

  fs.mkdirSync(options.out, { recursive: true });
  const stamp = report.meta.startedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(options.out, `memory-${stamp}.json`);
  const mdPath = path.join(options.out, `memory-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, buildMarkdown(report));

  log('\nSummary');
  for (const result of results) {
    const stats = summarize(result.repetitions.map((r) => r.totalBytes));
    log(`  ${result.workload.padEnd(10)} ${result.label.padEnd(24)} ${formatBytes(stats.median)}`);
  }
  log(`\nWrote ${jsonPath}`);
  log(`Wrote ${mdPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, rotate, buildPlan, seedBlancProfile };
