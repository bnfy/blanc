import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { siteFiles, LIMITATIONS } from './daily/site-pr.mjs';
import { loadStanding } from './standing.mjs';
// The owner's decisions as they stood then: both waivers standing, nothing retired.
const standingThen = loadStanding(new URL('./fixtures/standing-before-beta5.json', import.meta.url));

// beta.3's site files on main before bnfy/blanc#1529, beta.4's after it, and beta.4's public release.json.
const dir = new URL('./fixtures/site-beta3-to-beta4/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, dir), 'utf8');
const files = { betaJson: read('before/blanc-beta.json'), dlJs: read('before/dl.js'), inventory: read('before/audit-surface-inventory.json'), prevLedger: read('before/claims.json') };
// beta.4 waived both gates (production-sync-real-device through acceptance.json); a standing beta carries both in release.json.
const r = JSON.parse(read('release.json'));
r.gateWaivers['production-sync-real-device'] = 'Owner waiver 2026-11-14: the rebuilt beta.4 was not listed on the iPhone.';
const input = { r, appcast: read('after/arm64.xml'), dmg: { bytes: 242737071, sha256: 'fd42bf1265db3fe3844372a34a5c7ce14e58307ca989a811186b474ec0658ed1' }, published: '2026-11-14', files, standing: standingThen };

test('the generator writes beta.4\'s site files from beta.3\'s, byte for byte', () => {
  const out = siteFiles(input);
  assert.equal(out['site/src/data/blanc-beta.json'], read('after/blanc-beta.json'));
  assert.equal(out['cloudflare/ping-worker/src/dl.js'], read('after/dl.js'));
  assert.equal(out['security/audit-surface-inventory.json'], read('after/audit-surface-inventory.json'));
  assert.equal(out['site/public/updates/chromium-beta/arm64.xml'], read('after/arm64.xml'));
});

test('the claims ledger names the release and keeps every page sentence', () => {
  const before = JSON.parse(files.prevLedger);
  const ledger = JSON.parse(siteFiles(input)['docs/website-blanc-beta-2.0.0-beta.4-claims.json']);
  assert.equal(ledger.release, '2.0.0-beta.4');
  assert.equal(ledger.sourceCommit, r.sourceCommit);
  assert.equal(ledger.claims.length, before.claims.length);
  for (const text of ['Beta 4', '2.0.0-beta.4 · build 4', 'Chromium 158', '158.0.8127.37', 'Apple Silicon Macs · macOS 13 or later', 'Released November 14, 2026'])
    assert.ok(ledger.claims.some(c => c.text === text), text);
  assert.ok(!ledger.claims.some(c => /beta\.3|Beta 3|build 3/.test(c.text)));
  for (const text of Object.values(LIMITATIONS)) assert.match(ledger.claims.find(c => c.text === text).evidence, /standing decision/);
  assert.match(ledger.ownerDecisions.decisions.at(-1), /^Beta\.4 \(standing decision, owner 2026-11-14\): .* as for beta\.3/);
});

test('a release without a Chromium version, or a ledger without the version lines, is refused', () => {
  assert.throws(() => siteFiles({ ...input, r: { ...structuredClone(r), chromiumVersion: undefined } }), /chrome\/VERSION stays upstream/);
  const prev = JSON.parse(files.prevLedger);
  prev.claims = prev.claims.filter(c => c.field !== 'released');
  assert.throws(() => siteFiles({ ...input, files: { ...files, prevLedger: JSON.stringify(prev) } }), /no released line/);
});

test('a ledger from before the version figures keeps its one requirement line', () => {
  const prev = JSON.parse(files.prevLedger);
  const at = prev.claims.findIndex(c => c.field);
  prev.claims = prev.claims.filter(c => !c.field);
  prev.claims.splice(at, 0, { text: 'Apple Silicon Macs · macOS 13 or later · 2.0.0-beta.3', evidence: 'release.json arches [arm64], minimumSystemVersion 13.0, version 2.0.0-beta.3.' });
  const ledger = JSON.parse(siteFiles({ ...input, files: { ...files, prevLedger: JSON.stringify(prev) } })['docs/website-blanc-beta-2.0.0-beta.4-claims.json']);
  assert.equal(ledger.claims.length, prev.claims.length);
  assert.ok(ledger.claims.some(c => c.text === 'Apple Silicon Macs · macOS 13 or later · 2.0.0-beta.4'));
  assert.ok(!ledger.claims.some(c => c.field));
});

test('a release whose waivers differ from the page\'s limitations is refused', () => {
  const one = structuredClone(r);
  delete one.gateWaivers['production-sync-real-device'];
  assert.throws(() => siteFiles({ ...input, r: one }), /waivers differ from the limitations/);
});

test('the appcast must point at the published DMG, and the site must not go backwards', () => {
  assert.throws(() => siteFiles({ ...input, dmg: { ...input.dmg, bytes: 1 } }), /appcast does not point/);
  assert.throws(() => siteFiles({ ...input, files: { ...files, betaJson: read('after/blanc-beta.json') } }), /already names this beta/);
});

test('the record adds the ledger entry and moves lastPass only for checks that ran', async () => {
  const { recordRelease } = await import('./daily/beta-record.mjs');
  const { loadStanding } = await import('./standing.mjs');
  // The ledger and standing.json as they stood before beta.5 was recorded.
  const full = JSON.parse(fs.readFileSync(new URL('./ledger.json', import.meta.url)));
  const ledger = { ...full, builds: full.builds.filter(b => b.build <= 4) };
  const r5 = { ...structuredClone(r), version: '2.0.0-beta.5', tag: 'chromium-beta-2.0.0-beta.5', shortVersion: '2.0.0-beta.5', build: 5, previousBuild: 4,
    gateWaivers: { 'no-drm-handoff': 'Owner standing waiver 2026-11-14: x', 'production-sync-real-device': 'Owner standing waiver 2026-11-14: y' } };
  const state = { done: { 'notarize-dmg': { arm64: { dmgSHA256: 'a'.repeat(64) } }, publish: { at: '2026-11-15T09:00:00Z' }, 'verify-public': {} } };
  const standing = loadStanding(new URL('./fixtures/standing-before-beta5.json', import.meta.url));
  const out = recordRelease({ r: r5, state, ledger, standing, published: '2026-11-15',
    ranChecks: [{ gate: 'webauthn', evidence: 'evidence/foundation/beta5/webauthn.json', sha256: 'b'.repeat(64) }] });
  assert.deepEqual(out.ledger.builds.at(-1).gateWaivers, ['no-drm-handoff', 'production-sync-real-device']);
  assert.equal(out.ledger.builds.at(-1).dmgSHA256, 'a'.repeat(64));
  assert.equal(out.standing.carried.webauthn.lastPass.version, '2.0.0-beta.5');
  assert.deepEqual(out.standing.carried['desktop-sync'].lastPass, standing.carried['desktop-sync'].lastPass);
  assert.match(out.line, /^- 2026-11-15 2\.0\.0-beta\.5 \(build 5\).*checks run again: webauthn\.\n$/);
  assert.throws(() => recordRelease({ r: r5, state: { done: {} }, ledger, standing, published: '2026-11-15', ranChecks: [] }), /verify-public/);
  assert.throws(() => recordRelease({ r: { ...r5, build: 4, previousBuild: 3, version: '2.0.0-beta.4', tag: 'chromium-beta-2.0.0-beta.4', shortVersion: '2.0.0-beta.4' }, state, ledger, standing, published: '2026-11-15', ranChecks: [] }), /already has this build/);
});

test('a limitation kept after its waiver is retired stays on the page, with the gate passing', () => {
  // The protected-video waiver retired (owner, 2026-11-17): the gate passes on its notice, and video still does not play.
  const retired = { ...standingThen, keptLimits: ['no-drm-handoff'],
    waivers: { ...standingThen.waivers, 'no-drm-handoff': { ...standingThen.waivers['no-drm-handoff'], until: '2.0.0-beta.4' } } };
  const passing = structuredClone(r);
  delete passing.gateWaivers['no-drm-handoff'];
  const ledger = JSON.parse(siteFiles({ ...input, r: passing, standing: retired })['docs/website-blanc-beta-2.0.0-beta.4-claims.json']);
  const claim = ledger.claims.find(c => c.text === LIMITATIONS['no-drm-handoff']);
  assert.match(claim.evidence, /does not play/);
  assert.match(claim.evidence, /gate passes/);
  assert.doesNotMatch(claim.evidence, /is waived/);
  // Without the kept limitation the page's text would change, which needs the owner.
  assert.throws(() => siteFiles({ ...input, r: passing, standing: standingThen }), /needs the owner/);
});
