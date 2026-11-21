// Run on the build server with CHROMIUM_SRC and a fresh evidence folder.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireCheckoutLock } from '../tools/build.mjs';
import { keepingFile } from '../windows/candidate.mjs';
import { ASSET_NAME, candidateId, runtimeFiles } from './candidate.mjs';

const tree = fileURLToPath(new URL('../', import.meta.url));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const head = directory => execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function packageCandidate(src, folder) {
  const out = fs.realpathSync(path.join(src, 'out/BlancLinuxPrototype'));
  if (fs.existsSync(path.join(out, '.blanc-build-guard.lock'))) throw new Error('A build is running in this output; package after it finishes.');
  const built = readJson(path.join(out, '.blanc-last-successful-build.json'));
  const lane = readJson(path.join(tree, 'lanes/desktop.json'));
  if (head(src) !== lane.upstream) throw new Error("The checkout is not at the desktop lane's pin.");

  // GN can rewrite gn_logs.txt. Restore the build input, including its mtime.
  const deps = keepingFile(path.join(out, 'gn_logs.txt'), () => execFileSync(
    path.join(src, 'buildtools/linux64/gn'), ['desc', out, '//chrome:chrome', 'runtime_deps'],
    { cwd: src, encoding: 'utf8', maxBuffer: 64 << 20 }));
  const files = runtimeFiles(deps.split('\n'));
  const engine = path.join(os.homedir(), 'blanc-assets/blocker/engine.js');
  const pinned = /kBlancBlockerBundleSha256\[\] = "([0-9a-f]{64})"/.exec(
    fs.readFileSync(path.join(tree, 'blanc/services/blocker/bundle_hash.h'), 'utf8'))?.[1];

  // Reserve the destination before staging so two runs cannot overwrite it.
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  fs.mkdirSync(folder);
  try {
    const stage = path.join(folder, 'stage');
    fs.mkdirSync(stage);
    const copyRuntime = (source, target) => fs.cpSync(path.join(out, source), path.join(stage, target), {
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
    const count = fs.readdirSync(stage, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length;
    fs.mkdirSync(path.join(stage, 'blocker'), { recursive: true });
    const stagedEngine = path.join(stage, 'blocker/engine.js');
    fs.copyFileSync(engine, stagedEngine);
    if (await sha256(stagedEngine) !== pinned) throw new Error(`${engine} is not the pinned blocker engine.`);

    const exeSha256 = await sha256(path.join(stage, 'chrome'));
    const candidate = {
      id: candidateId(exeSha256), platform: 'linux', arch: 'x64', version: lane.version, upstream: lane.upstream,
      exeSha256, argsSha256: built.inputs.argsSha256, builtAt: built.completedAt, treeCommit: head(tree),
      channel: 'preview', qualification: 'preview with test hooks; never distributable',
    };
    fs.writeFileSync(path.join(stage, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
    const tar = path.join(folder, ASSET_NAME);
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
  const [source, destination, ...extra] = process.argv.slice(2);
  if (!source || !destination || extra.length) throw new Error('Usage: package-candidate.mjs CHROMIUM_SRC OUTPUT_FOLDER');
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Packaging runs on the x86-64 Linux build server.');
  const src = fs.realpathSync(source);
  const releaseCheckout = acquireCheckoutLock(src);
  try {
    console.log(JSON.stringify(await packageCandidate(src, path.resolve(destination)), null, 2));
  } finally { releaseCheckout(); }
}
try { await main(); } catch (error) { console.error(`package-candidate: ${error.message}`); process.exitCode = 1; }
