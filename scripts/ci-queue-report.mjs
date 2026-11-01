#!/usr/bin/env node
// How long GitHub Actions jobs wait for a runner, per runner label.
//
//   npm run ci:queue                 # the last 40 workflow runs
//   npm run ci:queue -- --runs=100   # more history
//   npm run ci:queue -- --since=2026-10-26T00:00:00Z
//
// Queue time is a job's started_at minus its created_at; run time is
// completed_at minus started_at. Needs an authenticated `gh` CLI. Read-only.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Median and 90th percentile of a list of numbers (null when empty). */
export function percentiles(values) {
  if (!values.length) return { median: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return { median: at(0.5), p90: at(0.9) };
}

/** Jobs → one row per runner label: count, queue and run minutes. Jobs that
 * never started (cancelled while queued) count toward `neverStarted`. */
export function summarizeJobs(jobs) {
  const byLabel = new Map();
  for (const job of jobs) {
    const label = (job.labels ?? []).join(',') || 'unknown';
    if (!byLabel.has(label)) byLabel.set(label, { label, queue: [], run: [], neverStarted: 0 });
    const row = byLabel.get(label);
    const created = Date.parse(job.created_at);
    const started = Date.parse(job.started_at);
    const completed = Date.parse(job.completed_at);
    // Skipped jobs report a started_at before created_at; they never queued.
    if (job.conclusion === 'skipped') continue;
    if (!Number.isFinite(started) || started < created) { row.neverStarted += 1; continue; }
    row.queue.push((started - created) / 60000);
    if (Number.isFinite(completed) && completed >= started) row.run.push((completed - started) / 60000);
  }
  return [...byLabel.values()]
    .map((row) => ({
      label: row.label,
      jobs: row.queue.length,
      neverStarted: row.neverStarted,
      queue: percentiles(row.queue),
      run: percentiles(row.run),
    }))
    .sort((a, b) => (b.queue.median ?? -1) - (a.queue.median ?? -1));
}

function gh(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function main(argv) {
  const arg = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
  const runs = Math.max(1, Math.min(300, Number(arg('runs', 40)) || 40));
  const since = arg('since', null);
  const repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { encoding: 'utf8' }).trim();
  const listed = [];
  for (let page = 1; listed.length < runs; page++) {
    const query = `repos/${repo}/actions/runs?per_page=100&page=${page}${since ? `&created=>=${since}` : ''}`;
    const batch = gh(query).workflow_runs ?? [];
    listed.push(...batch);
    if (batch.length < 100) break;
  }
  const jobs = [];
  for (const run of listed.slice(0, runs)) {
    jobs.push(...(gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&filter=all`).jobs ?? []));
  }
  const fmt = (n) => (n == null ? '–' : n.toFixed(1));
  console.log(`${repo}: ${Math.min(runs, listed.length)} runs, ${jobs.length} jobs${since ? ` since ${since}` : ''}\n`);
  console.log('runner'.padEnd(28) + 'jobs'.padStart(6) + 'queue p50'.padStart(11) + 'queue p90'.padStart(11) + 'run p50'.padStart(9) + '  (minutes)');
  for (const row of summarizeJobs(jobs)) {
    console.log(row.label.padEnd(28) + String(row.jobs).padStart(6) + fmt(row.queue.median).padStart(11)
      + fmt(row.queue.p90).padStart(11) + fmt(row.run.median).padStart(9)
      + (row.neverStarted ? `  (${row.neverStarted} cancelled before starting)` : ''));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
