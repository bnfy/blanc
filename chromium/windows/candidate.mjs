// What a packaged Windows candidate is: the files to take from the output
// folder, its id, and the run config the test harness reads. Pure, so the
// server's packaging step and the runner's unpacking step agree by test.
import fs from 'node:fs';
import path from 'node:path';

export const ASSET_NAME = 'blanc-windows-candidate.zip';
// Like the Mac's `macos-<framework hash>`: the main library names the build.
export function candidateId(dllSha256) {
  if (!/^[0-9a-f]{64}$/.test(dllSha256)) throw new Error('chrome.dll SHA-256 must be 64 lowercase hex digits.');
  return `windows-x64-${dllSha256.slice(0, 16)}`;
}
// `gn desc <out> //chrome:chrome runtime_deps` lists what the browser needs
// at run time, relative to the output folder. Take those inside it; leave out
// debug symbols and import libraries, and refuse anything that would be read
// from outside the folder, since the zip could not carry it.
export function runtimeFiles(lines) {
  const files = [];
  for (const raw of lines) {
    const line = raw.trim().replace(/^\.\//, '');
    if (!line) continue;
    if (line.startsWith('../') || path.posix.isAbsolute(line) || line.includes('\\')) throw new Error(`Runtime file outside the output folder: ${line}`);
    if (/\.(pdb|lib|exp|ilk)$/i.test(line)) continue;
    files.push(line);
  }
  if (!files.includes('chrome.exe') || !files.includes('chrome.dll')) throw new Error('The runtime list has no chrome.exe and chrome.dll; this is not a Windows browser output.');
  return [...new Set(files)].sort();
}
// The harness's run config for an unpacked candidate (tests/lib/fixture.mjs).
// Island assets are compiled in; the blocker engine travels in the zip.
// `installed` points at an installed copy instead of the unpacked one: the
// Application folder's chrome.exe and its version folder's chrome.dll, which
// the installer copies unchanged, so the same hashes identify them.
export function runtimeConfig(directory, candidate, join = path.join, installed = null) {
  for (const key of ['id', 'exeSha256', 'dllSha256']) if (typeof candidate[key] !== 'string') throw new Error(`candidate.json has no ${key}.`);
  if (candidate.id !== candidateId(candidate.dllSha256)) throw new Error('candidate.json id does not match its chrome.dll hash.');
  if (installed && (typeof candidate.version !== 'string' || !/^\d+(\.\d+){3}$/.test(candidate.version))) throw new Error('candidate.json has no four-part version.');
  return {
    candidate: candidate.id,
    executable: join(installed ?? directory, 'chrome.exe'), executableSha256: candidate.exeSha256,
    dll: installed ? join(installed, candidate.version, 'chrome.dll') : join(directory, 'chrome.dll'), dllSha256: candidate.dllSha256,
    blockerAssets: join(directory, 'blocker'), diskAssets: false,
  };
}
// Runs `work`, then restores `file` to the bytes and times it had before
// (or removes it if it did not exist), whatever `work` did to it.
export function keepingFile(file, work) {
  const before = fs.existsSync(file) ? { bytes: fs.readFileSync(file), stat: fs.statSync(file) } : null;
  try { return work(); } finally {
    if (!before) fs.rmSync(file, { force: true });
    else { fs.writeFileSync(file, before.bytes); fs.utimesSync(file, before.stat.atime, before.stat.mtime); }
  }
}
