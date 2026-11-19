// Packages the Windows build on the build server into one zip for a hosted
// Windows runner (chromium/windows/server/README.md):
//
//   node chromium/windows/package-candidate.mjs ~/chromium-desktop/src ~/blanc-evidence/windows/candidate
//
// The zip holds the browser's runtime files at its top level, the pinned
// blocker engine under blocker/, and candidate.json naming the build. It
// prints the candidate id and the zip's SHA-256, which the run on GitHub is
// given. Nothing is uploaded from here: the server holds no GitHub credential.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ASSET_NAME, candidateId, runtimeFiles, keepingFile, channelOfOutput, windowsVersion } from './candidate.mjs';

const sha256 = file => {
  const hash = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), chunk = Buffer.alloc(1 << 20);
  try { for (let n; (n = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0;) hash.update(chunk.subarray(0, n)); } finally { fs.closeSync(fd); }
  return hash.digest('hex');
};
function main() {
  const [source, destination, ...options] = process.argv.slice(2);
  if (!source || !destination) throw new Error('Usage: package-candidate.mjs CHROMIUM_SRC OUTPUT_FOLDER [--out=BlancWinBeta]');
  const outName = options.find(o => o.startsWith('--out='))?.slice('--out='.length) ?? 'BlancWinPrototype';
  if (options.some(o => !o.startsWith('--out='))) throw new Error('Unknown option: ' + options.join(' '));
  const channel = channelOfOutput(outName);
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Packaging runs on the x86-64 Linux build server.');
  const tree = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.realpathSync(source), out = path.join(src, 'out', outName);
  if (fs.existsSync(path.join(out, '.blanc-build-guard.lock'))) throw new Error('A build is running in this output; package after it finishes.');
  const built = JSON.parse(fs.readFileSync(path.join(out, '.blanc-last-successful-build.json'), 'utf8'));
  const lane = JSON.parse(fs.readFileSync(path.join(tree, 'lanes/desktop.json'), 'utf8'));
  if (execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== lane.upstream) throw new Error('The checkout is not at the desktop lane\'s pin.');
  // The pinned blocker engine, the same bytes the browser itself insists on.
  const pinned = /kBlancBlockerBundleSha256\[\] = "([0-9a-f]{64})"/.exec(fs.readFileSync(path.join(tree, 'blanc/services/blocker/bundle_hash.h'), 'utf8'))?.[1];
  const engine = path.join(os.homedir(), 'blanc-assets/blocker/engine.js');
  if (!pinned || sha256(engine) !== pinned) throw new Error(`${engine} is not the pinned blocker engine.`);

  // `gn desc` rewrites the output's gn_logs.txt, which the build treats as an
  // input: left newer than build.ninja, it makes the next build ask for a GN
  // regeneration (it stopped one on 2026-11-17). Put the file back as it was.
  const gn = path.join(src, 'buildtools/linux64/gn');
  const files = runtimeFiles(keepingFile(path.join(out, 'gn_logs.txt'), () =>
    execFileSync(gn, ['desc', out, '//chrome:chrome', 'runtime_deps'], { cwd: src, encoding: 'utf8', maxBuffer: 64 << 20 })).split('\n'));
  const dllSha256 = sha256(path.join(out, 'chrome.dll')), exeSha256 = sha256(path.join(out, 'chrome.exe'));
  // A beta installs as its own version (patch 0103); the build must have made it.
  const betaBuild = Number(/^blanc_beta_build = (\d+)$/m.exec(fs.readFileSync(path.join(out, 'args.gn'), 'utf8'))?.[1]);
  const version = windowsVersion(lane.version, channel, channel === 'beta' ? betaBuild : undefined);
  if (!fs.existsSync(path.join(out, `${version}.manifest`))) throw new Error(`The build in ${outName} is not version ${version}.`);
  const candidate = {
    id: candidateId(dllSha256), platform: 'windows', arch: 'x64', version, chromiumVersion: lane.version, upstream: lane.upstream,
    exeSha256, dllSha256, argsSha256: built.inputs.argsSha256, builtAt: built.completedAt,
    treeCommit: execFileSync('git', ['-C', tree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    channel,
    qualification: channel === 'preview' ? 'cross-compiled preview with test hooks; never distributable'
      : 'cross-compiled beta without test hooks; unsigned, not yet released',
  };
  // Stage with hard links (same disk), so the zip's layout is exact and the
  // output folder is only read.
  const folder = path.resolve(destination), stage = path.join(folder, 'stage'), zip = path.join(folder, ASSET_NAME);
  if (fs.existsSync(folder)) throw new Error(`${folder} exists; choose a new folder so no earlier candidate is overwritten.`);
  fs.mkdirSync(path.join(stage, 'blocker'), { recursive: true });
  let count = 0;
  const link = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); try { fs.linkSync(from, to); } catch { fs.copyFileSync(from, to); } count++; };
  const add = relative => {
    const from = path.join(out, relative), stat = fs.statSync(from);
    if (!stat.isDirectory()) return link(from, path.join(stage, relative));
    for (const entry of fs.readdirSync(from, { recursive: true, withFileTypes: true }))
      if (entry.isFile()) link(path.join(entry.parentPath, entry.name), path.join(stage, path.relative(out, path.join(entry.parentPath, entry.name))));
  };
  for (const file of files) add(file.replace(/\/$/, ''));
  // Chromium's installer, built with the browser (W1 Part B), and the files
  // its signing step repacks from (Part C).
  for (const file of ['mini_installer.exe', 'setup.exe']) if (fs.existsSync(path.join(out, file))) add(file);
  // The beta also carries Blanc's updater setup program (W3 Task B2) and
  // Chromium's tag tool, which tags the signed setup as the online installer.
  if (channel === 'beta') {
    for (const file of ['UpdaterSetup.exe', 'tag.exe']) {
      if (!fs.existsSync(path.join(out, file))) throw new Error(`A beta candidate needs ${file}; build the beta through the guard.`);
      add(file);
    }
  }
  if (fs.existsSync(path.join(out, 'signing'))) add('signing');
  fs.copyFileSync(engine, path.join(stage, 'blocker/engine.js'));
  fs.writeFileSync(path.join(stage, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
  execFileSync('zip', ['-q', '-r', '-1', zip, '.'], { cwd: stage, stdio: 'inherit' });
  fs.rmSync(stage, { recursive: true });
  const record = { ...candidate, files: count, zip, zipBytes: fs.statSync(zip).size, zipSha256: sha256(zip) };
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
}
try { main(); } catch (error) { console.error(`package-candidate: ${error.message}`); process.exitCode = 1; }
