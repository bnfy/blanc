import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assemble, sourceVerdict} from './gate-evidence.mjs';
import {GATES, verifyEvidenceFiles} from './manifest.mjs';
import {assetName, sha256} from './policy.mjs';

const WHY = 'Owner waiver 2026-11-14: the protected-video notice comes in beta.3.';
function setup({waive = true} = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-evidence-'));
  const r = JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
  Object.assign(r, {version: '2.0.0-beta.2', tag: 'chromium-beta-2.0.0-beta.2', shortVersion: '2.0.0-beta.2', build: 2, previousBuild: 1});
  if (waive) r.gateWaivers = {'no-drm-handoff': WHY};
  fs.writeFileSync(path.join(work, 'release.json'), JSON.stringify(r));
  fs.mkdirSync(path.join(work, 'assets'));
  fs.writeFileSync(path.join(work, 'assets', assetName(r, 'arm64')), 'final dmg');
  const src = path.join(work, 'src'); fs.mkdirSync(src);
  const map = {arm64: {}};
  for (const gate of GATES) {
    if (waive && gate === 'no-drm-handoff') continue;
    const file = path.join(src, `${gate}.json`);
    fs.writeFileSync(file, JSON.stringify({gate, status: 'pass'}));
    map.arm64[gate] = {files: [file]};
  }
  map.arm64.acceptance.basis = 'full suite on the same-source prototype';
  return {work, r, map, src};
}

test('source verdicts read a report\'s own status words', () => {
  assert.equal(sourceVerdict('{"status":"pass"}'), 'pass');
  assert.equal(sourceVerdict('{"report":{"verdict":"pass"},"status":"pass"}'), 'pass');
  assert.equal(sourceVerdict('{"status":"pass","verdict":"fail"}'), 'fail');
  assert.equal(sourceVerdict('{"checks":[]}'), 'unstated');
  assert.equal(sourceVerdict('629 pass, 0 fail'), 'text');
});

test('writes every bundle and an acceptance index the manifest stage accepts', () => {
  const {work, r, map} = setup();
  const {acceptance} = assemble(work, map, {write: true});
  const a = acceptance.arches.arm64;
  assert.equal(a.dmgSHA256, sha256('final dmg'));
  assert.equal(a.gates['no-drm-handoff'].status, 'waived');
  assert.equal(Object.values(a.gates).filter(g => g.status === 'pass').length, GATES.length - 1);
  verifyEvidenceFiles(JSON.parse(fs.readFileSync(path.join(work, 'payloads', 'acceptance.json'))), r, path.join(work, 'evidence'));
  const waived = JSON.parse(fs.readFileSync(path.join(work, 'evidence', 'arm64', 'no-drm-handoff.evidence')));
  assert.equal(waived.waiver, WHY);
  const acc = JSON.parse(fs.readFileSync(path.join(work, 'evidence', 'arm64', 'acceptance.evidence')));
  assert.equal(acc.basis, 'full suite on the same-source prototype');
  assert.equal(acc.sources[0].json.status, 'pass');
  assert.throws(() => assemble(work, map, {write: true}), /already exists/);
});

test('a waiver decided after release.json was fixed comes from SOURCES, only where policy allows it', () => {
  const later = 'Owner waiver 2026-11-14: production Sync with a real iPhone is waived for the first fork beta.';
  const {work, map} = setup(); map.arm64['production-sync-real-device'] = {waiver: later};
  const {acceptance} = assemble(work, map, {write: true});
  assert.deepEqual(acceptance.arches.arm64.gates['production-sync-real-device'].status, 'waived');
  assert.equal(acceptance.arches.arm64.gates['production-sync-real-device'].waiver, later);
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'evidence', 'arm64', 'production-sync-real-device.evidence'))).waiver, later);
  const other = setup(); other.map.arm64.webauthn = {waiver: later};
  assert.throws(() => assemble(other.work, other.map), /no owner waiver for gate: webauthn/);
  const short = setup(); short.map.arm64['production-sync-real-device'] = {waiver: 'short'};
  assert.throws(() => assemble(short.work, short.map), /no owner waiver/);
});

test('refuses missing, failing or unstated evidence, and a waiver the descriptor lacks', () => {
  {
    const {work, map} = setup(); delete map.arm64.gatekeeper;
    const {missing} = assemble(work, map);
    assert.deepEqual(missing.map(m => m.gate), ['gatekeeper']);
    assert.throws(() => assemble(work, map, {write: true}), /gate not ready: gatekeeper/);
    assert.equal(fs.existsSync(path.join(work, 'payloads', 'acceptance.json')), false);
  }
  {
    const {work, map, src} = setup(); fs.writeFileSync(path.join(src, 'webauthn.json'), '{"status":"fail"}');
    assert.throws(() => assemble(work, map, {write: true}), /gate not ready: webauthn/);
  }
  {
    const {work, map, src} = setup(); fs.writeFileSync(path.join(src, 'webauthn.json'), '{"checks":[]}');
    assert.throws(() => assemble(work, map, {write: true}), /gate not ready: webauthn/);
  }
  {
    const {work, map} = setup({waive: false}); delete map.arm64['no-drm-handoff'];
    assert.throws(() => assemble(work, map, {write: true}), /gate not ready: no-drm-handoff/);
  }
  {
    const {work, map, src} = setup(); map.arm64['no-drm-handoff'] = {files: [path.join(src, 'acceptance.json')]};
    assert.throws(() => assemble(work, map), /waived gate takes no evidence/);
  }
  {
    const {work, map} = setup(); map.arm64.unknown = {files: []};
    assert.throws(() => assemble(work, map), /unknown gate/);
  }
  {
    const {work, map, src} = setup(); const link = path.join(src, 'linked.json');
    fs.symlinkSync(path.join(src, 'webauthn.json'), link); map.arm64.webauthn.files = [link];
    assert.throws(() => assemble(work, map), /evidence source missing: linked\.json/, 'a symlinked source is refused');
  }
  {
    const {work, map} = setup(); map.arm64.webauthn.files = ['relative.json'];
    assert.throws(() => assemble(work, map), /absolute/);
  }
});
