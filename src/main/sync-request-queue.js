'use strict';
// The queue runs complete merge-first operations. A 409 returns {retry:true}
// to re-enter the rotation, releasing its turn without completing its callers.
function createRequestQueue({scheduler,persist=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,makeError=message=>new Error(message)}={}) {
  const waiting=[];let running=null,timer=null,scheduled=false,drain=[];
  // Requests background work leaves for change checks (design 2026-11-02):
  // four a minute while Blanc is in front, one otherwise, none without them.
  // Only checks not yet sent in the trailing minute are kept back (the ones
  // sent are already in the window), and none during a 429 backoff.
  let checkShare=0;const checksSent=[];
  function checkRoom() {
    const t=now();while(checksSent.length&&t-checksSent[0]>=60000)checksSent.shift();
    return scheduler.snapshot().windowLimit<10?0:Math.max(0,checkShare-checksSent.length);
  }
  // 429s with no answered request between them (M16 §6.2: "Sync is busy;
  // retrying" after two). Other failures leave the count as it is.
  let consecutiveRateLimits=0;
  // windowFreesAt is when routine work can next send, after the requests
  // kept for a person and for change checks.
  const status=()=>({waiting:waiting.length,running:running?1:0,windowFreesAt:scheduler.windowFreesAt({reserve:1+checkRoom()}),backoff:scheduler.snapshot().windowLimit<10,consecutiveRateLimits});
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
    // any GET: it takes the first request background work may use, ahead of
    // the rotation, but never the one kept for a person (the reserve). Checks
    // sent while one waits join it, so they never pile up.
    const ahead=free||urgent?null:waiting.find(x=>x.ahead)??null;
    const reserve=urgent?false:ahead?true:1+checkRoom();
    if(!free&&!scheduler.canRequest({reserve})) {
      timer=setTimer(()=>{timer=null;wake();},Math.max(1,scheduler.windowFreesAt({reserve})-now()));return;
    }
    const op=free||urgent||ahead?waiting.splice(waiting.indexOf(free??urgent??ahead),1)[0]:pickRotation();
    if(!op){wake();return;}
    running=op;op.state='running';if(op.class==='C')checksSent.push(now());
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
      else {if(request.urgent)op.urgent=true;if(request.noGet)op.noGet=true;if(request.ahead)op.ahead=true;}
      op.waiters.push({resolve,onOutcome});
    });wake();return promise;
  }
  // Acceptance harness only: free the window and run whatever waited on it.
  function resetWindow() {scheduler.resetWindow();persist(scheduler.snapshot());wake();}
  const settled=()=>!running&&!waiting.length?Promise.resolve():new Promise(resolve=>drain.push(resolve));
  const runningSettled=()=>running?new Promise(resolve=>running.waiters.push({resolve:()=>resolve()})):Promise.resolve();
  const setCheckShare=n=>{const next=Math.max(0,Math.floor(n)||0);if(next!==checkShare){checkShare=next;wake();}};
  return {enqueue,cancelWhere,status,settled,runningSettled,resetWindow,setCheckShare};
}
module.exports={createRequestQueue};
