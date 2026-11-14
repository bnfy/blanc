import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nextStep, factsOf, STEPS } from './daily/release-steps.mjs';

const none = { done: {}, outbound: false, signedEvidence: false, evidenceWritten: false, due: [] };
const doneThrough = stage => Object.fromEntries(['preflight', 'sign', 'notarize-app', 'dmg', 'notarize-dmg', 'sparkle', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public']
  .slice(0, ['preflight', 'sign', 'notarize-app', 'dmg', 'notarize-dmg', 'sparkle', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public'].indexOf(stage) + 1).map(s => [s, {}]));

test('a fresh release starts with the outbound check, then preflight', () => {
  assert.equal(nextStep(none), 'outbound');
  assert.equal(nextStep({ ...none, outbound: true }), 'preflight');
});

test('a stopped run resumes at the first unfinished step and never repeats one', () => {
  const after = { ...none, outbound: true, done: doneThrough('notarize-dmg') };
  assert.equal(nextStep(after), 'signed-evidence');
  assert.equal(nextStep({ ...after, signedEvidence: true }), 'sparkle');
  const signed = { ...after, signedEvidence: true, done: doneThrough('sparkle') };
  assert.equal(nextStep({ ...signed, due: ['webauthn (owner)'] }), 'hand-checks');
  assert.equal(nextStep(signed), 'gate-evidence');
  assert.equal(nextStep({ ...signed, evidenceWritten: true }), 'manifest');
  assert.equal(nextStep({ ...signed, evidenceWritten: true, done: doneThrough('sigstore') }), 'publish');
  assert.equal(nextStep({ ...signed, evidenceWritten: true, done: doneThrough('verify-public') }), 'done');
});

test('the steps keep release.mjs stage order', async () => {
  const { STAGES } = await import('./release.mjs');
  assert.deepEqual(STEPS.filter(s => STAGES.includes(s)), STAGES);
});

// A throwaway Mac Studio: the work folder, the marker and stub commands, so the
// remote script runs end to end without signing, sudo or the keychain.
function studio({ due = [], done = {} } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-studio-'));
  const work = path.join(base, 'records/beta5-work');
  fs.mkdirSync(path.join(work, 'payloads'), { recursive: true });
  fs.mkdirSync(path.join(base, 'evidence/foundation/beta5'), { recursive: true });
  fs.symlinkSync(path.resolve(fileURLToPath(import.meta.url), '../../..'), path.join(base, 'repo'));
  fs.writeFileSync(path.join(work, 'release.json'), JSON.stringify({ version: '2.0.0-beta.5' }));
  fs.writeFileSync(path.join(work, 'hand-checks.json'), JSON.stringify(due));
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({ done }));
  fs.writeFileSync(path.join(base, 'records/RELEASE-IN-PROGRESS'), JSON.stringify({ version: '2.0.0-beta.5', work }));
  const bin = path.join(base, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['sudo', 'security']) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\necho "stub $(basename $0) $*" >> "$STUB_LOG"\n', { mode: 0o755 });
  return { base, work, bin, log: path.join(base, 'stub.log') };
}
const run = s => spawnSync('bash', [fileURLToPath(new URL('./owner/beta-release-remote.sh', import.meta.url))], {
  encoding: 'utf8', env: { PATH: `${s.bin}:/usr/bin:/bin`, HOME: s.base, BLANC_STUDIO_BASE: s.base, BLANC_NODE: process.execPath, STUB_LOG: s.log,
    LC_BLANC_APPLE_ID: 'id-value', LC_BLANC_APPLE_PW: 'pw-value', LC_BLANC_SPARKLE_KEY: 'key-value' } });

test('a public release ends at once, asking for nothing', () => {
  const s = studio({ done: doneThrough('verify-public') });
  fs.writeFileSync(path.join(s.base, 'evidence/foundation/beta5/outbound-report.json'), '{}');
  const r = run(s);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /already public/);
  assert.ok(!fs.existsSync(s.log), 'no password was asked');
});

test('a due hand check stops the run after the keychain, with code 2, and never prints a secret', () => {
  const s = studio({ due: [{ gate: 'webauthn', who: 'owner' }], done: doneThrough('sparkle') });
  fs.writeFileSync(path.join(s.base, 'evidence/foundation/beta5/outbound-report.json'), '{}');
  fs.mkdirSync(path.join(s.base, 'evidence/foundation/beta5-signed'));
  for (const f of ['native-signature.json', 'gatekeeper.json']) fs.writeFileSync(path.join(s.base, 'evidence/foundation/beta5-signed', f), '{}');
  const r = run(s);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /webauthn \(owner\) is due/);
  assert.deepEqual(fs.readFileSync(s.log, 'utf8').trim().split('\n').map(l => l.split(' ')[1]), ['security']);
  for (const secret of ['id-value', 'pw-value', 'key-value']) assert.ok(!(r.stdout + r.stderr).includes(secret));
  assert.match(fs.readFileSync(path.join(s.base, 'records/beta5-release-status.txt'), 'utf8'), /hand-checks webauthn/);
});

test('factsOf reads the work folder', () => {
  const s = studio({ due: [{ gate: 'webauthn', who: 'owner' }] });
  const facts = factsOf(s.work, s.base);
  assert.deepEqual(facts.due, ['webauthn (owner)']);
  assert.equal(facts.outbound, false);
  fs.writeFileSync(path.join(s.base, 'evidence/foundation/beta5/webauthn.json'), '{}');
  assert.deepEqual(factsOf(s.work, s.base).due, []);
});

test('a check before a stage that already ran is never asked for again', () => {
  assert.equal(nextStep({ ...none, done: doneThrough('preflight') }), 'sign');
  assert.equal(nextStep({ ...none, outbound: true, done: doneThrough('manifest') }), 'draft');
});
