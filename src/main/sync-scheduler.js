'use strict';
const CLASSES=['I','S','F','R'];
const FIXED=['bookmarks','settings','session','icons','sends','closed','shared'];
function createScheduler({limit=10,windowMs=60000,log=[],nextClass='I',cursors={},now=Date.now,monotonic=()=>performance.now(),windowLimit=limit,backoffUntil=null}={}) {
  if(!Number.isInteger(limit)||limit<1||!Number.isFinite(windowMs)||windowMs<=0)throw new TypeError('Invalid sync request window');
  if(!Array.isArray(log))log=[];
  if(!Number.isFinite(windowLimit))windowLimit=limit;
  if(!Number.isFinite(backoffUntil))backoffUntil=null;
  let next=CLASSES.includes(nextClass)?nextClass:'I',items={...cursors},indexDue=false;
  let cap=Math.min(limit,Math.max(Math.min(3,limit),Math.floor(windowLimit))),recoverAt=null;
  const start=monotonic();
  // Restarts conservatively charge every recent/future wall timestamp for a
  // whole monotonic window. Neither a restart nor wall-clock rollback refills it.
  let events=log.filter(t=>Number.isFinite(t)&&(t>now() || now()-t<windowMs)).slice(-limit).map(wall=>({wall,at:start}));
  if(cap<limit)recoverAt=start+Math.max(0,(backoffUntil??now()+300000)-now())+60000;
  function refresh() {
    const t=monotonic();events=events.filter(e=>t-e.at<windowMs);
    if(recoverAt!==null && t>=recoverAt) {
      const steps=1+Math.floor((t-recoverAt)/60000);cap=Math.min(limit,cap+steps);
      recoverAt=cap===limit?null:recoverAt+steps*60000;
    }
  }
  const canRequest=()=>{refresh();return events.length<cap;};
  function windowFreesAt() {
    refresh();return events.length<cap?now():now()+Math.max(0,windowMs-(monotonic()-events[events.length-cap].at));
  }
  function record() {
    if(!canRequest())throw new RangeError('Sync request window exhausted');
    const event={wall:now(),at:monotonic()};events.push(event);return event;
  }
  // Charge through completion, not just reservation: persisting the log and
  // network latency can otherwise compress actual dispatch/arrival windows.
  function settle(event) {
    event.wall=now();event.at=monotonic();
    if(!events.includes(event))events.push(event);
  }
  function pick(work={}) {
    if(!canRequest())return null;
    for(let n=0;n<4;n++) {
      const kind=CLASSES[(CLASSES.indexOf(next)+n)%4];
      const candidates=kind==='I'?(work.I||indexDue?['spaces']:[]):[...new Set(work[kind]??[])];
      if(!candidates.length)continue;
      const order=kind==='F'?v=>{const i=FIXED.indexOf(v);return i===-1?FIXED.length:i;}:null;
      if(kind==='F')candidates.sort((a,b)=>order(a)-order(b) || (a<b?-1:a>b?1:0));
      // The caller supplies pending-first S order; otherwise lists are id
      // ordered. Remember a served id rather than an offset into a shrinking list.
      let i=candidates.indexOf(items[kind]);
      if(i<0 && kind!=='F' && typeof items[kind]==='string') {
        i=candidates.findIndex(v=>v>items[kind]);i=i<0?0:i;
      } else if(i<0 && kind==='F' && typeof items[kind]==='string') {
        i=candidates.findIndex(v=>order(v)>order(items[kind]));i=i<0?0:i;
      } else i=(i+1)%candidates.length;
      const item=candidates[i];items[kind]=item;next=CLASSES[(CLASSES.indexOf(kind)+1)%4];
      if(kind==='I')indexDue=false;
      return {class:kind,item};
    }
    return null;
  }
  // Acceptance harness only (sync.resetRequestWindowForTest): forget every
  // recorded request and any back-off, as if the window had just opened.
  function resetWindow() {events=[];cap=limit;recoverAt=null;}
  function onRateLimited() {refresh();cap=Math.max(Math.min(3,limit),Math.floor(cap/2));recoverAt=monotonic()+360000;}
  function snapshot() {refresh();return {log:events.map(e=>e.wall),nextClass:next,cursors:{...items},windowLimit:cap,
    backoffUntil:recoverAt===null?null:now()+Math.max(0,recoverAt-monotonic()-60000)};}
  return {canRequest,record,settle,next:pick,markIndexDue:()=>{indexDue=true;},onRateLimited,resetWindow,snapshot,windowFreesAt};
}
module.exports={createScheduler};
