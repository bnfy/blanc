import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const moduleURL = new URL('../android/release/aab.mjs', import.meta.url);
const pinURL = new URL('../android/release/upload-cert.json', import.meta.url);
const record = { versionCode: 1, versionName: '1.0.0-beta.1' };
const xml = (attributes = '', application = '') => `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="me.bnfy.blanc" android:versionCode="1" android:versionName="1.0.0-beta.1" ${attributes}><application ${application}/></manifest>`;
const notices = ['LICENSE', 'ASSET-LICENSE', 'THIRD-PARTY-NOTICES', 'CHROMIUM-FORK-NOTICES'].map(name => `base/assets/blanc/android/pages/notices/${name}.txt`);
const entries = [...notices, 'base/lib/arm64-v8a/libchrome.so', 'feature/lib/arm64-v8a/libfeature.so'];
const fingerprint = 'a1'.repeat(32);
const refs = { keystoreRef: 'op://Dev/Blanc Android upload key/blanc-upload.p12', aliasRef: 'op://Dev/Blanc Android upload key/alias', passwordRef: 'op://Dev/Blanc Android upload key/password' };
async function api() { assert.ok(fs.existsSync(moduleURL), 'AAB helper exists'); return import(moduleURL); }
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'aab-test-')); }
async function fixture(pin = fingerprint) {
  assert.ok(fs.existsSync(moduleURL), 'AAB helper exists');
  const dir = temp();
  fs.copyFileSync(moduleURL, path.join(dir, 'aab.mjs'));
  fs.writeFileSync(path.join(dir, 'upload-cert.json'), JSON.stringify({ sha256: pin }));
  const input = path.join(dir, 'input.aab');
  fs.writeFileSync(input, 'fixture bundle');
  return { dir, input, output: path.join(dir, 'signed.aab'), api: await import(pathToFileURL(path.join(dir, 'aab.mjs'))) };
}
function signingStub(f, { fail, cert = fingerprint, interrupt, missing, verifyFailure = false } = {}) {
  const calls = [];
  let key;
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    assert.notEqual(options.stdio, 'inherit', 'secret commands never inherit output');
    assert.equal(args.includes('fixture-password'), false);
    if (missing === command) return { error: Object.assign(new Error('sensitive diagnostic'), { code: 'ENOENT' }), status: null };
    if (command === 'op') {
      assert.deepEqual(args.slice(0, 1), ['read']);
      assert.equal(options.env.BLANC_ANDROID_OP_RUN, '1');
      if (args.includes(refs.keystoreRef)) {
        assert.ok(args.includes('--out-file'));
        assert.equal(args[args.indexOf('--file-mode') + 1], '0600');
        const target = args[args.indexOf('--out-file') + 1];
        assert.equal(fs.statSync(path.dirname(target)).mode & 0o777, 0o700);
        fs.writeFileSync(target, 'fixture keystore', { mode: 0o600 });
        return { status: 0, stdout: '' };
      }
      assert.ok(args.includes('--no-newline'));
      return { status: 0, stdout: args.includes(refs.passwordRef) ? 'fixture-password' : 'blanc-upload' };
    }
    if (command === 'unzip') return { status: 0, stdout: 'META-INF/MANIFEST.MF\nMETA-INF/OLD.SF\nMETA-INF/OLD.RSA\nMETA-INF/OLD.EC\nMETA-INF/services/keep\nbase/META-INF/KEEP.SF\n' };
    if (command === 'jarsigner' && !args.includes('-verify')) {
      key = args[args.indexOf('-keystore') + 1];
      const fd = fs.openSync(key, 'r');
      try {
        assert.equal(fs.fstatSync(fd).mode & 0o777, 0o600);
        assert.equal(fs.readFileSync(fd, 'utf8'), 'fixture keystore');
      } finally { fs.closeSync(fd); }
      assert.equal(fs.statSync(path.dirname(key)).mode & 0o777, 0o700);
      assert.ok(calls.find(call => call.command === 'zip'), 'old signatures stripped before signing');
      assert.ok(args.includes('-storepass:env') && args.includes('-keypass:env'));
      assert.equal(args[args.indexOf('-storepass:env') + 1], 'BLANC_ANDROID_UPLOAD_PASSWORD');
      assert.equal(options.env.BLANC_ANDROID_UPLOAD_PASSWORD, 'fixture-password');
      if (interrupt) process.emit(interrupt);
    }
    if (command === 'jarsigner' && args.includes('-verify')) {
      assert.ok(args.includes('-strict'));
      if (verifyFailure) return { status: 4, stderr: 'sensitive diagnostic fixture-password' };
    }
    if (command === 'keytool') {
      assert.ok(args.includes('-jarfile'), 'fingerprint comes from signed bundle, not keystore');
      return { status: 0, stdout: `Signer #1:\nCertificate #1:\nCertificate fingerprints:\n SHA256: ${cert.match(/../g).join(':').toUpperCase()}\n` };
    }
    if (command === fail) return { status: 1, stderr: `sensitive diagnostic ${key} fixture-password` };
    return { status: 0, stdout: '' };
  };
  return { run, calls, key: () => key };
}
function withSecrets(fn) {
  const previous = { ...process.env };
  Object.assign(process.env, { BLANC_ANDROID_OP_RUN: '1' });
  try { return fn(); } finally {
    for (const name of ['BLANC_ANDROID_OP_RUN']) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
}
test('valid manifest matches the build record', async () => assert.deepEqual((await api()).checkManifest(xml(), record), []));
for (const [name, value, expected] of [
  ['wrong package', xml().replace('me.bnfy.blanc', 'me.bnfy.blanc.dev'), /package/],
  ['debuggable true', xml('', 'android:debuggable="true"'), /debuggable/],
  ['debuggable numeric true', xml('', 'android:debuggable="1"'), /debuggable/],
  ['mismatched version code', xml().replace('versionCode="1"', 'versionCode="2"'), /versionCode/],
  ['mismatched version name', xml().replace('beta.1', 'beta.2'), /versionName/],
  ['missing manifest', '<application/>', /manifest/],
  ['comment', xml().replace('<manifest', '<!-- x --><manifest'), /invalid manifest XML/],
  ['nested comment', xml().replace('<manifest', '<!-<!-- x -->- y --><manifest'), /invalid manifest XML/],
]) test(`manifest reports ${name}`, async () => assert.match((await api()).checkManifest(value, record).join('\n'), expected));
test('all modules allow only arm64-v8a libraries and require Android notice paths', async () => {
  const { checkEntries } = await api();
  assert.deepEqual(checkEntries(entries), []);
  for (const abi of ['armeabi-v7a', 'x86', 'x86_64']) assert.match(checkEntries([...entries, `feature/lib/${abi}/libbad.so`]).join('\n'), /arm64-v8a/);
  assert.match(checkEntries([...entries, 'feature/assets/libbad.so']).join('\n'), /arm64-v8a/);
  for (const notice of notices) assert.match(checkEntries(entries.filter(name => name !== notice)).join('\n'), /notice/i);
  assert.match(checkEntries(entries.map(name => name.replace('/blanc/android/', '/blanc/'))).join('\n'), /notice/i);
  // Chromium's bundle puts browser assets in its install-time `chrome` module, not `base`.
  const inChrome = entries.map(name => name.replace(/^base\/assets\/blanc\//, 'chrome/assets/blanc/'));
  assert.deepEqual(checkEntries(inChrome), []);
  // A module fetched after install would leave a fresh install without its notices.
  assert.match(checkEntries(entries.map(name => name.replace(/^base\/assets\/blanc\//, 'on_demand_feature/assets/blanc/'))).join('\n'), /notice/i);
});
test('verification checks recorded bytes and digest before tools, then validates bundle and manifest', async () => {
  const { verifyBundle } = await api(); const dir = temp(); const file = path.join(dir, 'fixture.aab');
  try {
    const bytes = Buffer.from('fixture bundle'); fs.writeFileSync(file, bytes);
    const built = { ...record, aab: { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
    const commands = [];
    const run = (command, args) => { commands.push([command, args]); return { status: 0, stdout: command === 'unzip' ? entries.join('\n') : args.includes('manifest') ? xml() : '' }; };
    assert.throws(() => verifyBundle(file, { ...built, aab: { ...built.aab, sha256: 'b'.repeat(64) } }, run), /digest|sha256/i);
    assert.deepEqual(commands, []);
    verifyBundle(file, built, run);
    assert.ok(commands.some(([c, args]) => c === 'bundletool' && args.includes('validate')));
    assert.ok(commands.some(([c, args]) => c === 'bundletool' && args.includes('manifest')));
    assert.throws(() => verifyBundle(file, built, () => ({ error: { code: 'ENOENT' } })), /bundletool.*PATH/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('empty upload certificate pin refuses before reading secrets', async () => {
  const f = await fixture('');
  assert.ok(fs.existsSync(pinURL), 'certificate pin exists');
  const pin = JSON.parse(fs.readFileSync(pinURL));
  assert.ok(pin.sha256 === '' || /^[a-f0-9]{64}$/.test(pin.sha256));
  try { assert.throws(() => f.api.signBundle('', '', refs, () => assert.fail('no tools before pin')), /certificate.*pin/i); }
  finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('signing refuses outside the op run worker before reading secrets', async () => {
  const f = await fixture();
  try { assert.throws(() => f.api.signBundle(f.input, f.output, refs, () => assert.fail('no tools without op run')), /op run/); }
  finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
for (const outcome of ['success', 'jarsigner failure', 'strict verification failure', 'certificate mismatch', 'SIGINT', 'SIGTERM']) test(`signing ${outcome} removes the private keystore directory and keeps diagnostics secret`, async () => {
  const f = await fixture(); const stub = signingStub(f, { fail: outcome === 'jarsigner failure' ? 'jarsigner' : undefined, cert: outcome === 'certificate mismatch' ? 'b2'.repeat(32) : fingerprint, interrupt: outcome.startsWith('SIG') ? outcome : undefined, verifyFailure: outcome === 'strict verification failure' });
  const logs = []; const log = console.log; const error = console.error;
  console.log = console.error = (...args) => logs.push(args.join(' '));
  const listeners = process.listenerCount('SIGINT');
  try {
    withSecrets(() => {
      if (outcome === 'success') assert.deepEqual(f.api.signBundle(f.input, f.output, refs, stub.run), { certSha256: fingerprint });
      else assert.throws(() => f.api.signBundle(f.input, f.output, refs, stub.run), error => /failed|certificate|interrupt/i.test(error.message) && !error.message.includes('fixture-password') && !error.message.includes(stub.key()));
    });
    assert.ok(stub.key()); assert.equal(fs.existsSync(path.dirname(stub.key())), false);
    assert.equal(process.listenerCount('SIGINT'), listeners);
    assert.deepEqual(logs, []);
    if (outcome === 'strict verification failure') assert.equal(stub.calls.some(call => call.command === 'keytool'), false);
    const removed = stub.calls.find(call => call.command === 'zip').args;
    assert.deepEqual(removed.slice(2), ['META-INF/MANIFEST.MF', 'META-INF/OLD.SF', 'META-INF/OLD.RSA', 'META-INF/OLD.EC']);
    if (outcome === 'success') { assert.ok(fs.existsSync(f.output)); assert.ok(stub.calls.some(call => call.command === 'jarsigner' && call.args.includes('-verify'))); }
    else assert.equal(fs.existsSync(f.output), false);
  } finally { console.log = log; console.error = error; fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('signing failure while reading a secret removes its already written keystore', async () => {
  const f = await fixture(); const stub = signingStub(f); let keystore;
  const run = (command, args, options) => {
    const result = stub.run(command, args, options);
    if (command === 'op' && args.includes('--out-file')) keystore = args[args.indexOf('--out-file') + 1];
    if (command === 'op' && args.includes(refs.passwordRef)) return { status: 1, stderr: `sensitive ${keystore}` };
    return result;
  };
  try {
    withSecrets(() => assert.throws(() => f.api.signBundle(f.input, f.output, refs, run), /^Error: op failed$/));
    assert.equal(fs.existsSync(path.dirname(keystore)), false); assert.equal(fs.existsSync(f.output), false);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('missing signing tool is named without exposing command diagnostics', async () => {
  const f = await fixture(); const stub = signingStub(f, { missing: 'jarsigner' });
  try { withSecrets(() => assert.throws(() => f.api.signBundle(f.input, f.output, refs, stub.run), /jarsigner.*PATH/)); }
  finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
test('real SIGHUP during a fixture signing command removes the private keystore', async () => {
  const f = await fixture();
  const child = `
    import fs from 'node:fs';
    import { spawnSync } from 'node:child_process';
    import { signBundle } from ${JSON.stringify(pathToFileURL(path.join(f.dir, 'aab.mjs')).href)};
    const run = (command, args) => {
      if (command === 'op') {
        if (args.includes('--out-file')) {
          fs.writeFileSync(args[args.indexOf('--out-file') + 1], 'fixture keystore', { mode: 0o600 });
          return { status: 0, stdout: '' };
        }
        return { status: 0, stdout: args.includes(${JSON.stringify(refs.aliasRef)}) ? 'blanc-upload' : 'fixture-password' };
      }
      if (command === 'jarsigner') {
        // A separate Node fixture sends the real OS signal while the signing
        // worker is blocked in a synchronous command, as on Terminal closure.
        spawnSync(process.execPath, ['-e', 'process.kill(Number(process.argv[1]), "SIGHUP")', String(process.pid)], { stdio: 'ignore' });
        return { status: 1 };
      }
      return { status: 0, stdout: '' };
    };
    try {
      signBundle(${JSON.stringify(f.input)}, ${JSON.stringify(f.output)}, ${JSON.stringify(refs)}, run);
      process.exitCode = 2;
    } catch { /* Expected injected signing failure after the signal. */ }
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
      encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, TMPDIR: f.dir, BLANC_ANDROID_OP_RUN: '1' },
    });
    assert.deepEqual(fs.readdirSync(f.dir).filter(name => name.startsWith('blanc-android-sign-')), [], 'SIGHUP removes the keystore directory');
    assert.equal(result.status, 0);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(f.output), false);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
