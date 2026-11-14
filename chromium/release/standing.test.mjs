import test from 'node:test';
import assert from 'node:assert/strict';
import { betaNumber, globMatch, standingWaiver, carriedState, loadStanding, validateStanding } from './standing.mjs';
import { validateRelease, waiverAllowed } from './policy.mjs';

const standing = {
  schema: 1,
  anyChange: ['chromium/lanes/desktop.json', 'chromium/upstream/**'],
  waivers: {
    'no-drm-handoff': { since: '2.0.0-beta.5', reason: 'a standing owner reason long enough' },
    'production-sync-real-device': { since: '2.0.0-beta.5', until: '2.0.0-beta.9', reason: 'a retired owner reason long enough' },
  },
  carried: {
    webauthn: { who: 'owner', check: 'Touch ID', paths: ['chromium/blanc/browser/webauthn/**', 'chromium/patches/*passkey*'],
      lastPass: { version: '2.0.0-beta.4', sourceCommit: 'a'.repeat(40), evidence: 'evidence/x.json', sha256: 'b'.repeat(64) } },
  },
};

test('betaNumber reads N from 2.0.0-beta.N only', () => {
  assert.equal(betaNumber('2.0.0-beta.12'), 12);
  assert.equal(betaNumber('2.0.0'), null);
  assert.equal(betaNumber('2.0.0-beta.0'), null);
});

test('a standing waiver applies from since up to, not including, until', () => {
  assert.equal(standingWaiver(standing, '2.0.0-beta.4', 'no-drm-handoff'), null);
  assert.match(standingWaiver(standing, '2.0.0-beta.5', 'no-drm-handoff'), /standing/);
  assert.match(standingWaiver(standing, '2.0.0-beta.40', 'no-drm-handoff'), /standing/);
  assert.match(standingWaiver(standing, '2.0.0-beta.8', 'production-sync-real-device'), /retired/);
  assert.equal(standingWaiver(standing, '2.0.0-beta.9', 'production-sync-real-device'), null);
  assert.equal(standingWaiver(standing, '2.0.0-beta.6', 'gatekeeper'), null);
});

test('globMatch: * stays in one segment, ** crosses segments', () => {
  assert.ok(globMatch('chromium/patches/*passkey*', 'chromium/patches/0054-blanc-private-passkey-secret.patch'));
  assert.ok(!globMatch('chromium/patches/*passkey*', 'chromium/patches/sub/0054-passkey.patch'));
  assert.ok(globMatch('chromium/blanc/browser/webauthn/**', 'chromium/blanc/browser/webauthn/a/b/c.mm'));
  assert.ok(!globMatch('chromium/blanc/browser/webauthn/**', 'chromium/blanc/browser/webauthnx/c.mm'));
  assert.ok(globMatch('chromium/lanes/desktop.json', 'chromium/lanes/desktop.json'));
  assert.ok(!globMatch('chromium/lanes/desktop.json', 'chromium/lanes/desktop.jsonx'));
  assert.ok(globMatch('a/*.mm', 'a/x.y.mm'));
});

test('a carried gate stops counting when its code or anyChange changed', () => {
  assert.deepEqual(carriedState(standing, 'webauthn', ['chromium/blanc/browser/ui/x.cc']), { carried: true, touched: [] });
  assert.deepEqual(carriedState(standing, 'webauthn', ['chromium/patches/0054-blanc-private-passkey-secret.patch']),
    { carried: false, touched: ['chromium/patches/0054-blanc-private-passkey-secret.patch'] });
  assert.deepEqual(carriedState(standing, 'webauthn', ['chromium/upstream/chrome/VERSION']),
    { carried: false, touched: ['chromium/upstream/chrome/VERSION'] });
  assert.throws(() => carriedState(standing, 'gatekeeper', []), /not a carried gate/);
});

test('the committed standing file is valid and names only real gates', () => {
  const s = loadStanding();
  assert.equal(s.schema, 1);
  assert.ok(Object.keys(s.waivers).includes('no-drm-handoff'));
});

test('validateStanding refuses a short reason, a bad range and an unknown gate', () => {
  assert.throws(() => validateStanding({ ...standing, waivers: { 'no-drm-handoff': { since: '2.0.0-beta.5', reason: 'short' } } }), /reason/);
  assert.throws(() => validateStanding({ ...standing, waivers: { 'no-drm-handoff': { since: '2.0.0-beta.5', until: '2.0.0-beta.5', reason: 'x'.repeat(30) } } }), /until/);
  assert.throws(() => validateStanding({ ...standing, waivers: { 'made-up': { since: '2.0.0-beta.5', reason: 'x'.repeat(30) } } }), /gate/);
  assert.throws(() => validateStanding({ ...standing, carried: { webauthn: { ...standing.carried.webauthn, lastPass: { ...standing.carried.webauthn.lastPass, sha256: 'x' } } } }), /lastPass/);
});

test('policy accepts a standing waiver for a later beta and still accepts the per-version ones', () => {
  assert.ok(waiverAllowed({ version: '2.0.0-beta.5' }, 'no-drm-handoff'));
  assert.ok(waiverAllowed({ version: '2.0.0-beta.4' }, 'production-sync-real-device'));
  assert.ok(!waiverAllowed({ version: '2.0.0-beta.5' }, 'gatekeeper'));
  assert.ok(!waiverAllowed({ version: '2.0.0-beta.1' }, 'no-drm-handoff'));
  assert.equal(typeof validateRelease, 'function');
});

test('KNOWN_GATES is manifest.mjs GATES', async () => {
  const { GATES } = await import('./manifest.mjs');
  const { KNOWN_GATES } = await import('./standing.mjs');
  assert.deepEqual(KNOWN_GATES, GATES);
});
