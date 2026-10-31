import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {observeOwnedFixture} from './bridge.mjs';
import {redact} from './redact.mjs';
test('rejects non-owned or already exited process before launching observer',async()=>{
 for(const proc of [null,{pid:0,exitCode:null,signalCode:null},{pid:12,exitCode:0,signalCode:null}])await assert.rejects(observeOwnedFixture(proc,{left:1,top:2,width:3,height:4}));
});
test('rejects malformed bounds before launching observer',async()=>{
 const p={pid:12,exitCode:null,signalCode:null};
 for(const b of [{left:1,top:2,width:0,height:4},{left:NaN,top:2,width:3,height:4},null])await assert.rejects(observeOwnedFixture(p,b));
});
test('redacts title and URL fields and URL-bearing strings recursively',()=>{
 const x=redact({url:'chrome://newtab',title:'private',nested:[{text:'a',other:'https://example.com/path',focused:true}],error:'bad about:blank'});
 assert.deepEqual(x,{nested:[{other:'[redacted]',focused:true}],error:'[redacted]'});
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {writeAndSync} from './writer.mjs';
import {stopChild,ObserverNotExitedError} from './bridge.mjs';
test('actual writer removes nested sensitive fields, group name and URL strings',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-ax-writer-'));try{
  const p=path.join(d,'receipt.json');writeAndSync(p,{groups:[{name:'PRIVATE_TITLE',title:'PRIVATE_TITLE',url:'https://secret.example/',text:'PRIVATE_TEXT',args:['PRIVATE_ARGUMENT'],id:'ok'}],marker:{name:'before-click'},error:'url https://secret.example/'},'wx');
  const raw=fs.readFileSync(p,'utf8');for(const text of ['PRIVATE_TITLE','PRIVATE_TEXT','PRIVATE_ARGUMENT','secret.example'])assert.equal(raw.includes(text),false);
  assert.deepEqual(JSON.parse(raw),{groups:[{id:'ok'}],marker:{name:'before-click'},error:'[redacted]'});
 }finally{fs.rmSync(d,{recursive:true});}
});
function fakeChild(mode){
 const c=new EventEmitter();c.pid=123;c.exitCode=null;c.signalCode=null;c.killCount=0;
 c.stdin={end(){if(mode==='normal')setTimeout(()=>{c.exitCode=0;c.emit('exit')},1);},destroy(){c.inputDestroyed=true}};
 c.stdout={destroy(){c.outputDestroyed=true}};c.unref=()=>{c.unreferenced=true};
 c.kill=()=>{c.killCount++;if(mode==='terminate')setTimeout(()=>{c.signalCode='SIGTERM';c.emit('exit')},1);return true};return c;
}
test('stop waits for normal and signaled observer exit',async()=>{
 for(const mode of ['normal','terminate']){const c=fakeChild(mode);await stopChild(c,10);assert(c.exitCode===0||c.signalCode==='SIGTERM');assert.equal(c.killCount,mode==='terminate'?1:0);}
});
test('unconfirmed observer exit throws and requires guard retention',async()=>{
 const c=fakeChild('stuck');await assert.rejects(stopChild(c,5),ObserverNotExitedError);assert.equal(c.killCount,1);assert(c.inputDestroyed&&c.outputDestroyed&&c.unreferenced);
});
import {PassThrough} from 'node:stream';
test('throwing stop input still kills and confirms exit',async()=>{
 const c=fakeChild('terminate');c.stdin.end=()=>{throw Error('end failed')};await stopChild(c,5);assert.equal(c.signalCode,'SIGTERM');
});
test('throwing initial write still detects unconfirmed observer exit',async()=>{
 const c=fakeChild('stuck');const input=new PassThrough(),output=new PassThrough();input.write=()=>{throw Error('write failed')};c.stdin=input;c.stdout=output;
 await assert.rejects(observeOwnedFixture({pid:22,exitCode:null,signalCode:null},{left:1,top:2,width:3,height:4},{spawnObserver:()=>c,stopTimeout:5}),ObserverNotExitedError);
 assert.equal(c.killCount,1);assert(c.unreferenced);
});
test('throwing post-spawn stream setup still retains uncertain child',async()=>{
 const c=fakeChild('stuck');c.stdout=null;
 await assert.rejects(observeOwnedFixture({pid:22,exitCode:null,signalCode:null},{left:1,top:2,width:3,height:4},{spawnObserver:()=>c,stopTimeout:5}),ObserverNotExitedError);
 assert.equal(c.killCount,1);assert(c.unreferenced);
});
import {AXDiagnosticError} from './bridge.mjs';
function failingObserver(reason){
 const c=fakeChild('normal'),input=new PassThrough(),output=new PassThrough();c.stdin=input;c.stdout=output;
 input.write=()=>{setTimeout(()=>{
  c.exitCode=2;c.emit('exit'); // The OS exit event may precede the last stdout line.
  output.write(JSON.stringify({event:'sample',window_match:'ambiguous',app_frontmost:true,window_focused:false,minimized:false,start_monotonic_ns:1,end_monotonic_ns:2,title:'SECRET',url:'https://secret.example'})+'\n');
  output.end(JSON.stringify({event:'unavailable',reason})+'\n');
 },1);return true};return c;
}
test('unavailable reason and safe first sample survive child exit ordering',async()=>{
 for(const [input,expected] of [['ownership_query_failed','ownership_query_failed'],['window_ambiguous','window_ambiguous'],['SECRET','observer_protocol_invalid']]){
  const child=failingObserver(input);
  await assert.rejects(observeOwnedFixture({pid:22,exitCode:null,signalCode:null},{left:1,top:2,width:3,height:4},{spawnObserver:()=>child,stopTimeout:10}),e=>{
   assert(e instanceof AXDiagnosticError);assert.equal(e.code,expected);assert.equal(e.detail.observerExit,'confirmed');
   assert.deepEqual(e.detail.firstSample,{event:'sample',window_match:'ambiguous',app_frontmost:true,window_focused:false,minimized:false,start_monotonic_ns:1,end_monotonic_ns:2});
   assert(!JSON.stringify(e.detail).includes('SECRET'));return true;
  });
 }
});
test('not-started failures carry bounded reason and cleanup state',async()=>{
 await assert.rejects(observeOwnedFixture({pid:22,exitCode:null,signalCode:null},{left:1,top:2,width:0,height:4}),e=>e instanceof AXDiagnosticError&&e.code==='invalid_bounds'&&e.detail.observerExit==='not_started');
});
import {checkAXTrust} from './bridge.mjs';
test('trust preflight exposes only an allowlisted no-prompt reason',()=>{
 checkAXTrust({execCheck:()=>'{"event":"trusted"}'});
 assert.throws(()=>checkAXTrust({execCheck:()=>{const e=Error('SECRET');e.status=2;e.stdout='{"event":"unavailable","reason":"accessibility_not_trusted"}';throw e;}}),e=>e instanceof AXDiagnosticError&&e.code==='accessibility_not_trusted'&&!String(e).includes('SECRET'));
 assert.throws(()=>checkAXTrust({execCheck:()=>{const e=Error('SECRET');e.status=2;e.stdout='{"reason":"SECRET"}';throw e;}}),e=>e instanceof AXDiagnosticError&&e.code==='trust_check_failed'&&!String(e).includes('SECRET'));
});
test('asynchronous spawn failure without PID reports not started',async()=>{
 const c=fakeChild('normal');c.pid=undefined;const input=new PassThrough(),output=new PassThrough();c.stdin=input;c.stdout=output;
 input.write=()=>{setTimeout(()=>c.emit('error',Error('SECRET')),1);return true;};
 await assert.rejects(observeOwnedFixture({pid:22,exitCode:null,signalCode:null},{left:1,top:2,width:3,height:4},{spawnObserver:()=>c,stopTimeout:5}),e=>e instanceof AXDiagnosticError&&e.code==='observer_spawn_failed'&&e.detail.observerExit==='not_started');
});
