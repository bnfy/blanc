'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
let createScheduler;try{({createScheduler}=require('../../src/main/sync-scheduler'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const all={I:true,S:['s1','s2'],F:['bookmarks','settings','session','icons','sends','closed','shared'],R:Array.from({length:25},(_,i)=>'r'+String(i).padStart(2,'0'))};
function clock(options={}) {let t=0,wall=1800000000000;return {now:()=>wall+t,monotonic:()=>t,advance:n=>{t+=n;},back:n=>{wall-=n;},...options};}
test('rolling request window holds over an hour, including restart and backwards wall clock',()=>{
  assert.equal(typeof createScheduler,'function');const c=clock();let s=createScheduler(c);const requests=[];
  for(let t=0;t<3600000;t+=1000) {
    if(t===120000){c.back(120000);s=createScheduler({...c,...s.snapshot()});}
    while(s.canRequest()){s.record();requests.push(t);}
    assert.ok(requests.filter(x=>t-x<60000).length<=10);c.advance(1000);
  }
  assert.ok(requests.length>500,'the bound cannot be met by suppressing sync');
});
test('two and three devices stay within 20 and 30 GETs in fixed minute buckets',()=>{
  const c=clock(),devices=Array.from({length:3},()=>createScheduler(c)),buckets=new Map();
  for(let t=0;t<360000;t+=997) {
    for(let n=0;n<devices.length;n++)while(devices[n].canRequest()){devices[n].record();const k=Math.floor(c.now()/60000);const v=buckets.get(k)??[0,0,0];v[n]++;buckets.set(k,v);}
    c.advance(997);
  }
  for(const v of buckets.values()){assert.ok(v[0]+v[1]<=20);assert.ok(v.reduce((a,b)=>a+b,0)<=30);}
});
test('one-request passes with repeated focus events preserve class and item rotation across restart',()=>{
  const c=clock();let s=createScheduler({...c,limit:1});const classes=[],reconciled=new Set();
  for(let n=0;n<1000;n++) {
    s.markIndexDue();const next=s.next(all);assert.ok(next);classes.push(next.class);if(next.class==='R')reconciled.add(next.item);
    s.record();c.advance(60000);if(n===500)s=createScheduler({...c,...s.snapshot(),limit:1});
  }
  assert.deepEqual(classes.slice(0,8),['I','S','F','R','I','S','F','R']);
  assert.equal(classes.filter(x=>x==='R').length,250);assert.equal(reconciled.size,25);
});
test('empty classes yield their share and retries retain the Space cursor',()=>{
  const s=createScheduler(clock());
  assert.deepEqual(s.next({F:['sends']}),{class:'F',item:'sends'});s.record();
  assert.deepEqual(s.next({S:['space-a','space-b']}),{class:'S',item:'space-a'});s.record();
  assert.deepEqual(s.next({S:['space-a','space-b']}),{class:'S',item:'space-b'});
});
test('backoff lowers the limit to five then three and recovers after clean minutes',()=>{
  const c=clock(),s=createScheduler(c);s.onRateLimited();assert.equal(s.snapshot().windowLimit,5);
  s.onRateLimited();assert.equal(s.snapshot().windowLimit,3);
  for(let i=0;i<3;i++)s.record();assert.equal(s.canRequest(),false);
  c.advance(300000);assert.equal(s.snapshot().windowLimit,3);
  c.advance(60000);assert.equal(s.snapshot().windowLimit,4);
  c.advance(6*60000);assert.equal(s.snapshot().windowLimit,10);
});
test('every reconciliation item is reached within an hour at the normal and floor rates',()=>{
  for(const backoff of [false,true]) {
    const c=clock(),s=createScheduler(c),seen=new Set();if(backoff){s.onRateLimited();s.onRateLimited();}
    for(let t=0;t<3600000 && seen.size<25;t+=1000) {while(s.canRequest()){const x=s.next(all);s.record();if(x.class==='R')seen.add(x.item);}c.advance(1000);}
    assert.equal(seen.size,25);
  }
});
test('damaged persisted scheduler metadata cannot permanently wedge sync',()=>{
  let s;const c=clock();
  assert.doesNotThrow(()=>{s=createScheduler({...c,log:{invalid:true},windowLimit:'invalid',nextClass:'invalid',cursors:null});});
  for(let n=0;n<10;n++)s.record();assert.equal(s.canRequest(),false);
  c.advance(60000);assert.equal(s.canRequest(),true);
});
test('resetWindow forgets every recorded request and any back-off, and restart charging after it',()=>{
  const c=clock(),s=createScheduler(c);
  while(s.canRequest())s.record();
  s.onRateLimited();
  assert.equal(s.canRequest(),false);
  s.resetWindow();
  assert.equal(s.canRequest(),true);
  assert.equal(s.windowFreesAt(),c.now());
  assert.deepEqual(s.snapshot().log,[]);
  assert.equal(s.snapshot().windowLimit,10);
  assert.equal(s.snapshot().backoffUntil,null);
  let n=0;while(s.canRequest()){s.record();n++;}assert.equal(n,10);
});
