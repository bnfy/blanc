import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(dir,'../../../..');
const revision='85883b1afa11375e1300130914d6f40c5388af21';
const source=execFileSync('git',['show',`${revision}:src/main/sync-scheduler.js`],{cwd:repo,encoding:'utf8'});
const context={module:{exports:{}}};vm.runInNewContext(source,context);
const {createScheduler}=context.module.exports;
let wall=1000000,mono=10000,limit=10,windowMs=60000,saved,records=[];
const make=state=>createScheduler({...state,limit,windowMs,now:()=>wall,monotonic:()=>mono});
let scheduler=make();const commands=[],expected=[];
function run(line){
 commands.push(line);const [op,...args]=line.split(' ');let value='';
 if(op==='init'){[limit,windowMs]=args.map(Number);scheduler=make();records=[];}
 else if(op==='clock')[wall,mono]=args.map(Number);
 else if(op==='can')value=String(scheduler.canRequest());
 else if(op==='free')value=String(scheduler.windowFreesAt());
 else if(op==='record'){let event=null;try{event=scheduler.record()}catch(error){if(!(error?.name==='RangeError'))throw error}records.push(event);value=String(!!event);}
 else if(op==='settle')scheduler.settle(records[Number(args[0])]);
 else if(op==='rate')scheduler.onRateLimited();
 else if(op==='mark')scheduler.markIndexDue();
 else if(op==='save')saved=scheduler.snapshot();
 else if(op==='restore'){scheduler=make(saved);records=[];}
 else if(op==='pick'){
  const work={I:args[0]==='1'};let at=1;
  for(const kind of ['S','F','R']){const count=Number(args[at++]);work[kind]=args.slice(at,at+count);at+=count;}
  const selected=scheduler.next(work);value=selected?`${selected.class}:${selected.item}`:'-';
 } else assert.equal(op,'snapshot');
 const s=scheduler.snapshot();expected.push(`${op}|${value}|log=${s.log.join(',')};next=${s.nextClass};cap=${s.windowLimit};backoff=${s.backoffUntil??'-'}${['I','S','F','R'].map(k=>`;${k}=${s.cursors[k]??''}`).join('')}`);
}
const work='pick 1 3 c a b 4 shared settings bookmarks settings 2 r2 r1';
run('init 10 60000');
for(let i=0;i<10;i++){run(work);run('record');run(`clock ${1000000+i*10} ${10000+i*10}`);run(`settle ${i}`);}
run('record');run('can');run('free');run('clock 900000 70089');run('can');run('clock 900001 70090');run('can');
run('rate');run('rate');run('save');run('clock 800000 0');run('restore');run('can');run('free');
run('clock 860000 60000');run('can');run('clock 1220000 420000');run('snapshot');run('clock 1600000 800000');run('snapshot');
run('init 2 60000');run('rate');run('record');run('clock 1600001 860001');run('can');run('settle 0');run('can');run('free');
run('init 20 60000');run('snapshot');run('init 10 60000');run('mark');run('pick 0 0 0 0');run('pick 0 0 0 0');
for(const line of ['pick 0 3 c a b 0 0','pick 0 2 d b 0 0','pick 0 0 3 shared bookmarks settings 0','pick 0 0 2 shared session 0'])run(line);
run('save');let seed=179331,wallNow=wall,monoNow=mono;
const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
for(let i=0;i<1000;i++){
 const op=random(9);
 if(op===0){wallNow+=random(200001)-100000;monoNow+=random(90001);run(`clock ${wallNow} ${monoNow}`);}
 else if(op===1)run('record');else if(op===2)run('rate');else if(op===3)run('save');
 else if(op===4)run('restore');else if(op===5)run('mark');else if(op===6)run('free');
 else if(op===7)run('can');else run(i%2?work:'pick 0 2 b d 3 icons session z 2 r3 r2');
}
const [binary,resultPath]=process.argv.slice(2);assert(binary&&resultPath,'binary and result path required');
const actual=execFileSync(binary,{input:commands.join('\n')+'\n',encoding:'utf8'}).trimEnd().split('\n');
assert.equal(actual.length,expected.length);
for(let i=0;i<expected.length;i++)assert.equal(actual[i],expected[i],`operation ${i}: ${commands[i]}`);
const result={status:'passed',shippingSource:revision,operations:commands.length,referenceSha256:crypto.createHash('sha256').update(source).digest('hex'),nativeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'request_scheduler.h'))).digest('hex'),scope:'native scheduling core differential checks only; no transport, credentials, queue persistence or product Sync enabled'};
fs.writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
