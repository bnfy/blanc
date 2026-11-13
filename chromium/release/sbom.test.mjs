// The beta SBOM and notices come only from reviewed, digest-bound inputs, and
// the notices-and-credits audit passes only when the packaged app's notices
// are the reviewed bytes, its credits page names every shipped component and
// its notice describes the beta rather than the Electron app. A synthetic
// Chromium tree and app stand in for the real ones; nothing is built.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT, build, audit, gather, makeSbom, makeNotices, licenses, creditTitles} from './sbom.mjs';
import {NOTICES, BLOCKER_ENGINE} from './verify.mjs';
import {makeNotice} from './fork-notice.mjs';
import {sha256} from './policy.mjs';

const release = JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
const realExtra = JSON.parse(fs.readFileSync(new URL('./sbom-extra.json', import.meta.url)));
const extra = {...realExtra, chromiumAdditions: [], reviewedSkips: {'third_party/rust': 'container'}};
const LIBS = 120;
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function world({notice} = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sbom-'));
  const root = path.join(base, 'repo'), src = path.join(base, 'src');
  const copy = rel => { fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); fs.copyFileSync(path.join(ROOT, rel), path.join(root, rel)); };
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'compliance/policy.json')));
  ['compliance/policy.json', 'chromium/blanc/island-assets.json', 'chromium/blanc/third_party/sparkle/LICENSE',
    'chromium/release/sbom-extra.json', 'adblock/sources/pinned.json', 'chromium/blanc/third_party/blocker/bundle.json',
    ...fs.readdirSync(path.join(ROOT, 'chromium/blanc/third_party/blocker/licenses')).map(f => `chromium/blanc/third_party/blocker/licenses/${f}`),
    'chromium/blanc/notices/LICENSE', 'chromium/blanc/notices/ASSET-LICENSE.md', 'chromium/blanc/notices/THIRD-PARTY-NOTICES.md'].forEach(copy);
  for (const entry of extra.blancAssets) {
    entry.files.forEach(file => copy(`chromium/blanc/island/${file}`));
    const asset = entry.asset ? policy.assets.find(a => a.id === entry.asset) : entry;
    copy(asset.licenseFile); if (entry.asset) copy(asset.file);
  }
  // A stand-in engine, pinned the way the real one is.
  const engine = 'fake engine bundle\n';
  fs.mkdirSync(path.join(root, 'chromium/blanc/services/blocker'), {recursive: true});
  fs.writeFileSync(path.join(root, 'chromium/blanc/services/blocker/bundle_hash.h'), `inline constexpr char kBlancBlockerBundleSha256[] = "${sha256(engine)}";\n`);
  const bundleFile = path.join(root, 'chromium/blanc/third_party/blocker/bundle.json');
  fs.writeFileSync(bundleFile, JSON.stringify({...JSON.parse(fs.readFileSync(bundleFile)), bundleSha256: sha256(engine)}));
  fs.writeFileSync(path.join(root, 'chromium/blanc/notices/THIRD_PARTY_NOTICES.txt'), notice ?? makeNotice(root));
  fs.mkdirSync(src); fs.writeFileSync(path.join(src, 'LICENSE'), 'Copyright The Chromium Authors. BSD-3-Clause.\n');
  const components = [{name: 'The Chromium Project', version: null, revision: null, url: 'https://www.chromium.org', license: 'BSD-3-Clause',
    cpePrefix: null, dir: '', licenseFiles: [{path: 'LICENSE', sha256: sha256(fs.readFileSync(path.join(src, 'LICENSE')))}]}];
  for (let i = 0; i < LIBS; i++) {
    const dir = `third_party/lib${i}`, text = `licence ${i % 7}\n`;
    fs.mkdirSync(path.join(src, dir), {recursive: true}); fs.writeFileSync(path.join(src, dir, 'LICENSE'), text);
    components.push({name: i === 3 ? 'Paul\'s <Hash> & co' : `Lib ${i}`, version: i % 5 ? `1.${i}` : null, revision: i % 2 ? `rev${i}` : null,
      url: `https://example.test/${i}`, license: i % 3 ? 'MIT' : 'Apache-2.0, BSD-3-Clause', cpePrefix: i === 1 ? 'cpe:/a:lib:lib1:1.1' : null,
      dir, licenseFiles: [{path: `${dir}/LICENSE`, sha256: sha256(text)}]});
  }
  const scan = {schema: 1, target: '//chrome:chrome', outDir: 'out/BlancBeta', parseErrors: true, skippedDirs: [{dir: 'third_party/rust', reason: 'x'}], components};
  const app = path.join(base, 'Blanc Beta.app'), notices = path.join(app, 'Contents/Resources/notices');
  fs.mkdirSync(notices, {recursive: true});
  for (const [name, from] of Object.entries({'LICENSE': 'chromium/blanc/notices/LICENSE', 'THIRD-PARTY-NOTICES.md': 'chromium/blanc/notices/THIRD-PARTY-NOTICES.md',
    'ASSET-LICENSE.md': 'chromium/blanc/notices/ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.txt': 'chromium/blanc/notices/THIRD_PARTY_NOTICES.txt',
    'Sparkle-LICENSE': 'chromium/blanc/third_party/sparkle/LICENSE'})) fs.copyFileSync(path.join(root, from), path.join(notices, name));
  fs.copyFileSync(path.join(src, 'LICENSE'), path.join(notices, 'Chromium-LICENSE'));
  fs.mkdirSync(path.dirname(path.join(app, BLOCKER_ENGINE)), {recursive: true}); fs.writeFileSync(path.join(app, BLOCKER_ENGINE), engine);
  const credits = components.map(c => `<div class="product"><span class="title">${escape(c.name)}</span></div>`).join('\n');
  fs.writeFileSync(path.join(notices, 'Chromium-credits.html'), `<html><body>${credits}</body></html>`);
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleVersion</key><string>${release.build}</string><key>CFBundleShortVersionString</key><string>${release.shortVersion}</string></dict></plist>\n`);
  return {base, root, src, scan, app, options: {root, extra}, done: () => fs.rmSync(base, {recursive: true, force: true})};
}

test('the SBOM is CycloneDX 1.6, deterministic, and lists every shipped component with its licence', () => {
  const w = world();
  const out = path.join(w.base, 'out'); fs.mkdirSync(out);
  const result = build(release, w.scan, w.src, out, w.options);
  const sbom = JSON.parse(fs.readFileSync(path.join(out, 'Blanc-Beta.cdx.json')));
  assert.equal(sbom.bomFormat, 'CycloneDX'); assert.equal(sbom.specVersion, '1.6'); assert.equal(sbom.version, 1);
  assert.match(sbom.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const [name, version] of [['Chromium', release.chromiumVersion], ['Sparkle', release.sparkle.version]])
    assert.ok(sbom.components.some(c => c.name === name && c.version === version && c.licenses.length > 0), name);
  const bundle = JSON.parse(fs.readFileSync(path.join(w.root, 'chromium/blanc/third_party/blocker/bundle.json')));
  const blockerParts = bundle.packages.length + 1 + 1 + bundle.filters.lists.length;
  assert.equal(result.components, 3 + extra.blancAssets.length + blockerParts + LIBS);
  assert.deepEqual(sbom.dependencies.find(d => d.ref === 'blocker-engine').dependsOn.length, blockerParts);
  assert.equal(sbom.components.find(c => c['bom-ref'] === 'blocker-engine').hashes[0].content, bundle.bundleSha256);
  assert.ok(sbom.components.some(c => c.name === 'EasyList' && c.hashes?.length));
  assert.equal(sbom.components.find(c => c.name === '@ghostery/adblocker').purl, 'pkg:npm/%40ghostery/adblocker@2.18.2', 'purl segments are percent-encoded');
  assert.ok(sbom.components.every(c => c.licenses?.length > 0 && c['bom-ref']));
  assert.deepEqual(sbom.dependencies.find(d => d.ref === 'chromium').dependsOn.length, LIBS);
  assert.ok(sbom.components.find(c => c.name === 'Lib 1').cpe);
  assert.deepEqual(sbom.components.find(c => c.name === 'Lib 0').licenses, [{license: {id: 'Apache-2.0'}}, {license: {id: 'BSD-3-Clause'}}]);
  assert.equal(sbom.metadata.component.name, 'Blanc Beta');
  for (const [name, value] of [['blanc:sourceCommit', release.sourceCommit], ['blanc:inputDigest', release.inputDigest]])
    assert.equal(sbom.metadata.component.properties.find(p => p.name === name).value, value, 'manifest.mjs binds these');
  const again = makeSbom(gather(release, w.scan, w.src, w.options));
  assert.equal(again, fs.readFileSync(path.join(out, 'Blanc-Beta.cdx.json'), 'utf8'));
  // Every component is named in NOTICES.txt and each distinct text appears once.
  const notices = fs.readFileSync(path.join(out, 'NOTICES.txt'), 'utf8');
  for (const c of w.scan.components.slice(1)) assert.ok(notices.includes(`- ${c.name}`), c.name);
  const blockerTexts = new Set([...bundle.packages, bundle.proceduralRenderer].flatMap(p => p.licenseFiles.map(f => f.sha256))).size;
  assert.equal((notices.match(/^==== \[text /gm) || []).length, 7 + 3 + extra.blancAssets.length + blockerTexts);
  assert.ok(notices.includes('- EasyPrivacy') && notices.includes('- @ghostery/adblocker 2.18.2'));
  assert.throws(() => build(release, w.scan, w.src, out, w.options), /EEXIST/, 'never overwrites');
  w.done();
});

test('build refuses inputs nobody reviewed', () => {
  const w = world();
  const tmp = fs.mkdtempSync(path.join(w.base, 'o'));
  assert.throws(() => build(release, {...w.scan, skippedDirs: [...w.scan.skippedDirs, {dir: 'third_party/new', reason: 'x'}]}, w.src, tmp, w.options), /unreviewed folders: third_party\/new/);
  fs.appendFileSync(path.join(w.src, 'third_party/lib4/LICENSE'), 'edited');
  assert.throws(() => gather(release, w.scan, w.src, w.options), /changed since the scan: Lib 4/);
  w.done();
  const v = world();
  const swapped = {...extra, blancAssets: [{asset: 'inter-font', files: ['pages/caveat-latin.woff2']}]};
  assert.throws(() => gather(release, v.scan, v.src, {...v.options, extra: swapped}), /not the reviewed inter-font file/);
  fs.appendFileSync(path.join(v.root, 'chromium/blanc/island/pages/inter-latin.woff2'), 'x');
  assert.throws(() => gather(release, v.scan, v.src, v.options), /differs from the pinned asset manifest/);
  assert.throws(() => gather(release, {...v.scan, target: '//chrome:other'}, v.src, v.options), /scan target/);
  assert.throws(() => gather(release, {...v.scan, components: v.scan.components.slice(1)}, v.src, v.options), /Chromium itself/);
  v.done();
});

test('the audit passes only a packaged app whose notices and credits match', () => {
  const w = world();
  const sbom = Buffer.from(makeSbom(gather(release, w.scan, w.src, w.options)));
  const good = audit(release, w.scan, w.src, w.app, sbom, w.options);
  assert.equal(good.status, 'pass', good.failures.join('; '));
  assert.equal(good.credits.titles, LIBS + 1);
  assert.deepEqual(Object.keys(good.notices).sort(), [...NOTICES].sort());
  const dir = path.join(w.app, 'Contents/Resources/notices');
  const fails = (change, pattern) => {
    const saved = Object.fromEntries(NOTICES.map(n => [n, fs.existsSync(path.join(dir, n)) ? fs.readFileSync(path.join(dir, n)) : null]));
    const plist = fs.readFileSync(path.join(w.app, 'Contents/Info.plist'));
    const result = change();
    const report = result ?? audit(release, w.scan, w.src, w.app, sbom, w.options);
    assert.equal(report.status, 'fail'); assert.match(report.failures.join('\n'), pattern);
    for (const [n, bytes] of Object.entries(saved)) bytes ? fs.writeFileSync(path.join(dir, n), bytes) : fs.rmSync(path.join(dir, n), {force: true});
    fs.writeFileSync(path.join(w.app, 'Contents/Info.plist'), plist);
  };
  fails(() => { const f = path.join(dir, 'Chromium-credits.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('>Lib 7<', '>Lib 7b<')); }, /leaves out 1 shipped components/);
  fails(() => fs.rmSync(path.join(dir, 'Sparkle-LICENSE')), /missing packaged notice: Sparkle-LICENSE/);
  fails(() => fs.appendFileSync(path.join(dir, 'LICENSE'), 'x'), /packaged LICENSE differs/);
  fails(() => fs.appendFileSync(path.join(dir, 'Chromium-LICENSE'), 'x'), /Chromium-LICENSE differs/);
  fails(() => fs.writeFileSync(path.join(w.app, 'Contents/Info.plist'), fs.readFileSync(path.join(w.app, 'Contents/Info.plist'), 'utf8').replace(`<string>${release.build}</string>`, '<string>99</string>')), /not this release's build/);
  fails(() => audit(release, w.scan, w.src, w.app, Buffer.from(sbom.toString().replace('"Lib 9"', '"Lib 9x"')), w.options), /not what build makes/);
  const engine = path.join(w.app, BLOCKER_ENGINE), bytes = fs.readFileSync(engine);
  fails(() => fs.rmSync(engine), /embeds no blocker engine/); fs.writeFileSync(engine, bytes);
  fails(() => fs.appendFileSync(engine, 'x'), /not the pinned bundle/); fs.writeFileSync(engine, bytes);
  fails(() => audit(release, {...w.scan, skippedDirs: [{dir: 'third_party/odd', reason: 'x'}]}, w.src, w.app, sbom, w.options), /unreviewed folders/);
  w.done();
});

test('the audit fails a beta that ships the Electron app\'s notice', () => {
  const electron = fs.readFileSync(path.join(ROOT, 'compliance/THIRD_PARTY_NOTICES.txt'), 'utf8');
  const w = world({notice: electron});
  const sbom = Buffer.from(makeSbom(gather(release, w.scan, w.src, w.options)));
  const report = audit(release, w.scan, w.src, w.app, sbom, w.options);
  assert.equal(report.status, 'fail');
  assert.match(report.failures.join('\n'), /describes the Electron app/);
  assert.ok(report.blancNotice.extraneous.includes('Electron'));
  w.done();
});

test('the beta notice is generated, current, and names only what the beta ships', async () => {
  const {makeNotice: make, blockerBundle, NOTICE} = await import('./fork-notice.mjs');
  const notice = fs.readFileSync(path.join(ROOT, NOTICE), 'utf8');
  assert.equal(notice, make(), 'run node chromium/release/fork-notice.mjs');
  for (const name of ['Electron', '@1password', 'uBlock Origin', 'Dark Reader', 'electron-updater']) assert.ok(!notice.includes(name), name);
  for (const name of ['@ghostery/adblocker 2.18.2', 'EasyList', 'EasyPrivacy', 'Inter Latin webfont', 'Kagi bangs', 'Lucide', 'Mozilla Public License'])
    assert.ok(notice.includes(name), name);
  const w = world();
  blockerBundle(w.root);
  fs.appendFileSync(path.join(w.root, 'chromium/blanc/third_party/blocker/licenses/tldts-experimental-LICENSE'), 'x');
  assert.throws(() => blockerBundle(w.root), /licence text changed/);
  w.done();
});

test('licence fields and credit titles parse the way Chromium writes them', () => {
  assert.deepEqual(licenses('MIT, Apache-2.0'), [{license: {id: 'MIT'}}, {license: {id: 'Apache-2.0'}}]);
  assert.deepEqual(licenses('Apache-2.0 WITH LLVM-exception'), [{expression: 'Apache-2.0 WITH LLVM-exception'}]);
  assert.deepEqual(licenses('Custom license'), [{license: {name: 'Custom license'}}]);
  assert.throws(() => licenses(''), /needs a licence/);
  assert.deepEqual([...creditTitles('<span class="title">Paul&#39;s &lt;Hash&gt; &amp; co</span><span class="title">x&#x27;y</span>')], ["Paul's <Hash> & co", "x'y"]);
  assert.equal(makeNotices.length, 1);
});
