import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candidateOf, checkCarriedEvidence } from './daily/beta-prep.mjs';
import { sha256 } from './policy.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-prep-'));

test('candidateOf names the candidate from the framework digest', () => {
  const app = path.join(tmp(), 'Blanc Beta.app');
  const dir = path.join(app, 'Contents/Frameworks/Blanc Beta Framework.framework/Versions/158.0.8127.2');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Blanc Beta Framework'), 'framework bytes');
  assert.equal(candidateOf(app), `macos-${sha256(Buffer.from('framework bytes')).slice(0, 16)}`);
});

test('carried evidence must be the pinned bytes; a gate due for a check is not read', () => {
  const base = tmp();
  fs.mkdirSync(path.join(base, 'evidence'));
  fs.writeFileSync(path.join(base, 'evidence/w.json'), '{"status":"pass"}');
  const pass = { carried: true, lastPass: { evidence: 'evidence/w.json', sha256: sha256(Buffer.from('{"status":"pass"}')) } };
  checkCarriedEvidence({ webauthn: pass }, base);
  checkCarriedEvidence({ webauthn: { carried: false, lastPass: { evidence: 'missing.json', sha256: 'x' } } }, base);
  assert.throws(() => checkCarriedEvidence({ webauthn: { ...pass, lastPass: { ...pass.lastPass, sha256: 'a'.repeat(64) } } }, base), /changed since it was pinned: webauthn/);
  assert.throws(() => checkCarriedEvidence({ webauthn: { ...pass, lastPass: { ...pass.lastPass, evidence: 'nope.json' } } }, base), /missing on this Mac: webauthn/);
});
