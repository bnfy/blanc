#!/usr/bin/env node
// The beta's CycloneDX SBOM, its NOTICES.txt, and the notices-and-credits
// gate evidence.
//
//   node chromium/release/sbom.mjs build RELEASE.json SCAN.json SRC OUT_DIR
//   node chromium/release/sbom.mjs audit RELEASE.json SCAN.json SRC APP SBOM EVIDENCE
//
// SCAN.json is sbom_scan.py's list of the components //chrome:chrome ships,
// read with Chromium's own licence tooling from the candidate's output folder.
// build writes Blanc-Beta.cdx.json and NOTICES.txt (never over an existing
// file). audit checks a packaged app against them: the notices in
// Contents/Resources/notices are the reviewed bytes, Chromium-credits.html
// names every shipped component, the SBOM is exactly what build makes from
// the same inputs, and every folder Chromium's tooling skipped was reviewed.
// It writes the evidence file whatever the result and exits 1 on a failure.
// Nothing here builds, signs, launches or contacts anything.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {check, equal, reason, sha256, validateRelease} from './policy.mjs';
import {NOTICES} from './verify.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const EXTRA = path.join(import.meta.dirname, 'sbom-extra.json');
const BLANC_REF = 'blanc-beta';
// SPDX identifiers emitted as `id`; anything else is a `name` (CycloneDX
// validates ids against the SPDX list, names are free text).
const SPDX = new Set(['0BSD', 'Apache-2.0', 'APSL-2.0', 'Artistic-2.0', 'blessing', 'BSD-2-Clause', 'BSD-3-Clause',
  'BSD-3-Clause-Attribution', 'BSD-4-Clause', 'BSD-Source-Code', 'BSL-1.0', 'bzip2-1.0.6', 'CC-BY-3.0', 'CC-BY-4.0',
  'CC-BY-SA-3.0', 'CC0-1.0', 'curl', 'FTL', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'HPND', 'ICU', 'IJG', 'ISC', 'LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
  'LGPL-3.0-only', 'LGPL-3.0-or-later', 'Libpng', 'libpng-2.0', 'MIT', 'MIT-0', 'MPL-1.1', 'MPL-2.0', 'NAIST-2003',
  'NCSA', 'OFL-1.1', 'OpenSSL', 'Python-2.0', 'SGI-B-2.0', 'Unicode-3.0', 'Unicode-DFS-2016', 'Unlicense', 'W3C',
  'X11', 'Zlib']);

export function licenses(expression) {
  const value = String(expression || '').trim();
  check(value, 'every component needs a licence');
  if (/ (AND|OR|WITH) /.test(value)) return [{expression: value}];
  // Chromium's README.chromium lists several licences with commas: all apply.
  return value.split(/,\s*/).filter(Boolean).map(item => SPDX.has(item) ? {license: {id: item}} : {license: {name: item}});
}

function text(file) {
  check(fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0, `missing licence text: ${path.basename(file)}`);
  return fs.readFileSync(file);
}
const inside = (base, rel) => {
  const full = path.resolve(base, rel);
  check(full.startsWith(path.resolve(base) + path.sep), 'a path leaves its tree');
  return full;
};

export function validateScan(scan) {
  equal(scan?.schema, 1, 'scan schema'); equal(scan.target, '//chrome:chrome', 'scan target');
  check(Array.isArray(scan.components) && scan.components.length > 100, 'scan lists too few components');
  equal(scan.components[0].name, 'The Chromium Project', 'scan starts with Chromium itself');
  check(Array.isArray(scan.skippedDirs), 'scan must record skipped folders');
}

// Everything build and audit need, read once and cross-checked: each licence
// text's bytes against the scan, each Island file against the pinned asset
// manifest, each Blanc asset against compliance/policy.json.
export function gather(r, scan, src, {root = ROOT, extra = JSON.parse(fs.readFileSync(EXTRA))} = {}) {
  validateRelease(r, {allowLocalQualification: true}); validateScan(scan);
  const texts = new Map(); // sha256 -> bytes
  const keep = bytes => { const digest = sha256(bytes); texts.set(digest, bytes); return digest; };
  const chromium = [];
  const seen = new Map();
  for (const c of scan.components.slice(1)) {
    const files = c.licenseFiles.map(f => {
      const bytes = text(inside(src, f.path));
      equal(sha256(bytes), f.sha256, `licence text changed since the scan: ${c.name}`);
      return {path: f.path, sha256: keep(bytes)};
    });
    check(files.length > 0, `no licence text: ${c.name}`);
    const key = `${c.dir}#${c.name}`, n = (seen.get(key) || 0) + 1; seen.set(key, n);
    chromium.push({ref: `chromium:${c.dir}#${c.name}${n > 1 ? `#${n}` : ''}`, name: c.name, version: c.version || c.revision || null,
      revision: c.version && c.revision ? c.revision : null, url: c.url, license: c.license, cpe: c.cpePrefix, dir: c.dir, files});
  }
  for (const a of extra.chromiumAdditions) {
    const bytes = text(inside(src, a.licenseFile));
    chromium.push({ref: `chromium:${a.dir}#${a.name}`, name: a.name, version: a.version || null, revision: null, url: a.url,
      license: a.license, cpe: null, dir: a.dir, files: [{path: a.licenseFile, sha256: keep(bytes)}], addition: true});
  }
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'compliance/policy.json')));
  const island = JSON.parse(fs.readFileSync(path.join(root, 'chromium/blanc/island-assets.json'))).manifest;
  const blanc = extra.blancAssets.map(entry => {
    const base = entry.asset ? policy.assets.find(a => a.id === entry.asset) : entry;
    check(base, `unknown compliance asset: ${entry.asset}`);
    const files = entry.files.map(file => {
      const digest = sha256(fs.readFileSync(inside(path.join(root, 'chromium/blanc/island'), file)));
      equal(digest, island[file], `Island file differs from the pinned asset manifest: ${file}`);
      // A copied asset must be the very file compliance reviewed; a built one
      // (the bangs catalogue) is bound by the asset manifest alone.
      if (entry.asset && !entry.derived) equal(digest, sha256(fs.readFileSync(inside(root, base.file))), `Island file is not the reviewed ${entry.asset} file`);
      return {path: `island/${file}`, sha256: digest};
    });
    return {ref: `blanc-asset:${entry.asset || entry.name}`, name: base.name, version: base.version || null, license: base.license,
      url: base.homepage, attribution: base.attribution || entry.attribution || null, noticeMatch: entry.noticeMatch || base.name,
      licenseText: keep(text(inside(root, base.licenseFile))), files};
  });
  const sparkleLicense = keep(text(path.join(root, 'chromium/blanc/third_party/sparkle/LICENSE')));
  const chromiumLicense = keep(text(path.join(src, 'LICENSE')));
  const blancLicense = keep(text(path.join(root, 'chromium/blanc/notices/LICENSE')));
  const reviewed = new Set([...Object.keys(extra.reviewedSkips), ...extra.chromiumAdditions.map(a => a.dir)]);
  const unreviewed = scan.skippedDirs.map(s => s.dir).filter(dir => !reviewed.has(dir));
  return {r, scan, extra, chromium, blanc, texts, sparkleLicense, chromiumLicense, blancLicense, unreviewed};
}

function uuidFrom(hex) {
  const h = hex.slice(0, 32).split('');
  h[12] = '5'; h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const prop = (name, value) => ({name, value: String(value)});
const site = url => /^https?:\/\//.test(url || '') ? [{type: 'website', url}] : undefined;

// Deterministic: the same inputs always give the same bytes, so audit can
// rebuild and compare instead of trusting a file it was handed.
export function makeSbom(g) {
  const {r} = g;
  const chromiumRef = 'chromium', sparkleRef = 'sparkle';
  const components = [
    {type: 'framework', 'bom-ref': chromiumRef, name: 'Chromium', version: r.chromiumVersion, licenses: licenses('BSD-3-Clause'),
      purl: `pkg:generic/chromium@${r.chromiumVersion}`, externalReferences: [{type: 'vcs', url: 'https://chromium.googlesource.com/chromium/src'}],
      properties: [prop('blanc:upstreamCommit', r.upstream), prop('blanc:licenseText:sha256', g.chromiumLicense)]},
    {type: 'framework', 'bom-ref': sparkleRef, name: 'Sparkle', version: r.sparkle.version, licenses: licenses('MIT'),
      purl: `pkg:github/sparkle-project/Sparkle@${r.sparkle.version}`,
      hashes: [{alg: 'SHA-256', content: r.sparkle.archiveSHA256}],
      externalReferences: [{type: 'distribution', url: `https://github.com/sparkle-project/Sparkle/releases/tag/${r.sparkle.version}`}],
      properties: [prop('blanc:licenseText:sha256', g.sparkleLicense)]},
    ...g.blanc.map(b => ({type: 'file', 'bom-ref': b.ref, name: b.name, ...(b.version ? {version: b.version} : {}), licenses: licenses(b.license),
      ...(b.attribution ? {copyright: b.attribution} : {}), externalReferences: site(b.url),
      properties: [...b.files.map(f => prop(`blanc:file:${f.path}:sha256`, f.sha256)), prop('blanc:licenseText:sha256', b.licenseText)]})),
    ...g.chromium.map(c => ({type: 'library', 'bom-ref': c.ref, name: c.name, ...(c.version ? {version: c.version} : {}),
      licenses: licenses(c.license), ...(/^cpe:/.test(c.cpe || '') ? {cpe: c.cpe} : {}), externalReferences: site(c.url),
      properties: [prop('blanc:chromiumDir', c.dir), ...(c.revision ? [prop('blanc:revision', c.revision)] : []),
        ...(c.version ? [] : [prop('blanc:inTreeAt', r.chromiumVersion)]), ...(c.addition ? [prop('blanc:skippedByLicensesPy', 'true')] : []),
        ...c.files.map(f => prop(`blanc:licenseText:${f.path}:sha256`, f.sha256))]})),
  ].map(c => JSON.parse(JSON.stringify(c)));
  const refs = new Set();
  for (const c of components) { check(!refs.has(c['bom-ref']), `duplicate component: ${c['bom-ref']}`); refs.add(c['bom-ref']); }
  const body = {
    metadata: {
      tools: {components: [{type: 'application', name: 'blanc chromium/release/sbom.mjs'}, {type: 'application', name: 'chromium tools/licenses/licenses.py'}]},
      component: {type: 'application', 'bom-ref': BLANC_REF, name: 'Blanc Beta', version: r.version, licenses: licenses('MIT'),
        externalReferences: [{type: 'vcs', url: 'https://github.com/bnfy/blanc'}],
        properties: [prop('blanc:sourceCommit', r.sourceCommit), prop('blanc:inputDigest', r.inputDigest), prop('blanc:build', r.build),
          prop('blanc:gnTarget', g.scan.target), prop('blanc:licenseText:sha256', g.blancLicense),
          ...g.extra.notBundled.map(n => prop('blanc:notBundled', `${n.name}: ${n.reason}`))]},
    },
    components,
    dependencies: [
      {ref: BLANC_REF, dependsOn: [chromiumRef, sparkleRef, ...g.blanc.map(b => b.ref)]},
      {ref: chromiumRef, dependsOn: g.chromium.map(c => c.ref)},
    ],
  };
  const serial = `urn:uuid:${uuidFrom(sha256(JSON.stringify(body)))}`;
  return JSON.stringify({bomFormat: 'CycloneDX', specVersion: '1.6', serialNumber: serial, version: 1, ...body}, null, 2) + '\n';
}

// One plain-text notice for the release page: every component with its
// licence, and each distinct licence text once, cited by digest.
export function makeNotices(g) {
  const {r} = g;
  const used = [];
  const cite = digest => { if (!used.includes(digest)) used.push(digest); return `[text ${digest.slice(0, 12)}]`; };
  const line = (name, version, license, url, digests) =>
    `- ${name}${version ? ` ${version}` : ''} — ${license}${url ? ` — ${url}` : ''}\n  Licence: ${digests.map(cite).join(' ')}\n`;
  let out = `BLANC BETA ${r.version} (build ${r.build}) — NOTICES\n\n` +
    'Blanc is released under the MIT License. Blanc Beta is built on Chromium and includes the third-party\n' +
    'components below. Each licence text appears once at the end, cited by the start of its SHA-256 digest.\n\n';
  out += 'BLANC\n\n' + line('Blanc Beta', r.version, 'MIT', 'https://github.com/bnfy/blanc', [g.blancLicense]);
  out += '\nFRAMEWORKS\n\n' + line('Chromium', r.chromiumVersion, 'BSD-3-Clause', 'https://www.chromium.org/', [g.chromiumLicense]) +
    line('Sparkle', r.sparkle.version, 'MIT', 'https://sparkle-project.org/', [g.sparkleLicense]);
  out += '\nBLANC INTERFACE ASSETS\n\n' + g.blanc.map(b => line(b.name, b.version, b.license, b.url, [b.licenseText]) +
    (b.attribution ? `  Attribution: ${b.attribution}\n` : '')).join('');
  out += '\nCHROMIUM THIRD-PARTY COMPONENTS\n\n' + g.chromium.map(c => line(c.name, c.version, c.license, c.url, c.files.map(f => f.sha256))).join('');
  out += '\nLICENCE TEXTS\n';
  for (const digest of used) out += `\n==== [text ${digest.slice(0, 12)}] sha256 ${digest} ====\n\n${g.texts.get(digest).toString('utf8').replace(/\s+$/, '')}\n`;
  return out;
}

export function build(r, scan, src, outDir, options) {
  const g = gather(r, scan, src, options);
  check(g.unreviewed.length === 0, `Chromium's licence tooling skipped unreviewed folders: ${g.unreviewed.join(', ')}`);
  const sbom = makeSbom(g), notices = makeNotices(g);
  fs.writeFileSync(path.join(outDir, 'Blanc-Beta.cdx.json'), sbom, {flag: 'wx'});
  fs.writeFileSync(path.join(outDir, 'NOTICES.txt'), notices, {flag: 'wx'});
  return {components: JSON.parse(sbom).components.length, sbomSHA256: sha256(sbom), noticesSHA256: sha256(notices)};
}

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'"};
export function creditTitles(html) {
  return new Set([...html.matchAll(/<span class="title">([^<]*)<\/span>/g)]
    .map(m => m[1].replace(/&(#?\w+);/g, (all, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : all)).trim()));
}

// The packaged notice must name what the beta ships and nothing it doesn't.
// These are the Electron app's components that the Chromium fork never carries.
export const ELECTRON_ONLY = ['Electron ', '@1password/sdk', 'electron-updater', 'uBlock Origin', 'app.asar', 'Dark Reader'];

export function audit(r, scan, src, app, sbomBytes, options) {
  const failures = [], notices = {};
  const fail = message => failures.push(message);
  const g = gather(r, scan, src, options);
  if (g.unreviewed.length) fail(`unreviewed folders skipped by Chromium's licence tooling: ${g.unreviewed.join(', ')}`);
  const expected = makeSbom(g);
  if (sha256(sbomBytes) !== sha256(expected)) fail('the SBOM is not what build makes from this scan and tree');
  const dir = path.join(app, 'Contents/Resources/notices');
  for (const name of NOTICES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) { fail(`missing packaged notice: ${name}`); continue; }
    notices[name] = sha256(fs.readFileSync(file));
  }
  const root = options?.root || ROOT;
  const reviewed = {'LICENSE': 'chromium/blanc/notices/LICENSE', 'THIRD-PARTY-NOTICES.md': 'chromium/blanc/notices/THIRD-PARTY-NOTICES.md',
    'ASSET-LICENSE.md': 'chromium/blanc/notices/ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.txt': 'chromium/blanc/notices/THIRD_PARTY_NOTICES.txt',
    'Sparkle-LICENSE': 'chromium/blanc/third_party/sparkle/LICENSE'};
  for (const [name, source] of Object.entries(reviewed))
    if (notices[name] && notices[name] !== sha256(fs.readFileSync(path.join(root, source)))) fail(`packaged ${name} differs from ${source}`);
  if (notices['Chromium-LICENSE'] && notices['Chromium-LICENSE'] !== g.chromiumLicense) fail('packaged Chromium-LICENSE differs from the tree');
  let missingCredits = [], titles = new Set();
  if (notices['Chromium-credits.html']) {
    titles = creditTitles(fs.readFileSync(path.join(dir, 'Chromium-credits.html'), 'utf8'));
    missingCredits = g.chromium.filter(c => !c.addition && !titles.has(c.name)).map(c => c.name);
    if (missingCredits.length) fail(`Chromium-credits.html leaves out ${missingCredits.length} shipped components`);
  }
  let missingNotice = [], extraneous = [];
  if (notices['THIRD_PARTY_NOTICES.txt']) {
    const notice = fs.readFileSync(path.join(dir, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
    missingNotice = g.blanc.filter(b => !notice.includes(b.noticeMatch)).map(b => b.name);
    extraneous = ELECTRON_ONLY.filter(name => notice.includes(name)).map(name => name.trim());
    if (missingNotice.length) fail(`THIRD_PARTY_NOTICES.txt leaves out: ${missingNotice.join(', ')}`);
    if (extraneous.length) fail(`THIRD_PARTY_NOTICES.txt describes the Electron app (names ${extraneous.join(', ')}), not the beta`);
  }
  const info = plist(path.join(app, 'Contents/Info.plist'));
  if (!info) fail('the app has no readable Info.plist');
  else if (String(info.CFBundleVersion) !== String(r.build)) fail('the app is not this release\'s build');
  return {schema: 1, gate: 'notices-and-credits', status: failures.length ? 'fail' : 'pass', failures,
    release: {version: r.version, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest},
    app: {name: path.basename(app), bundleVersion: info?.CFBundleVersion ?? null, shortVersion: info?.CFBundleShortVersionString ?? null},
    scan: {target: scan.target, outDir: scan.outDir, components: scan.components.length, skippedDirs: scan.skippedDirs.map(s => s.dir)},
    sbom: {sha256: sha256(sbomBytes), components: g.chromium.length + g.blanc.length + 2, notBundled: g.extra.notBundled.map(n => n.name)},
    notices, credits: {titles: titles.size, missing: missingCredits}, blancNotice: {missing: missingNotice, extraneous}};
}

function plist(file) {
  if (!fs.existsSync(file)) return null;
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], {encoding: 'utf8'});
  return result.status === 0 ? JSON.parse(result.stdout) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, ...rest] = process.argv.slice(2);
  try {
    const read = file => JSON.parse(fs.readFileSync(file));
    if (mode === 'build' && rest.length === 4) {
      const [release, scan, src, out] = rest;
      console.log(JSON.stringify(build(read(release), read(scan), path.resolve(src), out)));
    } else if (mode === 'audit' && rest.length === 6) {
      const [release, scan, src, app, sbom, evidence] = rest;
      const result = audit(read(release), read(scan), path.resolve(src), path.resolve(app), fs.readFileSync(sbom));
      fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
      console.log(JSON.stringify({status: result.status, failures: result.failures, evidenceSHA256: sha256(fs.readFileSync(evidence))}));
      if (result.status !== 'pass') process.exitCode = 1;
    } else check(false, 'usage: sbom.mjs build RELEASE.json SCAN.json SRC OUT_DIR | audit RELEASE.json SCAN.json SRC APP SBOM EVIDENCE');
  } catch (error) { console.error(`SBOM ${mode || ''} failed: ${reason(error)}`); process.exitCode = 1; }
}
