// Android release attestation; no build, upload or server access.
//
// WORK contains build.json and the upload-key-signed Blanc-Android.aab.
// WORK/sbom-inputs.json (schema 1) is the offline handoff from the server:
// {sourceCommit, upstream, chromiumVersion, scan, scanSha256, src,
//  review: {sourceCommit, complete: true, reason}, additions: [], reviewedSkips: {}}
// `scan` and `src` are paths relative to WORK (or absolute). `src` may be a
// read-only copy containing only LICENSE and every scanned/additional licence
// file, preserving its relative path. Additions use the scanner's component
// shape (name, dir, version/revision, url, license, licenseFiles[{path,sha256}]);
// optional type and artifactSha256 preserve data/file provenance. Unknown
// versions stay absent. Every omitted/skipped folder needs a review reason.
// The pin metadata MUST come from the same tagged source as build.json; it
// supplies Chromium's version, which the build record does not contain.
// Android additions require an Android-specific completeness review: never
// copy the desktop sbom-extra.json (it includes Sparkle and desktop assets).
//
// See docs/android/a7-attestation.md for the server prepare/copy contract.
// node chromium/android/release/attest.mjs WORK
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT, gatherComponents, makeSbom, readRegular, validateScan} from '../../release/sbom.mjs';
import {sha256} from '../../release/policy.mjs';
import {validateBuildRecord} from './record.mjs';
const check = (value, message) => { if (!value) throw new Error(message); };
const SHA = /^[a-f0-9]{64}$/;
const TARGET = '//chrome/android:chrome_public_bundle';
const read = file => { const bytes = readRegular(file); check(bytes, `missing input: ${path.basename(file)}`); return bytes; };
const resolve = (work, value) => { check(typeof value === 'string' && value.length > 0, 'missing SBOM input path'); return path.resolve(work, value); };

// Read immutable repository objects, never the working tree's current pin.
// Task 9 must fetch the source tag/object into this repository before attest.
function sourceReader(record, run) {
  return file => {
    check(typeof file === 'string' && !file.split('/').includes('..') && !path.isAbsolute(file), 'invalid source path');
    const result = run('git', ['-C', ROOT, 'show', `${record.commit}:${file}`], {encoding: 'buffer', maxBuffer: 32 * 1024 * 1024});
    check(!result.error && result.status === 0 && result.stdout?.length, `tagged source input unavailable: ${file}`);
    return Buffer.from(result.stdout);
  };
}

// A draft, never a claim that the actual server scan has been reviewed. Known
// shipped additions cannot be removed. Missing upstream licence texts (ZXing,
// filter-list terms, aggregate bundle) remain explicit empty arrays to fill
// from the build tree before `complete` can be true.
export function reviewTemplate(record, run = spawnSync) {
  const source = sourceReader(record, run), load = file => JSON.parse(source(file));
  const pin = load('chromium/lanes/android.json');
  const bundle = load('chromium/blanc/third_party/blocker/bundle.json');
  const policy = load('compliance/policy.json'), pages = load('chromium/blanc/android/pages.json');
  const licence = (file, expected) => {
    const digest = sha256(source(file)); check(!expected || digest === expected, `tagged licence provenance mismatch: ${file}`);
    return {path: `repository/${file}`, sha256: digest, repositoryPath: file};
  };
  const packages = [...bundle.packages, bundle.proceduralRenderer].map(p => ({name: p.name, dir: `blanc/blocker/${p.name}`, version: p.version, license: p.license, url: p.source || 'https://github.com/ghostery/adblocker',
    licenseFiles: p.licenseFiles.map(f => licence(`chromium/blanc/third_party/blocker/${f.file}`, f.sha256))}));
  const build = source('chromium/blanc/android/BUILD.gn').toString();
  const zxing = /ZXing core ([\d.]+) \(Apache-2.0\)[\s\S]*?# ([a-f0-9]{64})/.exec(build);
  check(zxing, 'tagged Android ZXing provenance is missing');
  const additions = [
    {name: 'ZXing core', dir: 'blanc/android/zxing', version: zxing[1], license: 'Apache-2.0', url: 'https://github.com/zxing/zxing', artifactFile: `blanc/android/zxing/core-${zxing[1]}.jar`, artifactSha256: zxing[2], licenseFiles: []},
    {name: 'Blanc blocker engine bundle', dir: 'blanc/android/blocker_assets', type: 'file', version: bundle.engineVersion, license: 'MPL-2.0 AND CC-BY-SA-3.0-or-later', artifactFile: 'blanc/android/blocker_assets/engine.js', artifactSha256: bundle.bundleSha256, licenseFiles: []},
    ...packages,
    ...[{id: bundle.ghosteryResources.id, version: bundle.ghosteryResources.packageVersion, hash: bundle.ghosteryResources.sha256},
      ...bundle.filters.lists.map(l => ({id: l.id, version: bundle.filters.date, hash: l.sha256}))].map(d => {
      const a = policy.assets.find(a => a.id === d.id); check(a, `unknown blocker data: ${d.id}`);
      return {name: a.name, dir: `blanc/blocker/${d.id}`, type: 'data', version: d.version, license: a.license, url: a.homepage, artifactSha256: d.hash, licenseFiles: []};
    }),
  ];
  const shippedPages = [...pages.files, ...(pages.start?.files || []).map(f => `start/${f}`)];
  // Native resources are compiled from BUILD.gn's explicit XML inputs; the
  // Start Page also embeds Lucide geometry. Record each shipped artifact so
  // preparation verifies all of their bytes without inventing a package version.
  const lucideArtifacts = new Set([...build.matchAll(/"(island\/res\/drawable\/[^"]+\.xml)"/g)].map(m => m[1]));
  if (shippedPages.includes('start/space-identity.js')) lucideArtifacts.add('pages/start/space-identity.js');
  for (const file of lucideArtifacts) {
    const bytes = source(`chromium/blanc/android/${file}`);
    if (!/Lucide/i.test(bytes.toString())) continue;
    additions.push({name: 'Lucide geometry (Android)', dir: `blanc/android/${file}`, type: 'file', version: null, license: 'ISC', url: 'https://github.com/lucide-icons/lucide',
      artifactFile: `blanc/android/${file}`, artifactSha256: sha256(bytes), licenseFiles: [licence('src/renderer/ublock-popup-icons/lucide-LICENSE.txt')]});
  }
  for (const a of policy.assets.filter(a => a.licenseFile)) for (const file of shippedPages.filter(f => path.basename(f) === path.basename(a.file))) {
    const bytes = source(`chromium/blanc/android/pages/${file}`);
    // Derived data needs its own reviewed metadata; don't infer its identity
    // from a filename. Byte-identical shipped fonts have direct provenance.
    if (sha256(bytes) !== sha256(source(a.file))) continue;
    additions.push({name: a.name, dir: `blanc/android/pages/${file}`, type: a.type || 'file', version: a.version || null, license: a.license, url: a.homepage,
      artifactFile: `blanc/android/pages/${file}`, artifactSha256: sha256(bytes), licenseFiles: [licence(a.licenseFile)]});
  }
  return {sourceCommit: record.commit, upstream: pin.upstream, chromiumVersion: pin.version, complete: false, reason: '', additions, reviewedSkips: {}};
}
function validateKnown(record, input, run) {
  const expected = reviewTemplate(record, run);
  check(expected.upstream === record.upstream && input.upstream === expected.upstream, 'Android upstream pin differs from tagged source');
  check(input.chromiumVersion === expected.chromiumVersion, 'Chromium version differs from tagged Android pin');
  for (const c of expected.additions) {
    const actual = input.additions.find(a => a.name === c.name && a.dir === c.dir);
    check(actual, `missing known Android inventory component: ${c.name}`);
    for (const key of ['version', 'license', 'artifactSha256', 'artifactFile', 'type']) check(actual[key] === c[key], `Android inventory differs from tagged provenance: ${c.name} ${key}`);
    for (const f of c.licenseFiles) check(actual.licenseFiles?.some(a => a.path === f.path && a.sha256 === f.sha256), `Android inventory omits tagged licence: ${c.name}`);
  }
}

// Server-side, after the scanner and an actual inventory/skips review. Copies
// just licence inputs, not the Chromium checkout, and validates artifact bytes.
// Copy scan.json, sbom-inputs.json, license-inputs/ and build.json to Mac WORK;
// Task 9 signs to Blanc-Android.aab there and calls attest(WORK, env, run).
export function prepareInputs(workDir, src, review, run = spawnSync) {
  const record = JSON.parse(read(path.join(workDir, 'build.json')));
  validateBuildRecord(record, record);
  check(review.complete === true && review.sourceCommit === record.commit && review.reason?.trim(), 'Android inventory review is incomplete');
  const scanBytes = read(path.join(workDir, 'scan.json')), scan = JSON.parse(scanBytes);
  const input = {schema: 1, sourceCommit: record.commit, upstream: review.upstream, chromiumVersion: review.chromiumVersion, scan: 'scan.json', scanSha256: sha256(scanBytes), src: 'license-inputs',
    review: {sourceCommit: review.sourceCommit, complete: review.complete, reason: review.reason}, additions: review.additions, reviewedSkips: review.reviewedSkips};
  validateKnown(record, input, run);
  const source = sourceReader(record, run), files = new Map();
  const within = rel => { const file = path.resolve(src, rel); check(file.startsWith(path.resolve(src) + path.sep), 'input leaves Chromium tree'); return file; };
  for (const c of [...scan.components, ...review.additions]) {
    check(Array.isArray(c.licenseFiles) && c.licenseFiles.length, `missing licence inputs: ${c.name}`);
    if (c.artifactFile) check(sha256(read(within(c.artifactFile))) === c.artifactSha256, `additional artifact digest mismatch: ${c.name}`);
    for (const f of c.licenseFiles) {
      const bytes = f.repositoryPath ? source(f.repositoryPath) : read(within(f.path));
      check(sha256(bytes) === f.sha256, `licence input digest mismatch: ${c.name}`);
      const dest = path.resolve(workDir, input.src, f.path);
      check(dest.startsWith(path.resolve(workDir, input.src) + path.sep), 'licence path leaves handoff');
      files.set(dest, bytes);
    }
  }
  fs.mkdirSync(path.join(workDir, input.src), {recursive: true});
  for (const [file, bytes] of files) { fs.mkdirSync(path.dirname(file), {recursive: true}); writeSame(file, bytes); }
  const target = path.join(workDir, 'sbom-inputs.json');
  fs.writeFileSync(target, JSON.stringify(input, null, 2) + '\n', {flag: 'wx'});
  try { androidSbom(workDir, run); } catch (error) { fs.unlinkSync(target); throw error; }
  return input;
}
function writeSame(file, bytes) {
  const expected = Buffer.from(bytes), existing = readRegular(file);
  if (existing) check(existing.equals(expected), `existing release artifact differs: ${path.basename(file)}`);
  else fs.writeFileSync(file, expected, {flag: 'wx'});
}

export function androidSbom(workDir, run = spawnSync) {
  const recordBytes = read(path.join(workDir, 'build.json')), record = JSON.parse(recordBytes);
  validateBuildRecord(record, record);
  const inputBytes = read(path.join(workDir, 'sbom-inputs.json')), input = JSON.parse(inputBytes);
  check(input.schema === 1, 'SBOM inputs schema must be 1');
  check(input.sourceCommit === record.commit, 'SBOM source commit differs from build record');
  check(input.upstream === record.upstream, 'SBOM upstream differs from build record');
  check(/^\d+\.\d+\.\d+\.\d+$/.test(input.chromiumVersion || ''), 'missing Chromium version from tagged Android pin');
  check(input.review?.sourceCommit === record.commit && input.review.complete === true && input.review.reason?.trim(), 'Android inventory review is incomplete or bound to another source');
  check(Array.isArray(input.additions) && input.reviewedSkips && typeof input.reviewedSkips === 'object' && !Array.isArray(input.reviewedSkips), 'missing reviewed Android inventory');
  for (const reason of Object.values(input.reviewedSkips)) check(typeof reason === 'string' && reason.trim(), 'every reviewed skip needs a reason');
  validateKnown(record, input, run);
  const scanBytes = read(resolve(workDir, input.scan));
  check(SHA.test(input.scanSha256 || '') && sha256(scanBytes) === input.scanSha256, 'SBOM scan digest mismatch');
  const scan = JSON.parse(scanBytes);
  validateScan(scan, {target: TARGET});
  check(scan.outDir === 'out/AndroidRelease', 'Android scan must use out/AndroidRelease');
  const src = resolve(workDir, input.src);
  const all = [...(scan.components || []), ...input.additions];
  for (const c of all) {
    check(c.name?.trim() && typeof c.dir === 'string' && c.license?.trim(), 'missing component name, directory or licence metadata');
    check(Array.isArray(c.licenseFiles) && c.licenseFiles.length > 0, `no licence text: ${c.name}`);
    for (const f of c.licenseFiles) check(SHA.test(f.sha256 || ''), `missing licence digest: ${c.name}`);
    if (c.artifactSha256 !== undefined) check(SHA.test(c.artifactSha256), `invalid artifact digest: ${c.name}`);
  }
  check(!scan.parseErrors || scan.skippedDirs?.length > 0, 'scanner parse errors have no reviewable folders');
  const g = gatherComponents({...scan, components: all}, src, {target: TARGET, extra: {chromiumAdditions: [], reviewedSkips: input.reviewedSkips}});
  check(g.unreviewed.length === 0, `unreviewed Android licence folders: ${g.unreviewed.join(', ')}`);
  // Chromium itself is represented separately by makeSbom; verify its scanned
  // licence too (gatherComponents verifies the remaining components).
  for (const f of all[0].licenseFiles) {
    const file = path.resolve(src, f.path);
    check(file.startsWith(path.resolve(src) + path.sep), 'licence path leaves its tree');
    check(sha256(read(file)) === f.sha256, 'Chromium licence changed since the scan');
  }
  for (let i = 1; i < all.length; i++) Object.assign(g.chromium[i - 1], {type: all[i].type, hash: all[i].artifactSha256});
  const r = {version: record.versionName, build: record.versionCode, sourceCommit: record.commit, upstream: record.upstream, chromiumVersion: input.chromiumVersion,
    inputDigest: sha256(Buffer.concat([recordBytes, inputBytes]))};
  return makeSbom({...g, r, scan, blanc: [], blocker: [], extra: {notBundled: []}, blancLicense: sha256(sourceReader(record, run)('LICENSE'))},
    {platform: 'android', productName: 'Blanc for Android', productRef: 'blanc-android'});
}

export function attest(workDir, env, run = spawnSync) {
  for (const name of ['BLANC_COSIGN_IDENTITY', 'BLANC_COSIGN_OIDC_ISSUER']) check(typeof env?.[name] === 'string' && env[name].trim(), `${name} is required (exact release signer pin)`);
  const work = path.resolve(workDir), manifest = path.join(work, 'SHA256SUMS'), bundle = path.join(work, 'SHA256SUMS.sigstore.json');
  const sbom = androidSbom(work, run);
  read(path.join(work, 'Blanc-Android.aab'));
  writeSame(path.join(work, 'Blanc-Android.cdx.json'), sbom);
  const names = ['Blanc-Android.aab', 'Blanc-Android.cdx.json', 'build.json'].sort();
  writeSame(manifest, names.map(name => `${sha256(read(path.join(work, name)))}  ${name}\n`).join(''));
  // Reuse a finished signature only by verifying it again. A partial/invalid
  // bundle is preserved and fails verification; the owner reconciles it.
  let signed;
  try { fs.lstatSync(bundle); signed = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const invoke = args => {
    const result = run('cosign', args, {env, stdio: 'inherit'});
    check(!result.error && result.status === 0, `cosign ${args[0]} failed`);
  };
  if (!signed) invoke(['sign-blob', '--yes', '--bundle', bundle, manifest]);
  check(readRegular(bundle), 'cosign sign-blob produced no bundle');
  invoke(['verify-blob', '--bundle', bundle, '--certificate-identity', env.BLANC_COSIGN_IDENTITY, '--certificate-oidc-issuer', env.BLANC_COSIGN_OIDC_ISSUER, manifest]);
  return {sbom: 'Blanc-Android.cdx.json', checksums: 'SHA256SUMS', sigstore: 'SHA256SUMS.sigstore.json'};
}
// Real paths: on macOS a temp or symlinked path (/var → /private/var) would otherwise never match.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [mode, work, src, review] = process.argv.slice(2);
    if (mode === 'review' && work && !src) {
      const record = JSON.parse(read(path.join(work, 'build.json'))); validateBuildRecord(record, record);
      fs.writeFileSync(path.join(work, 'sbom-review.json'), JSON.stringify(reviewTemplate(record), null, 2) + '\n', {flag: 'wx'});
    } else if (mode === 'prepare' && work && src && review) {
      prepareInputs(work, path.resolve(src), JSON.parse(read(review)));
    } else { check(process.argv.length === 3, 'usage: attest.mjs WORK | review WORK | prepare WORK SRC REVIEW.json'); console.log(JSON.stringify(attest(mode, process.env))); }
  }
  catch (error) { console.error(`Android attestation: ${error.message}`); process.exitCode = 1; }
}
