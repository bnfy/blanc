#!/usr/bin/env node
// The order of the one release command (owner/beta-release-remote.sh), and
// where a stopped run resumes. Every step is either a release.mjs stage, whose
// state.json says whether it ran, or a check whose evidence file says so; a
// step that already ran is never run again.
//
//   node chromium/release/daily/release-steps.mjs next WORK   prints the next step, or "done"
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, reason } from '../policy.mjs';
import { betaNumber } from '../standing.mjs';
import { BASE } from './beta-prep.mjs';

export const STEPS = ['outbound', 'preflight', 'sign', 'notarize-app', 'dmg', 'notarize-dmg', 'signed-evidence', 'sparkle',
  'hand-checks', 'gate-evidence', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public'];
const STAGES = new Set(['preflight', 'sign', 'notarize-app', 'dmg', 'notarize-dmg', 'sparkle', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public']);

// facts: {done: state.json's done, outbound, signedEvidence, evidenceWritten (booleans), due: hand checks still without evidence}
export function nextStep(facts) {
  // A check before a stage that already ran passed then (the stage needed it), even
  // if its file was moved since: never send the run back to it.
  const lastDone = Math.max(-1, ...STEPS.map((s, i) => STAGES.has(s) && facts.done[s] ? i : -1));
  for (const [index, step] of STEPS.entries()) {
    if (STAGES.has(step)) { if (!facts.done[step]) return step; continue; }
    if (index < lastDone) continue;
    if (step === 'outbound' && !facts.outbound) return step;
    if (step === 'signed-evidence' && !facts.signedEvidence) return step;
    if (step === 'hand-checks' && facts.due.length) return step;
    if (step === 'gate-evidence' && !facts.evidenceWritten) return step;
  }
  return 'done';
}

export function factsOf(work, base = BASE) {
  const r = JSON.parse(fs.readFileSync(path.join(work, 'release.json'), 'utf8'));
  const n = betaNumber(r.version), ev = rel => path.join(base, 'evidence/foundation', rel);
  const stateFile = path.join(work, 'state.json');
  const done = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).done : {};
  const due = JSON.parse(fs.readFileSync(path.join(work, 'hand-checks.json'), 'utf8'))
    .filter(h => !fs.existsSync(ev(`beta${n}/${h.gate}.json`))).map(h => `${h.gate} (${h.who})`);
  return {
    done, due,
    outbound: fs.existsSync(ev(`beta${n}/outbound-report.json`)),
    signedEvidence: fs.existsSync(ev(`beta${n}-signed/native-signature.json`)) && fs.existsSync(ev(`beta${n}-signed/gatekeeper.json`)),
    evidenceWritten: fs.existsSync(path.join(work, 'payloads/acceptance.json')),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, work] = process.argv.slice(2);
  try {
    check(mode === 'next' && work && path.isAbsolute(work), 'usage: release-steps.mjs next WORK');
    const facts = factsOf(work);
    const step = nextStep(facts);
    console.log(step === 'hand-checks' ? `hand-checks ${facts.due.join(', ')}` : step);
  } catch (error) { console.error(`Release steps: ${reason(error)}.`); process.exitCode = 1; }
}
