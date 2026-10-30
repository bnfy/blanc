import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../../..');
const revision='85883b1afa11375e1300130914d6f40c5388af21';
const load=file=>{const source=execFileSync('git',['show',`${revision}:src/main/${file}.js`],{cwd:repo,encoding:'utf8'});const context={module:{exports:{}},queueMicrotask};vm.runInNewContext(source,context);return{api:context.module.exports,source}};
const scheduling=load('sync-scheduler'),queuing=load('sync-request-queue');
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
function harness(limit=10){
 const h={wall:1000000,mono:0,writes:0,fail:new Set(),runs:[],results:[],timer:null};
 h.scheduler=scheduling.api.createScheduler({limit,now:()=>h.wall,monotonic:()=>h.mono});
 h.queue=queuing.api.createRequestQueue({scheduler:h.scheduler,now:()=>h.wall,persist:()=>{if(h.fail.has(++h.writes))throw Error('disk-full')},setTimer:(task,delay)=>{h.timer={task,due:h.mono+delay};return h.timer},clearTimer:id=>{if(h.timer===id)h.timer=null}});
 h.request=(id,kind='F')=>({class:kind,item:id,generation:'account-a',run:async({attempt})=>{assert(h.writes>0);h.runs.push(`${id}:${attempt}`);return'ok'}});
 h.enqueue=(request,id)=>h.queue.enqueue(request).then(r=>h.results.push(`${id}:${r.error?.message??r.outcome??'null'}`));
 h.advance=async ms=>{h.wall+=ms;h.mono+=ms;if(h.timer&&h.timer.due<=h.mono){const {task}=h.timer;h.timer=null;task()}await flush()};
 return h;
}
const expected=[];
const summarize=(name,h)=>{const s=h.queue.status();expected.push(`${name}|${h.runs.join(',')}|${h.results.join(',')}|${h.writes}|${s.waiting}|${s.running}|${s.consecutiveRateLimits}`)};
{
 const h=harness(),first=h.request('settings'),duplicate=h.request('settings');
 first.onOutcome=()=>{throw Error('observer')};duplicate.run=()=>{throw Error('duplicate runner executed')};
 h.enqueue(first,'a');h.enqueue(duplicate,'b');await flush();summarize('coalesce',h);
}
{
 const h=harness();h.fail.add(1);h.enqueue(h.request('settings'),'a');await flush();h.enqueue(h.request('bookmarks'),'b');await flush();summarize('reservation-fault',h);
}
{
 const h=harness();h.fail.add(2);h.enqueue(h.request('settings'),'a');await flush();summarize('settlement-fault',h);
}
{
 const h=harness();h.fail.add(3);const request=h.request('settings');request.run=async()=>{h.runs.push('rate');throw Error('http-429')};h.enqueue(request,'a');await flush();summarize('backoff-fault',h);
}
{
 const h=harness();for(const [kind,id]of [['I','spaces'],['S','a'],['F','settings'],['R','peer']]){const request=h.request(id,kind);if(kind==='S')request.run=async({attempt})=>{h.runs.push(`a:${attempt}`);return attempt===0?{retry:true}:'ok'};h.enqueue(request,id)}await flush();summarize('retry-rotation',h);
}
{
 const h=harness();let changed=false,complete;const request=h.request('settings');request.cancelled=()=>changed?'account-changed':null;request.run=()=>new Promise(resolve=>{complete=resolve});h.enqueue(request,'a');await flush();changed=true;complete('must-not-apply');await flush();summarize('inflight-cancel',h);
}
{
 const h=harness(),old=h.request('settings'),next=h.request('settings');next.generation='account-b';h.enqueue(old,'old');h.enqueue(next,'new');h.queue.cancelWhere(r=>r.generation==='account-a','account-changed');await flush();summarize('queued-generation',h);
}
{
 const h=harness(),request=h.request('settings');request.cancelled=()=> 'disabled';h.enqueue(request,'a');await flush();summarize('pre-cancel',h);
}
{
 const h=harness(2);for(const id of ['bookmarks','settings','session'])h.enqueue(h.request(id),id);await flush();await h.advance(59999);await h.advance(1);summarize('rolling-window',h);
}
{
 const h=harness();const add=async error=>{const request=h.request('settings');request.run=async()=>{if(error)throw Error(error);return'ok'};h.enqueue(request,'a');await flush()};await add('http-429');await add('rate-limited');await add('http-500');await add('');await h.advance(60000);summarize('rate-status',h);
}
{
 const h=harness();for(const [id,priority]of [['a',1],['c',0],['b',0]]){const request=h.request(id,'S');request.priority=priority;h.enqueue(request,id)}await flush();summarize('pending-priority',h);
}
const [binary,resultPath]=process.argv.slice(2);assert(binary&&resultPath);
const lines=execFileSync(binary,{encoding:'utf8'}).trimEnd().split('\n'),native=JSON.parse(lines.pop());
assert.equal(native.status,'passed');assert.deepEqual(lines,expected);
const result={status:'passed',shippingSource:revision,differentialQueueScenarios:expected.length,nativeFailureAndLifecycleCases:native.nativeFailureAndLifecycleCases,referenceSha256:crypto.createHash('sha256').update(queuing.source).digest('hex'),nativeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'request_queue.h'))).digest('hex'),scope:'injected queue core only; actual disk, transport, OS vault and product integration remain unqualified'};
fs.writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
