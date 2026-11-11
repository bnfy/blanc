'use strict';
// On November 11, 2026 ubuntu-latest became Ubuntu 26.04, whose runners could
// not resolve archive.ubuntu.com, security.ubuntu.com or
// azure.archive.ubuntu.com, so every job that installs packages with apt failed
// there while npm ci kept working. Jobs that run apt stay on ubuntu-24.04 (the
// release workflow's Linux build moved first, in #1447; its assertion is in
// ecs-release-pipeline.test.js). A matrix leg keeps its `ubuntu-latest` name,
// because required checks are named after it, and maps it in runs-on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const workflows = path.join(__dirname, '..', '..', '.github', 'workflows');
const MATRIX_MAP = "matrix.os == 'ubuntu-latest' && 'ubuntu-24.04' || matrix.os";

// Left on ubuntu-latest for now: the release workflow was not changed while
// the v1.48.0 release was in progress. Remove an entry once its job is pinned.
const KNOWN = new Set(['release-windows-linux.yml#ecs-native']);

const runsApt = (job) => (job.steps || []).some((step) => /\bapt(-get)? /.test(step.run || ''));

function aptJobs() {
  const jobs = [];
  for (const name of fs.readdirSync(workflows).filter((f) => f.endsWith('.yml'))) {
    const doc = yaml.load(fs.readFileSync(path.join(workflows, name), 'utf8'));
    for (const [id, job] of Object.entries(doc.jobs || {})) {
      if (runsApt(job)) jobs.push({ key: `${name}#${id}`, job });
    }
  }
  return jobs;
}

test('jobs that install packages with apt never run on bare ubuntu-latest', () => {
  const jobs = aptJobs();
  assert.ok(jobs.length >= 8, `found ${jobs.length} apt jobs; the scan has stopped seeing them`);
  for (const { key, job } of jobs) {
    if (KNOWN.has(key)) continue;
    const runsOn = String(job['runs-on']);
    assert.notEqual(runsOn, 'ubuntu-latest', `${key} runs apt on ubuntu-latest`);
    if (runsOn.includes('matrix.os')) {
      const legs = JSON.stringify(job.strategy && job.strategy.matrix);
      if (legs.includes('ubuntu-latest')) {
        assert.ok(runsOn.includes(MATRIX_MAP), `${key} must map its ubuntu-latest leg to ubuntu-24.04: ${runsOn}`);
      }
    }
  }
});

test('the known exceptions still exist and still need excusing', () => {
  const byKey = new Map(aptJobs().map(({ key, job }) => [key, job]));
  for (const key of KNOWN) {
    const job = byKey.get(key);
    assert.ok(job, `${key} no longer runs apt; drop it from KNOWN`);
    assert.ok(!String(job['runs-on']).includes(MATRIX_MAP), `${key} is pinned now; drop it from KNOWN`);
  }
});

test('the pinned jobs keep their required check names', () => {
  const parity = yaml.load(fs.readFileSync(path.join(workflows, 'parity-guards.yml'), 'utf8'));
  // `browser-shortcuts (ubuntu-latest)` is a required check: the leg is still named ubuntu-latest.
  assert.match(parity.jobs['browser-shortcuts'].strategy.matrix.os, /"ubuntu-latest"/);
  assert.equal(parity.jobs['browser-shortcuts']['runs-on'], `\${{ ${MATRIX_MAP} }}`);
  assert.equal(parity.jobs['shared-spaces']['runs-on'], 'ubuntu-24.04');
  assert.deepEqual(parity.jobs['shared-spaces'].strategy.matrix.shard, [1, 2, 3]);
});
