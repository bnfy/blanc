#!/usr/bin/env node
// Builds the release's gate evidence for release.mjs's manifest stage
// (docs/chromium-beta-release.md §6): WORK/evidence/<arch>/<gate>.evidence for
// every gate in manifest.mjs GATES, and WORK/payloads/acceptance.json, the
// index of their digests bound to the final DMG bytes.
//
//   node chromium/release/gate-evidence.mjs plan  WORK SOURCES.json
//   node chromium/release/gate-evidence.mjs write WORK SOURCES.json
//
// Run it after the sparkle stage (the DMGs are final in WORK/assets) and before
// manifest. SOURCES.json names, per architecture and gate, the evidence files
// that back it and, where the owner decided one, the basis that lets them count
// (an equivalence or a local-build check), for example:
//
//   {"arm64": {"acceptance": {"basis": "full suite on the same-source prototype",
//                             "files": ["/…/full-beta2-equivalence/summary.json"]},
//              "gatekeeper": {"files": ["/…/gatekeeper.json"]}}}
//
// Each bundle embeds its sources byte for byte (JSON parsed, text as text) with
// their digests. A JSON source must report "pass" (status, verdict or result).
// A gate policy.mjs GATE_WAIVERS lets this release waive is written "waived" with
// the owner's reason, from release.json's gateWaivers or, for a waiver decided
// after release.json was fixed, from its SOURCES entry {"waiver": "reason"}; the
// reason is also put in acceptance.json. A waived gate takes no sources. plan only reports what
// is ready; write refuses anything missing or failing and never overwrites.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {check, equal, reason, sha256, validateRelease, assetName, waiverAllowed, waiverReason} from './policy.mjs';
import {GATES, validateAcceptance} from './manifest.mjs';

const MAX_SOURCE = 4 * 1024 * 1024;
const PASSING = new Set(['pass', 'passed']);

// The source's verdict, from a JSON report's own status words.
export function sourceVerdict(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return 'text'; }
  const said = [doc?.status, doc?.verdict, doc?.result, doc?.report?.verdict].filter(v => typeof v === 'string');
  if (!said.length) return 'unstated';
  return said.every(v => PASSING.has(v.toLowerCase())) ? 'pass' : 'fail';
}

function readSource(file) {
  check(typeof file === 'string' && path.isAbsolute(file), 'evidence sources must be absolute paths');
  const stat = fs.lstatSync(file, {throwIfNoEntry: false});
  check(stat?.isFile(), `evidence source missing: ${path.basename(file)}`);
  check(stat.size > 0 && stat.size <= MAX_SOURCE, `evidence source size: ${path.basename(file)}`);
  const bytes = fs.readFileSync(file), text = bytes.toString('utf8');
  check(Buffer.from(text, 'utf8').equals(bytes), `evidence source must be UTF-8 text: ${path.basename(file)}`);
  return {name: path.basename(file), sha256: sha256(bytes), text};
}

// Every gate's state for one architecture: ready (with its bundle) or why not.
export function planGates(r, arch, dmgSHA256, sources = {}) {
  const unknown = Object.keys(sources).filter(g => !GATES.includes(g));
  check(!unknown.length, `unknown gate: ${unknown[0]}`);
  return GATES.map(gate => {
    const entry = sources[gate], waiver = r.gateWaivers?.[gate] ?? entry?.waiver;
    const head = {schema: 1, gate, arch,
      release: {version: r.version, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest, candidate: r.candidates[arch], dmgSHA256}};
    if (waiver !== undefined) {
      check(waiverAllowed(r, gate) && waiverReason(waiver), `no owner waiver for gate: ${gate}`);
      check(!entry?.files?.length, `a waived gate takes no evidence sources: ${gate}`);
      return {gate, ready: true, bundle: {...head, status: 'waived', waiver}};
    }
    if (!entry?.files?.length) return {gate, ready: false, why: 'no evidence yet'};
    check(Array.isArray(entry.files) && (entry.basis === undefined || (typeof entry.basis === 'string' && entry.basis.trim())), `evidence entry: ${gate}`);
    const read = entry.files.map(readSource);
    const bad = read.find(s => !['pass', 'text'].includes(sourceVerdict(s.text)));
    if (bad) return {gate, ready: false, why: `${bad.name} does not report a pass`};
    const embedded = read.map(s => {
      const json = sourceVerdict(s.text) !== 'text';
      return {name: s.name, sha256: s.sha256, ...(json ? {json: JSON.parse(s.text)} : {text: s.text})};
    });
    return {gate, ready: true, bundle: {...head, status: 'pass', ...(entry.basis ? {basis: entry.basis.trim()} : {}), sources: embedded}};
  });
}

export function assemble(work, map, {write = false} = {}) {
  const r = validateRelease(JSON.parse(fs.readFileSync(path.join(work, 'release.json'), 'utf8')));
  check(map && typeof map === 'object' && !Array.isArray(map), 'SOURCES.json must be an object');
  equal(Object.keys(map).sort(), [...r.arches].sort(), 'evidence for every architecture');
  const acceptance = {sourceCommit: r.sourceCommit, inputDigest: r.inputDigest, build: r.build, arches: {}};
  const payloads = {}, plan = {}, bundles = [];
  for (const arch of r.arches) {
    const dmg = path.join(work, 'assets', assetName(r, arch));
    check(fs.existsSync(dmg), `the final ${arch} DMG is not in WORK/assets yet (run the sparkle stage first)`);
    payloads[assetName(r, arch)] = fs.readFileSync(dmg);
    const dmgSHA256 = sha256(payloads[assetName(r, arch)]);
    plan[arch] = planGates(r, arch, dmgSHA256, map[arch]);
    const gates = {};
    for (const p of plan[arch]) if (p.ready) {
      const bytes = Buffer.from(JSON.stringify(p.bundle, null, 2) + '\n');
      gates[p.gate] = {status: p.bundle.status, ...(p.bundle.waiver ? {waiver: p.bundle.waiver} : {}), evidenceSHA256: sha256(bytes)};
      bundles.push({file: path.join(work, 'evidence', arch, `${p.gate}.evidence`), bytes});
    }
    acceptance.arches[arch] = {candidate: r.candidates[arch], dmgSHA256, gnArgsSHA256: r.gnArgsSHA256[arch], gates};
  }
  const missing = Object.values(plan).flat().filter(p => !p.ready);
  if (!write) return {plan, missing};
  check(!missing.length, `gate not ready: ${missing[0]?.gate} (${missing[0]?.why})`);
  validateAcceptance(acceptance, r, payloads);
  const index = path.join(work, 'payloads', 'acceptance.json');
  check(!fs.existsSync(index), 'payloads/acceptance.json already exists; nothing was overwritten');
  for (const b of bundles) check(!fs.existsSync(b.file), 'an evidence bundle already exists; nothing was overwritten');
  for (const b of bundles) { fs.mkdirSync(path.dirname(b.file), {recursive: true, mode: 0o700}); fs.writeFileSync(b.file, b.bytes, {flag: 'wx', mode: 0o600}); }
  fs.mkdirSync(path.dirname(index), {recursive: true, mode: 0o700});
  fs.writeFileSync(index, JSON.stringify(acceptance, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {plan, missing, acceptance};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, work, sources] = process.argv.slice(2);
  try {
    check(['plan', 'write'].includes(mode) && work && sources, 'usage: gate-evidence.mjs plan|write WORK SOURCES.json');
    const result = assemble(path.resolve(work), JSON.parse(fs.readFileSync(sources, 'utf8')), {write: mode === 'write'});
    for (const [arch, gates] of Object.entries(result.plan))
      for (const p of gates) console.log(`${arch} ${p.gate}: ${p.ready ? p.bundle.status : `MISSING (${p.why})`}`);
    if (mode === 'write') console.log('Wrote payloads/acceptance.json and every evidence bundle.');
    else if (result.missing.length) { console.log(`${result.missing.length} gate(s) not ready.`); process.exitCode = 1; }
  } catch (error) { console.error(`Gate evidence stopped: ${reason(error)}`); process.exitCode = 1; }
}
