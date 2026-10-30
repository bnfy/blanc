import {test} from 'node:test';import {strict as assert} from 'node:assert';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {guard,publicSample,HandoffError} from './handoff-bridge.mjs';import {ObserverNotExitedError} from './bridge.mjs';
const proc={pid:42,exitCode:null,signalCode:null},bounds={left:22,top:52,width:1200,height:996};
function child(mode){const c=new EventEmitter();c.pid=55;c.exitCode=null;c.signalCode=null;c.stdout=new PassThrough();c.stdin=new PassThrough();c.unref=()=>{c.unreferenced=true};c.kill=()=>{c.killed=true;return true};c.stdin.end=()=>{if(mode!=='stuck')setTimeout(()=>{c.exitCode=0;c.stdout.write(JSON.stringify({event:'result',status:mode==='bad'?'SECRET':'point_clear',birth:[123,456],frontmost:true,owned_matches:1,obscurers:0,start_monotonic_ns:1,end_monotonic_ns:2,title:'SECRET',url:'https://private'}));c.stdout.end();c.emit('exit');c.emit('close')},1)};return c;}
test('only fixed data reaches receipt and birth stays in memory',async()=>{
 const r=await guard(proc,bounds,{mode:'point',birth:[123,456],point:[400,400],spawnHelper:()=>child('ok'),stopTimeout:5});assert.deepEqual(r.birth,[123,456]);const p=publicSample(r);assert(!('birth' in p));assert(!JSON.stringify(p).includes('SECRET'));assert.equal(p.status,'point_clear');
});
test('untrusted status is rejected',async()=>{await assert.rejects(guard(proc,bounds,{mode:'initial',spawnHelper:()=>child('bad'),stopTimeout:5}),e=>e instanceof HandoffError&&e.code==='guard_protocol_invalid');});
test('unconfirmed helper exit requires guard retention',async()=>{const c=child('stuck');await assert.rejects(guard(proc,bounds,{mode:'initial',spawnHelper:()=>c,completionTimeout:5,stopTimeout:5}),ObserverNotExitedError);assert(c.killed&&c.unreferenced);});
test('invalid fixture never starts a guard',async()=>{await assert.rejects(guard({...proc,exitCode:0},bounds,{mode:'initial',spawnHelper:()=>{throw Error()}}),e=>e.code==='fixture_exited');});
