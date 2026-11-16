#!/usr/bin/env node
// Evidence for the profile-coexistence gate: Blanc Beta keeps to its own
// "Blanc Beta" folders and refuses every other Blanc identity's data.
//
//   node chromium/release/profile-evidence.mjs RELEASE.json APP EVIDENCE
//
// Each launch gets a throwaway HOME seeded with decoys of the reserved
// folders (Application Support and Caches for the Electron app under both
// its names and bundle id, the release fork and the preview), each holding
// a marker file. Default: the beta opens its page and creates its profile
// under Application Support/Blanc Beta, nothing else named for Blanc appears,
// and every decoy is byte for byte as it was. Refusals: pointed at a decoy
// (directly, through a symlink alias, as a cache folder), at a profile name
// that climbs out, or asked to import, the beta must quit before opening the
// page and leave every decoy as it was. The owner's real Library is never
// used; the real "Blanc Beta" folder is checked unchanged across the run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {check, reason, sha256, validateRelease} from './policy.mjs';
import {plist} from './sbom.mjs';
import {launchBeta} from './launch-beta.mjs';

export const RESERVED = ['Blanc', 'Bowser', 'me.bnfy.bowser', 'Blanc Browser', 'Blanc Chromium Preview'];
const SUPPORT = 'Library/Application Support', CACHES = 'Library/Caches';

// Every file under DIR with its size and digest: a decoy's fingerprint.
export function tree(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = {};
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), {withFileTypes: true})) {
      const name = path.join(rel, entry.name), full = path.join(dir, name);
      if (entry.isDirectory()) { out[name + '/'] = 'dir'; walk(name); }
      else if (entry.isSymbolicLink()) out[name] = 'link:' + fs.readlinkSync(full);
      else out[name] = sha256(fs.readFileSync(full));
    }
  };
  walk('');
  return out;
}

export function seed(home) {
  for (const parent of [SUPPORT, CACHES]) for (const name of RESERVED) {
    fs.mkdirSync(path.join(home, parent, name), {recursive: true});
    fs.writeFileSync(path.join(home, parent, name, 'MARKER'), `decoy ${parent}/${name}\n`);
  }
  fs.symlinkSync(path.join(home, SUPPORT, 'Blanc'), path.join(home, 'alias-to-blanc'));
}
const decoys = home => Object.fromEntries([SUPPORT, CACHES].flatMap(parent =>
  RESERVED.map(name => [`${parent}/${name}`, tree(path.join(home, parent, name))])));

export const REFUSALS = home => [
  {name: 'electron-profile', args: [`--user-data-dir=${path.join(home, SUPPORT, 'Blanc')}`]},
  {name: 'electron-old-name', args: [`--user-data-dir=${path.join(home, SUPPORT, 'Bowser')}`]},
  {name: 'electron-bundle-id', args: [`--user-data-dir=${path.join(home, SUPPORT, 'me.bnfy.bowser', 'Default')}`]},
  {name: 'release-fork-profile', args: [`--user-data-dir=${path.join(home, SUPPORT, 'Blanc Browser')}`]},
  {name: 'preview-profile', args: [`--user-data-dir=${path.join(home, SUPPORT, 'Blanc Chromium Preview')}`]},
  {name: 'symlink-alias', args: [`--user-data-dir=${path.join(home, 'alias-to-blanc', 'inner')}`]},
  {name: 'electron-cache', args: [`--disk-cache-dir=${path.join(home, CACHES, 'Blanc')}`]},
  {name: 'profile-climbs-out', args: ['--profile-directory=..']},
  {name: 'unattended-import', args: ['--import-from-file=/dev/null']},
];

export async function collect(r, app, {run = launchBeta, realBeta = path.join(os.homedir(), SUPPORT, 'Blanc Beta')} = {}) {
  validateRelease(r, {allowLocalQualification: true});
  const failures = [];
  const info = plist(path.join(app, 'Contents/Info.plist'));
  check(info, 'the app has no readable Info.plist');
  if (String(info.CFBundleVersion) !== String(r.build)) failures.push('the app is not this release\'s build');
  if (info.CrProductDirName !== 'Blanc Beta') failures.push(`the app's data folder name is ${info.CrProductDirName}, not Blanc Beta`);
  const realBefore = tree(realBeta);
  const fresh = () => { const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-profile-ev-')); seed(home); return home; };
  const scenarios = {};
  // Default launch: its own folder, nothing else.
  {
    const home = fresh(), before = decoys(home);
    const supportBefore = new Set(fs.readdirSync(path.join(home, SUPPORT))), cachesBefore = new Set(fs.readdirSync(path.join(home, CACHES)));
    const result = await run({app, home});
    const created = [...fs.readdirSync(path.join(home, SUPPORT)).filter(n => !supportBefore.has(n)).map(n => `${SUPPORT}/${n}`),
      ...fs.readdirSync(path.join(home, CACHES)).filter(n => !cachesBefore.has(n)).map(n => `${CACHES}/${n}`)];
    const profile = fs.existsSync(path.join(home, SUPPORT, 'Blanc Beta', 'Local State')) && fs.existsSync(path.join(home, SUPPORT, 'Blanc Beta', 'Default'));
    const foreign = created.filter(n => /blanc|bowser|chrom/i.test(path.basename(n)) && !/^Blanc Beta$/.test(path.basename(n)));
    const changed = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(decoys(home)[k]));
    const pageLoaded = result.requests.some(q => / \/$/.test(q));
    scenarios.default = {pass: pageLoaded && profile && foreign.length === 0 && changed.length === 0, pageLoaded, profileCreated: profile, created, foreign, decoysChanged: changed};
    fs.rmSync(home, {recursive: true, force: true});
  }
  for (const refusal of REFUSALS('/HOME')) {
    const home = fresh(), before = decoys(home);
    const result = await run({app, home, args: REFUSALS(home).find(x => x.name === refusal.name).args, settle: 12000});
    const changed = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(decoys(home)[k]));
    const pageLoaded = result.requests.some(q => / \/$/.test(q));
    scenarios[refusal.name] = {pass: result.quitOnItsOwn && !pageLoaded && changed.length === 0, quitOnItsOwn: result.quitOnItsOwn,
      exitCode: result.exitCode, pageLoaded, decoysChanged: changed};
    fs.rmSync(home, {recursive: true, force: true});
  }
  const realAfter = tree(realBeta);
  if (JSON.stringify(realBefore) !== JSON.stringify(realAfter)) failures.push('the owner\'s real Blanc Beta folder changed during the run: HOME was not honoured');
  for (const [name, s] of Object.entries(scenarios)) if (!s.pass) failures.push(name === 'default'
    ? `default: ${!s.pageLoaded ? 'the page did not load' : !s.profileCreated ? 'no profile under Blanc Beta' : s.foreign.length ? `created ${s.foreign.join(', ')}` : `changed ${s.decoysChanged.join(', ')}`}`
    : `${name}: ${s.pageLoaded ? 'the beta opened its page' : !s.quitOnItsOwn ? 'the beta kept running' : `changed ${s.decoysChanged.join(', ')}`}`);
  return {schema: 1, gate: 'profile-coexistence', status: failures.length ? 'fail' : 'pass', failures,
    release: {version: r.version, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest},
    app: {name: path.basename(app), bundleVersion: info.CFBundleVersion, dataFolder: info.CrProductDirName},
    method: {home: 'a throwaway HOME per launch, seeded with decoys of every reserved folder', keychain: 'Chromium mock keychain',
      network: 'loopback only', reserved: RESERVED}, scenarios};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [releaseFile, app, evidence] = process.argv.slice(2);
    check(releaseFile && app && evidence && process.argv.length === 5, 'usage: profile-evidence.mjs RELEASE.json APP EVIDENCE');
    const result = await collect(JSON.parse(fs.readFileSync(releaseFile)), path.resolve(app));
    fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: result.status, failures: result.failures, evidenceSHA256: sha256(fs.readFileSync(evidence))}));
    if (result.status !== 'pass') process.exitCode = 1;
  } catch (error) { console.error(`Profile evidence failed: ${reason(error)}`); process.exitCode = 1; }
}
