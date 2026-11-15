import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const SHA256 = /^[a-f0-9]{64}$/;
const NOTICES = ['LICENSE', 'ASSET-LICENSE', 'THIRD-PARTY-NOTICES', 'CHROMIUM-FORK-NOTICES']
  .map(name => `base/assets/blanc/android/pages/notices/${name}.txt`);
const requireValue = (value, message) => { if (!value) throw new Error(message); };

// Input is the XML emitted by bundletool dump manifest, never binary XML.
export function checkManifest(xml, record) {
  const problems = [];
  const source = String(xml);
  const manifests = [...source.matchAll(/<manifest\b([^>]*)>/g)];
  // bundletool writes no comments, so any comment is refused rather than stripped: a stripped one could hide a match.
  if (manifests.length !== 1 || /<!--|<!DOCTYPE|<!ENTITY/i.test(source)) return ['invalid manifest XML'];
  const attributes = manifests[0][1];
  for (const [name, expected] of [['package', 'me.bnfy.blanc'], ['android:versionCode', String(record?.versionCode)], ['android:versionName', record?.versionName]]) {
    const values = [...attributes.matchAll(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'g'))];
    if (values.length !== 1 || values[0][2] !== expected) problems.push(`manifest ${name.replace('android:', '')} differs from release record`);
  }
  if (/\bandroid:debuggable\s*=\s*(["'])(?:true|1)\1/.test(source)) problems.push('manifest is debuggable');
  return problems;
}

export function checkEntries(names) {
  const problems = [];
  for (const name of names) {
    if (name.endsWith('/')) continue;
    if ((/(?:^|\/)lib\//.test(name) || /\.so$/i.test(name)) && !/^[^/]+\/lib\/arm64-v8a\/[^/]+$/.test(name)) {
      problems.push(`native library must be under module/lib/arm64-v8a/: ${name}`);
    }
  }
  for (const notice of NOTICES) if (!names.includes(notice)) problems.push(`missing notice: ${notice}`);
  return problems;
}

// Always capture output. Neither command output nor a command line is included
// in errors: op/jarsigner diagnostics can contain secrets and private paths.
function execute(run, command, args, env = process.env) {
  let result;
  try {
    result = run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      // op waits for the owner's 1Password approval, which has no fixed length.
      maxBuffer: 32 * 1024 * 1024, timeout: command === 'op' ? 0 : 120_000, env: { ...env, LC_ALL: 'C', LANG: 'C' } });
  } catch { throw new Error(`${command} failed`); }
  if (result?.error?.code === 'ENOENT') throw new Error(`${command} is missing from PATH`);
  requireValue(!result?.error && result?.status === 0, `${command} failed`);
  return String(result.stdout ?? '');
}
const listEntries = (run, bundle) => execute(run, 'unzip', ['-Z1', bundle]).split(/\r?\n/).filter(Boolean);

export function verifyBundle(input, record, run = spawnSync) {
  const bytes = fs.readFileSync(input);
  requireValue(bytes.length === record?.aab?.bytes, 'bundle bytes differ from build record');
  requireValue(SHA256.test(record?.aab?.sha256 ?? '') && crypto.createHash('sha256').update(bytes).digest('hex') === record.aab.sha256,
    'bundle sha256 digest differs from build record');
  const bundle = path.resolve(input);
  execute(run, 'bundletool', ['validate', `--bundle=${bundle}`]);
  const xml = execute(run, 'bundletool', ['dump', 'manifest', `--bundle=${bundle}`, '--module=base']);
  const problems = [...checkManifest(xml, record), ...checkEntries(listEntries(run, bundle))];
  requireValue(problems.length === 0, problems.join('\n'));
}

/**
 * Caller contract: Task 9's orchestrator MUST launch the worker through
 * `op run -- node ...`, setting BLANC_ANDROID_OP_RUN=1 only in that worker.
 * This marker is a guard against mistakes, not proof of an op session. Keep
 * secret references in its private configuration, not op run environment
 * variables (op run resolves those). Every secret is obtained here by op read.
 * keystoreRef addresses the raw Document/attachment `blanc-upload.p12`, e.g.
 * op://Dev/Blanc Android upload key/blanc-upload.p12; aliasRef/passwordRef name
 * fields in that item. The item/field setup is an owner step, never inferred.
 * Use the same store/key password. No password value is passed in argv.
 */
export function signBundle(input, output, { keystoreRef, aliasRef, passwordRef }, run = spawnSync) {
  const pin = JSON.parse(fs.readFileSync(new URL('./upload-cert.json', import.meta.url), 'utf8')).sha256;
  requireValue(SHA256.test(pin ?? ''), 'upload certificate SHA-256 pin is missing or invalid; obtain the owner fingerprint');
  requireValue(process.env.BLANC_ANDROID_OP_RUN === '1', 'signing must run inside the orchestrator op run worker');
  for (const ref of [keystoreRef, aliasRef, passwordRef]) requireValue(typeof ref === 'string' && /^op:\/\/[^\r\n]+$/.test(ref), 'invalid 1Password secret reference');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-android-sign-'));
  let interrupted = false;
  const cleanup = () => fs.rmSync(temporary, { recursive: true, force: true });
  const interrupt = () => { interrupted = true; cleanup(); };
  const checkedRun = (command, args, env) => {
    requireValue(!interrupted, 'bundle signing interrupted');
    const result = execute(run, command, args, env);
    requireValue(!interrupted, 'bundle signing interrupted');
    return result;
  };
  // spawnSync may return on a child signal before Node dispatches its handler;
  // finally also cleans up that path. exit covers explicit worker termination.
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  process.on('SIGHUP', interrupt);
  process.on('exit', cleanup);
  try {
    fs.chmodSync(temporary, 0o700);
    const keystore = path.join(temporary, 'upload.p12');
    checkedRun('op', ['read', keystoreRef, '--out-file', keystore, '--file-mode', '0600']);
    const stat = fs.lstatSync(keystore);
    requireValue(stat.isFile() && (stat.mode & 0o777) === 0o600, 'op read did not create a private keystore');
    const alias = checkedRun('op', ['read', aliasRef, '--no-newline']);
    const password = checkedRun('op', ['read', passwordRef, '--no-newline']);
    requireValue(/^[a-zA-Z0-9_-]+$/.test(alias) && password.length > 0 && !password.includes('\0'), 'invalid upload key credentials');
    const env = { ...process.env, BLANC_ANDROID_UPLOAD_PASSWORD: password };
    const bundle = path.join(temporary, 'bundle.aab');
    fs.copyFileSync(input, bundle, fs.constants.COPYFILE_EXCL);
    const signatures = listEntries((command, args, options) => {
      requireValue(!interrupted, 'bundle signing interrupted');
      return run(command, args, options);
    }, bundle).filter(name => /^META-INF\/(?:[^/]+\.(?:SF|RSA|EC)|MANIFEST\.MF)$/i.test(name));
    if (signatures.length) checkedRun('zip', ['-d', bundle, ...signatures]);
    checkedRun('jarsigner', ['-keystore', keystore, '-storetype', 'PKCS12', '-storepass:env', 'BLANC_ANDROID_UPLOAD_PASSWORD',
      '-keypass:env', 'BLANC_ANDROID_UPLOAD_PASSWORD', '-digestalg', 'SHA-256', '-sigalg', 'SHA256withRSA', bundle, alias], env);
    // Trust this upload key for strict verification (the upload certificate is
    // normally self-signed). Strict success still precedes the independent pin.
    checkedRun('jarsigner', ['-verify', '-strict', '-keystore', keystore, '-storetype', 'PKCS12',
      '-storepass:env', 'BLANC_ANDROID_UPLOAD_PASSWORD', bundle], env);
    const certificates = checkedRun('keytool', ['-J-Duser.language=en', '-J-Duser.country=US', '-printcert', '-jarfile', bundle]);
    const fingerprints = [...certificates.matchAll(/^\s*SHA256:\s*((?:[a-f\d]{2}:){31}[a-f\d]{2})\s*$/gim)];
    requireValue(fingerprints.length === 1, 'signed bundle must have exactly one upload signer certificate');
    const certSha256 = fingerprints[0][1].replaceAll(':', '').toLowerCase();
    requireValue(certSha256 === pin, 'signed bundle upload certificate differs from pinned SHA-256');
    requireValue(!interrupted, 'bundle signing interrupted');
    // Publish only a fully verified bundle; never overwrite an existing result.
    fs.copyFileSync(bundle, output, fs.constants.COPYFILE_EXCL);
    return { certSha256 };
  } catch (error) {
    // Filesystem failures can reveal the temporary keystore path too.
    if (error?.code) throw new Error('bundle signing file operation failed');
    throw error;
  } finally {
    cleanup();
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    process.off('SIGHUP', interrupt);
    process.off('exit', cleanup);
  }
}
