import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const moduleURL = new URL('../android/release/release.mjs', import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
async function api() { assert.ok(fs.existsSync(moduleURL), 'release orchestrator exists'); return import(moduleURL); }
function fixture(t) {
  const base = path.join(root, '.a7-tmp'); fs.mkdirSync(base, {recursive: true});
  const dir = fs.mkdtempSync(path.join(base, 'stages-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const source = path.join(dir, 'handoff'), work = path.join(dir, 'work'), ledger = path.join(dir, 'ledger.json');
  const record = {schema: 1, tag: 'android-v1.0.0-beta.1-1', versionName: '1.0.0-beta.1', versionCode: 1, commit: 'a'.repeat(40), appliedOver: 'b'.repeat(40), upstream: 'c'.repeat(40), argsSha256: 'd'.repeat(64), builtAt: '2026-11-15T00:00:00.000Z', aab: {file: 'ChromePublic.aab', bytes: 14, sha256: sha('fixture bundle')}, gatesApk: {sha256: 'e'.repeat(64)}};
  const refs = {keystoreRef: 'op://Dev/Blanc Android upload key/blanc-upload.p12', aliasRef: 'op://Dev/Blanc Android upload key/alias', passwordRef: 'op://Dev/Blanc Android upload key/password', credentialRef: 'op://Dev/Blanc Play API/credential'};
  write(path.join(work, 'config.json'), {schema: 1, source, ledger, secrets: refs}); write(ledger, {schema: 1, builds: []});
  write(path.join(source, 'build.json'), record); write(path.join(source, 'ChromePublic.aab'), 'fixture bundle');
  write(path.join(source, 'scan.json'), {fixture: true}); write(path.join(source, 'sbom-inputs.json'), {fixture: true}); write(path.join(source, 'license-inputs/LICENSE'), 'fixture licence');
  write(path.join(source, 'release-gate.json'), {schema: 1, package: 'me.bnfy.blanc', verdict: 'pass', sourceCommit: record.commit, apkSHA256: record.gatesApk.sha256, exclusions: [], exclusionDiscovery: 'pending', results: ['outbound', 'acceptance'].map(name => ({name, verdict: 'pass'}))});
  write(path.join(source, 'privacy-capture.json'), {schema: 1, verdict: 'pass', sourceCommit: record.commit, apkSHA256: record.gatesApk.sha256, captureSHA256: 'f'.repeat(64), reason: 'Fixture OS and Play-services packet review'});
  const calls = [], prompts = [];
  const run = (command, args, options = {}) => {
    calls.push({command, args, options}); let stdout = '';
    if (command === 'git') stdout = args.includes('show') ? '[]' : record.commit;
    else if (command === 'bundletool') {
      if (args[0] === 'dump') stdout = `<manifest package="me.bnfy.blanc" android:versionCode="1" android:versionName="1.0.0-beta.1"/>`;
      if (args[0] === 'build-apks') write(args.find(a => a.startsWith('--output=')).slice(9), 'fixture APK set');
      if (args[0] === 'get-size') stdout = 'MIN,MAX\n123456,123999\n';
    } else if (command === 'unzip') stdout = ['base/lib/arm64-v8a/libchrome.so', ...['LICENSE', 'ASSET-LICENSE', 'THIRD-PARTY-NOTICES', 'CHROMIUM-FORK-NOTICES'].map(n => `base/assets/blanc/android/pages/notices/${n}.txt`)].join('\n');
    else throw new Error(`unexpected external command ${command}`);
    return {status: 0, stdout};
  };
  const io = {run, platform: 'darwin', tty: true, env: {BLANC_COSIGN_IDENTITY: 'fixture@example.com', BLANC_COSIGN_OIDC_ISSUER: 'https://fixture.invalid'}, prompt: async text => { prompts.push(text); return 'upload 1.0.0-beta.1 (1) to internal'; },
    worker: async stage => { if (stage === 'sign') { write(path.join(work, 'Blanc-Android.aab'), 'fixture signed bundle'); return {certSha256: '1'.repeat(64)}; } return {editId: 'fixture-edit', versionCode: 1, aabSha256: sha('fixture signed bundle')}; },
    attest: (target, env, runner) => { assert.equal(target, work); assert.equal(runner, run); assert.equal(env.BLANC_COSIGN_IDENTITY, 'fixture@example.com'); for (const name of ['Blanc-Android.cdx.json', 'SHA256SUMS', 'SHA256SUMS.sigstore.json']) write(path.join(work, name), 'fixture ' + name); return {sbom: 'Blanc-Android.cdx.json', checksums: 'SHA256SUMS', sigstore: 'SHA256SUMS.sigstore.json'}; }};
  return {dir, work, source, ledger, record, refs, io, calls, prompts};
}
async function through(f, last) { const {runStage} = await api(); for (const stage of ['fetch', 'verify', 'sign', 'attest']) { await runStage(stage, f.work, f.io); if (stage === last) break; } }

for (const stage of ['verify', 'sign', 'attest', 'upload']) test(`${stage} requires its predecessor before any command or prompt`, async t => {
  const f = fixture(t); const {runStage} = await api(); await assert.rejects(runStage(stage, f.work, f.io), /predecessor|requires.*stage/i); assert.equal(f.calls.length, 0); assert.equal(f.prompts.length, 0);
});
test('status starts empty, fetch imports the exact offline handoff and reserves a verified built row', async t => {
  const f = fixture(t), {runStage} = await api(); assert.deepEqual((await runStage('status', f.work, f.io)).stages, {});
  await runStage('fetch', f.work, f.io); const state = read(path.join(f.work, 'state.json'));
  assert.equal(state.schema, 1); assert.equal(state.stages.fetch.outputs['ChromePublic.aab'], f.record.aab.sha256);
  assert.equal(state.stages.fetch.outputs['license-inputs/LICENSE'], sha('fixture licence'));
  assert.equal(read(f.ledger).builds[0].state, 'built'); assert.equal(read(f.ledger).builds[0].tag, f.record.tag);
  assert.equal(f.calls.some(c => c.command === 'git' && c.args.includes('rev-parse')), true);
  assert.equal(f.calls.some(c => ['ssh', 'scp', 'curl'].includes(c.command)), false);
});
test('fetch refuses AAB digest mismatch without ledger reservation', async t => {
  const f = fixture(t), {runStage} = await api(); write(path.join(f.source, 'ChromePublic.aab'), 'bad bundle');
  await assert.rejects(runStage('fetch', f.work, f.io), /bundle.*(sha256|digest|bytes)/i); assert.deepEqual(read(f.ledger).builds, []);
});
test('fetch validates the full build record and local immutable source before reservation', async t => {
  const f = fixture(t), {runStage} = await api(); const record = {...f.record}; delete record.argsSha256; write(path.join(f.source, 'build.json'), record);
  await assert.rejects(runStage('fetch', f.work, f.io), /argsSha256/); assert.deepEqual(read(f.ledger).builds, []);
  write(path.join(f.source, 'build.json'), f.record); f.io.run = () => ({status: 128, stdout: ''});
  await assert.rejects(runStage('fetch', f.work, f.io), /source commit|git/); assert.deepEqual(read(f.ledger).builds, []);
});
for (const name of ['ChromePublic.aab', 'build.json', 'license-inputs/LICENSE', 'release-gate.json', 'privacy-capture.json', 'config.json']) test(`recorded ${name} digest change refuses before subsequent work`, async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'fetch'); write(path.join(f.work, name), 'changed'); f.calls.length = 0;
  await assert.rejects(runStage('verify', f.work, f.io), /digest|changed/); assert.equal(f.calls.length, 0);
});
test('verify validates AAB and records pinned Pixel download size, raw CSV and APK set digest', async t => {
  const f = fixture(t); await through(f, 'verify'); const stage = read(path.join(f.work, 'state.json')).stages.verify;
  assert.deepEqual(stage.downloadSize, {minBytes: 123456, maxBytes: 123999, csv: 'MIN,MAX\n123456,123999\n', deviceSha256: sha(fs.readFileSync(new URL('../android/release/pixel-10-pro.json', import.meta.url)))});
  assert.equal(stage.outputs['pixel.apks'], sha('fixture APK set'));
  const size = f.calls.find(c => c.args[0] === 'get-size'); assert.equal(size.command, 'bundletool'); assert.equal(size.args[1], 'total'); assert.ok(size.args.some(a => a.endsWith('/pixel-10-pro.json')));
  const build = f.calls.find(c => c.args[0] === 'build-apks'); assert.equal(build.args.some(a => /skip-apk-signing|--ks/.test(a)), false);
  assert.deepEqual(read(fileURLToPath(new URL('../android/release/pixel-10-pro.json', import.meta.url))), {supportedAbis: ['arm64-v8a'], supportedLocales: ['en', 'de', 'es', 'fr', 'it', 'pt-BR'], screenDensity: 480, sdkVersion: 36});
});
for (const csv of ['MIN,MAX\n0,1', 'MIN,MAX\n20,10', 'MIN,MAX\n1 MB,2 MB', 'MIN,MAX\n1,2\n3,4', 'other\n1,2', 'MIN,MAX\n1,9007199254740992']) test(`size CSV fails closed: ${JSON.stringify(csv)}`, async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'fetch'); const run = f.io.run; f.io.run = (c, a, o) => a[0] === 'get-size' ? {status: 0, stdout: csv} : run(c, a, o);
  await assert.rejects(runStage('verify', f.work, f.io), /size|CSV/i); assert.equal(read(path.join(f.work, 'state.json')).stages.verify, undefined);
});
test('finished stages return validated status without rerunning tools, signing or upload', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); await runStage('upload', f.work, f.io);
  f.io.run = () => { throw new Error('must not rerun'); }; f.io.worker = () => { throw new Error('must not rerun'); }; f.io.prompt = () => { throw new Error('must not ask again'); };
  for (const stage of ['fetch', 'verify', 'sign', 'attest', 'upload', 'status']) assert.ok((await runStage(stage, f.work, f.io)).stages.upload);
});
for (const input of ['', 'yes', 'upload 1.0.0-beta.1 (1) to internal ', 'upload 1.0.0-beta.2 (1) to internal']) test(`upload does nothing for nonexact approval ${JSON.stringify(input)}`, async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); let calls = 0; f.io.worker = () => { calls++; }; f.io.prompt = async text => { f.prompts.push(text); return input; };
  await assert.rejects(runStage('upload', f.work, f.io), /confirmation/); assert.equal(calls, 0); assert.match(f.prompts[0], /upload 1\.0\.0-beta\.1 \(1\) to internal/); assert.equal(read(f.ledger).builds[0].state, 'built');
});
test('upload refuses an already uploaded code before prompt or worker', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); const l = read(f.ledger); l.builds[0].state = 'uploaded'; write(f.ledger, l);
  f.io.worker = () => { throw new Error('worker must not run'); }; await assert.rejects(runStage('upload', f.work, f.io), /uploaded/); assert.equal(f.prompts.length, 0);
});
test('ledger advances only after the upload resolves and a public receipt is recorded', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); let finish, started;
  const ready = new Promise(resolve => { started = resolve; }); f.io.worker = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const pending = runStage('upload', f.work, f.io); await ready; assert.equal(read(f.ledger).builds[0].state, 'built'); assert.equal(read(path.join(f.work, 'state.json')).stages.upload, undefined);
  finish({editId: 'committed', versionCode: 1, aabSha256: sha('fixture signed bundle')}); await pending;
  assert.equal(read(f.ledger).builds[0].state, 'uploaded'); assert.equal(read(path.join(f.work, 'upload-receipt.json')).editId, 'committed'); assert.ok(read(path.join(f.work, 'state.json')).stages.upload);
});
test('failed upload preserves built state and a retry makes a fresh worker request', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); const worker = f.io.worker; let attempts = 0;
  f.io.worker = async (...args) => { if (++attempts === 1) throw new Error('Play edit commit failed'); return worker(...args); };
  await assert.rejects(runStage('upload', f.work, f.io), /commit/); assert.equal(read(f.ledger).builds[0].state, 'built'); await runStage('upload', f.work, f.io); assert.equal(attempts, 2);
});
test('a leftover public upload receipt blocks a second API request pending reconciliation', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); write(path.join(f.work, 'upload-receipt.json'), {editId: 'committed', versionCode: 1, aabSha256: sha('fixture signed bundle')});
  f.io.worker = () => { throw new Error('must not reupload'); }; await assert.rejects(runStage('upload', f.work, f.io), /receipt.*reconcil/i);
});
for (const change of ['gate-missing', 'gate-commit', 'gate-apk', 'gate-package', 'gate-result', 'gate-exclusions', 'privacy-missing', 'privacy-commit', 'privacy-apk', 'privacy-capture', 'privacy-reason']) test(`upload binds privacy evidence: ${change}`, async t => {
  const f = fixture(t), {runStage} = await api(); const gate = path.join(f.source, 'release-gate.json'), privacy = path.join(f.source, 'privacy-capture.json');
  if (change.endsWith('missing')) fs.unlinkSync(change.startsWith('gate') ? gate : privacy);
  else { const file = change.startsWith('gate') ? gate : privacy, value = read(file); if (change.endsWith('commit')) value.sourceCommit = 'b'.repeat(40); if (change.endsWith('apk')) value.apkSHA256 = 'b'.repeat(64); if (change.endsWith('package')) value.package = 'me.bnfy.blanc.dev'; if (change.endsWith('result')) value.results[0].verdict = 'fail'; if (change.endsWith('exclusions')) value.exclusions = [{scenario: '@bogus'}]; if (change.endsWith('capture')) value.captureSHA256 = ''; if (change.endsWith('reason')) value.reason = ''; write(file, value); }
  // Missing evidence may fail at import; no path is allowed through to Play.
  await assert.rejects(async () => { await through(f, 'attest'); await runStage('upload', f.work, f.io); }); assert.equal(f.prompts.length, 0);
});
for (const stage of ['sign', 'attest', 'upload']) test(`${stage} requires owner Mac foreground Terminal`, async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, stage === 'sign' ? 'verify' : stage === 'attest' ? 'sign' : 'attest');
  for (const io of [{...f.io, tty: false}, {...f.io, platform: 'linux'}]) await assert.rejects(runStage(stage, f.work, io), /foreground|Mac/);
});
test('production credential stages launch only the op run worker with file-held references', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'verify'); delete f.io.worker;
  f.io.run = (command, args, options) => { assert.equal(command, 'op'); assert.deepEqual(args.slice(0, 3), ['run', '--', process.execPath]); assert.equal(args.includes('--worker'), true); assert.equal(options.env.BLANC_ANDROID_OP_RUN, '1'); assert.equal(JSON.stringify(args).includes('op://'), false); assert.equal(JSON.stringify(options.env).includes('op://'), false); write(path.join(f.work, 'Blanc-Android.aab'), 'fixture signed bundle'); return {status: 0, stdout: JSON.stringify({certSha256: '1'.repeat(64)})}; };
  await runStage('sign', f.work, f.io);
});
test('worker keeps credential and token inside its boundary and returns only public upload receipt', async t => {
  const f = fixture(t), {secretWorker} = await api(); await through(f, 'attest'); const token = 'fixture-private-token', credential = 'fixture-private-credential'; const trace = [];
  const result = await secretWorker('upload', f.work, {...f.io, env: {...f.io.env, BLANC_ANDROID_OP_RUN: '1'}, run: (command, args, options) => { if (command === 'git') return f.io.run(command, args, options); trace.push([command, args]); assert.deepEqual([command, ...args], ['op', 'read', f.refs.credentialRef, '--no-newline']); return {status: 0, stdout: credential}; }, accessToken: async value => { assert.equal(value, credential); return token; }, uploadToInternal: async value => { assert.equal(value.token, token); assert.equal(value.aabPath, path.join(f.work, 'Blanc-Android.aab')); return {editId: 'fixture-edit', versionCode: 1}; }});
  assert.deepEqual(result, {editId: 'fixture-edit', versionCode: 1, aabSha256: sha('fixture signed bundle')}); assert.equal(JSON.stringify(read(path.join(f.work, 'upload-receipt.json'))).includes(token), false); assert.equal(trace.length, 1); assert.equal(read(f.ledger).builds[0].state, 'built');
});
test('worker rejects missing marker and sanitizes tool diagnostics', async t => {
  const f = fixture(t), {secretWorker} = await api(); await through(f, 'attest');
  await assert.rejects(secretWorker('upload', f.work, f.io), /op run/);
  await assert.rejects(secretWorker('upload', f.work, {...f.io, env: {BLANC_ANDROID_OP_RUN: '1'}, run: () => ({status: 1, stderr: 'SECRET'})}), error => { assert.equal(String(error).includes('SECRET'), false); return true; });
});
test('worker independently rechecks release/privacy gates before reading API credentials', async t => {
  const f = fixture(t), {secretWorker} = await api();
  const gate = path.join(f.source, 'release-gate.json'), failed = read(gate); failed.verdict = 'fail'; write(gate, failed); await through(f, 'attest');
  let secretReads = 0;
  await assert.rejects(secretWorker('upload', f.work, {...f.io, env: {BLANC_ANDROID_OP_RUN: '1'}, run: (c, a, o) => { if (c === 'op') { secretReads++; return {status: 1}; } return f.io.run(c, a, o); }}), /gate/);
  assert.equal(secretReads, 0);
});
test('upload rechecks source-approved exclusions after owner approval', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); let workers = 0;
  f.io.worker = () => { workers++; throw new Error('must not upload'); };
  const run = f.io.run; let changed = false; f.io.run = (c, a, o) => changed && c === 'git' && a.includes('show') ? {status: 0, stdout: '[{"scenario":"@unexpected"}]'} : run(c, a, o);
  f.io.prompt = async () => { changed = true; return 'upload 1.0.0-beta.1 (1) to internal'; };
  await assert.rejects(runStage('upload', f.work, f.io), /exclusions/); assert.equal(workers, 0);
});
test('verify refuses missing APK-set output even if bundletool reports success', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'fetch'); const run = f.io.run;
  f.io.run = (c, a, o) => a[0] === 'build-apks' ? {status: 0, stdout: ''} : run(c, a, o);
  await assert.rejects(runStage('verify', f.work, f.io)); assert.equal(read(path.join(f.work, 'state.json')).stages.verify, undefined);
});
test('sign worker delegates raw Document and field references to the audited signing helper', async t => {
  const f = fixture(t), {secretWorker} = await api(); await through(f, 'verify'); let signed = false;
  assert.deepEqual(await secretWorker('sign', f.work, {...f.io, env: {BLANC_ANDROID_OP_RUN: '1'}, signBundle: (input, output, refs, run) => { assert.equal(input, path.join(f.work, 'ChromePublic.aab')); assert.equal(output, path.join(f.work, 'Blanc-Android.aab')); assert.deepEqual(refs, f.refs); assert.equal(run, f.io.run); signed = true; return {certSha256: '1'.repeat(64)}; }}), {certSha256: '1'.repeat(64)});
  assert.equal(signed, true);
});
test('fetch refuses symlinked licence input without copying or reserving a code', async t => {
  const f = fixture(t), {runStage} = await api(); fs.symlinkSync(path.join(f.source, 'build.json'), path.join(f.source, 'license-inputs/link'));
  await assert.rejects(runStage('fetch', f.work, f.io), /symlink/); assert.equal(fs.existsSync(path.join(f.work, 'build.json')), false); assert.deepEqual(read(f.ledger).builds, []);
});
test('verify refuses a changed Pixel device pin before invoking another tool', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'verify'); const state = read(path.join(f.work, 'state.json')); state.stages.verify.downloadSize.deviceSha256 = '0'.repeat(64); write(path.join(f.work, 'state.json'), state); f.calls.length = 0;
  await assert.rejects(runStage('sign', f.work, f.io), /device spec digest/); assert.equal(f.calls.length, 0);
});
test('fetch downloads only whitelisted handoff inputs, leaving raw captures and server attempts untouched', async t => {
  const f = fixture(t), {runStage} = await api(); const configFile = path.join(f.work, 'config.json'), config = read(configFile); config.source = {host: 'android-release', path: '/home/blanc/evidence/android-v1.0.0-beta.1-1'}; write(configFile, config);
  write(path.join(f.source, 'raw-session.pcap'), 'fixture raw capture stays server-side'); write(path.join(f.source, 'attempts/source-backup'), 'fixture source backup');
  const run = f.io.run; let transfers = 0; const whitelist = ['ChromePublic.aab', 'build.json', 'scan.json', 'sbom-inputs.json', 'release-gate.json', 'privacy-capture.json', 'license-inputs'];
  f.io.run = (command, args, options) => { if (command !== 'rsync') return run(command, args, options); transfers++; assert.deepEqual(args.slice(0, 2), ['--recursive', '--links']); assert.deepEqual(args.slice(3, -1), ['--', 'android-release:/home/blanc/evidence/android-v1.0.0-beta.1-1/']); assert.deepEqual(fs.readFileSync(args[2].slice(13), 'utf8').trim().split('\n'), whitelist); const destination = args.at(-1); assert.ok(destination.startsWith(f.work + path.sep)); for (const name of whitelist) fs.cpSync(path.join(f.source, name), path.join(destination, name), {recursive: true, verbatimSymlinks: true}); return {status: 0, stdout: ''}; };
  await runStage('fetch', f.work, f.io); assert.equal(transfers, 1); assert.equal(read(path.join(f.work, 'state.json')).stages.fetch.outputs['ChromePublic.aab'], f.record.aab.sha256); assert.equal(fs.readdirSync(f.work).some(n => n.startsWith('.fetch-')), false); assert.equal(fs.existsSync(path.join(f.work, 'raw-session.pcap')), false); assert.equal(fs.existsSync(path.join(f.work, 'attempts')), false);
});
for (const source of [{host: '-evil', path: '/safe'}, {host: 'host;command', path: '/safe'}, {host: 'host', path: '/safe/../secret'}, {host: 'host', path: '/safe/$(command)'}, {host: 'host', path: 'relative'}]) test(`fetch refuses unsafe transport address ${JSON.stringify(source)}`, async t => {
  const f = fixture(t), {runStage} = await api(); const config = read(path.join(f.work, 'config.json')); config.source = source; write(path.join(f.work, 'config.json'), config);
  await assert.rejects(runStage('fetch', f.work, f.io), /source|host|path/); assert.equal(f.calls.length, 0); assert.deepEqual(read(f.ledger).builds, []);
});
test('failed CLI transfer preserves no stage output or ledger reservation', async t => {
  const f = fixture(t), {runStage} = await api(); const config = read(path.join(f.work, 'config.json')); config.source = {host: 'android-release', path: '/safe'}; write(path.join(f.work, 'config.json'), config);
  f.io.run = command => { assert.equal(command, 'rsync'); return {status: 1, stderr: 'private host diagnostics'}; };
  await assert.rejects(runStage('fetch', f.work, f.io), /rsync failed/); assert.equal(fs.readdirSync(f.work).some(n => n.startsWith('.fetch-')), false); assert.deepEqual(read(f.ledger).builds, []); assert.equal(fs.existsSync(path.join(f.work, 'state.json')), false);
});
test('a changed upload-certificate pin after signing blocks reuse before another worker or command', async t => {
  const f = fixture(t), {runStage} = await api(); f.io.pinFile = path.join(f.dir, 'fixture-upload-cert.json'); write(f.io.pinFile, {sha256: '1'.repeat(64)});
  await through(f, 'attest'); const state = read(path.join(f.work, 'state.json')); assert.equal(state.stages.sign.uploadCertSha256, sha(fs.readFileSync(f.io.pinFile)));
  write(f.io.pinFile, {sha256: '2'.repeat(64)}); f.calls.length = 0; f.io.worker = () => { throw new Error('must not rerun'); };
  for (const stage of ['sign', 'upload', 'status']) await assert.rejects(runStage(stage, f.work, f.io), /certificate pin.*changed/);
  assert.equal(f.calls.length, 0); assert.equal(f.prompts.length, 0);
});
test('an unrecorded signed AAB requires reconciliation without another signing attempt', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'verify'); write(path.join(f.work, 'Blanc-Android.aab'), 'signed before interrupted parent');
  f.io.worker = () => { throw new Error('must not sign again'); };
  await assert.rejects(runStage('sign', f.work, f.io), /signed bundle.*reconcil/); assert.equal(read(path.join(f.work, 'state.json')).stages.sign, undefined);
});
test('a certificate pin changed while the signing worker runs cannot bind the result to the new pin', async t => {
  const f = fixture(t), {runStage} = await api(); f.io.pinFile = path.join(f.dir, 'fixture-upload-cert.json'); write(f.io.pinFile, {sha256: '1'.repeat(64)}); await through(f, 'verify');
  const worker = f.io.worker; f.io.worker = async (...args) => { const result = await worker(...args); write(f.io.pinFile, {sha256: '2'.repeat(64)}); return result; };
  await assert.rejects(runStage('sign', f.work, f.io), /pin.*changed.*signing/); assert.equal(read(path.join(f.work, 'state.json')).stages.sign, undefined);
});
for (const kind of ['file', 'directory']) test(`remote ${kind} symlink is preserved and refused before target bytes transfer or ledger reservation`, async t => {
  const f = fixture(t), {runStage} = await api();
  const configFile = path.join(f.work, 'config.json'), config = read(configFile); config.source = {host: 'android-release', path: '/private/release'}; write(configFile, config);
  const outside = path.join(f.dir, kind === 'file' ? 'private.pcap' : 'private-captures');
  if (kind === 'file') write(outside, 'PRIVATE CAPTURE'); else write(path.join(outside, 'private.pcap'), 'PRIVATE CAPTURE');
  fs.symlinkSync(outside, path.join(f.source, 'license-inputs/private-capture'));
  const run = f.io.run; let privateBytesTransferred = false;
  f.io.run = (command, args, options) => {
    if (!['scp', 'rsync'].includes(command)) return run(command, args, options);
    // Faithful distinction: scp -r follows remote links; rsync --links copies
    // link text without reading the target. Do not run either real transport.
    const follow = command === 'scp' || args.includes('--copy-links') || args.includes('-L');
    const names = command === 'scp' ? args.slice(2, -1).map(value => path.posix.basename(value)) : fs.readFileSync(args.find(value => value.startsWith('--files-from=')).slice(13), 'utf8').trim().split('\n');
    const copy = (from, to) => {
      const stat = fs.lstatSync(from);
      if (stat.isSymbolicLink() && !follow) { if (command === 'rsync' && args.includes('--links')) fs.symlinkSync(fs.readlinkSync(from), to); return; }
      const actual = stat.isSymbolicLink() ? fs.realpathSync(from) : from;
      if (actual === outside || actual.startsWith(outside + path.sep)) privateBytesTransferred = true;
      if (fs.statSync(actual).isDirectory()) { fs.mkdirSync(to, {recursive: true}); for (const name of fs.readdirSync(actual)) copy(path.join(actual, name), path.join(to, name)); }
      else fs.copyFileSync(actual, to);
    };
    for (const name of names) copy(path.join(f.source, name), path.join(args.at(-1), name));
    return {status: 0, stdout: ''};
  };
  await assert.rejects(runStage('fetch', f.work, f.io), /symlink/);
  assert.equal(privateBytesTransferred, false); assert.deepEqual(read(f.ledger).builds, []); assert.equal(fs.existsSync(path.join(f.work, 'build.json')), false); assert.equal(fs.readdirSync(f.work).some(name => name.startsWith('.fetch-')), false);
});
for (const boundary of ['parent', 'worker']) test(`${boundary} refuses unfinished code below the highest uploaded code before approval or credentials`, async t => {
  const f = fixture(t), {runStage, secretWorker} = await api(); await through(f, 'attest');
  const ledger = read(f.ledger); ledger.builds.push({...ledger.builds[0], versionName: '1.0.0-beta.2', versionCode: 2, tag: 'android-v1.0.0-beta.2-2', state: 'uploaded'}); write(f.ledger, ledger);
  let commands = 0, workers = 0; f.io.run = () => { commands++; throw new Error('must reject before credentials or source reads'); }; f.io.worker = () => { workers++; throw new Error('must reject before worker'); };
  if (boundary === 'parent') await assert.rejects(runStage('upload', f.work, f.io), /below.*(highest|last).*uploaded/i);
  else await assert.rejects(secretWorker('upload', f.work, {...f.io, env: {...f.io.env, BLANC_ANDROID_OP_RUN: '1'}}), /below.*(highest|last).*uploaded/i);
  assert.equal(f.prompts.length, 0); assert.equal(commands, 0); assert.equal(workers, 0); assert.equal(read(f.ledger).builds[0].state, 'built');
});
test('finished older release remains idempotent status after a newer code uploads', async t => {
  const f = fixture(t), {runStage} = await api(); await through(f, 'attest'); await runStage('upload', f.work, f.io);
  const ledger = read(f.ledger); ledger.builds.push({...ledger.builds[0], versionName: '1.0.0-beta.2', versionCode: 2, tag: 'android-v1.0.0-beta.2-2', state: 'uploaded'}); write(f.ledger, ledger);
  f.io.run = () => { throw new Error('must not rerun'); }; f.io.worker = () => { throw new Error('must not rerun'); }; f.io.prompt = () => { throw new Error('must not prompt'); };
  assert.ok((await runStage('upload', f.work, f.io)).stages.upload); assert.ok((await runStage('status', f.work, f.io)).stages.upload);
});
