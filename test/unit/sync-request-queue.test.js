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
test('variable persistence latency cannot compress actual GET dispatches into one window',async()=>{
 let t=0,wake,writes=0;const sent=[],scheduler=createScheduler({limit:1,now:()=>t,monotonic:()=>t});
 const queue=createRequestQueue({scheduler,now:()=>t,persist:()=>{if(++writes===1)t+=25;},setTimer:fn=>{wake=fn;return 1;},clearTimer:()=>{wake=null;}});
 const request=()=>queue.enqueue({class:'F',item:'settings',run:async()=>{sent.push(t);}});
 await request();const second=request();await tick();t=60000;wake?.();await tick();assert.equal(sent.length,1);
 t=60025;wake?.();await second;assert.deepEqual(sent,[25,60025]);
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
test('rate limits count only in a row: another error keeps the count, an answered request clears it',async()=>{
  const {queue,advance}=setup();const fail=message=>()=>{throw new Error(message);};
  assert.equal(queue.status().consecutiveRateLimits,0);
  await queue.enqueue({class:'F',item:'settings',run:fail('http-429')});
  assert.equal(queue.status().consecutiveRateLimits,1);
  await queue.enqueue({class:'F',item:'bookmarks',run:fail('rate-limited')});
  assert.equal(queue.status().consecutiveRateLimits,2);
  await queue.enqueue({class:'F',item:'session',run:fail('http-500')});
  assert.equal(queue.status().consecutiveRateLimits,2);
  // Two 429s shrank the window to three requests: the answered one waits for it.
  const answered=queue.enqueue({class:'S',item:'s1',run:async()=>'stored'});
  await advance(60000);assert.equal((await answered).outcome,'stored');
  assert.equal(queue.status().consecutiveRateLimits,0);
  await queue.settled();
});
test('failed persistence of a 429 backoff still completes every caller and drains',async()=>{
  const scheduler=createScheduler();let writes=0,callbacks=0;
  const queue=createRequestQueue({scheduler,persist:()=>{if(++writes===3)throw new Error('disk full during backoff');}});
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
test('resetWindow lets a request waiting on an exhausted window run now and persists the empty log',async()=>{
  let t=0,wake,persisted=[];const scheduler=createScheduler({limit:10,now:()=>1800000000000+t,monotonic:()=>t});
  const queue=createRequestQueue({scheduler,persist:s=>persisted.push(s),now:()=>1800000000000+t,setTimer:fn=>{wake=fn;return 1;},clearTimer:()=>{wake=null;}});
  for(let i=0;i<10;i++)scheduler.record();let ran=0;
  const send=queue.enqueue({class:'F',item:'sends',run:async()=>{ran++;return 'sent';}});
  await tick();assert.equal(queue.status().waiting,1);assert.equal(ran,0);
  queue.resetWindow();
  assert.deepEqual(persisted.at(-1).log,[]);assert.equal(persisted.at(-1).backoffUntil,null);
  await tick();await tick();assert.equal((await send).outcome,'sent');assert.equal(ran,1);assert.equal(queue.status().waiting,0);
});
test('background work leaves the window\'s last request for an urgent one, which skips the rotation',async()=>{
  const {scheduler,queue}=setup();const order=[];
  const background=Array.from({length:12},(_,i)=>queue.enqueue({class:'F',item:'settings'+i,run:async()=>{order.push('F'+i);}}));
  await tick();for(let i=0;i<12;i++)await tick();
  assert.equal(order.length,9,'background stops one short of the 10-request window');
  assert.equal(scheduler.canRequest({reserve:true}),false);assert.equal(scheduler.canRequest(),true);
  const before=scheduler.snapshot().nextClass;
  const urgent=await queue.enqueue({class:'I',item:'spaces',generation:'preview:1',urgent:true,run:async()=>{order.push('I');return 'fresh';}});
  assert.equal(urgent.outcome,'fresh');assert.equal(order.at(-1),'I');assert.equal(order.length,10);
  assert.equal(scheduler.snapshot().nextClass,before,'the urgent request leaves the rotation where it was');
  assert.equal(scheduler.canRequest(),false,'the window itself never grows');
  void background;
});
test('an urgent request goes ahead of waiting background work',async()=>{
  const {scheduler,queue}=setup();for(let i=0;i<9;i++)scheduler.record();const order=[];
  const waitingWork=queue.enqueue({class:'S',item:'s1',run:async()=>{order.push('S');}});
  const urgent=queue.enqueue({class:'I',item:'spaces',generation:'preview:1',urgent:true,run:async()=>{order.push('I');}});
  await urgent;assert.deepEqual(order,['I']);assert.equal(queue.status().waiting,1);void waitingWork;
});
test('a small or backed-off window keeps every request for background work',()=>{
  let t=0;const scheduler=createScheduler({limit:3,now:()=>t,monotonic:()=>t});
  scheduler.record();scheduler.record();assert.equal(scheduler.canRequest({reserve:true}),true);scheduler.record();assert.equal(scheduler.canRequest(),false);
});
test('an upload that downloads nothing runs on a full window and is not charged; its retry is',async()=>{
  const {scheduler,queue,advance}=setup();for(let i=0;i<10;i++)scheduler.record();const order=[];
  const routine=queue.enqueue({class:'F',item:'settings',run:async()=>{order.push('F');}});
  const upload=queue.enqueue({class:'S',item:'s1',noGet:true,run:async({attempt})=>{order.push('S'+attempt);return attempt===0?{retry:true}:'stored';}});
  await tick();await tick();
  assert.deepEqual(order,['S0'],'the first upload goes at once, ahead of work waiting on the window');
  assert.equal(scheduler.snapshot().log.length,10,'it is not charged to the window');
  await tick();assert.deepEqual(order,['S0'],'the retry downloads first, so it waits for the window like any request');
  await advance(60000);assert.equal((await upload).outcome,'stored');await routine;
  assert.deepEqual(order.slice(1).sort(),['F','S1']);assert.equal(scheduler.snapshot().log.length,2,'the retry is charged');
});
test('a change check runs ahead of waiting rotation work',async()=>{
  const {queue}=setup();const order=[];
  const routine=queue.enqueue({class:'F',item:'settings',run:async()=>{order.push('F');}});
  const check=queue.enqueue({class:'C',item:'versions',ahead:true,run:async()=>{order.push('C');return 'named';}});
  assert.equal((await check).outcome,'named');await routine;assert.deepEqual(order,['C','F']);
});
test('on a full window a change check waits for the first free request, ahead of rotation work, and leaves the reserve',async()=>{
  const {scheduler,queue,advance}=setup();for(let i=0;i<9;i++)scheduler.record();const order=[];
  const routine=queue.enqueue({class:'F',item:'settings',run:async()=>{order.push('F');}});
  const check=queue.enqueue({class:'C',item:'versions',ahead:true,run:async()=>{order.push('C');}});
  await tick();assert.deepEqual(order,[]);assert.equal(scheduler.canRequest(),true,'the reserved request is still free for the sheet');
  const again=queue.enqueue({class:'C',item:'versions',ahead:true,run:async()=>{order.push('C2');}});
  await advance(60000);await check;await again;await routine;
  assert.deepEqual(order,['C','F'],'the check goes first, and a second one joined it');
});
test('with a check share, background work leaves that many requests for checks',async()=>{
  const {scheduler,queue}=setup();queue.setCheckShare(4);const order=[];
  for(let i=0;i<8;i++)queue.enqueue({class:'F',item:'s'+i,run:async()=>{order.push('F');}});
  for(let i=0;i<20;i++)await tick();
  assert.equal(order.length,5,'background stops at five: one kept for the sheet, four for checks');
  const check=await queue.enqueue({class:'C',item:'versions',ahead:true,run:async()=>{order.push('C');}});void check;
  assert.equal(order.at(-1),'C','a check still finds room');assert.equal(scheduler.canRequest({reserve:true}),true);
});
test('with a check every 15 s, routine work still gets five requests a minute',async()=>{
  const {queue,advance}=setup();queue.setCheckShare(4);const done=[];
  for(let i=0;i<40;i++)queue.enqueue({class:'F',item:'s'+i,run:async()=>{done.push(i);}});
  let at=0;const perMinute=[0,0,0,0];
  for(let s=0;s<240;s++){
    if(s%15===0)queue.enqueue({class:'C',item:'versions',generation:'check:'+s,ahead:true,run:async()=>{}});
    const before=done.length;await advance(1000);at++;perMinute[Math.floor(s/60)]+=done.length-before;
  }
  void at;assert.ok(perMinute.slice(1).every(n=>n>=5),`routine requests per minute: ${perMinute}`);
});
test('a fetch a check asked for keeps its place ahead when it joins a waiting request',async()=>{
  const {scheduler,queue,advance}=setup();for(let i=0;i<9;i++)scheduler.record();const order=[];
  queue.enqueue({class:'F',item:'bookmarks',run:async()=>{order.push('bookmarks');}});
  queue.enqueue({class:'F',item:'shared',run:async()=>{order.push('shared');}});
  const asked=queue.enqueue({class:'F',item:'shared',ahead:true,run:async()=>{order.push('shared');}});
  await advance(60000);await asked;assert.equal(order[0],'shared');
});
test('during a 429 backoff nothing is kept for checks',async()=>{
  const {scheduler,queue}=setup();queue.setCheckShare(4);scheduler.onRateLimited();const order=[];
  for(let i=0;i<8;i++)queue.enqueue({class:'F',item:'s'+i,run:async()=>{order.push(i);}});
  for(let i=0;i<20;i++)await tick();
  assert.equal(order.length,4,'the reduced window of five, less the request kept for a person');
});
