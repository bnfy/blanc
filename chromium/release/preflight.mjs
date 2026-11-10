#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRelease, validateProfile, validateIdentityList, validateGN, validateLedger, ROOT_ID, PRODUCT, TEAM, sha256, check, equal, reason } from './policy.mjs';
import { profileAt, run, GIT, PYTHON } from './native.mjs';
export const ROOT = path.resolve(import.meta.dirname, '../..');
export function validateBetaBranding(text) {
  const branding = Object.fromEntries(text.split(/\r?\n/).filter(l => l.includes('=')).map(l => {
    const index = l.indexOf('='); return [l.slice(0,index), l.slice(index+1)];
  }));
  equal(branding.MAC_BUNDLE_ID, ROOT_ID, 'beta branding bundle ID');
  equal(branding.MAC_TEAM_ID, TEAM, 'beta branding team');
  equal(branding.PRODUCT_FULLNAME, PRODUCT, 'beta branding full name');
  equal(branding.PRODUCT_SHORTNAME, PRODUCT, 'beta branding short name');
}
// Only files git tracks are release inputs: an ignored file (.DS_Store, an editor backup) must
// not change the digest while the tree still looks clean.
export function trackedFiles(root, dir) {
  return run(GIT, ['-C', root, 'ls-files', '-z', '--', dir]).split('\0').filter(Boolean);
}
export const INPUT_DIRS = ['chromium/blanc', 'chromium/patches', 'chromium/lanes', 'chromium/upstream'];
export function inputInventory(root = ROOT, list = dir => trackedFiles(root, dir)) {
  const lane = JSON.parse(fs.readFileSync(path.join(root, 'chromium/lanes/desktop.json')));
  const upstream = JSON.parse(fs.readFileSync(path.join(root, 'chromium/upstream/manifest.json')));
  equal(lane.upstream, upstream.upstream, 'lane/upstream agreement');
  const names = ['chromium/lanes/desktop.json', 'chromium/upstream/manifest.json', 'chromium/source-map.json', ...lane.patches.map(p => `chromium/${p}`), ...list('chromium/blanc')];
  for (const name of names) check(!fs.lstatSync(path.join(root, name)).isSymbolicLink(), 'source symlinks require review');
  const files = names.sort().map(name => ({ path: name, sha256: sha256(fs.readFileSync(path.join(root, name))) }));
  for (const [name, digest] of Object.entries(upstream.files)) {
    equal(sha256(fs.readFileSync(path.join(root, 'chromium/upstream', name))), digest, 'pristine upstream digest');
  }
  return { upstream: lane.upstream, files, digest: sha256(JSON.stringify(files)) };
}
export function validateLocalInputs(r, inputs) {
  check(inputs && path.isAbsolute(inputs.profile || ''), 'absolute profile path required');
  check(path.isAbsolute(inputs.sparkleArchive || ''), 'absolute pinned Sparkle distribution path required');
  equal(sha256(fs.readFileSync(inputs.sparkleArchive)), r.sparkle.archiveSHA256, 'Sparkle archive bytes changed');
  for (const arch of r.arches) {
    check(path.isAbsolute(inputs.gnArgs?.[arch] || ''), 'absolute GN args path required');
    const bytes = fs.readFileSync(inputs.gnArgs[arch]);
    equal(sha256(bytes), r.gnArgsSHA256[arch], 'GN args changed');
    const gn=validateGN(bytes.toString('utf8'), arch);
    equal(gn.blanc_beta_version, r.version, 'GN beta version differs from release');
    equal(gn.blanc_beta_build, r.build, 'GN beta build differs from release');
    equal(gn.blanc_sparkle_public_key, r.sparkle.publicKey, 'GN updater key differs from release');
    equal(gn.blanc_sparkle_archive_sha256, r.sparkle.archiveSHA256, 'GN Sparkle archive differs from release');
  }
  equal(sha256(fs.readFileSync(inputs.profile)), r.profileSHA256, 'profile bytes changed');
}
export function preflight(r, {root = ROOT, inputs, now = Date.now()} = {}) {
  validateRelease(r);
  check(process.platform === 'darwin', 'native preflight requires macOS');
  check(!process.env.CSC_LINK && !process.env.CSC_NAME && !process.env.CSC_IDENTITY_AUTO_DISCOVERY, 'alternate signer environment refused');
  equal(run(GIT, ['-C', root, 'status', '--porcelain']).trim(), '', 'clean tree required including untracked files');
  // A build reads these directories from disk, so ignored files in them are refused too.
  equal(run(GIT, ['-C', root, 'status', '--porcelain', '--ignored', '--', ...INPUT_DIRS]).trim(), '', 'ignored or untracked files in release input directories');
  equal(run(GIT, ['-C', root, 'rev-parse', 'HEAD']).trim(), r.sourceCommit, 'source HEAD');
  check(!run(GIT, ['-C', root, 'tag', '--list', r.tag]).trim(), 'immutable local tag already exists');
  validateLedger(JSON.parse(fs.readFileSync(path.join(root, 'chromium/release/ledger.json'))), r);
  const inventory = inputInventory(root);
  equal(inventory.upstream, r.upstream, 'upstream input'); equal(inventory.digest, r.inputDigest, 'source inputs changed');
  // Select the dedicated beta branding; preserved release branding is Electron's ID.
  validateBetaBranding(fs.readFileSync(path.join(root, 'chromium/blanc/branding/beta/BRANDING'), 'utf8'));
  run(PYTHON, [path.join(root, 'chromium/tools/check-patches.py'), '--lane', 'desktop']);
  validateLocalInputs(r, inputs);
  for (const arch of r.arches) {
    const gn=validateGN(fs.readFileSync(inputs.gnArgs[arch],'utf8'),arch);
    run(PYTHON,[path.join(root,'chromium/blanc/third_party/sparkle/verify.py'),
      '--stage',gn.blanc_sparkle_stage,'--archive-sha256',r.sparkle.archiveSHA256]);
  }
  const inspected = profileAt(inputs.profile);
  validateProfile(inspected.data, inspected.certificates, r, now);
  validateIdentityList(run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']), r);
  return { status: 'local-preflight-only', inputDigest: inventory.digest, remoteUniqueness: 'NOT CHECKED', buildAcceptance: 'NOT CHECKED' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--inventory' && process.argv.length === 3) console.log(JSON.stringify(inputInventory(), null, 2));
    else {
      check(process.argv.length === 4, 'usage: preflight.mjs RELEASE.json LOCAL-INPUTS.json (or --inventory)');
      console.log(JSON.stringify(preflight(JSON.parse(fs.readFileSync(process.argv[2])), {inputs: JSON.parse(fs.readFileSync(process.argv[3]))})));
    }
  } catch (error) { console.error(`Beta preflight failed: ${reason(error)}. Nothing was built or published.`); process.exitCode = 1; }
}
