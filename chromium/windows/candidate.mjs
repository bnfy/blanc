// What a packaged Windows candidate is: the files to take from the output
// folder, its id, and the run config the test harness reads. Pure, so the
// server's packaging step and the runner's unpacking step agree by test.
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
export function runtimeConfig(directory, candidate, join = path.join) {
  for (const key of ['id', 'exeSha256', 'dllSha256']) if (typeof candidate[key] !== 'string') throw new Error(`candidate.json has no ${key}.`);
  if (candidate.id !== candidateId(candidate.dllSha256)) throw new Error('candidate.json id does not match its chrome.dll hash.');
  return {
    candidate: candidate.id,
    executable: join(directory, 'chrome.exe'), executableSha256: candidate.exeSha256,
    dll: join(directory, 'chrome.dll'), dllSha256: candidate.dllSha256,
    blockerAssets: join(directory, 'blocker'), diskAssets: false,
  };
}
