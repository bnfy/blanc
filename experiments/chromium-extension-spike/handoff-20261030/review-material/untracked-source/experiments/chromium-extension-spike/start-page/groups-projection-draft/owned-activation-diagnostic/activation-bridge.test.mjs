import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {activateOwnedFixture,OwnedActivationError} from './activation-bridge.mjs';
import {ObserverNotExitedError} from './bridge.mjs';
const proc={pid:22,exitCode:null,signalCode:null},bounds={left:1,top:2,width:300,height:400};
function child(mode){
 const c=new EventEmitter();c.pid=42;c.exitCode=null;c.signalCode=null;c.stdout=new PassThrough();c.stdin=new PassThrough();c.unref=()=>{c.unreferenced=true};
 c.kill=()=>{c.killed=true;if(mode!=='stuck')setTimeout(()=>{c.signalCode='SIGTERM';c.emit('exit');c.emit('close')},1);return true};
 c.stdin.end=()=>{if(mode!=='stuck')setTimeout(()=>{c.exitCode=mode==='denied'?2:0;c.stdout.write(JSON.stringify({event:'result',status:mode==='denied'?'activation_not_observed':mode==='probe'?'observed':'activated',frontmost_before:mode==='malformed',frontmost_after:mode!=='denied'&&mode!=='probe',activation_requested:mode==='probe'?false:true,activation_accepted:mode==='probe'?null:true,title:'SECRET',pid:123}));c.stdout.end();c.emit('exit');c.emit('close');},1)};
 return c;
}
test('records bounded activation result with confirmed helper exit',async()=>{
 const r=await activateOwnedFixture(proc,bounds,{spawnHelper:()=>child('ok'),stopTimeout:5});assert.deepEqual(r,{status:'activated',frontmost_before:false,activation_requested:true,activation_accepted:true,frontmost_after:true,start_monotonic_ns:null,end_monotonic_ns:null,helperExit:'confirmed'});
});
test('refused or unobserved activation never authorizes click',async()=>{
 await assert.rejects(activateOwnedFixture(proc,bounds,{spawnHelper:()=>child('denied'),stopTimeout:5}),e=>e instanceof OwnedActivationError&&e.status==='activation_not_observed'&&e.detail.helperExit==='confirmed'&&!JSON.stringify(e.detail).includes('SECRET'));
});
test('helper which cannot be stopped yields guard-retaining uncertainty',async()=>{
 const c=child('stuck');await assert.rejects(activateOwnedFixture(proc,bounds,{spawnHelper:()=>c,completionTimeout:5,stopTimeout:5}),ObserverNotExitedError);assert(c.killed&&c.unreferenced);
});
test('unusable fixture or bounds never starts helper',async()=>{
 const spawnHelper=()=>{throw Error('should not start')};
 await assert.rejects(activateOwnedFixture({...proc,exitCode:0},bounds,{spawnHelper}),e=>e instanceof OwnedActivationError&&e.status==='fixture_exited');
 await assert.rejects(activateOwnedFixture(proc,{...bounds,width:-1},{spawnHelper}),e=>e instanceof OwnedActivationError&&e.status==='invalid_bounds');
});
test('synchronous helper input failure still confirms helper exit',async()=>{
 const c=child('ok');c.stdin.end=()=>{throw Error('SECRET')};
 await assert.rejects(activateOwnedFixture(proc,bounds,{spawnHelper:()=>c,completionTimeout:20,stopTimeout:5}),e=>e instanceof OwnedActivationError&&e.status==='helper_failed'&&e.detail.helperExit==='confirmed');assert(c.killed);
});

test('read-only probe accepts a negative foreground observation without activating',async()=>{
 const c=child('probe');
 const r=await activateOwnedFixture(proc,bounds,{mode:'probe',spawnHelper:()=>c,stopTimeout:5});assert.equal(r.status,'observed');assert.equal(r.frontmost_after,false);
});

test('contradictory activation evidence is rejected',async()=>{
 await assert.rejects(activateOwnedFixture(proc,bounds,{spawnHelper:()=>child('malformed'),stopTimeout:5}),OwnedActivationError);
});
