import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { ASSET_NAME, candidateId, runtimeFiles, runtimeConfig, signedCopyOf, signedRuntimeConfig, channelOfOutput, channelNames } from '../windows/candidate.mjs';
import { candidateIdentityFiles, candidateIdentity } from '../tests/lib/platform.mjs';

const dll = 'ab'.repeat(32), exe = 'cd'.repeat(32);
test('a Windows candidate is named for its chrome.dll', () => {
  assert.equal(candidateId(dll), 'windows-x64-abababababababab');
  for (const bad of ['', 'AB'.repeat(32), 'ab'.repeat(31), undefined]) assert.throws(() => candidateId(bad));
  assert.equal(ASSET_NAME, 'blanc-windows-candidate.zip');
});
test('the package takes the browser\'s runtime files and nothing from outside the output', () => {
  assert.deepEqual(runtimeFiles(['./chrome.exe', 'chrome.dll', 'chrome.dll.pdb', 'locales/en-US.pak', '', '  icudtl.dat ', 'chrome.dll.lib', 'chrome.exe']),
    ['chrome.dll', 'chrome.exe', 'icudtl.dat', 'locales/en-US.pak']);
  assert.throws(() => runtimeFiles(['chrome.exe', 'chrome.dll', '../../third_party/x.dll']), /outside the output folder/);
  assert.throws(() => runtimeFiles(['chrome.exe', 'chrome.dll', '/etc/passwd']), /outside the output folder/);
  assert.throws(() => runtimeFiles(['chrome.exe', 'chrome.dll', 'a\\b.dll']), /outside the output folder/);
  assert.throws(() => runtimeFiles(['chrome.exe', 'resources.pak']), /not a Windows browser output/);
});
test('the run config for an unpacked candidate is one the harness accepts', () => {
  const candidate = { id: candidateId(dll), exeSha256: exe, dllSha256: dll };
  const config = runtimeConfig('C:\\t\\blanc', candidate, path.win32.join);
  assert.deepEqual(config, {
    candidate: 'windows-x64-abababababababab',
    executable: 'C:\\t\\blanc\\chrome.exe', executableSha256: exe,
    dll: 'C:\\t\\blanc\\chrome.dll', dllSha256: dll,
    blockerAssets: 'C:\\t\\blanc\\blocker', diskAssets: false,
  });
  assert.deepEqual(candidateIdentityFiles(config), [[config.executable, exe], [config.dll, dll]]);
  assert.deepEqual(candidateIdentity(config), { id: config.candidate, dllSha256: dll, executableSha256: exe });
  assert.throws(() => runtimeConfig('/t', { ...candidate, id: 'windows-x64-0000000000000000' }), /does not match/);
  assert.throws(() => runtimeConfig('/t', { id: candidate.id, dllSha256: dll }), /exeSha256/);
});

import { suiteArguments } from '../windows/run-suite.mjs';
test('a suite run names its slice, and a filter is never empty', () => {
  assert.deepEqual(suiteArguments(['--slice=f0']), []);
  assert.deepEqual(suiteArguments(['--slice=f0', '--only=tab-groups']), ['--only=tab-groups']);
  for (const bad of [[], ['--slice=s1'], ['--slice=f0', '--only='], ['--slice=f0', '--only=a', '--only=b'], ['--slice=f0', '--case-list=x'], ['--only=a']])
    assert.throws(() => suiteArguments(bad), undefined, bad.join(' '));
});

import { pinnedCommits } from '../windows/pinned-commits.mjs';
test('the runner fetches the reference commit and every corrected step\'s commit, once each', () => {
  const a = 'a'.repeat(40), b = 'b'.repeat(40);
  assert.deepEqual(pinnedCommits({ shippingCommit: a }, [{ commit: b }, { commit: a }]), [a, b]);
  assert.deepEqual(pinnedCommits({ shippingCommit: a }, []), [a]);
  assert.throws(() => pinnedCommits({}, []), /Not a full commit/);
  assert.throws(() => pinnedCommits({ shippingCommit: a }, [{ commit: 'v1.49.1' }]), /Not a full commit/);
});

import fs from 'node:fs';
import os from 'node:os';
import { keepingFile } from '../windows/candidate.mjs';
test('a tool that rewrites a build input leaves it as it was', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-keep-'));
  try {
    const file = path.join(dir, 'gn_logs.txt'), then = new Date('2026-11-17T15:50:35Z');
    fs.writeFileSync(file, 'first'); fs.utimesSync(file, then, then);
    assert.equal(keepingFile(file, () => { fs.writeFileSync(file, 'rewritten'); return 'out'; }), 'out');
    // Contents and time from one open file, so nothing can change between them.
    const opened = () => { const fd = fs.openSync(file, 'r');
      try { return {text: fs.readFileSync(fd, 'utf8'), mtime: fs.fstatSync(fd).mtime.getTime()}; } finally { fs.closeSync(fd); } };
    assert.deepEqual(opened(), {text: 'first', mtime: then.getTime()});
    assert.throws(() => keepingFile(file, () => { fs.rmSync(file); throw new Error('boom'); }), /boom/);
    assert.equal(opened().text, 'first');
    const absent = path.join(dir, 'absent.txt');
    keepingFile(absent, () => fs.writeFileSync(absent, 'made'));
    assert.equal(fs.existsSync(absent), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an installed copy is found in the Application folder and its version folder', () => {
  const candidate = { id: candidateId(dll), exeSha256: exe, dllSha256: dll, version: '158.0.8127.2' };
  const config = runtimeConfig('C:\\t\\blanc', candidate, path.win32.join, 'C:\\L\\Blanc Chromium Preview\\Application');
  assert.equal(config.executable, 'C:\\L\\Blanc Chromium Preview\\Application\\chrome.exe');
  assert.equal(config.dll, 'C:\\L\\Blanc Chromium Preview\\Application\\158.0.8127.2\\chrome.dll');
  assert.equal(config.blockerAssets, 'C:\\t\\blanc\\blocker');
  assert.throws(() => runtimeConfig('/t', { ...candidate, version: '158' }, path.win32.join, '/i'), /four-part version/);
});

// A minimal PE32+ image: DOS header, PE header, optional header with sixteen
// data directories, then some body bytes.
function pe(body = 'body') {
  const b = Buffer.alloc(0x80 + 24 + 240 + 16);
  b.writeUInt16LE(0x5a4d, 0); b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x4550, 0x80);
  const optional = 0x80 + 24;
  b.writeUInt16LE(0x20b, optional); b.writeUInt32LE(0x1234, optional + 64); b.writeUInt32LE(16, optional + 108);
  return Buffer.concat([b, Buffer.from(body)]);
}
function sign(unsigned, { checksum = 0x5678, padding = (8 - unsigned.length % 8) % 8, certificate = Buffer.from('certificate!') } = {}) {
  const out = Buffer.concat([unsigned, Buffer.alloc(padding), certificate]);
  const optional = 0x80 + 24, directory = optional + 112 + 32;
  out.writeUInt32LE(checksum, optional + 64); out.writeUInt32LE(unsigned.length + padding, directory); out.writeUInt32LE(certificate.length, directory + 4);
  return out;
}
test('a signed file is the candidate\'s file only when the signature is all that changed', () => {
  const unsigned = pe();
  assert.equal(signedCopyOf(unsigned, sign(unsigned)), true);
  assert.equal(signedCopyOf(unsigned, sign(pe('bodx'))), false, 'a changed body');
  const tampered = sign(unsigned); tampered[0x80 + 4] ^= 1;
  assert.equal(signedCopyOf(unsigned, tampered), false, 'a changed header');
  const paddedWithData = sign(unsigned); assert.ok(unsigned.length % 8); paddedWithData[unsigned.length] = 1;
  assert.equal(signedCopyOf(unsigned, paddedWithData), false, 'data in the padding');
  assert.equal(signedCopyOf(unsigned, sign(unsigned, { padding: 9 })), false, 'more than alignment padding');
  assert.equal(signedCopyOf(unsigned, Buffer.concat([sign(unsigned), Buffer.from('x')])), false, 'bytes after the certificate');
  assert.equal(signedCopyOf(unsigned, unsigned), false, 'no signature at all');
  assert.throws(() => signedCopyOf(sign(unsigned), sign(sign(unsigned))), /already signed/);
  assert.throws(() => signedCopyOf(Buffer.from('MZ not a pe file at all, just text, long enough to have a header field'), unsigned), /Not a PE/);
});
test('a signed install is run against the signed bytes, after checking them', () => {
  const sha = b => crypto.createHash('sha256').update(b).digest('hex');
  const files = { 'u/chrome.exe': pe('exe'), 'u/chrome.dll': pe('dll') };
  files['i/chrome.exe'] = sign(files['u/chrome.exe']); files['i/1.0.0.0/chrome.dll'] = sign(files['u/chrome.dll']);
  const config = { candidate: 'windows-x64-1', executable: 'i/chrome.exe', executableSha256: sha(files['u/chrome.exe']), dll: 'i/1.0.0.0/chrome.dll', dllSha256: sha(files['u/chrome.dll']), blockerAssets: 'u/blocker', diskAssets: false };
  const originals = { executable: 'u/chrome.exe', dll: 'u/chrome.dll' }, read = f => files[f];
  assert.deepEqual(signedRuntimeConfig(config, originals, read, sha),
    { ...config, executableSha256: sha(files['i/chrome.exe']), dllSha256: sha(files['i/1.0.0.0/chrome.dll']) });
  assert.throws(() => signedRuntimeConfig({ ...config, dllSha256: 'ef'.repeat(32) }, originals, read, sha), /not the candidate's file\./);
  files['i/chrome.exe'] = sign(pe('exf'));
  assert.throws(() => signedRuntimeConfig(config, originals, read, sha), /signature added/);
});
test('a native check is named by its file, inside chromium/tests', async () => {
  const { nativeCheckPath } = await import('../windows/run-native-check.mjs');
  assert.equal(nativeCheckPath('/r', 'native-tab-switch.mjs'), path.join('/r', 'chromium', 'tests', 'native-tab-switch.mjs'));
  for (const bad of ['../x.mjs', 'runner.mjs', 'native-tab-switch.js', 'native-../a.mjs']) assert.throws(() => nativeCheckPath('/r', bad));
});
test('each Windows output is a channel with its own installed names (W3)', () => {
  assert.equal(channelOfOutput('BlancWinPrototype'), 'preview');
  assert.equal(channelOfOutput('BlancWinBeta'), 'beta');
  assert.throws(() => channelOfOutput('BlancPrototype'));
  assert.deepEqual(channelNames('preview'), { product: 'Blanc Chromium Preview', appName: 'Blanc Prototype', progId: 'BlancPrvHTM', testHooks: true });
  assert.deepEqual(channelNames('beta'), { product: 'Blanc Beta', appName: 'Blanc Beta', progId: 'BlancBetHTM', testHooks: false });
  assert.throws(() => channelNames('release'));
});
