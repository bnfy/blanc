// What a daily Blanc Beta release is, decided before anyone signs anything
// (docs/chromium-beta-release.md, "Daily betas"). Pure functions shared by the
// nightly job (which builds and checks the candidate under this descriptor)
// and beta-prep (which turns a passing night into the release work folder).
import path from 'node:path';
import { CERT, CHROME_VERSION, PRODUCT, ROOT_ID, SPARKLE, TEAM, UPSTREAM, check, validateRelease, validateLedger } from '../policy.mjs';
import { betaNumber, carriedState, standingWaiver } from '../standing.mjs';
import { GATES } from '../manifest.mjs';

// Gates the nightly job checks on the candidate (their evidence comes from the night).
export const NIGHT_GATES = ['blocker-payload', 'official-hooks-absent', 'profile-coexistence', 'notices-and-credits'];
// Gates checked during the release command, on the Mac Studio, with their evidence file.
export const RELEASE_GATES = {
  'outbound-isolation': n => `beta${n}/outbound-report.json`,
  'native-signature': n => `beta${n}-signed/native-signature.json`,
  'gatekeeper': n => `beta${n}-signed/gatekeeper.json`,
};

export function nextVersion(ledger) {
  check(ledger?.schema === 1 && Array.isArray(ledger.builds) && ledger.builds.length, 'beta build ledger schema');
  const build = Math.max(...ledger.builds.map(b => b.build)) + 1;
  return { version: `2.0.0-beta.${build}`, build, previousBuild: build - 1 };
}

// build: {sourceCommit, inputDigest, candidate, gnArgsSHA256, sparkle: {publicKey, archiveSHA256}};
// the arch is arm64 only, under the owner's standing Intel waiver.
export function releaseDescriptor({ ledger, standing, build, profileSHA256 }) {
  const { version, build: number, previousBuild } = nextVersion(ledger);
  const gateWaivers = {};
  for (const gate of GATES) {
    const why = standingWaiver(standing, version, gate);
    if (why !== null) gateWaivers[gate] = why;
  }
  check(typeof standing.archWaiver === 'string' && standing.archWaiver.trim().length >= 20, 'the standing Intel waiver is missing');
  const r = {
    schema: 1, bundleId: ROOT_ID, product: PRODUCT, userDataDir: PRODUCT,
    keychainGroup: `${TEAM}.${ROOT_ID}.webauthn`, certificateSHA1: CERT, teamId: TEAM,
    upstream: UPSTREAM, chromiumVersion: CHROME_VERSION,
    version, tag: `chromium-beta-${version}`, shortVersion: version, build: number, previousBuild,
    prerelease: true, makeLatest: false,
    sourceCommit: build.sourceCommit, inputDigest: build.inputDigest,
    arches: ['arm64'], candidates: { arm64: build.candidate }, gnArgsSHA256: { arm64: build.gnArgsSHA256 },
    sparkle: { version: SPARKLE, publicKey: build.sparkle.publicKey, archiveSHA256: build.sparkle.archiveSHA256 },
    minimumSystemVersion: '13.0', profileSHA256, launchScheme: 'blanc-beta',
    archWaiver: standing.archWaiver,
    ...(Object.keys(gateWaivers).length ? { gateWaivers } : {}),
  };
  validateRelease(r);
  validateLedger(ledger, r);
  return r;
}

// Carried gates and the checks this release needs because their code changed.
// changedSince(commit) lists files changed from that commit to the release source.
export function carriedGates(standing, r, changedSince) {
  const out = {};
  for (const [gate, c] of Object.entries(standing.carried ?? {})) {
    if (r.gateWaivers?.[gate]) continue;
    const state = carriedState(standing, gate, changedSince(c.lastPass.sourceCommit));
    out[gate] = { ...state, who: c.who, check: c.check, lastPass: c.lastPass };
  }
  return out;
}

// SOURCES.json for gate-evidence.mjs. base: the Mac Studio folder whose
// evidence/foundation holds every file; night: the nightly result;
// targeted: an optional same-day rerun on the release source.
export function gateSources({ r, night, carried, base, targeted }) {
  const n = betaNumber(r.version), ev = rel => path.join(base, 'evidence/foundation', rel);
  check(night.status === 'pass', 'the night did not pass');
  const sources = {};
  const acceptanceFiles = [night.suite.summary];
  let basis = `full suite on the prototype ${night.prototype.candidate} built from ${night.sourceCommit.slice(0, 9)} the night of ${night.night}`
    + ` (${night.suite.pass} pass; every other result on the known list)`;
  if (targeted) {
    // targeted: nightly.mjs --targeted's result on the release source.
    check(targeted.status === 'pass' && targeted.sourceCommit === r.sourceCommit && targeted.inputDigest === r.inputDigest, 'the targeted rerun is not on the release source');
    acceptanceFiles.push(targeted.suite.summary);
    basis += `, plus ${targeted.targeted.cases} targeted cases on the prototype ${targeted.prototype.candidate} built from ${r.sourceCommit.slice(0, 9)}`
      + ` for the files changed since (owner, 2026-11-14: nightly plus targeted rerun)`;
  } else {
    check(night.sourceCommit === r.sourceCommit && night.inputDigest === r.inputDigest, 'the release source differs from the night; run a targeted rerun');
  }
  sources.acceptance = { basis, files: acceptanceFiles };
  const evidenceBuild = targeted ?? night;
  for (const gate of NIGHT_GATES) sources[gate] = { files: [evidenceBuild.evidence[gate]] };
  for (const [gate, file] of Object.entries(RELEASE_GATES)) sources[gate] = { files: [ev(file(n))] };
  const handChecks = [];
  for (const [gate, c] of Object.entries(carried)) {
    if (c.carried) {
      sources[gate] = { basis: `carried from ${c.lastPass.version} (source ${c.lastPass.sourceCommit.slice(0, 9)}): no change since to the code this check covers (standing decision, owner 2026-11-14)`,
        files: [path.join(base, c.lastPass.evidence)] };
    } else {
      sources[gate] = { files: [ev(`beta${n}/${gate}.json`)] };
      handChecks.push({ gate, who: c.who, check: c.check, touched: c.touched });
    }
  }
  const covered = new Set([...Object.keys(sources), ...Object.keys(r.gateWaivers ?? {})]);
  const missing = GATES.filter(g => !covered.has(g));
  check(!missing.length, `no source planned for gate: ${missing[0]}`);
  return { sources: { arm64: sources }, handChecks };
}

// The release notes: the fixed frame around Claude's list of changes and the
// standing limitations. Touch ID passkeys are claimed only while that check
// passed on this release's code (carried or rerun).
export function releaseNotes({ changes, standing, r }) {
  check(typeof changes === 'string' && /\S/.test(changes) && !/\{\{|\}\}/.test(changes), 'the list of changes is required');
  // In the order standing.json lists them (protected video first, as in earlier betas).
  const limits = Object.keys(standing.notes ?? {}).filter(g => r.gateWaivers?.[g]).map(g => standing.notes[g]);
  check(limits.length === Object.keys(r.gateWaivers ?? {}).length, 'every standing waiver needs its release-notes line');
  return [
    'Blanc Beta is an early preview of Blanc built directly on Chromium. It installs as a separate app beside the regular Blanc and never replaces it.',
    '',
    changes.trim(),
    '',
    '**What to know**',
    '',
    ...standing.whatToKnow,
    '',
    ...(limits.length ? ['**Not in this beta yet**', '', ...limits, ''] : []),
    '**Checking the download**',
    '',
    'The app is signed with Developer ID and notarized by Apple. `SHA256SUMS` lists every file in this release and is signed with Sigstore (`SHA256SUMS.sigstore.json`); `RELEASE-MANIFEST.json` and `acceptance.json` record what was checked before release.',
    '',
    'This is a pre-release. The regular Blanc remains the recommended browser.',
    '',
  ].join('\n');
}
