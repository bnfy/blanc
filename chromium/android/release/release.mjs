// Owner-side, resumable Android release. No server or Git mutations: fetch
// imports a prepared handoff locally or by CLI transfer. Secret workers use op.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {nextRelease, tagFor, validateLedger} from './versions.mjs';
import {validateBuildRecord} from './record.mjs';
import {verifyBundle, signBundle} from './aab.mjs';
import {attest} from './attest.mjs';
import {accessToken, uploadToInternal} from './play-api.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = fileURLToPath(import.meta.url);
const DEVICE = fileURLToPath(new URL('./pixel-10-pro.json', import.meta.url));
const PIN = fileURLToPath(new URL('./upload-cert.json', import.meta.url));
const STAGES = ['fetch', 'verify', 'sign', 'attest', 'upload'];
const HANDOFF = ['ChromePublic.aab', 'build.json', 'scan.json', 'sbom-inputs.json', 'release-gate.json', 'privacy-capture.json'];
const SHA = /^[a-f0-9]{64}$/;
const check = (value, message) => { if (!value) throw new Error(message); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
function read(file) {
  check(fs.lstatSync(file).isFile(), `regular input required: ${path.basename(file)}`);
  return fs.readFileSync(file);
}
const load = file => JSON.parse(read(file));
function optional(file) {
  try { return read(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function writeSame(file, bytes) {
  const existing = optional(file), expected = Buffer.from(bytes);
  if (existing) check(existing.equals(expected), `existing output differs; reconcile ${path.basename(file)}`);
  else fs.writeFileSync(file, expected, {flag: 'wx', mode: 0o600});
}
function save(file, value) {
  // Rename keeps readers from seeing a partially written state/ledger.
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, json(value), {flag: 'wx', mode: 0o600});
  try { fs.renameSync(temporary, file); } finally { fs.rmSync(temporary, {force: true}); }
}
function execute(run, command, args, options = {}) {
  let result;
  try { result = run(command, args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options}); }
  catch { throw new Error(`${command} failed`); }
  check(!result?.error && result?.status === 0, `${command} failed`);
  return String(result.stdout ?? '');
}
const relative = (work, name) => {
  check(typeof name === 'string' && name.length && !path.isAbsolute(name) && !name.split(/[\\/]/).includes('..'), 'invalid recorded output path');
  return path.join(work, name);
};
function inventory(directory, prefix = '') {
  check(fs.lstatSync(directory).isDirectory(), 'handoff tree must be a regular directory');
  return fs.readdirSync(directory).sort().flatMap(name => {
    const file = path.join(directory, name), rel = prefix ? `${prefix}/${name}` : name, stat = fs.lstatSync(file);
    check(!stat.isSymbolicLink(), 'symlinks are not allowed in handoff');
    if (stat.isDirectory()) return inventory(file, rel);
    check(stat.isFile(), 'handoff contains nonregular input'); return [rel];
  });
}
function inputs(state) {
  return digest(Buffer.from(JSON.stringify({configSha256: state.configSha256, outputs: Object.fromEntries(Object.entries(state.stages).map(([stage, value]) => [stage, value.outputs]))})));
}
function context(workDir, pinFile = PIN) {
  const work = path.resolve(workDir), configBytes = read(path.join(work, 'config.json'));
  const stateBytes = optional(path.join(work, 'state.json'));
  const state = stateBytes ? JSON.parse(stateBytes) : {schema: 1, configSha256: digest(configBytes), stages: {}};
  check(state.schema === 1 && state.stages && state.configSha256 === digest(configBytes), 'config digest changed or invalid release state');
  const prior = {configSha256: state.configSha256, stages: {}};
  for (const stage of STAGES) {
    const done = state.stages[stage]; if (!done) continue;
    check(STAGES.slice(0, STAGES.indexOf(stage)).every(s => state.stages[s]), 'recorded stage lacks predecessor');
    check(done.inputDigest === inputs(prior), `recorded ${stage} input digest changed`);
    check(done.outputs && Object.keys(done.outputs).length, 'recorded outputs missing');
    for (const [name, hash] of Object.entries(done.outputs)) check(SHA.test(hash) && digest(read(relative(work, name))) === hash, `recorded output digest changed: ${name}`);
    if (stage === 'verify') check(done.downloadSize?.deviceSha256 === digest(read(DEVICE)), 'Pixel device spec digest changed');
    if (stage === 'sign') check(done.uploadCertSha256 === digest(read(pinFile)), 'upload certificate pin digest changed');
    prior.stages[stage] = done;
  }
  const config = JSON.parse(configBytes);
  const source = config.source;
  check(config.schema === 1 && ((typeof source === 'string' && source.length) ||
    (source && typeof source === 'object' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(source.host ?? '') &&
      /^\/[A-Za-z0-9._/-]+$/.test(source.path ?? '') && !source.path.split('/').includes('..'))),
  'config source must be a local directory or a safe SSH host alias and absolute path');
  const ledgerPath = config.ledger ? path.resolve(work, config.ledger) : path.join(ROOT, 'chromium/android/release/ledger.json');
  const ledger = load(ledgerPath); validateLedger(ledger);
  return {work, config, state, ledgerPath, ledger};
}
function predecessor(stage, state) {
  const index = STAGES.indexOf(stage);
  check(index >= 0, 'unknown Android release stage');
  if (index) check(state.stages[STAGES[index - 1]], `${stage} requires predecessor stage ${STAGES[index - 1]}`);
}
function entryFor(record, ledger, reserve = false) {
  const highestUploaded = Math.max(0, ...ledger.builds.filter(entry => entry.state === 'uploaded').map(entry => entry.versionCode));
  check(record.versionCode >= highestUploaded, 'versionCode is below the highest uploaded code');
  const existing = ledger.builds.find(entry => entry.versionCode === record.versionCode);
  if (existing) {
    validateBuildRecord(record, existing);
    check(existing.state === 'built', `versionCode is already ${existing.state}`); return existing;
  }
  check(reserve, 'build is not reserved in ledger');
  const pending = nextRelease(ledger, record.versionName);
  check(pending.versionCode === record.versionCode && pending.tag === tagFor(record.versionName, record.versionCode), 'build is not next ledger versionCode');
  const entry = {...pending, commit: record.commit, state: 'built', date: record.builtAt, note: 'Verified local Android handoff; release/device evidence pending.'};
  validateBuildRecord(record, entry); return entry;
}
function owner(io) { check(io.platform === 'darwin' && io.tty, 'owner Mac foreground Terminal is required'); }
function privacy(work, record, run) {
  const gate = load(path.join(work, 'release-gate.json'));
  check(gate.schema === 1 && gate.verdict === 'pass' && gate.package === 'me.bnfy.blanc', 'release gate must pass for me.bnfy.blanc');
  check(SHA.test(record.gatesApk?.sha256 ?? '') && gate.apkSHA256 === record.gatesApk.sha256 && gate.sourceCommit === record.commit, 'release gate APK/source binding differs');
  for (const name of ['outbound', 'acceptance']) check(gate.results?.filter(r => r.name === name).length === 1 && gate.results.find(r => r.name === name).verdict === 'pass', `${name} release gate result must pass`);
  const approved = JSON.parse(execute(run, 'git', ['-C', ROOT, 'show', `${record.commit}:chromium/tests/android/release-gate-exclusions.json`]));
  check(Array.isArray(approved) && JSON.stringify(gate.exclusions) === JSON.stringify(approved), 'release gate exclusions differ from approved source');
  const capture = load(path.join(work, 'privacy-capture.json'));
  check(capture.schema === 1 && capture.verdict === 'pass' && capture.sourceCommit === record.commit && capture.apkSHA256 === record.gatesApk.sha256 && SHA.test(capture.captureSHA256 ?? '') && typeof capture.reason === 'string' && capture.reason.trim(), 'privacy capture review is missing, failed or bound to another source/APK');
}
function receiptCheck(receipt, work, record) {
  check(typeof receipt?.editId === 'string' && receipt.editId.length && receipt.versionCode === record.versionCode && receipt.aabSha256 === digest(read(path.join(work, 'Blanc-Android.aab'))), 'invalid public upload receipt');
  return {editId: receipt.editId, versionCode: receipt.versionCode, aabSha256: receipt.aabSha256};
}
const defaults = () => ({run: spawnSync, platform: process.platform, tty: Boolean(process.stdin.isTTY && process.stdout.isTTY), env: process.env, pinFile: PIN,
  prompt: async text => { const terminal = createInterface({input: process.stdin, output: process.stdout}); try { return await terminal.question(text + '\n> '); } finally { terminal.close(); } }, attest});
function launchWorker(stage, work, io) {
  const output = execute(io.run, 'op', ['run', '--', process.execPath, SCRIPT, '--worker', stage, work], {env: {...io.env, BLANC_ANDROID_OP_RUN: '1'}, stdio: ['inherit', 'pipe', 'pipe']});
  try { return JSON.parse(output); } catch { throw new Error('op worker returned no valid public result'); }
}

export async function runStage(stage, workDir, injected = {}) {
  const io = {...defaults(), ...injected}, c = context(workDir, io.pinFile), {work, config, state, ledger, ledgerPath} = c;
  check(stage === 'status' || STAGES.includes(stage), 'unknown Android release stage');
  if (stage === 'status') return state;
  predecessor(stage, state);
  if (state.stages[stage]) return state;
  const inputDigest = inputs(state), names = []; let details = {};
  if (stage === 'fetch') {
    let temporary;
    try {
      let source;
      if (typeof config.source === 'string') source = path.resolve(work, config.source);
      else {
        temporary = fs.mkdtempSync(path.join(work, '.fetch-'));
        source = path.join(temporary, 'handoff'); fs.mkdirSync(source);
        const remote = `${config.source.host}:${config.source.path.replace(/\/$/, '')}`;
        const files = path.join(temporary, 'files.txt');
        fs.writeFileSync(files, [...HANDOFF, 'license-inputs'].join('\n') + '\n', {flag: 'wx', mode: 0o600});
        // Preserve links as links, so inventory refuses them before any import.
        // scp -r follows their targets, which could transfer private captures.
        execute(io.run, 'rsync', ['--recursive', '--links', `--files-from=${files}`, '--', `${remote}/`, source]);
      }
      check(source !== work, 'handoff source must differ from WORK');
      const record = load(path.join(source, 'build.json')), entry = entryFor(record, ledger, true);
      const bundle = read(path.join(source, 'ChromePublic.aab'));
      check(bundle.length === record.aab.bytes && digest(bundle) === record.aab.sha256, 'bundle bytes or sha256 digest differ from build record');
      check(execute(io.run, 'git', ['-C', ROOT, 'rev-parse', '--verify', `${record.commit}^{commit}`]).trim() === record.commit, 'source commit is unavailable locally');
      names.push(...HANDOFF, ...inventory(path.join(source, 'license-inputs')).map(n => `license-inputs/${n}`));
      // Read every input before publishing any copied file or ledger reservation.
      const handoff = names.map(name => [name, read(path.join(source, name))]);
      for (const [name, bytes] of handoff) { const target = relative(work, name); fs.mkdirSync(path.dirname(target), {recursive: true}); writeSame(target, bytes); }
      if (!ledger.builds.some(row => row.versionCode === entry.versionCode)) { ledger.builds.push(entry); validateLedger(ledger); save(ledgerPath, ledger); }
    } finally { if (temporary) fs.rmSync(temporary, {recursive: true, force: true}); }
  } else {
    const record = load(path.join(work, 'build.json')); entryFor(record, ledger);
    if (stage === 'verify') {
      verifyBundle(path.join(work, 'ChromePublic.aab'), record, io.run);
      const temporary = fs.mkdtempSync(path.join(work, '.size-'));
      try {
        const apks = path.join(temporary, 'pixel.apks');
        execute(io.run, 'bundletool', ['build-apks', `--bundle=${path.join(work, 'ChromePublic.aab')}`, `--output=${apks}`, `--device-spec=${DEVICE}`]);
        const csv = execute(io.run, 'bundletool', ['get-size', 'total', `--apks=${apks}`, `--device-spec=${DEVICE}`]);
        const match = /^MIN,MAX\r?\n([1-9]\d*),([1-9]\d*)\r?\n?$/.exec(csv);
        check(match, 'invalid bundletool size CSV');
        const [minBytes, maxBytes] = match.slice(1).map(Number);
        check(Number.isSafeInteger(minBytes) && Number.isSafeInteger(maxBytes) && minBytes <= maxBytes, 'invalid bundletool size range');
        writeSame(path.join(work, 'pixel.apks'), read(apks)); names.push('pixel.apks');
        details = {downloadSize: {minBytes, maxBytes, csv, deviceSha256: digest(read(DEVICE))}};
      } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
    } else {
      owner(io);
      if (stage === 'sign') {
        check(!optional(path.join(work, 'Blanc-Android.aab')), 'signed bundle exists without finished sign stage; reconcile before retrying');
        const uploadCertSha256 = digest(read(io.pinFile));
        const result = await (io.worker ?? launchWorker)('sign', work, io);
        check(SHA.test(result?.certSha256 ?? ''), 'sign worker returned no certificate fingerprint');
        check(digest(read(io.pinFile)) === uploadCertSha256, 'upload certificate pin changed during signing; reconcile the signed bundle');
        details = {certSha256: result.certSha256, uploadCertSha256}; names.push('Blanc-Android.aab');
      } else if (stage === 'attest') {
        const result = await io.attest(work, io.env, io.run); names.push(result.sbom, result.checksums, result.sigstore);
      } else {
        privacy(work, record, io.run);
        check(!optional(path.join(work, 'upload-receipt.json')), 'upload receipt exists; reconcile the committed edit before retrying');
        const phrase = `upload ${record.versionName} (${record.versionCode}) to internal`;
        check(await io.prompt(phrase) === phrase, 'upload confirmation did not match exactly');
        // Recheck mutable inputs/ledger after the owner has typed approval.
        const fresh = context(work, io.pinFile); entryFor(record, fresh.ledger); privacy(work, record, io.run);
        const result = receiptCheck(await (io.worker ?? launchWorker)('upload', work, io), work, record);
        writeSame(path.join(work, 'upload-receipt.json'), json(result)); names.push('upload-receipt.json');
        // uploadToInternal resolves only after Google acknowledges edit commit.
        const latest = load(ledgerPath); validateLedger(latest); entryFor(record, latest).state = 'uploaded'; save(ledgerPath, latest);
      }
    }
  }
  state.stages[stage] = {inputDigest, outputs: Object.fromEntries(names.map(name => [name, digest(read(relative(work, name)))])), ...details};
  save(path.join(work, 'state.json'), state); return state;
}

// This marker prevents accidental direct use; it is not authentication. Only
// the owner invokes this program. Credentials never leave this process.
export async function secretWorker(stage, workDir, injected = {}) {
  const io = {...defaults(), accessToken, uploadToInternal, signBundle, ...injected};
  check(io.env.BLANC_ANDROID_OP_RUN === '1', 'secret stage requires the orchestrator op run worker');
  check(io.platform === 'darwin' && (injected.tty ?? Boolean(process.stdin.isTTY)), 'owner Mac foreground Terminal is required');
  check(['sign', 'upload'].includes(stage), 'invalid secret worker stage');
  const {work, config, state, ledger} = context(workDir, io.pinFile); predecessor(stage, state);
  const record = load(path.join(work, 'build.json')); entryFor(record, ledger);
  const refs = config.secrets;
  if (stage === 'sign') return io.signBundle(path.join(work, 'ChromePublic.aab'), path.join(work, 'Blanc-Android.aab'), refs, io.run);
  privacy(work, record, io.run);
  check(typeof refs?.credentialRef === 'string' && /^op:\/\/[^\r\n]+$/.test(refs.credentialRef), 'invalid Play 1Password credential reference');
  check(!optional(path.join(work, 'upload-receipt.json')), 'upload receipt exists; reconcile before retrying');
  const credential = execute(io.run, 'op', ['read', refs.credentialRef, '--no-newline']);
  const token = await io.accessToken(credential);
  const uploaded = await io.uploadToInternal({packageName: 'me.bnfy.blanc', aabPath: path.join(work, 'Blanc-Android.aab'), versionCode: record.versionCode, releaseName: record.versionName, token});
  const receipt = receiptCheck({...uploaded, aabSha256: digest(read(path.join(work, 'Blanc-Android.aab')))}, work, record);
  writeSame(path.join(work, 'upload-receipt.json'), json(receipt)); return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), worker = args[0] === '--worker'; if (worker) args.shift();
    check(args.length === 2, 'usage: release.mjs status|fetch|verify|sign|attest|upload WORK');
    const result = await (worker ? secretWorker : runStage)(args[0], args[1]); console.log(json(result).trim());
  } catch (error) { console.error(`Android release: ${error.message}`); process.exitCode = 1; }
}
