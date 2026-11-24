// The owner's standing gate decisions for daily Blanc Betas (standing.json).
// Owner, 2026-11-14: waivers and carried checks carry from one beta to the
// next until the owner changes them. This module imports nothing from
// policy.mjs (policy imports it); its errors are StandingError, whose fixed
// messages policy's reason() and the daily tools print.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STANDING_FILE = fileURLToPath(new URL('./standing.json', import.meta.url));
// The same list as manifest.mjs GATES (standing.test.mjs keeps them equal);
// importing it here would make policy.mjs import itself.
export const KNOWN_GATES = ['acceptance', 'desktop-sync', 'production-sync-real-device', 'notices-and-credits', 'blocker-payload', 'outbound-isolation', 'profile-coexistence', 'webauthn', 'no-drm-handoff', 'official-hooks-absent', 'sparkle-N-to-N+1', 'native-signature', 'gatekeeper'];

export class StandingError extends Error {}
const must = (condition, message) => { if (!condition) throw new StandingError(message); };

export function betaNumber(version) {
  const m = /^2\.0\.0-beta\.([1-9]\d*)$/.exec(String(version));
  return m ? Number(m[1]) : null;
}

export function validateStanding(s) {
  must(s?.schema === 1, 'standing decisions schema must be 1');
  must(Array.isArray(s.anyChange) && s.anyChange.every(g => typeof g === 'string' && g), 'standing anyChange must be a list of paths');
  must(s.chromiumVersion === undefined || (typeof s.chromiumVersion?.file === 'string' && s.chromiumVersion.file
    && Array.isArray(s.chromiumVersion.fields) && s.chromiumVersion.fields.length > 0 && s.chromiumVersion.fields.every(f => typeof f === 'string' && f)),
    'standing chromiumVersion needs a file and its fields');
  must(typeof s.archWaiver === 'string' && s.archWaiver.trim().length >= 20, 'standing Intel waiver needs the owner\'s reason');
  must(Array.isArray(s.whatToKnow) && s.whatToKnow.every(l => typeof l === 'string' && l.startsWith('- ')), 'standing whatToKnow must be release-notes bullets');
  for (const [gate, w] of Object.entries(s.waivers ?? {})) {
    must(typeof s.notes?.[gate] === 'string' && s.notes[gate].startsWith('- '), `standing waiver needs its release-notes line: ${gate}`);
    must(KNOWN_GATES.includes(gate), `standing waiver names an unknown gate: ${gate}`);
    must(betaNumber(w?.since) !== null, `standing waiver needs since: ${gate}`);
    must(w.until === undefined || betaNumber(w.until) > betaNumber(w.since), `standing waiver until must come after since: ${gate}`);
    must(typeof w.reason === 'string' && w.reason.trim().length >= 20, `standing waiver needs the owner's reason: ${gate}`);
  }
  // A limitation that stays in the release notes and on the website after its
  // waiver is retired: the gate passes, and the thing is still not in the beta.
  must(s.keptLimits === undefined || (Array.isArray(s.keptLimits) && s.keptLimits.every(g => KNOWN_GATES.includes(g)
    && typeof s.notes?.[g] === 'string' && s.notes[g].startsWith('- '))), 'a kept limitation needs a known gate and its release-notes line');
  for (const [gate, c] of Object.entries(s.carried ?? {})) {
    must(KNOWN_GATES.includes(gate), `carried check names an unknown gate: ${gate}`);
    must(['owner', 'claude'].includes(c?.who) && typeof c.check === 'string' && c.check, `carried check needs who and what: ${gate}`);
    must(Array.isArray(c.paths) && c.paths.length > 0 && c.paths.every(g => typeof g === 'string' && g), `carried check needs paths: ${gate}`);
    must(c.chromiumVersion === undefined || c.chromiumVersion === false, `carried check chromiumVersion may only be false: ${gate}`);
    const p = c.lastPass;
    must(betaNumber(p?.version) !== null && /^[a-f0-9]{40}$/.test(p.sourceCommit) && typeof p.evidence === 'string' && p.evidence
      && !p.evidence.startsWith('/') && !p.evidence.split('/').includes('..') && /^[a-f0-9]{64}$/.test(p.sha256), `carried check lastPass: ${gate}`);
  }
  return s;
}

export function loadStanding(file = STANDING_FILE) {
  return validateStanding(JSON.parse(fs.readFileSync(file, 'utf8')));
}

// The owner's reason when a standing waiver covers this beta, else null.
export function standingWaiver(s, version, gate) {
  const n = betaNumber(version), w = s?.waivers?.[gate];
  if (n === null || !w) return null;
  if (n < betaNumber(w.since)) return null;
  if (w.until !== undefined && n >= betaNumber(w.until)) return null;
  return w.reason;
}

// The limitations a release lists, in standing.json's order: each waived gate,
// and each kept limitation whose gate now passes.
export function listedLimits(s, gateWaivers = {}) {
  return Object.keys(s?.notes ?? {}).filter(g => gateWaivers[g] || (s.keptLimits ?? []).includes(g));
}

// '*' matches within one path segment, '**' any number of segments.
export function globMatch(glob, file) {
  const parts = glob.split('/').map(seg => seg === '**' ? '(?:.*)'
    : seg.split('*').map(t => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'));
  const source = parts.join('/').replace(/\/\(\?:\.\*\)$/, '/.+').replace(/\(\?:\.\*\)\//g, '(?:.*/)?');
  return new RegExp(`^${source}$`).test(file);
}

// versionChanged: whether the Chromium version (standing.chromiumVersion's
// fields) differs between the check's last pass and this release. A check with
// chromiumVersion: false comes due on its own paths only (the passkey check,
// owner 2026-11-24): a Chromium update alone doesn't make it due.
export function carriedState(s, gate, changed, versionChanged = false) {
  const c = s.carried?.[gate];
  must(c, `not a carried gate: ${gate}`);
  const globs = [...c.paths, ...s.anyChange];
  const touched = changed.filter(file => globs.some(g => globMatch(g, file)));
  if (versionChanged && s.chromiumVersion && c.chromiumVersion !== false) touched.push(`Chromium version (${s.chromiumVersion.file})`);
  return { carried: touched.length === 0, touched };
}

// The Chromium version at a commit: standing.chromiumVersion's fields of its
// file, as one string, or null where the file is absent or unreadable.
export function chromiumVersionAt(s, commit, repo) {
  must(/^[a-f0-9]{7,40}$/.test(commit), 'commits must be hexadecimal ids');
  if (!s.chromiumVersion) return null;
  try {
    const text = execFileSync('git', ['-C', repo, 'show', `${commit}:${s.chromiumVersion.file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const value = JSON.parse(text);
    return JSON.stringify(s.chromiumVersion.fields.map(f => value?.[f] ?? null));
  } catch { return null; }
}

// Files changed between two commits (renames count as both names).
export function changedFiles(from, to, repo) {
  must(/^[a-f0-9]{7,40}$/.test(from) && /^[a-f0-9]{7,40}$/.test(to), 'commits must be hexadecimal ids');
  const out = execFileSync('git', ['-C', repo, 'diff', '--name-only', '--no-renames', from, to], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter(Boolean);
}
