import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ASSET_NAME, candidateId, runtimeFiles, runtimeConfig } from '../windows/candidate.mjs';
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
