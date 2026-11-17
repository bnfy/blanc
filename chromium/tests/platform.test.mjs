import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {hostPlatform,chromeProfileRoot,processListCommand,parseProcessList,candidateIdentityFiles,candidateIdentity,freeMemoryText} from './lib/platform.mjs';
import {freePercent} from './lib/memory-guard.mjs';

test('the host platform uses the tracker\'s names, and an unknown host stops', () => {
  assert.equal(hostPlatform('darwin'), 'macos');
  assert.equal(hostPlatform('win32'), 'windows');
  assert.equal(hostPlatform('linux'), 'linux');
  assert.throws(() => hostPlatform('freebsd'), /Unsupported test host/);
});
// These must equal kBrowsers in blanc/browser/ui/first_run.inc, which the
// browser joins to --blanc-test-browser-home.
test('the import fixture is laid out where each platform\'s browser looks', () => {
  assert.equal(chromeProfileRoot('/h', 'darwin'), path.join('/h', 'Library', 'Application Support', 'Google', 'Chrome'));
  assert.equal(chromeProfileRoot('/h', 'win32'), path.join('/h', 'Google', 'Chrome', 'User Data'));
  assert.equal(chromeProfileRoot('/h', 'linux'), path.join('/h', '.config', 'google-chrome'));
  assert.throws(() => chromeProfileRoot('/h', 'freebsd'));
});
test('process lists are read with each platform\'s own tool', () => {
  assert.deepEqual(processListCommand('darwin'), ['/bin/ps', ['-axo', 'pid=,command=']]);
  assert.deepEqual(processListCommand('linux'), ['/bin/ps', ['-eo', 'pid=,command=']]);
  const [tool, args] = processListCommand('win32');
  assert.equal(tool, 'powershell.exe');
  assert.ok(args.includes('-NoProfile') && args.at(-1).includes('Win32_Process'));
});
test('a process list parses to pids and command lines, skipping what has neither', () => {
  const text = '  812 /Apps/Blanc --user-data-dir=/tmp/a b --flag\r\n77 C:\\blanc\\chrome.exe --user-data-dir=C:\\t\\p\n\n  x not-a-pid\n4 \n';
  assert.deepEqual(parseProcessList(text), [
    {pid: 812, command: '/Apps/Blanc --user-data-dir=/tmp/a b --flag'},
    {pid: 77, command: 'C:\\blanc\\chrome.exe --user-data-dir=C:\\t\\p'},
  ]);
});
test('a candidate is identified by its executable and its main library', () => {
  const mac = {executable: '/a/Blanc', executableSha256: 'e', framework: '/a/Framework', frameworkSha256: 'f', candidate: 'macos-1'};
  assert.deepEqual(candidateIdentityFiles(mac), [['/a/Blanc', 'e'], ['/a/Framework', 'f']]);
  assert.deepEqual(candidateIdentity(mac), {id: 'macos-1', frameworkSha256: 'f', executableSha256: 'e'});
  const win = {executable: 'C:\\b\\chrome.exe', executableSha256: 'e', dll: 'C:\\b\\chrome.dll', dllSha256: 'd', candidate: 'windows-x64-1'};
  assert.deepEqual(candidateIdentityFiles(win), [['C:\\b\\chrome.exe', 'e'], ['C:\\b\\chrome.dll', 'd']]);
  assert.deepEqual(candidateIdentity(win), {id: 'windows-x64-1', dllSha256: 'd', executableSha256: 'e'});
  for (const bad of [{executable: '/a', executableSha256: 'e'}, {executable: '/a', framework: '/f', frameworkSha256: 'f'},
    {executable: '/a', executableSha256: 'e', dll: '/d'}, {executable: '/a', executableSha256: 'e', framework: '/f', frameworkSha256: 'f', dll: '/d', dllSha256: 'd'}])
    assert.throws(() => candidateIdentityFiles(bad), /identity/);
});
test('free memory off the Mac reads in the same form the guard parses', () => {
  assert.equal(freePercent(freeMemoryText('win32', {free: 6, total: 16})), 38);
  assert.equal(freePercent(freeMemoryText('win32', {free: 0, total: 16})), 0);
  // Linux counts file cache as used, so its figure would stop runs for nothing.
  assert.equal(freePercent(freeMemoryText('linux', {free: 1, total: 16})), null);
});
