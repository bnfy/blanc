import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {sessionBytes} from './lib/import-fixture.mjs';

test('the Linux chooser waits for the owned GTK location entry and accepts the exact file', async t => {
  const {chooseLinuxArcFile} = await import('./adapters/import.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc chooser-'));
  t.after(() => fs.rmSync(home, {recursive:true,force:true}));
  const file = path.join(home, 'StorableSidebar.json');
  fs.writeFileSync(file, '{}');
  const calls = [];
  let selections=0, accepts=0;
  await chooseLinuxArcFile(file, 701, async (tool,...args) => {
    calls.push([tool,...args]);
    if (tool==='xsel') return ++selections === 1 ? 'partial path' : file;
    if (args[0]==='search') {
      if (args.includes('--sync') || accepts<2) return '303';
      throw Object.assign(Error('no matching visible window'),{code:1});
    }
    if (args[0]==='getwindowpid') return '701';
    if (args[0]==='getwindowfocus') return '303';
    if (args.at(-1)==='Return') {
      assert.ok(selections>=2,'never submits an unverified path');
      assert.ok(args.includes('--window') && args.includes('303'));
      accepts++;
    }
    return '';
  });
  assert.deepEqual(calls[0], ['xdotool','search','--sync','--onlyvisible','--name','^Choose StorableSidebar\\.json$']);
  assert.equal(accepts,2,'an ignored response leaves the original dialog visible');
  assert.equal(calls.at(-1)[1],'search');
  await assert.rejects(chooseLinuxArcFile(path.join(home,'missing'), 701), /ENOENT/);
});

const configFile = process.env.BLANC_LINUX_IMPORT_CONFIG;
test('installed Linux import discovers all five browsers and distinguishes stale and live locks', {
  skip: !configFile || process.platform !== 'linux' ? 'needs a Linux candidate and X11' : false,
}, async t => {
  const {NativeFixture} = await import('./lib/fixture.mjs');
  const {installDriver,nativeCall} = await import('./lib/test-driver.mjs');
  const config = JSON.parse(fs.readFileSync(configFile));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'linux-import-'));
  const f = new NativeFixture();
  const sourceBrowser = new NativeFixture();
  t.after(async () => {
    try { await Promise.all([f.close(),sourceBrowser.close()]); }
    finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  });
  await f.launch(config,path.join(tmp,'case'),{testHooks:true,diskAssets:false});
  await installDriver(f.host);
  const folders = {chrome:'google-chrome', edge:'microsoft-edge', chromium:'chromium',
    brave:'BraveSoftware/Brave-Browser', vivaldi:'vivaldi'};
  const root = path.join(f.browserHome,'.config');
  const session = sessionBytes([{url:'https://example.test/',title:'Fixture'}]);
  for (const folder of Object.values(folders)) {
    const sessions = path.join(root,folder,'Default','Sessions');
    fs.mkdirSync(sessions,{recursive:true});
    fs.writeFileSync(path.join(sessions,'Session_100'),session);
    fs.writeFileSync(path.join(sessions,'Session_200'),'incomplete snapshot');
  }
  const {sources} = await nativeCall(f.host,'importSources');
  assert.deepEqual(sources.map(s=>s.browserId).sort(),Object.keys(folders).sort());
  const source = sources.find(s=>s.browserId==='chrome');
  const open = () => nativeCall(f.host,'importOpenSource',[source.id,{}]);
  const lock = path.join(root,folders.chrome,'SingletonLock');
  // Mirror a separate live Chromium process's singleton into the synthetic source.
  // Its socket stays owned by the browser even while we vary the lock PID.
  await sourceBrowser.launch(config,path.join(tmp,'source-browser'),{testHooks:true,diskAssets:false});
  const browserOwner = fs.readlinkSync(path.join(sourceBrowser.profile,'SingletonLock'));
  assert.equal(browserOwner, os.hostname()+'-'+sourceBrowser.process.pid);
  fs.symlinkSync(fs.readlinkSync(path.join(sourceBrowser.profile,'SingletonSocket')),path.join(root,folders.chrome,'SingletonSocket'));
  const unlocked = await open();
  assert.ok(unlocked.error);
  assert.notEqual(unlocked.error,'source-locked');
  // Hold a child after exit so the kernel still has its PID during the read.
  const parent = spawn('python3',['-uc',[
    'import os, sys', 'pid = os.fork()', 'if pid == 0: os._exit(0)',
    'os.waitid(os.P_PID, pid, os.WEXITED | os.WNOWAIT)', 'print(pid)', 'sys.stdin.read()', 'os.waitpid(pid, 0)',
  ].join('\n')],{stdio:['pipe','pipe','inherit']});
  const closed = once(parent,'close');
  t.after(async () => {parent.stdin.end(); await closed;});
  const [output] = await Promise.race([
    once(parent.stdout,'data'),
    closed.then(([code]) => {throw Error('Zombie fixture exited before reporting its PID: '+code);}),
  ]);
  const zombie = String(output).trim();
  assert.match(fs.readFileSync('/proc/'+zombie+'/stat','utf8'), /\) Z /);
  const unrelated = os.hostname()+'-'+process.pid;
  fs.writeFileSync(path.join(path.dirname(lock),unrelated),'');
  for (const target of ['missing-file',os.hostname()+'-2147483647',unrelated,os.hostname()+'-'+f.process.pid,os.hostname()+'-'+zombie]) {
    fs.symlinkSync(target,lock);
    assert.deepEqual(await open(),unlocked);
    assert.equal(fs.readlinkSync(lock),target);
    fs.unlinkSync(lock);
  }
  fs.symlinkSync(browserOwner,lock);
  const active = await open();
  assert.equal(active.error,'source-locked');
  assert.equal(active.recoverableTabCount,1);
  assert.equal(fs.readlinkSync(lock),browserOwner);
  fs.unlinkSync(lock);
  fs.symlinkSync('remote-'+browserOwner,lock);
  assert.equal((await open()).error,'source-locked');
});

test('the Linux Arc platform setup accepts explicit file choice and rejects spoofing other platforms', async () => {
  const {configureArcImport} = await import('./adapters/import.mjs');
  const w = {fixture:{browserHome:'/isolated'}};
  assert.equal(configureArcImport(w,'platform','darwin','linux'),true); // shared Before hook
  assert.equal(configureArcImport(w,'platform','linux','linux'),true);
  assert.equal(configureArcImport(w,'choose-file','/copied/StorableSidebar.json','linux'),true);
  assert.equal(w.arcChosenFile,'/copied/StorableSidebar.json');
  assert.equal(configureArcImport(w,'choose-file',null,'linux'),true);
  assert.equal(w.arcChosenFile,null);
  assert.throws(()=>configureArcImport(w,'platform','linux','darwin'), /Linux/);
});

test('a portal-owned dialog must be transient for this browser before typing', async t => {
  const {chooseLinuxArcFile} = await import('./adapters/import.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(),'blanc-portal-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const file = path.join(home,'StorableSidebar.json');
  fs.writeFileSync(file,'{}');
  const calls = [];
  const missing = new Set();
  let accepted=false;
  const tool = async (command,...args) => {
    calls.push([command,...args]);
    if (command === 'xprop') return 'WM_TRANSIENT_FOR(WINDOW): window id # 0x111';
    if (args[0] === 'getwindowpid' && missing.has(args[1]))
      throw Object.assign(Error('window has no _NET_WM_PID'), {code:1});
    if (args[0] === 'getwindowpid') return args[1] === '0x111' ? '701' : '808';
    if (args[0] === 'search') {
      if (args.includes('--sync')) accepted=false;
      if (accepted) throw Object.assign(Error('no matching window'),{code:1});
      return '303';
    }
    if (command==='xsel') return file;
    if (args[0]==='getwindowfocus') return '303';
    if (args.at(-1)==='Return') accepted=true;
    return '';
  };
  await chooseLinuxArcFile(file,701,tool);
  assert.ok(calls.some(args=>args[0]==='xprop' && args.at(-1)==='WM_TRANSIENT_FOR'));
  calls.length = 0;
  await assert.rejects(chooseLinuxArcFile(file,702,tool),/browser/);
  assert.ok(!calls.some(args=>args.includes('type')));
  calls.length = 0;
  missing.add('303');
  await chooseLinuxArcFile(file,701,tool);
  assert.ok(calls.some(args=>args.includes('type')));
  calls.length = 0;
  missing.add('0x111');
  await assert.rejects(chooseLinuxArcFile(file,701,tool),/browser/);
  assert.ok(!calls.some(args=>args.includes('windowfocus') || args.includes('type')));
});
