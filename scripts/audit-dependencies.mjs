#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaces = [
  ['desktop', '.'],
  ['site', 'site'],
  ['tab-import-worker', 'cloudflare/tab-import-worker'],
  ['tab-import-companions', 'extensions/blanc-tab-import'],
];
const threshold = new Set(['high', 'critical']);
const vex = JSON.parse(fs.readFileSync(path.join(root, 'security/openvex.json'), 'utf8'));
const suppressed = new Set(
  vex.statements
    .filter((statement) => statement.status === 'not_affected')
    .map((statement) => statement.vulnerability?.name?.toUpperCase())
    .filter(Boolean),
);

function advisoryId(via) {
  return /GHSA-[0-9a-z-]+/i.exec(via.url || '')?.[0]?.toUpperCase() || null;
}

function leafAdvisories(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const finding = vulnerabilities[name];
  if (!finding) return [];
  return finding.via.flatMap((via) => {
    if (typeof via === 'string') return leafAdvisories(via, vulnerabilities, seen);
    const id = advisoryId(via);
    return id ? [{ id, title: via.title }] : [{ id: null, title: via.title || name }];
  });
}

let failed = false;
for (const [label, directory] of workspaces) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--json'],
    { cwd: path.join(root, directory), encoding: 'utf8' },
  );
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error(`${label}: npm audit did not return valid JSON`);
    if (result.stderr) console.error(result.stderr.trim());
    failed = true;
    continue;
  }
  if (!Number.isInteger(report.auditReportVersion) || !report.vulnerabilities || report.error) {
    console.error(`${label}: npm audit failed without a vulnerability report`);
    if (report.message) console.error(`  ${report.message}`);
    failed = true;
    continue;
  }

  const violations = [];
  const accepted = [];
  for (const [name, finding] of Object.entries(report.vulnerabilities || {})) {
    const leaves = leafAdvisories(name, report.vulnerabilities);
    const malicious = leaves.some(({ title }) => /malicious|malware/i.test(title));
    if (!threshold.has(finding.severity) && !malicious) continue;
    if (leaves.length && leaves.every(({ id }) => id && suppressed.has(id))) {
      accepted.push(...leaves.map(({ id }) => `${name}: ${id}`));
    } else {
      const detail = leaves.map(({ id, title }) => id || title).join(', ') || 'unidentified advisory';
      violations.push(`${name} (${finding.severity}): ${detail}`);
    }
  }

  if (violations.length) {
    failed = true;
    console.error(`${label}: dependency-policy violations`);
    for (const violation of violations) console.error(`  - ${violation}`);
  } else {
    const acceptedIds = new Set(accepted.map((finding) => finding.split(': ').at(-1)));
    const note = acceptedIds.size ? `; ${acceptedIds.size} VEX-accounted advisory(s)` : '';
    console.log(`${label}: no unsuppressed high or critical dependency findings${note}`);
  }
}

if (failed) process.exitCode = 1;
