import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';
const context=new AsyncLocalStorage();
export const measuredAttempt=(record,run)=>context.run({record,frame:null},run);
export async function phase(name,run){
 const parent=context.getStore();if(!parent)return run();
 const frame={children:0},start=performance.now(),timeoutsBefore=parent.record.timeouts.length;
 try{return await context.run({...parent,frame},run);}
 catch(error){
  // Frozen shipping helpers keep their own polling loop. Record its failed
  // enclosing phase without editing that loop or extending its deadline.
  // Nested instrumented polls already recorded their more precise duration.
  if(parent.record.timeouts.length===timeoutsBefore&&/\b(?:timeout|timed out)\b/i.test(error.message??''))
   parent.record.timeouts.push({kind:'phase-timeout',label:error.message,phase:name,
    elapsedMs:performance.now()-start,durationScope:'enclosing phase; upper bound on wait'});
  throw error;
 }
 finally{
  const elapsed=performance.now()-start;
  const total=parent.record.phases[name]??={count:0,totalMs:0,exclusiveMs:0};
  total.count++;total.totalMs+=elapsed;total.exclusiveMs+=Math.max(0,elapsed-frame.children);
  if(parent.frame)parent.frame.children+=elapsed;
 }
}
export function timedOut(kind,label,elapsedMs){
 context.getStore()?.record.timeouts.push({kind,label,elapsedMs});
}
export function timingSummary(attempts){
 const phases={},cases=new Map();
 for(const a of attempts){
  for(const [name,value] of Object.entries(a.phases)){
   const total=phases[name]??={count:0,totalMs:0,exclusiveMs:0};
   for(const key of Object.keys(total))total[key]+=value[key];
  }
  const c=cases.get(a.id)??{id:a.id,totalMs:0,attempts:0,timeouts:0};
  c.totalMs+=a.totalMs;c.attempts++;c.timeouts+=a.timeouts.length;cases.set(a.id,c);
 }
 return {schemaVersion:1,units:'milliseconds',
  accounting:'Phase totals include nested phases; exclusiveMs excludes them. Timeout and retry totals are annotations within attempts, not additional wall time.',
  totals:{attempts:attempts.length,cases:cases.size,totalMs:attempts.reduce((n,a)=>n+a.totalMs,0),phases,
   retries:{count:attempts.filter(a=>a.attempt>1).length,totalMs:attempts.filter(a=>a.attempt>1).reduce((n,a)=>n+a.totalMs,0)},
   timeouts:{count:attempts.reduce((n,a)=>n+a.timeouts.length,0),totalMs:attempts.flatMap(a=>a.timeouts).reduce((n,t)=>n+t.elapsedMs,0)}},
  slowestCases:[...cases.values()].sort((a,b)=>b.totalMs-a.totalMs).slice(0,20),attempts};
}
