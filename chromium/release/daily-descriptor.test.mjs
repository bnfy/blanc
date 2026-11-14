import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextVersion, releaseDescriptor, carriedGates, gateSources, releaseNotes, NIGHT_GATES } from './daily/descriptor.mjs';
import { loadStanding } from './standing.mjs';
import { GATES } from './manifest.mjs';

const ledger = JSON.parse(fs.readFileSync(new URL('./ledger.json', import.meta.url)));
const upTo = n => ({ schema: 1, builds: ledger.builds.filter(b => b.build <= n) });
const standing = loadStanding();
// beta.4's published release.json (records/beta4-work/release.json on the Mac Studio).
const beta4 = {
  sourceCommit: '57e3109dd3c166fe1ea76caf0cc1a3b93aa54585',
  inputDigest: '14313460ce9300fce7d3b1a80333a6edf27dfdc2ddad61095135b560a6d1ed0a',
  candidate: 'macos-e8eb804f1ebb87a8',
  gnArgsSHA256: 'bb9d5e49f29431107a5ecaebf61277b226741fb6f82357818167c6c47b71e177',
  sparkle: { publicKey: '6evJNrxSq6GUSthnzlQDIVCyC6U90GrhDE0eTFqYlVQ=', archiveSHA256: '1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27' },
};
const profileSHA256 = 'c4d6ef484cb449f4c3bd730aeccc5561b1a536223b7f36e0ac26d50b698b581c';

test('nextVersion follows the ledger', () => {
  assert.deepEqual(nextVersion(upTo(3)), { version: '2.0.0-beta.4', build: 4, previousBuild: 3 });
  assert.deepEqual(nextVersion(upTo(4)), { version: '2.0.0-beta.5', build: 5, previousBuild: 4 });
});

test('the descriptor rebuilds beta.4 from the night, apart from its per-version waivers', () => {
  const r = releaseDescriptor({ ledger: upTo(3), standing, build: beta4, profileSHA256 });
  assert.equal(r.version, '2.0.0-beta.4');
  assert.equal(r.tag, 'chromium-beta-2.0.0-beta.4');
  assert.equal(r.gateWaivers, undefined); // beta.4's came from GATE_WAIVERS, decided on the day
  assert.deepEqual(Object.keys(r), ['schema', 'bundleId', 'product', 'userDataDir', 'keychainGroup', 'certificateSHA1', 'teamId', 'upstream', 'chromiumVersion', 'version', 'tag', 'shortVersion', 'build', 'previousBuild', 'prerelease', 'makeLatest', 'sourceCommit', 'inputDigest', 'arches', 'candidates', 'gnArgsSHA256', 'sparkle', 'minimumSystemVersion', 'profileSHA256', 'launchScheme', 'archWaiver']);
});

test('beta.5 carries both standing waivers with the owner reasons', () => {
  const r = releaseDescriptor({ ledger: upTo(4), standing, build: beta4, profileSHA256 });
  assert.deepEqual(Object.keys(r.gateWaivers).sort(), ['no-drm-handoff', 'production-sync-real-device']);
  assert.match(r.gateWaivers['no-drm-handoff'], /^Owner standing waiver 2026-11-14/);
});

const night = {
  status: 'pass', night: '2026-11-15', sourceCommit: beta4.sourceCommit, inputDigest: beta4.inputDigest,
  prototype: { candidate: 'macos-402d768b8c8f6e43' },
  suite: { summary: '/B/evidence/foundation/nightly/2026-11-15/suite-summary.json', pass: 580 },
  evidence: Object.fromEntries(NIGHT_GATES.map(g => [g, `/B/evidence/foundation/nightly/2026-11-15/${g}.json`])),
};

test('gate sources cover every gate; a touched carried check becomes a hand check', () => {
  const r = releaseDescriptor({ ledger: upTo(4), standing, build: beta4, profileSHA256 });
  const carried = carriedGates(standing, r, commit => commit.startsWith('e47bf1bcf') ? ['chromium/patches/0054-blanc-private-passkey-secret.patch'] : ['chromium/blanc/browser/ui/x.cc']);
  const { sources, handChecks } = gateSources({ r, night, carried, base: '/B' });
  const covered = new Set([...Object.keys(sources.arm64), ...Object.keys(r.gateWaivers)]);
  assert.deepEqual(GATES.filter(g => !covered.has(g)), []);
  assert.deepEqual(handChecks.map(h => [h.gate, h.who]), [['webauthn', 'owner']]);
  assert.deepEqual(sources.arm64.webauthn.files, ['/B/evidence/foundation/beta5/webauthn.json']);
  assert.match(sources.arm64['sparkle-N-to-N+1'].basis, /^carried from 2\.0\.0-beta\.2/);
  assert.deepEqual(sources.arm64['desktop-sync'].files, ['/B/evidence/foundation/beta4/acceptance/native-sync-organic-tabs.json']);
  assert.deepEqual(sources.arm64['outbound-isolation'].files, ['/B/evidence/foundation/beta5/outbound-report.json']);
  assert.match(sources.arm64.acceptance.basis, /full suite on the prototype macos-402d768b8c8f6e43 built from 57e3109dd the night of 2026-11-15/);
  assert.equal(sources.arm64['no-drm-handoff'], undefined);
});

test('a release source that differs from the night needs a targeted rerun', () => {
  const r = releaseDescriptor({ ledger: upTo(4), standing, build: { ...beta4, sourceCommit: 'c'.repeat(40) }, profileSHA256 });
  const carried = carriedGates(standing, r, () => []);
  assert.throws(() => gateSources({ r, night, carried, base: '/B' }), /targeted rerun/);
  const targeted = { summary: '/B/t.json', cases: 12, candidate: 'macos-1111111111111111', evidence: night.evidence };
  const { sources } = gateSources({ r, night, carried, base: '/B', targeted });
  assert.deepEqual(sources.arm64.acceptance.files, [night.suite.summary, '/B/t.json']);
  assert.match(sources.arm64.acceptance.basis, /plus 12 targeted cases/);
});

test('a night that did not pass is refused', () => {
  const r = releaseDescriptor({ ledger: upTo(4), standing, build: beta4, profileSHA256 });
  assert.throws(() => gateSources({ r, night: { ...night, status: 'fail' }, carried: {}, base: '/B' }), /did not pass/);
});

test('release notes frame the changes and list each standing limitation', () => {
  const r = releaseDescriptor({ ledger: upTo(4), standing, build: beta4, profileSHA256 });
  const notes = releaseNotes({ changes: '**Fixed in this beta**\n\n- **A fix.** It works.', standing, r });
  assert.match(notes, /^Blanc Beta is an early preview/);
  assert.match(notes, /\*\*Not in this beta yet\*\*\n\n- \*\*Protected video\*\*/);
  assert.match(notes, /- \*\*Sync\*\* is included/);
  assert.match(notes, /This is a pre-release\. The regular Blanc remains the recommended browser\.\n$/);
  assert.throws(() => releaseNotes({ changes: ' ', standing, r }), /changes is required/);
});
