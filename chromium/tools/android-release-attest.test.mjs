import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256} from '../release/policy.mjs';
const url = new URL('../android/release/attest.mjs', import.meta.url);
const pins = {BLANC_COSIGN_IDENTITY: 'owner@example.test', BLANC_COSIGN_OIDC_ISSUER: 'https://github.com/login/oauth'};
const repo = fileURLToPath(new URL('../../', import.meta.url));
const commit = 'a'.repeat(40), upstream = 'b'.repeat(40);
async function api() { assert.ok(fs.existsSync(url), 'Android attestation helper exists'); return import(url); }
function fixture(t, mod) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'android-attest-'));
  t.after(() => fs.rmSync(work, {recursive: true, force: true}));
  const src = path.join(work, 'licenses'); fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'LICENSE'), 'Chromium BSD licence\n');
  const components = [{name: 'The Chromium Project', dir: '', license: 'BSD-3-Clause', licenseFiles: [{path: 'LICENSE', sha256: sha256('Chromium BSD licence\n')}]}];
  for (let i = 0; i < 120; i++) {
    const file = `lib${i}.txt`, text = `licence ${i}\n`; fs.writeFileSync(path.join(src, file), text);
    components.push({name: `Android library ${i}`, dir: `third_party/lib${i}`, version: `1.${i}`, license: 'MIT', licenseFiles: [{path: file, sha256: sha256(text)}]});
  }
  const scan = {schema: 1, target: '//chrome/android:chrome_public_bundle', outDir: 'out/AndroidRelease', targetOs: 'android', parseErrors: false, skippedDirs: [], components};
  const record = {schema: 1, tag: 'android-v1.0.0-beta.1-1', commit, appliedOver: 'c'.repeat(40), upstream, versionName: '1.0.0-beta.1', versionCode: 1, argsSha256: 'd'.repeat(64), aab: {file: 'ChromePublic.aab', sha256: sha256('unsigned'), bytes: 8}, builtAt: '2026-11-15T12:00:00.000Z'};
  fs.writeFileSync(path.join(work, 'build.json'), JSON.stringify(record));
  fs.writeFileSync(path.join(work, 'Blanc-Android.aab'), 'signed fixture bundle');
  fs.writeFileSync(path.join(work, 'scan.json'), JSON.stringify(scan));
  const calls = [];
  const run = (command, args, options) => {
    calls.push({command, args, options});
    if (command === 'git') {
      const file = args.at(-1).split(':').slice(1).join(':');
      if (file === 'chromium/lanes/android.json') return {status: 0, stdout: JSON.stringify({version: '156.0.8078.79', upstream})};
      const bytes = fs.readFileSync(path.join(repo, file));
      if (file === 'chromium/blanc/android/BUILD.gn') return {status: 0, stdout: bytes.toString().replace('8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82', sha256('fixture zxing'))};
      if (file === 'chromium/blanc/third_party/blocker/bundle.json') return {status: 0, stdout: JSON.stringify({...JSON.parse(bytes), bundleSha256: sha256('fixture engine')})};
      return {status: 0, stdout: bytes};
    }
    if (args[0] === 'sign-blob') fs.writeFileSync(args[args.indexOf('--bundle') + 1], '{"fixture":true}');
    return {status: 0};
  };
  const review = mod.reviewTemplate(record, run);
  const additions = review.additions;
  for (const c of additions) {
    if (c.artifactFile) {
      const dest = path.join(src, c.artifactFile); fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.writeFileSync(dest, c.name === 'ZXing core' ? 'fixture zxing' : c.name === 'Blanc blocker engine bundle' ? 'fixture engine' : fs.readFileSync(path.join(repo, 'chromium', c.artifactFile)));
    }
    if (!c.licenseFiles.length) {
      const file = `extra-${additions.indexOf(c)}.txt`, bytes = 'synthetic missing upstream licence text';
      fs.writeFileSync(path.join(src, file), bytes); c.licenseFiles = [{path: file, sha256: sha256(bytes)}];
    }
    for (const f of c.licenseFiles) if (f.repositoryPath) {
      const dest = path.join(src, f.path); fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.copyFileSync(path.join(repo, f.repositoryPath), dest);
    }
  }
  const inputs = {schema: 1, sourceCommit: commit, upstream, chromiumVersion: '156.0.8078.79', scan: 'scan.json', scanSha256: sha256(JSON.stringify(scan)), src: 'licenses', review: {sourceCommit: commit, complete: true, reason: 'synthetic inventory'}, additions, reviewedSkips: {}};
  fs.writeFileSync(path.join(work, 'sbom-inputs.json'), JSON.stringify(inputs));
  return {work, src, scan, inputs, record, calls, run, saveInputs() {fs.writeFileSync(path.join(work, 'sbom-inputs.json'), JSON.stringify(inputs));}};
}
test('Android SHA256SUMS lists exactly the signed bundle, SBOM and build record with sorted correct digests', async t => {
  const {attest} = await api(), w = fixture(t, await api()); attest(w.work, pins, w.run);
  const names = ['Blanc-Android.aab', 'Blanc-Android.cdx.json', 'build.json'].sort();
  assert.equal(fs.readFileSync(path.join(w.work, 'SHA256SUMS'), 'utf8'), names.map(name => `${sha256(fs.readFileSync(path.join(w.work, name)))}  ${name}\n`).join(''));
  assert.deepEqual(w.calls.filter(c => c.command === 'cosign').map(c => [c.command, c.args[0]]), [['cosign', 'sign-blob'], ['cosign', 'verify-blob']]);
  const verify = w.calls.filter(c => c.command === 'cosign')[1].args;
  assert.equal(verify[verify.indexOf('--certificate-identity') + 1], pins.BLANC_COSIGN_IDENTITY);
  assert.equal(verify[verify.indexOf('--certificate-oidc-issuer') + 1], pins.BLANC_COSIGN_OIDC_ISSUER);
  assert.ok(!verify.some(arg => arg.includes('regexp')));
});
test('Android attestation refuses either missing or blank Sigstore pin before running a command', async t => {
  const {attest} = await api(), w = fixture(t, await api());
  w.calls.length = 0;
  for (const env of [{}, {BLANC_COSIGN_IDENTITY: 'x'}, {BLANC_COSIGN_OIDC_ISSUER: 'x'}, {...pins, BLANC_COSIGN_IDENTITY: ' '}, {...pins, BLANC_COSIGN_OIDC_ISSUER: ' '}]) assert.throws(() => attest(w.work, env, w.run), /BLANC_COSIGN/);
  assert.equal(w.calls.length, 0);
});
test('Android attestation throws when Sigstore verification fails', async t => {
  const {attest} = await api(), w = fixture(t, await api());
  assert.throws(() => attest(w.work, pins, (command, args, options) => args[0] === 'verify-blob' ? {status: 1} : w.run(command, args, options)), /verify-blob/);
});
test('Android SBOM names Blanc for Android and the build record version without desktop components', async t => {
  const {attest} = await api(), w = fixture(t, await api()); attest(w.work, pins, w.run);
  const bom = JSON.parse(fs.readFileSync(path.join(w.work, 'Blanc-Android.cdx.json')));
  assert.equal(bom.metadata.component.name, 'Blanc for Android'); assert.equal(bom.metadata.component.version, w.record.versionName);
  assert.equal(bom.components.length, w.scan.components.length + w.inputs.additions.length);
  assert.ok(!bom.components.some(c => /Sparkle|Island/.test(c.name)));
  assert.ok(bom.components.some(c => c.name === 'ZXing core'));
  assert.ok(bom.components.some(c => c.name === '@ghostery/adblocker'));
  assert.equal(bom.components[0].version, w.inputs.chromiumVersion);
});
test('Android SBOM rejects changed or missing licence text and unreviewed scanner omissions', async t => {
  const {attest} = await api(), w = fixture(t, await api());
  fs.writeFileSync(path.join(w.src, 'lib0.txt'), 'changed');
  assert.throws(() => attest(w.work, pins, w.run), /changed since the scan/);
  fs.rmSync(path.join(w.src, 'lib0.txt'));
  assert.throws(() => attest(w.work, pins, w.run), /missing licence text/);
  fs.writeFileSync(path.join(w.src, 'lib0.txt'), 'licence 0\n');
  w.scan.skippedDirs.push({dir: 'third_party/unreviewed', reason: 'missing metadata'});
  fs.writeFileSync(path.join(w.work, 'scan.json'), JSON.stringify(w.scan)); w.inputs.scanSha256 = sha256(JSON.stringify(w.scan)); w.saveInputs();
  assert.throws(() => attest(w.work, pins, w.run), /unreviewed/); assert.equal(w.calls.filter(c => c.command === 'cosign').length, 0);
});
test('Android SBOM refuses an unbound source or incomplete Android inventory', async t => {
  const {attest} = await api(), w = fixture(t, await api());
  for (const change of [{sourceCommit: 'e'.repeat(40)}, {upstream: 'e'.repeat(40)}, {chromiumVersion: ''}, {chromiumVersion: '999.0.0.0'}, {review: {sourceCommit: commit, complete: false}}]) {
    const original = {...w.inputs}; Object.assign(w.inputs, change); w.saveInputs();
    assert.throws(() => attest(w.work, pins, w.run), /source|upstream|version|review|inventory/);
    Object.assign(w.inputs, original); w.saveInputs();
  }
});
test('scanner discovers Android target metadata as Android and leaves desktop default macOS', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'android-scan-')); t.after(() => fs.rmSync(base, {recursive: true, force: true}));
  fs.mkdirSync(path.join(base, 'tools/licenses'), {recursive: true}); fs.mkdirSync(path.join(base, 'out/AndroidRelease'), {recursive: true});
  fs.writeFileSync(path.join(base, 'out/AndroidRelease/args.gn'), 'fixture');
  fs.writeFileSync(path.join(base, 'tools/licenses/licenses.py'), `OPTIONAL_FIELDS = []\nclass LicenseError(Exception): pass\ndef ParseDir(*args): pass\ndef _DiscoverMetadatas(args):\n    expected = 'android' if args.gn_target == '//chrome/android:chrome_public_bundle' else 'mac'\n    assert args.target_os == expected, 'wrong license platform: ' + args.target_os\n    return [], False\n`);
  for (const target of ['//chrome/android:chrome_public_bundle', '//chrome:chrome']) {
    const result = spawnSync('python3', ['-B', fileURLToPath(new URL('../release/sbom_scan.py', import.meta.url)), '--src', base, '--out-dir', 'out/AndroidRelease', '--target', target, path.join(base, target.includes('android') ? 'android.json' : 'desktop.json')], {encoding: 'utf8', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
    assert.equal(result.status, 0, result.stderr);
  }
});
test('Android preparation copies scanned licences and derives known Android additions from pinned provenance', async t => {
  const mod = await api(); assert.equal(typeof mod.prepareInputs, 'function', 'offline preparer exists');
  const w = fixture(t, await api());
  fs.rmSync(path.join(w.work, 'sbom-inputs.json'));
  const review = mod.reviewTemplate(w.record, w.run);
  assert.equal(review.complete, false, 'draft inventory never asserts completeness');
  assert.ok(review.additions.some(c => c.name === 'ZXing core' && c.version === '3.5.3'));
  assert.ok(review.additions.some(c => c.name === '@ghostery/adblocker' && c.version));
  assert.ok(!review.additions.some(c => c.name === 'Sparkle'));
  assert.throws(() => mod.prepareInputs(w.work, w.src, review), /review|inventory/);
  // Exercise the complete offline handoff with an explicit fixture inventory,
  // including an additional component's verified licence and artifact bytes.
  const text = 'fixture additional licence\n'; fs.writeFileSync(path.join(w.src, 'additional.txt'), text);
  fs.writeFileSync(path.join(w.src, 'additional.bin'), 'fixture artifact');
  const input = mod.prepareInputs(w.work, w.src, {sourceCommit: commit, complete: true, reason: 'synthetic scanner-only fixture plus one explicit addition', upstream, chromiumVersion: w.inputs.chromiumVersion,
    additions: [...w.inputs.additions, {name: 'Fixture extra', dir: 'fixture/extra', version: '1', license: 'MIT', artifactFile: 'additional.bin', artifactSha256: sha256('fixture artifact'), licenseFiles: [{path: 'additional.txt', sha256: sha256(text)}]}], reviewedSkips: {}}, w.run);
  assert.equal(input.src, 'license-inputs');
  fs.rmSync(w.src, {recursive: true});
  mod.attest(w.work, pins, w.run);
  const bom = JSON.parse(fs.readFileSync(path.join(w.work, 'Blanc-Android.cdx.json')));
  assert.equal(bom.components.find(c => c.name === 'Fixture extra').hashes[0].content, sha256('fixture artifact'));
});
test('Android preparation rejects incorrect additional artifact bytes', async t => {
  const mod = await api(); assert.equal(typeof mod.prepareInputs, 'function', 'offline preparer exists');
  const w = fixture(t, await api()); fs.rmSync(path.join(w.work, 'sbom-inputs.json'));
  const c = {...w.scan.components[1], artifactFile: 'artifact.bin', artifactSha256: 'e'.repeat(64)};
  fs.writeFileSync(path.join(w.src, 'artifact.bin'), 'different');
  assert.throws(() => mod.prepareInputs(w.work, w.src, {sourceCommit: commit, complete: true, reason: 'fixture', upstream, chromiumVersion: w.inputs.chromiumVersion, additions: [...w.inputs.additions, c], reviewedSkips: {}}, w.run), /artifact/);
});

test('Android SBOM rejects omitted known shipped provenance before signing', async t => {
  const mod = await api(), w = fixture(t, mod);
  const all = w.inputs.additions;
  for (const name of ['ZXing core', '@ghostery/adblocker', 'Inter Latin webfont']) {
    w.inputs.additions = all.filter(c => c.name !== name); w.saveInputs();
    assert.throws(() => mod.attest(w.work, pins, w.run), /missing.*Android|inventory/);
  }
  assert.equal(w.calls.filter(c => c.command === 'cosign').length, 0);
});
test('Android attestation retries identical artifacts by verifying the existing signature', async t => {
  const mod = await api(), w = fixture(t, mod);
  mod.attest(w.work, pins, w.run); mod.attest(w.work, pins, w.run);
  assert.equal(w.calls.filter(c => c.command === 'cosign' && c.args[0] === 'sign-blob').length, 1);
  fs.appendFileSync(path.join(w.work, 'Blanc-Android.aab'), 'changed');
  assert.throws(() => mod.attest(w.work, pins, w.run), /differ|changed/);
});
test('Android SBOM checks Chromium version and upstream against the exact build source commit', async t => {
  const mod = await api(), w = fixture(t, mod);
  for (const pin of [{version: '999.0.0.0', upstream}, {version: w.inputs.chromiumVersion, upstream: 'f'.repeat(40)}]) {
    assert.throws(() => mod.attest(w.work, pins, (command, args, options) => {
      if (command === 'git') {
        assert.ok(args.at(-1).startsWith(`${w.record.commit}:`));
        if (args.at(-1).endsWith(':chromium/lanes/android.json')) return {status: 0, stdout: JSON.stringify(pin)};
      }
      return w.run(command, args, options);
    }), /version|upstream/);
  }
  assert.equal(w.calls.filter(c => c.command === 'cosign').length, 0);
});
test('Android preparation cannot omit the pinned artifact path to bypass checking its bytes', async t => {
  const mod = await api(), w = fixture(t, mod);
  fs.rmSync(path.join(w.work, 'sbom-inputs.json'));
  const review = {...w.inputs.review, upstream, chromiumVersion: w.inputs.chromiumVersion, additions: w.inputs.additions, reviewedSkips: {}};
  delete review.additions.find(c => c.name === 'ZXing core').artifactFile;
  assert.throws(() => mod.prepareInputs(w.work, w.src, review, w.run), /provenance|artifact/);
});
test('Android SBOM validates the scanner inventory before adding Blanc components', async t => {
  const mod = await api(), w = fixture(t, mod);
  w.scan.components = w.scan.components.slice(0, 99);
  fs.writeFileSync(path.join(w.work, 'scan.json'), JSON.stringify(w.scan));
  w.inputs.scanSha256 = sha256(JSON.stringify(w.scan)); w.saveInputs();
  assert.throws(() => mod.attest(w.work, pins, w.run), /too few/);
});
test('Android SBOM refuses omitted Lucide geometry even when the inventory claims completeness', async t => {
  const mod = await api(), w = fixture(t, mod);
  w.inputs.additions = w.inputs.additions.filter(c => !c.name.startsWith('Lucide')); w.saveInputs();
  assert.throws(() => mod.attest(w.work, pins, w.run), /missing known Android inventory component: Lucide/);
  assert.equal(w.calls.filter(c => c.command === 'cosign').length, 0);
});
test('Android Lucide provenance binds native and Start Page artifacts to the source commit and ISC text', async t => {
  const mod = await api(), w = fixture(t, mod);
  const additions = mod.reviewTemplate(w.record, w.run).additions;
  for (const file of ['island/res/drawable/blanc_space_book.xml', 'pages/start/space-identity.js']) {
    const c = additions.find(c => c.artifactFile === `blanc/android/${file}`);
    assert.ok(c, `Lucide artifact recorded: ${file}`);
    assert.equal(c.license, 'ISC'); assert.equal(c.version, null, 'no invented Lucide version');
    assert.equal(c.artifactSha256, sha256(fs.readFileSync(path.join(repo, 'chromium/blanc/android', file))));
    assert.ok(c.licenseFiles.some(f => f.sha256 === sha256(fs.readFileSync(path.join(repo, 'src/renderer/ublock-popup-icons/lucide-LICENSE.txt')))));
  }
  fs.rmSync(path.join(w.work, 'sbom-inputs.json'));
  fs.appendFileSync(path.join(w.src, 'blanc/android/island/res/drawable/blanc_space_book.xml'), 'changed');
  assert.throws(() => mod.prepareInputs(w.work, w.src, {...w.inputs.review, upstream, chromiumVersion: w.inputs.chromiumVersion, additions: w.inputs.additions, reviewedSkips: {}}, w.run), /artifact digest mismatch: Lucide/);
});
