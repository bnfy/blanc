#!/usr/bin/env node
// Records a published daily Blanc Beta (docs/chromium-beta-release.md,
// "Daily betas"). Run by Claude on the Mac Studio after verify-public:
//
//   node chromium/release/daily/beta-record.mjs WORK REPO
//
// WORK is the release work folder; REPO a checkout of chromium/next that
// Claude then commits and pushes. It adds the ledger entry, moves standing.json's
// lastPass for every carried check that ran again on this release, appends a
// line to chromium/release/daily-log.md and removes records/RELEASE-IN-PROGRESS
// so the nightly job runs again.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, equal, reason, sha256, validateRelease } from '../policy.mjs';
import { validateStanding, betaNumber } from '../standing.mjs';
import { BASE, MARKER } from './beta-prep.mjs';

// state: release.mjs's state.json; ranChecks: [{gate, evidence (relative to BASE), sha256}].
export function recordRelease({ r, state, ledger, standing, ranChecks, published }) {
  validateRelease(r);
  check(state.done?.['verify-public'], 'the release has not passed verify-public');
  check(/^\d{4}-\d{2}-\d{2}$/.test(published), 'publication date');
  const dmgSHA256 = state.done['notarize-dmg'].arm64.dmgSHA256;
  const waived = Object.keys(r.gateWaivers ?? {});
  const entry = {
    build: r.build, version: r.version, tag: r.tag, date: published, arches: r.arches, archWaiver: r.archWaiver,
    sourceCommit: r.sourceCommit, candidate: r.candidates.arm64, dmgSHA256,
    ...(waived.length ? { gateWaivers: waived } : {}),
    note: `Daily Blanc Beta, published ${published} as a GitHub pre-release (not latest) through the one release command. Signed with the pinned Developer ID, notarized and stapled; Sigstore-signed checksums; logged-out public verification passed. Waivers under the owner's standing decisions: ${waived.join(', ') || 'none'}.`,
  };
  check(!ledger.builds.some(b => b.build >= r.build || b.version === r.version), 'the ledger already has this build');
  const next = structuredClone(standing);
  for (const ran of ranChecks) {
    const c = next.carried?.[ran.gate];
    check(c, `not a carried gate: ${ran.gate}`);
    c.lastPass = { version: r.version, sourceCommit: r.sourceCommit, evidence: ran.evidence, sha256: ran.sha256 };
  }
  validateStanding(next);
  const line = `- ${published} ${r.version} (build ${r.build}) from \`${r.sourceCommit.slice(0, 9)}\`, candidate \`${r.candidates.arm64}\`, DMG \`${dmgSHA256.slice(0, 12)}…\`; checks run again: ${ranChecks.map(c => c.gate).join(', ') || 'none'}.\n`;
  return { ledger: { ...ledger, builds: [...ledger.builds, entry] }, standing: next, line };
}

function main(work, repo) {
  check(path.isAbsolute(work ?? '') && path.isAbsolute(repo ?? ''), 'usage: beta-record.mjs WORK REPO (absolute paths)');
  const r = JSON.parse(fs.readFileSync(path.join(work, 'release.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(work, 'state.json'), 'utf8'));
  const due = JSON.parse(fs.readFileSync(path.join(work, 'hand-checks.json'), 'utf8'));
  const n = betaNumber(r.version);
  const ranChecks = due.map(({ gate }) => {
    const evidence = `evidence/foundation/beta${n}/${gate}.json`;
    return { gate, evidence, sha256: sha256(fs.readFileSync(path.join(BASE, evidence))) };
  });
  const ledgerFile = path.join(repo, 'chromium/release/ledger.json');
  const standingFile = path.join(repo, 'chromium/release/standing.json');
  const logFile = path.join(repo, 'chromium/release/daily-log.md');
  const published = state.done.publish.at.slice(0, 10);
  const out = recordRelease({ r, state, ledger: JSON.parse(fs.readFileSync(ledgerFile, 'utf8')),
    standing: JSON.parse(fs.readFileSync(standingFile, 'utf8')), ranChecks, published });
  fs.writeFileSync(ledgerFile, JSON.stringify(out.ledger, null, 2) + '\n');
  fs.writeFileSync(standingFile, JSON.stringify(out.standing, null, 2) + '\n');
  fs.appendFileSync(logFile, out.line);
  if (fs.existsSync(MARKER)) {
    equal(JSON.parse(fs.readFileSync(MARKER, 'utf8')).version, r.version, 'the in-progress marker names another release');
    fs.rmSync(MARKER);
  }
  return out.line.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(main(...process.argv.slice(2))); }
  catch (error) { console.error(`Beta record stopped: ${reason(error)}.`); process.exitCode = 1; }
}
