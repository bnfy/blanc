'use strict';
// The queue runs complete merge-first operations. A 409 returns {retry:true}
// to re-enter the rotation, releasing its turn without completing its callers.
function createRequestQueue({scheduler,persist=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,makeError=message=>new Error(message)}={}) {
  const waiting=[];let running=null,timer=null,scheduled=false,drain=[];
  const status=()=>({waiting:waiting.length,running:running?1:0,windowFreesAt:scheduler.windowFreesAt(),backoff:scheduler.snapshot().windowLimit<10});
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
  async function pump() {
    if(running)return;
    for(let i=waiting.length-1;i>=0;i--) {
      const reason=waiting[i].cancelled?.();
      if(reason)complete(waiting.splice(i,1)[0],null,makeError('cancelled:'+reason));
    }
    if(!waiting.length){settleDrain();return;}
    if(!scheduler.canRequest()) {
      timer=setTimer(()=>{timer=null;wake();},Math.max(1,scheduler.windowFreesAt()-now()));return;
    }
    const work={I:waiting.some(x=>x.class==='I'),S:[],F:[],R:[]};
    for(const op of waiting)if(op.class!=='I')work[op.class].push(op.item);
    for(const k of ['S','R'])work[k].sort((a,b)=>{
      const pa=waiting.find(x=>x.class===k&&x.item===a)?.priority??1;
      const pb=waiting.find(x=>x.class===k&&x.item===b)?.priority??1;
      return pa-pb || (a<b?-1:a>b?1:0);
    });
    const chosen=scheduler.next(work);
    const pos=waiting.findIndex(x=>x.class===chosen?.class && x.item===chosen?.item);
    if(pos<0){wake();return;}
    const op=waiting.splice(pos,1)[0];running=op;op.state='running';
    try {
      scheduler.record();persist(scheduler.snapshot());
      const outcome=await op.run({attempt:op.attempt});
      const cancelled=op.cancelled?.();
      if(cancelled)complete(op,null,makeError('cancelled:'+cancelled));
      else if(outcome?.retry){op.attempt++;op.state='waiting';waiting.push(op);}
      else complete(op,outcome,null);
    } catch(error) {
      let failure=error;
      if(['rate-limited','http-429'].includes(error.message)) {
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
      op.waiters.push({resolve,onOutcome});
    });wake();return promise;
  }
  const settled=()=>!running&&!waiting.length?Promise.resolve():new Promise(resolve=>drain.push(resolve));
  const runningSettled=()=>running?new Promise(resolve=>running.waiters.push({resolve:()=>resolve()})):Promise.resolve();
  return {enqueue,cancelWhere,status,settled,runningSettled};
}
module.exports={createRequestQueue};
