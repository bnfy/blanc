'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
let createScheduler,createRequestQueue;
try{({createScheduler}=require('../../src/main/sync-scheduler'));({createRequestQueue}=require('../../src/main/sync-request-queue'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const tick=()=>new Promise(r=>setImmediate(r));
function setup(limit=10) {
  let t=0,wake;const scheduler=createScheduler({limit,now:()=>1800000000000+t,monotonic:()=>t});
  const queue=createRequestQueue({scheduler,now:()=>1800000000000+t,setTimer:fn=>{wake=fn;return 1;},clearTimer:()=>{wake=null;}});
  return {scheduler,queue,advance:async n=>{t+=n;const fn=wake;wake=null;fn?.();await tick();}};
}
test('requested work coalesces only before execution and every caller hears its own outcome once',async()=>{
  assert.equal(typeof createRequestQueue,'function');const {queue}=setup();let runs=0,callbacks=0;
  const op={class:'F',item:'sends',run:async()=>++runs,onOutcome:()=>callbacks++};
  const results=await Promise.all([queue.enqueue(op),queue.enqueue(op)]);
  assert.equal(runs,1);assert.equal(callbacks,2);assert.deepEqual(results.map(x=>x.outcome),[1,1]);
});
test('a mutation arriving during a fetch gets a later operation instead of the old fetch result',async()=>{
  const {queue}=setup();let release,ran=0;
  const first=queue.enqueue({class:'F',item:'sends',run:()=>new Promise(r=>{release=()=>r('old');})});await tick();
  const next=queue.enqueue({class:'F',item:'sends',run:async()=>{ran++;return 'new';}});
  release();assert.equal((await first).outcome,'old');assert.equal((await next).outcome,'new');assert.equal(ran,1);
});
test('an exhausted window makes a send wait rather than fail and exposes its next opportunity',async()=>{
  const {scheduler,queue,advance}=setup();for(let i=0;i<10;i++)scheduler.record();let done=false,ran=0;
  const send=queue.enqueue({class:'F',item:'sends',run:async()=>{ran++;return 'sent';}}).then(x=>{done=true;return x;});
  await tick();assert.equal(done,false);assert.equal(queue.status().waiting,1);assert.ok(queue.status().windowFreesAt>1800000000000);
  await advance(60000);assert.equal((await send).outcome,'sent');assert.equal(ran,1);
});
test('generation, disable, suspended, consent-off and unavailable cancel waiting work without running it',async()=>{
  for(const reason of ['generation','disabled','suspended','consent-off','unavailable']) {
    const {scheduler,queue}=setup(1);scheduler.record();let ran=false,outcomes=0;
    const op=queue.enqueue({class:'S',item:'s1',run:()=>{ran=true;},onOutcome:()=>outcomes++});await tick();
    queue.cancelWhere(()=>true,reason);const result=await op;
    assert.equal(result.error.message,'cancelled:'+reason);assert.equal(ran,false);assert.equal(outcomes,1);await queue.settled();
  }
});
test('drain waits for a PUT already on the wire while cancellation removes the queued PUT',async()=>{
  const {queue}=setup();const events=[];let release;
  const wire=queue.enqueue({class:'S',item:'s1',run:()=>new Promise(r=>{release=()=>{events.push('wire-put');r();};})});await tick();
  const waiting=queue.enqueue({class:'S',item:'s2',run:()=>events.push('queued-put')});
  queue.cancelWhere(()=>true,'suspended');let drained=false;const drain=queue.settled().then(()=>{drained=true;events.push('delete');});
  await tick();assert.equal(drained,false);release();await Promise.all([wire,waiting,drain]);assert.deepEqual(events,['wire-put','delete']);
});
test('a 409 retry re-enters the fair Space turn before the original caller completes',async()=>{
  const {queue}=setup();const events=[];
  const first=queue.enqueue({class:'S',item:'s1',run:async({attempt})=>{events.push('s'+attempt);return attempt===0?{retry:true}: 'stored';}});
  const fixed=queue.enqueue({class:'F',item:'sends',run:async()=>{events.push('fixed');}});
  assert.equal((await first).outcome,'stored');await fixed;assert.deepEqual(events,['s0','fixed','s1']);
});
test('a request-log persistence failure prevents the GET and leaves the queue drainable',async()=>{
  const scheduler=createScheduler();let ran=false;
  const queue=createRequestQueue({scheduler,persist:()=>{throw new Error('disk full');}});
  const op=queue.enqueue({class:'F',item:'settings',run:()=>{ran=true;}});
  const result=await Promise.race([op,new Promise(r=>setTimeout(()=>r({error:new Error('queue wedged')}),30))]);
  assert.equal(result.error.message,'disk full');assert.equal(ran,false);assert.equal(queue.status().running,0);
});
test('failed persistence of a 429 backoff still completes every caller and drains',async()=>{
  const scheduler=createScheduler();let writes=0,callbacks=0;
  const queue=createRequestQueue({scheduler,persist:()=>{if(++writes===2)throw new Error('disk full during backoff');}});
  const op=queue.enqueue({class:'F',item:'settings',run:()=>{throw new Error('http-429');},onOutcome:()=>callbacks++});
  const result=await Promise.race([op,new Promise(r=>setTimeout(()=>r({error:new Error('queue wedged')}),50))]);
  assert.equal(result.error.message,'disk full during backoff');assert.equal(callbacks,1);
  assert.equal(queue.status().running,0);assert.equal(scheduler.snapshot().windowLimit,5);
  await queue.settled();
});
test('a fractional persisted window limit is repaired and waiting requests eventually run',async()=>{
  let t=0,wake;const scheduler=createScheduler({windowLimit:3.5,now:()=>t,monotonic:()=>t});
  const queue=createRequestQueue({scheduler,now:()=>t,setTimer:fn=>{wake=fn;return 1;},clearTimer:()=>{wake=null;}});
  let runs=0;
  const calls=Array.from({length:5},(_,n)=>queue.enqueue({class:'F',item:'item'+n,run:()=>++runs}));
  await tick();assert.equal(runs,3);assert.equal(scheduler.snapshot().windowLimit,3);
  t+=60000;wake?.();await tick();await Promise.all(calls);assert.equal(runs,5);await queue.settled();
});
test('continuous requested work and focus refreshes cannot starve any class or item',async()=>{
  const {scheduler,queue,advance}=setup(1),events=[],calls=[];let outcomes=0;
  const work={I:['spaces'],S:['s1','s2'],F:['bookmarks','settings','session','icons','sends','closed','shared'],R:Array.from({length:25},(_,i)=>'r'+String(i).padStart(2,'0'))};
  for(let n=0;n<1000;n++) {
    scheduler.markIndexDue();
    for(const [kind,items] of Object.entries(work))for(const item of items)calls.push(queue.enqueue({class:kind,item,run:async()=>{events.push({kind,item});return item;},onOutcome:()=>outcomes++}));
    await advance(60000);
  }
  assert.deepEqual(events.slice(0,8).map(x=>x.kind),['I','S','F','R','I','S','F','R']);
  assert.equal(events.filter(x=>x.kind==='R').length,250);
  assert.equal(new Set(events.filter(x=>x.kind==='R').map(x=>x.item)).size,25);
  assert.equal(new Set(events.filter(x=>x.kind==='F').map(x=>x.item)).size,7);
  queue.cancelWhere(()=>true,'disabled');await Promise.all(calls);assert.equal(outcomes,calls.length);
});
