// Run on the build server with CHROMIUM_SRC and a fresh evidence folder.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireCheckoutLock, LINUX_OUTPUT_ARCH } from '../tools/build.mjs';
import { keepingFile } from '../windows/candidate.mjs';
import { ASSET_NAME, candidateId, packageNames, runtimeFiles } from './candidate.mjs';
import { scanPackage } from './package-scan.mjs';

const tree = fileURLToPath(new URL('../', import.meta.url));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const head = directory => execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function repositoryFingerprint(key = path.join(tree, 'linux/keys/blanc-repository.asc')) {
  if (!fs.lstatSync(key, {throwIfNoEntry: false})) return null;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-public-key-'));
  try {
    const listing = execFileSync('gpg', ['--no-options', '--homedir', home, '--batch', '--with-colons', '--show-keys', key], {encoding: 'utf8'});
    const fingerprints = [...listing.matchAll(/^fpr:::::::::([A-F0-9]{40}):/gm)];
    if (fingerprints.length !== 1 || !/^pub:/m.test(listing)) throw new Error(`Expected one repository signing key in ${key}`);
    return fingerprints[0][1];
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
}

async function packageCandidate(src, folder, outName, arch) {
  const out = fs.realpathSync(path.join(src, 'out', outName));
  if (fs.existsSync(path.join(out, '.blanc-build-guard.lock'))) throw new Error('A build is running in this output; package after it finishes.');
  const built = readJson(path.join(out, '.blanc-last-successful-build.json'));
  const lane = readJson(path.join(tree, 'lanes/desktop.json'));
  if (head(src) !== lane.upstream) throw new Error("The checkout is not at the desktop lane's pin.");
  const args = path.join(out, 'args.gn');
  if (built.inputs.argsSha256 !== await sha256(args) ||
      /^\s*target_cpu\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(args, 'utf8'))?.[1] !== arch) {
    throw new Error(`The guarded build arguments do not match the selected ${arch} output.`);
  }

  // GN can rewrite gn_logs.txt. Restore the build input, including its mtime.
  const deps = keepingFile(path.join(out, 'gn_logs.txt'), () => execFileSync(
    path.join(src, 'buildtools/linux64/gn'), ['desc', out, '//chrome:chrome', 'runtime_deps'],
    { cwd: src, encoding: 'utf8', maxBuffer: 64 << 20 }));
  const files = runtimeFiles(deps.split('\n'));
  const engine = path.join(os.homedir(), 'blanc-assets/blocker/engine.js');
  const pinned = /kBlancBlockerBundleSha256\[\] = "([0-9a-f]{64})"/.exec(
    fs.readFileSync(path.join(tree, 'blanc/services/blocker/bundle_hash.h'), 'utf8'))?.[1];

  const build = {arch, version: lane.version, upstream: lane.upstream, argsSha256: built.inputs.argsSha256,
    builtAt: built.completedAt, treeCommit: head(tree)};
  return archiveCandidate(out, folder, build, {src, files, engine, engineSha256: pinned, fingerprint: repositoryFingerprint()});
}

async function stagePackages({src, out, stage, folder, names, fingerprint, scan}) {
  if (fingerprint === null) return [];
  const destination = path.join(stage, 'packages');
  fs.mkdirSync(destination);
  const checks = fs.mkdtempSync(path.join(folder, 'verify-'));
  try {
    // Reproduce //chrome/installer/linux:strip_chrome_binary from the staged
    // runtime. Even out/chrome.stripped may predate an interrupted rebuild.
    const llvm = path.join(src, 'third_party/llvm-build/Release+Asserts/bin');
    const stripped = path.join(checks, 'chrome.stripped');
    execFileSync('python3', [path.join(src, 'build/linux/strip_binary.py'),
      '--binary-input', path.join(stage, 'chrome/chrome'), '--symbol-output', path.join(checks, 'chrome.debug'),
      '--stripped-binary-output', stripped, '--llvm-strip-binary-path', path.join(llvm, 'llvm-strip'),
      '--llvm-objcopy-binary-path', path.join(llvm, 'llvm-objcopy')]);
    const expected = await sha256(stripped);
    const packages = [];
    const browser = 'opt/bnfy/blanc-prototype/chrome';
    for (const file of names) {
      const source = path.join(out, file);
      if (!fs.lstatSync(source, {throwIfNoEntry: false})?.isFile()) {
        throw new Error(`Missing installer ${source}. Complete the guarded Linux installer build before packaging.`);
      }
      const staged = path.join(destination, file);
      fs.copyFileSync(source, staged);
      const result = scan(staged, {fingerprint});
      if (!result.ok) throw new Error(`${file}: ${result.findings.join('; ')}`);
      const extract = file.endsWith('.deb')
        ? 'dpkg-deb --fsys-tarfile "$1" | tar -xf - "./$2"'
        : 'rpm2cpio "$1" | cpio -id --quiet "./$2" "$2"';
      const payload = fs.mkdtempSync(path.join(checks, 'payload-'));
      execFileSync('bash', ['-o', 'pipefail', '-c', extract, 'verify-browser', staged, browser], {cwd: payload});
      const installed = path.join(payload, browser);
      if (!fs.lstatSync(installed, {throwIfNoEntry: false})?.isFile() || await sha256(installed) !== expected) {
        throw new Error(`${file}: installed chrome differs from the staged runtime after stripping.`);
      }
      fs.rmSync(payload, {recursive: true});
      packages.push({file, sha256: await sha256(staged)});
    }
    return packages;
  } finally {
    fs.rmSync(checks, {recursive: true, force: true});
  }
}

export async function archiveCandidate(out, folder, build, {src, files, engine, engineSha256, fingerprint}, scan = scanPackage) {
  const {arch, version} = build;
  const asset = ASSET_NAME(arch);
  const names = Object.values(packageNames(version, arch));
  // Reserve the destination before staging so two runs cannot overwrite it.
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  fs.mkdirSync(folder);
  try {
    const stage = path.join(folder, 'stage');
    const runtime = path.join(stage, 'chrome');
    fs.mkdirSync(runtime, {recursive: true});
    const copyRuntime = (source, target) => fs.cpSync(path.join(out, source), path.join(runtime, target), {
      recursive: true, dereference: true,
      filter(entry) {
        if (!fs.realpathSync(entry).startsWith(out + path.sep)) throw new Error(`Runtime file outside the output folder: ${entry}`);
        return true;
      },
    });
    for (const file of files) {
      if (file !== 'chrome_sandbox' && file !== 'chrome-sandbox') copyRuntime(file, file);
    }
    copyRuntime('chrome_sandbox', 'chrome-sandbox');
    const count = fs.readdirSync(runtime, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length;
    fs.mkdirSync(path.join(runtime, 'blocker'), { recursive: true });
    const stagedEngine = path.join(runtime, 'blocker/engine.js');
    fs.copyFileSync(engine, stagedEngine);
    if (await sha256(stagedEngine) !== engineSha256) throw new Error(`${engine} is not the pinned blocker engine.`);

    const packages = await stagePackages({src, out, stage, folder, names, fingerprint, scan});
    const exeSha256 = await sha256(path.join(runtime, 'chrome'));
    const candidate = {
      id: candidateId(exeSha256, arch), platform: 'linux', ...build, exeSha256, packages,
      channel: 'preview', qualification: 'preview with test hooks; never distributable',
    };
    fs.writeFileSync(path.join(stage, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
    const tar = path.join(folder, asset);
    execFileSync('tar', ['-czf', tar, '.'], { cwd: stage, stdio: 'inherit' });
    fs.rmSync(stage, { recursive: true });
    const record = { ...candidate, files: count, tar, tarBytes: fs.statSync(tar).size, tarSha256: await sha256(tar) };
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify(record, null, 2) + '\n');
    return record;
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const [source, destination, output = '--out=BlancLinuxPrototype', ...extra] = process.argv.slice(2);
  const outName = output.match(/^--out=(\w+)$/)?.[1];
  if (!source || !destination || extra.length || !Object.hasOwn(LINUX_OUTPUT_ARCH, outName)) {
    throw new Error('Usage: package-candidate.mjs CHROMIUM_SRC OUTPUT_FOLDER [--out=BlancLinuxPrototype|BlancLinuxArm64Prototype]');
  }
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Packaging runs on the x86-64 Linux build server.');
  const src = fs.realpathSync(source);
  const releaseCheckout = acquireCheckoutLock(src);
  try {
    console.log(JSON.stringify(await packageCandidate(src, path.resolve(destination), outName, LINUX_OUTPUT_ARCH[outName]), null, 2));
  } finally { releaseCheckout(); }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { await main(); } catch (error) { console.error(`package-candidate: ${error.message}`); process.exitCode = 1; }
}
