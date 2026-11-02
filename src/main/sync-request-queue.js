'use strict';
// The queue runs complete merge-first operations. A 409 returns {retry:true}
// to re-enter the rotation, releasing its turn without completing its callers.
function createRequestQueue({scheduler,persist=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,makeError=message=>new Error(message)}={}) {
  const waiting=[];let running=null,timer=null,scheduled=false,drain=[];
  // 429s with no answered request between them (M16 §6.2: "Sync is busy;
  // retrying" after two). Other failures leave the count as it is.
  let consecutiveRateLimits=0;
  const status=()=>({waiting:waiting.length,running:running?1:0,windowFreesAt:scheduler.windowFreesAt({reserve:true}),backoff:scheduler.snapshot().windowLimit<10,consecutiveRateLimits});
  function complete(op,outcome,error) {
    op.state=error?.message?.startsWith('cancelled:')?'cancelled':'done';
    for(const waiter of op.waiters) {
      try {waiter.onOutcome?.(outcome,error);}catch { /* observers cannot wedge the drain barrier */ }
      waiter.resolve({outcome,error});
    }
  }
  function settleDrain() {if(!running&&!waiting.length){for(const resolve of drain)resolve();drain=[];}}
  function wake() {
    if(scheduled||running)return;
    if(timer!==null){clearTimer(timer);timer=null;}
    scheduled=true;queueMicrotask(()=>{scheduled=false;pump().catch(()=>{});});
  }
  function cancelWhere(predicate,reason) {
    for(let i=waiting.length-1;i>=0;i--)if(predicate(waiting[i]))complete(waiting.splice(i,1)[0],null,makeError('cancelled:'+reason));
    settleDrain();wake();
  }
  function pickRotation() {
    const work={I:waiting.some(x=>x.class==='I'),S:[],F:[],R:[]};
    for(const op of waiting)if(op.class!=='I')work[op.class].push(op.item);
    for(const k of ['S','R'])work[k].sort((a,b)=>{
      const pa=waiting.find(x=>x.class===k&&x.item===a)?.priority??1;
      const pb=waiting.find(x=>x.class===k&&x.item===b)?.priority??1;
      return pa-pb || (a<b?-1:a>b?1:0);
    });
    const chosen=scheduler.next(work);
    const pos=waiting.findIndex(x=>x.class===chosen?.class && x.item===chosen?.item);
    return pos<0?null:waiting.splice(pos,1)[0];
  }
  async function pump() {
    if(running)return;
    for(let i=waiting.length-1;i>=0;i--) {
      const reason=waiting[i].cancelled?.();
      if(reason)complete(waiting.splice(i,1)[0],null,makeError('cancelled:'+reason));
    }
    if(!waiting.length){settleDrain();return;}
    // An upload that downloads nothing first (a Space no device has yet)
    // costs the window nothing, so it never waits on it; a 409 sends it
    // back to download and merge, which is charged like any request.
    const free=waiting.find(x=>x.noGet&&!x.attempt)??null;
    // A request a person is waiting on goes first, outside the class
    // rotation, and leaves the rotation's cursors where they were.
    const urgent=free?null:waiting.find(x=>x.urgent)??null;
    // A change check goes next, also outside the rotation and charged like
    // any GET. It never waits for the window or takes the reserved request:
    // with no room it is skipped, and the next interval sends another.
    const check=free||urgent?null:waiting.find(x=>x.skipIfBusy)??null;
    if(check&&!scheduler.canRequest({reserve:true})){complete(waiting.splice(waiting.indexOf(check),1)[0],{skipped:true},null);settleDrain();wake();return;}
    if(!free&&!check&&!scheduler.canRequest({reserve:!urgent})) {
      timer=setTimer(()=>{timer=null;wake();},Math.max(1,scheduler.windowFreesAt({reserve:!urgent})-now()));return;
    }
    const op=free||urgent||check?waiting.splice(waiting.indexOf(free??urgent??check),1)[0]:pickRotation();
    if(!op){wake();return;}
    running=op;op.state='running';
    try {
      const reservation=op===free?null:scheduler.record();if(reservation)persist(scheduler.snapshot());
      let outcome;
      try {outcome=await op.run({attempt:op.attempt});}
      finally {if(reservation){scheduler.settle(reservation);persist(scheduler.snapshot());}}
      consecutiveRateLimits=0;
      const cancelled=op.cancelled?.();
      if(cancelled)complete(op,null,makeError('cancelled:'+cancelled));
      else if(outcome?.retry){op.attempt++;op.state='waiting';waiting.push(op);}
      else complete(op,outcome,null);
    } catch(error) {
      let failure=error;
      if(['rate-limited','http-429'].includes(error.message)) {
        consecutiveRateLimits++;
        scheduler.onRateLimited();
        try {persist(scheduler.snapshot());}catch(persistError){failure=persistError;}
      }
      const reason=op.cancelled?.();complete(op,null,reason?makeError('cancelled:'+reason):failure);
    } finally {running=null;settleDrain();wake();}
  }
  function enqueue({onOutcome,...request}) {
    const promise=new Promise(resolve=>{
      let op=waiting.find(x=>x.class===request.class && x.item===request.item && x.generation===request.generation);
      if(!op){op={...request,state:'waiting',attempt:0,waiters:[]};waiting.push(op);}
      else {if(request.urgent)op.urgent=true;if(request.noGet)op.noGet=true;}
      op.waiters.push({resolve,onOutcome});
    });wake();return promise;
  }
  // Acceptance harness only: free the window and run whatever waited on it.
  function resetWindow() {scheduler.resetWindow();persist(scheduler.snapshot());wake();}
  const settled=()=>!running&&!waiting.length?Promise.resolve():new Promise(resolve=>drain.push(resolve));
  const runningSettled=()=>running?new Promise(resolve=>running.waiters.push({resolve:()=>resolve()})):Promise.resolve();
  return {enqueue,cancelWhere,status,settled,runningSettled,resetWindow};
}
module.exports={createRequestQueue};
