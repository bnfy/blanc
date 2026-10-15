#!/usr/bin/env node
// Per-process idle-memory attribution for packaged Blanc builds (macOS).
//
// run.js answers "how much does Blanc use"; this answers "which process grew".
// It launches each given Blanc.app exactly as run.js does for the idle
// baseline (seeded profile, warmed template, the same argv, the same settle
// rule) and records every process's phys_footprint plus the category
// breakdown footprint(1) prints for it, instead of only the summed total.
//
// Pass several bundles (for example two mounted public DMGs) to compare
// releases within one session. Bundles are interleaved and rotated per
// repetition like run.js, so machine drift lands evenly.
//
//   node bench/memory/idle-attribution.js \
//     --app=/Volumes/Blanc-1.1.0/Blanc.app=1.1.0 \
//     --app=/Volumes/Blanc-1.34.0/Blanc.app=1.34.0 --reps=3
//
// Renderers carry no URL in their argv, so each is labelled by spawn order
// (renderer 1 is the first launched). Within one release that order is fixed
// by main.js; map it to WebContents with a source read, not by guessing from
// sizes.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const launcher = require('./lib/launch');
const proctree = require('./lib/proctree');
const measure = require('./lib/measure');
const { isCountStable, sampleUntilSettled } = require('./lib/settle');
const { summarize, formatBytes } = require('./lib/stats');
const { seedBlancProfile, rotate } = require('./run');

const USAGE = `Usage: node bench/memory/idle-attribution.js --app=<Blanc.app>[=<label>] ... [options]

  --app=PATH[=LABEL]   A packaged Blanc bundle; repeat to compare releases
  --reps=N             Repetitions per bundle (default 3)
  --warm-ms=MS         Warm-up run length for each template profile (default 45000)
  --noblock            Seed adblockEnabled: false, like the blanc-noblock row
  --sudo               Run footprint(1) through sudo -n, for hardened processes
  --extra-arg=ARG      Append one argv entry to every launch (repeatable), for
                       example --force-device-scale-factor=2 on a non-Retina Mac
  --out=DIR            Output directory (default bench/memory/results)
`;

function parseArgs(argv) {
  const options = { apps: [], reps: 3, warmMs: 45_000, noblock: false, sudo: false, extraArgs: [], out: null };
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'app') {
      const [bundlePath, label] = value.split('=');
      options.apps.push({ bundlePath, label: label || path.basename(path.dirname(bundlePath)) });
    } else if (key === 'reps') options.reps = Number(value);
    else if (key === 'warm-ms') options.warmMs = Number(value);
    else if (key === 'noblock') options.noblock = true;
    else if (key === 'sudo') options.sudo = true;
    else if (key === 'extra-arg') options.extraArgs.push(value);
    else if (key === 'out') options.out = value;
    else if (key === 'help' || key === 'h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function exec(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 20_000 },
      (error, stdout) => resolve({ ok: !error, stdout: stdout || '' }));
  });
}

/**
 * The process's role, from its argv. Renderers get their spawn order later.
 * @param {string} args full `ps -o args=` line
 */
function processKind(args) {
  const type = (args.match(/--type=(\S+)/) || [])[1];
  if (!type) return /crashpad/i.test(args) ? 'crashpad' : 'browser';
  if (type === 'utility') {
    const sub = (args.match(/--utility-sub-type=(\S+)/) || [])[1] || 'unknown';
    return `utility:${sub}`;
  }
  return type;
}

/**
 * Category rows from footprint(1): "Dirty Clean Reclaimable Regions Category".
 * Unrecognised lines are skipped; the total still comes from parseFootprint.
 * @param {string} stdout
 */
function parseFootprintCategories(stdout) {
  const rows = [];
  const size = String.raw`(\d+(?:\.\d+)?\s*(?:[KMGT]i?B|B))`;
  const re = new RegExp(String.raw`^\s*${size}\s+${size}\s+${size}\s+(\d+)\s+(\S.*?)\s*$`);
  for (const line of String(stdout).split('\n')) {
    const m = line.match(re);
    if (!m || /^total$/i.test(m[5])) continue;
    const dirty = measure.parseSizeToBytes(m[1].replace(/\s+/g, ''));
    if (dirty === null) continue;
    rows.push({ category: m[5], dirty, clean: measure.parseSizeToBytes(m[2].replace(/\s+/g, '')) });
  }
  return rows.sort((a, b) => b.dirty - a.dirty);
}

async function footprintOf(pid, { sudo }) {
  const r = sudo
    ? await exec('/usr/bin/sudo', ['-n', '/usr/bin/footprint', '-pid', String(pid)])
    : await exec('/usr/bin/footprint', ['-pid', String(pid)]);
  if (!r.ok) return null;
  const bytes = measure.parseFootprint(r.stdout);
  return bytes === null ? null : { bytes, categories: parseFootprintCategories(r.stdout) };
}

async function argsOf(pids) {
  if (!pids.length) return new Map();
  const r = await exec('/bin/ps', ['-o', 'pid=,args=', '-p', pids.join(',')]);
  const out = new Map();
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (m) out.set(Number(m[1]), m[2]);
  }
  return out;
}

/** Sample every process of one launched tree. */
async function sampleTree(app, rootPid, options) {
  const rows = await proctree.snapshot();
  const pids = proctree.browserProcessSet(rows, { rootPid, bundlePath: app.bundlePath, excludePids: options.excludePids });
  const args = await argsOf(pids);
  const procs = [];
  await measure.mapLimit(pids, 8, async (pid) => {
    const fp = await footprintOf(pid, options);
    if (fp) procs.push({ pid, kind: processKind(args.get(pid) || ''), ...fp });
  });
  procs.sort((a, b) => a.pid - b.pid);
  let order = 0;
  for (const p of procs) if (p.kind === 'renderer') p.kind = `renderer ${(order += 1)}`;
  return { procs, missing: pids.length - procs.length, total: procs.reduce((s, p) => s + p.bytes, 0) };
}

function browserFor(app, options) {
  return {
    extraArgs: options.extraArgs,
    id: `blanc-${app.label}`,
    label: `Blanc ${app.label}`,
    family: 'blanc',
    bundlePath: app.bundlePath,
    executableName: 'Blanc',
    extraBlankTabs: 1,
  };
}

async function warm(app, options, log) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-attrib-warm-${app.label}-`));
  seedBlancProfile(dir, { adblockEnabled: !options.noblock });
  log(`warming ${app.label}…`);
  const launched = await launcher.launch(browserFor(app, options), { profileDir: dir, urls: [] });
  await new Promise((resolve) => setTimeout(resolve, options.warmMs));
  await launcher.quit(launched.pid);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return dir;
}

async function measureCell(app, template, options, log) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-attrib-${app.label}-`));
  fs.cpSync(template, dir, { recursive: true });
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) fs.rmSync(path.join(dir, name), { force: true });
  const launched = await launcher.launch(browserFor(app, options), { profileDir: dir, urls: [] });
  let last = null;
  const counts = [];
  try {
    const { series, settled, elapsedMs } = await sampleUntilSettled(async () => {
      last = await sampleTree(app, launched.pid, options);
      counts.push(last.procs.length);
      return last.total;
    }, { alsoStable: () => isCountStable(counts) });
    log(`  ${app.label}: ${formatBytes(last.total)} across ${last.procs.length} processes${settled ? '' : ' (never settled)'}`);
    return { label: app.label, settled, elapsedMs, series, missing: last.missing, total: last.total, procs: last.procs };
  } finally {
    await launcher.quit(launched.pid, { pids: last ? last.procs.map((p) => p.pid) : [] });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Median footprint per process kind and per footprint category, per release. */
function summarise(cells, labels) {
  const byLabel = new Map(labels.map((l) => [l, cells.filter((c) => c.label === l)]));
  const kinds = [...new Set(cells.flatMap((c) => c.procs.map((p) => p.kind)))].sort();
  const table = {};
  for (const [label, reps] of byLabel) {
    table[label] = { total: summarize(reps.map((r) => r.total)), processes: reps.map((r) => r.procs.length), kinds: {} };
    for (const kind of kinds) {
      const values = reps.map((r) => r.procs.filter((p) => p.kind === kind).reduce((s, p) => s + p.bytes, 0));
      const categories = {};
      for (const r of reps) {
        for (const p of r.procs.filter((q) => q.kind === kind)) {
          for (const c of p.categories) (categories[c.category] ||= []).push(c.dirty / reps.length);
        }
      }
      table[label].kinds[kind] = {
        median: summarize(values).median,
        topCategories: Object.entries(categories)
          .map(([category, v]) => ({ category, mean: v.reduce((s, x) => s + x, 0) }))
          .sort((a, b) => b.mean - a.mean)
          .slice(0, 6),
      };
    }
  }
  return { kinds, table };
}

function markdown(summary, labels, meta) {
  const mib = (b) => (b / 1048576).toFixed(0);
  const lines = [
    '# Blanc idle memory by process',
    '',
    `Run: ${meta.startedAt} · macOS ${meta.osVersion} · ${meta.arch} · ${meta.totalRamGiB} GiB RAM`,
    `Metric: \`phys_footprint\` via \`footprint\` · median of ${meta.reps} repetitions · one window, one blanc://newtab tab${meta.extraArgs.length ? ` · extra argv: \`${meta.extraArgs.join(' ')}\`` : ''}`,
    '',
    `| Process | ${labels.join(' | ')} |`,
    `| --- | ${labels.map(() => '---:').join(' | ')} |`,
  ];
  for (const kind of summary.kinds) {
    lines.push(`| ${kind} | ${labels.map((l) => (summary.table[l].kinds[kind].median ? `${mib(summary.table[l].kinds[kind].median)} MiB` : '—')).join(' | ')} |`);
  }
  lines.push(`| **Total** | ${labels.map((l) => `**${mib(summary.table[l].total.median)} MiB**`).join(' | ')} |`);
  lines.push('', 'Renderers are numbered in spawn order. Largest footprint categories (dirty, mean MiB):', '');
  for (const l of labels) {
    lines.push(`- **${l}**`);
    for (const kind of summary.kinds) {
      const k = summary.table[l].kinds[kind];
      if (!k.median) continue;
      lines.push(`  - ${kind}: ${k.topCategories.map((c) => `${c.category} ${mib(c.mean)}`).join(', ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.apps.length) {
    process.stdout.write(USAGE);
    return;
  }
  if (process.platform !== 'darwin') throw new Error('idle-attribution reads phys_footprint, which is macOS-only');
  const log = (m) => process.stdout.write(`${m}\n`);
  const startedAt = new Date().toISOString();
  options.excludePids = (await proctree.snapshot()).map((r) => r.pid);

  const templates = new Map();
  for (const app of options.apps) templates.set(app.label, await warm(app, options, log));

  const cells = [];
  try {
    for (let rep = 0; rep < options.reps; rep += 1) {
      log(`repetition ${rep + 1}/${options.reps}`);
      for (const app of rotate(options.apps, rep)) {
        cells.push({ rep, ...(await measureCell(app, templates.get(app.label), options, log)) });
      }
    }
  } finally {
    for (const dir of templates.values()) fs.rmSync(dir, { recursive: true, force: true });
  }

  const labels = options.apps.map((a) => a.label);
  const meta = {
    startedAt,
    finishedAt: new Date().toISOString(),
    osVersion: os.release() && (await exec('/usr/bin/sw_vers', ['-productVersion'])).stdout.trim(),
    arch: os.arch(),
    totalRamGiB: Math.round(os.totalmem() / 1024 ** 3),
    reps: options.reps,
    extraArgs: options.extraArgs,
    adblockEnabled: !options.noblock,
    metric: 'phys_footprint',
    backend: 'footprint',
  };
  const summary = summarise(cells, labels);
  const outDir = options.out || path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const stem = path.join(outDir, `idle-attribution-${startedAt.replace(/[:.]/g, '-')}`);
  fs.writeFileSync(`${stem}.json`, `${JSON.stringify({ meta, summary, cells }, null, 1)}\n`);
  fs.writeFileSync(`${stem}.md`, markdown(summary, labels, meta));
  log(fs.readFileSync(`${stem}.md`, 'utf8'));
  log(`wrote ${stem}.json and .md`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  });
}

module.exports = { parseArgs, processKind, parseFootprintCategories, summarise, markdown };
