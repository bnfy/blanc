'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../scripts/ci-queue-report.mjs');
const job = (labels, created, started, completed, conclusion = 'success') => ({
  labels, created_at: created, started_at: started, completed_at: completed, conclusion,
});

test('queue and run minutes per runner label, slowest queue first', async () => {
  const { summarizeJobs } = await load();
  const rows = summarizeJobs([
    job(['macos-15'], '2026-10-26T16:00:00Z', '2026-10-26T16:40:00Z', '2026-10-26T16:45:00Z'),
    job(['macos-15'], '2026-10-26T17:00:00Z', '2026-10-26T17:20:00Z', '2026-10-26T17:30:00Z'),
    job(['ubuntu-latest'], '2026-10-26T16:00:00Z', '2026-10-26T16:00:30Z', '2026-10-26T16:04:30Z'),
  ]);
  assert.deepEqual(rows.map((r) => r.label), ['macos-15', 'ubuntu-latest']);
  assert.equal(rows[0].jobs, 2);
  assert.equal(rows[0].queue.median, 20);
  assert.equal(rows[0].queue.p90, 40);
  assert.equal(rows[0].run.median, 5);
  assert.equal(rows[1].queue.median, 0.5);
});

test('skipped jobs are left out and jobs cancelled before starting are counted apart', async () => {
  const { summarizeJobs } = await load();
  const [row] = summarizeJobs([
    // Skipped jobs report a start before their creation.
    job(['macos-15-intel'], '2026-10-26T17:31:39Z', '2026-10-26T17:02:38Z', '2026-10-26T17:02:38Z', 'skipped'),
    job(['macos-15-intel'], '2026-10-26T17:00:00Z', null, null, 'cancelled'),
    job(['macos-15-intel'], '2026-10-26T17:00:00Z', '2026-10-26T17:28:00Z', '2026-10-26T17:38:00Z'),
  ]);
  assert.equal(row.jobs, 1);
  assert.equal(row.neverStarted, 1);
  assert.equal(row.queue.median, 28);
});

test('percentiles of an empty list are null', async () => {
  const { percentiles } = await load();
  assert.deepEqual(percentiles([]), { median: null, p90: null });
});
