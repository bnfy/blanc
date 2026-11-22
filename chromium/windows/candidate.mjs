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
// Each Windows output is a channel (W3), and each channel installs under its
// own names (patch 0098; chromium/windows/identity.md). Only the preview has
// test hooks compiled in.
const CHANNEL_OF_OUTPUT = { BlancWinPrototype: 'preview', BlancWinBeta: 'beta' };
export function channelOfOutput(out) {
  if (!Object.hasOwn(CHANNEL_OF_OUTPUT, out)) throw new Error(`Not a Windows output: ${out}`);
  return CHANNEL_OF_OUTPUT[out];
}
const CHANNEL_NAMES = {
  preview: { product: 'Blanc Chromium Preview', appName: 'Blanc Prototype', progId: 'BlancPrvHTM', testHooks: true },
  beta: { product: 'Blanc Beta', appName: 'Blanc Beta', progId: 'BlancBetHTM', testHooks: false },
};
// The Windows version a candidate installs as (W3 Task D1): a beta's PATCH is
// its build number (patch 0103), so each beta is newer than the last for
// Blanc's updater; other channels keep Chromium's. Each part is 16-bit in the
// Windows version resource.
export function windowsVersion(chromiumVersion, channel, betaBuild) {
  if (channel !== 'beta') return chromiumVersion;
  if (!Number.isInteger(betaBuild) || betaBuild < 1) throw new Error('A beta needs its build number');
  if (betaBuild > 65535) throw new Error('A Windows version part is 16-bit');
  return chromiumVersion.split('.').slice(0, 3).concat(String(betaBuild)).join('.');
}
export function channelNames(channel) {
  if (!Object.hasOwn(CHANNEL_NAMES, channel)) throw new Error(`Not a Windows channel: ${channel}`);
  return { ...CHANNEL_NAMES[channel] };
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
// Authenticode signing changes a PE file in three places: the header's
// checksum, the security directory entry, and a certificate table appended
// after zero padding to an 8-byte boundary. `signed` is `unsigned` with a
// signature added, and nothing else, when those are the only differences.
function peSecurity(buffer) {
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) throw new Error('Not a PE file.');
  const pe = buffer.readUInt32LE(0x3c);
  if (pe + 24 + 2 > buffer.length || buffer.readUInt32LE(pe) !== 0x4550) throw new Error('Not a PE file.');
  const optional = pe + 24, magic = buffer.readUInt16LE(optional);
  if (magic !== 0x10b && magic !== 0x20b) throw new Error('Unknown PE optional header.');
  const plus = magic === 0x20b, directory = optional + (plus ? 112 : 96) + 4 * 8;
  if (directory + 8 > buffer.length || buffer.readUInt32LE(optional + (plus ? 108 : 92)) < 5) throw new Error('The PE file has no security directory.');
  return { checksum: optional + 64, directory, offset: buffer.readUInt32LE(directory), size: buffer.readUInt32LE(directory + 4) };
}
export function signedCopyOf(unsigned, signed) {
  const u = peSecurity(unsigned), s = peSecurity(signed);
  if (u.offset || u.size) throw new Error('The candidate\'s own file is already signed.');
  if (u.checksum !== s.checksum || u.directory !== s.directory || !s.size || s.offset + s.size !== signed.length) return false;
  const padding = s.offset - unsigned.length;
  if (padding < 0 || padding > 7 || signed.subarray(unsigned.length, s.offset).some(byte => byte !== 0)) return false;
  const same = (from, to) => unsigned.subarray(from, to).equals(signed.subarray(from, to));
  return same(0, u.checksum) && same(u.checksum + 4, u.directory) && same(u.directory + 8, unsigned.length);
}
// The run config for a signed install: each installed file must be the
// candidate's own (its hash matches the config) with only a signature added,
// and the harness then checks the signed bytes. `originals` names the
// candidate's unsigned chrome.exe and chrome.dll.
export function signedRuntimeConfig(config, originals, read, sha256) {
  const next = { ...config };
  for (const [file, key, original] of [[config.executable, 'executableSha256', originals.executable], [config.dll, 'dllSha256', originals.dll]]) {
    const before = read(original), after = read(file);
    if (sha256(before) !== config[key]) throw new Error(`${original} is not the candidate's file.`);
    if (!signedCopyOf(before, after)) throw new Error(`${file} is not the candidate's file with a signature added.`);
    next[key] = sha256(after);
  }
  return next;
}
// Whether an installed chrome.exe and chrome.dll are this candidate's (the
// nightly's installed-bytes check, Task 2): unsigned, their SHA-256 must be the
// packaged exeSha256 and dllSha256; signed, each must be the candidate's own
// file (originalExe, originalDll, hashing to those values) with only a
// signature added, and each installed hash must be one the signing record
// (windows-signature.json) verified, so a damaged signature fails too.
// Returns the installed hashes either way.
export function installedMatches(candidate, {installedExe, installedDll, originalExe, originalDll}, {signed, read, sha256, signedHashes = null}) {
  const exe = read(installedExe), dll = read(installedDll);
  const result = {sha256: {exe: sha256(exe), dll: sha256(dll)}, match: false};
  if (!signed) {
    result.match = result.sha256.exe === candidate.exeSha256 && result.sha256.dll === candidate.dllSha256;
    return result;
  }
  if (!signedHashes) throw new Error('A signed install is checked against the signing record (windows-signature.json).');
  if (!signedHashes.has(result.sha256.exe) || !signedHashes.has(result.sha256.dll)) return result;
  const originals = [[read(originalExe), exe, candidate.exeSha256], [read(originalDll), dll, candidate.dllSha256]];
  result.match = originals.every(([original, installed, expected]) => {
    if (sha256(original) !== expected) return false;
    try { return signedCopyOf(original, installed); } catch { return false; }
  });
  return result;
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
