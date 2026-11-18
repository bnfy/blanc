import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {hostPlatform,chromeProfileRoot,processListCommand,parseProcessList,candidateIdentityFiles,candidateIdentity,freeMemoryText,runningBrowserMarker} from './lib/platform.mjs';
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

import {clickSteps,doubleClickSteps,dragSteps,keySteps} from './lib/windows-desktop.mjs';
test('real-input gestures are a press and release at the point, and a drag travels in steps', () => {
  const kinds=steps=>steps.filter(s=>s.do!=='sleep').map(s=>s.do).join(' ');
  assert.equal(kinds(clickSteps(10.4,20.6)),'move down up');
  assert.deepEqual(clickSteps(10.4,20.6)[0],{do:'move',x:10,y:21});
  assert.equal(kinds(doubleClickSteps(1,2)),'move down up down up');
  const drag=dragSteps({x:100,y:50},{x:160,y:80},3);
  assert.equal(kinds(drag),'move down move move move up');
  assert.deepEqual(drag.filter(s=>s.do==='move').map(s=>[s.x,s.y]),[[100,50],[120,60],[140,70],[160,80]]);
  assert.deepEqual(keySteps(27)[0],{do:'key',vk:27});
});
test('a running Chrome is marked as each platform\'s Chrome marks itself', () => {
  // The Mac and Linux: a SingletonLock symlink naming the host; Windows: the
  // lockfile Chrome holds open in its User Data folder (no symlink needed).
  assert.deepEqual(runningBrowserMarker('darwin'), {name: 'SingletonLock', kind: 'symlink'});
  assert.deepEqual(runningBrowserMarker('linux'), {name: 'SingletonLock', kind: 'symlink'});
  assert.deepEqual(runningBrowserMarker('win32'), {name: 'lockfile', kind: 'file'});
  assert.throws(() => runningBrowserMarker('freebsd'));
});
test('on Windows the Arc fixture is reached through Arc\'s own Store folder', async () => {
  const {ARC_WINDOWS_FOLDER, linkArcFolder} = await import('./adapters/import.mjs');
  const source = (await import('node:fs')).readFileSync(new URL('../blanc/browser/ui/tab_import.inc', import.meta.url), 'utf8');
  assert.ok(source.includes(`AppendASCII("${ARC_WINDOWS_FOLDER.join('/')}/StorableSidebar.json")`), 'matches tab_import.inc ArcPath on Windows');
  const calls = [];
  const fsApi = {mkdirSync: p => calls.push(['mkdir', p]), existsSync: () => false, symlinkSync: (t, p, k) => calls.push(['link', t, p, k])};
  assert.equal(linkArcFolder('/home', 'darwin', fsApi), false);
  assert.equal(calls.length, 0);
  assert.equal(linkArcFolder('/home', 'win32', fsApi), true);
  assert.deepEqual(calls.at(-1), ['link', path.join('/home', 'Library', 'Application Support', 'Arc'), path.join('/home', ...ARC_WINDOWS_FOLDER), 'junction']);
});
test('the browser looks for the running marker the harness writes, on each platform', async () => {
  const source = (await import('node:fs')).readFileSync(new URL('../blanc/browser/ui/tab_import.inc', import.meta.url), 'utf8');
  const running = /#if BUILDFLAG\(IS_WIN\)\n(.*?)\n#else\n(.*?)\n#endif/s.exec(source.slice(source.indexOf('SourceRead ReadSource')));
  assert.ok(running, 'tab_import.inc has a Windows running check');
  assert.match(running[1], new RegExp(`AppendASCII\\("${runningBrowserMarker('win32').name}"\\)`));
  assert.match(running[2], new RegExp(`AppendASCII\\("${runningBrowserMarker('darwin').name}"\\)`));
});
