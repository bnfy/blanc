'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
let m={};try{m=require('../../src/main/synced-closed-model');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const day=86400000,now=1800000000000;
const item=(n,closedAt=now-n)=>({id:'tab-'+n,url:'https://example.test/'+n,title:'T'+n,closedAt,spaceId:null});
const device=(items,updatedAt=now)=>({name:'Mac',platform:'darwin',updatedAt,items});
test('closed entries keep the newest 25 items for 24 hours and prune other devices after 30 days',()=>{
  assert.equal(typeof m.mergeDevices,'function');
  const rows=Array.from({length:30},(_,i)=>item(i));rows.push(item(90,now-day));
  const merged=m.mergeDevices({}, {phone:device(rows),stale:device([],now-30*day)},'own',now);
  assert.equal(merged.phone.items.length,25);assert.equal(merged.phone.items[0].id,'tab-0');assert.equal(merged.phone.items.at(-1).id,'tab-24');
  assert.equal(merged.stale,undefined);
});
test('own closes are never repeated in the synced inbox and dismissed remote rows stay hidden',()=>{
  const devices={own:device([item(1)]),phone:device([item(2),item(3)])};
  assert.deepEqual(m.inbox(devices,'own',{'tab-2':now},now).map(x=>x.id),['tab-3']);
});
test('closed records reject private schemes and preserve only the page address, title and space id',()=>{
  const raw={...item(1),snapshot:'private page state',url:'file:///private'};
  assert.equal(m.sanitizeItem(raw,now),null);
  const clean=m.sanitizeItem({...raw,url:'https://example.test/'},now);
  assert.equal(clean.snapshot,undefined);assert.equal(clean.url,'https://example.test/');
});
test('daily heartbeat and retraction preserve one-writer entry semantics',()=>{
  const previous=device([item(1)],now-day+1);
  assert.equal(m.ownEntry(previous,{name:'Mac',platform:'darwin'},now).entry.updatedAt,previous.updatedAt);
  assert.equal(m.ownEntry(previous,{name:'Mac',platform:'darwin'},now+1).entry.updatedAt,now+1);
  assert.deepEqual(m.mergeDevices({phone:previous},{phone:{retracted:true,updatedAt:now}},'own',now).phone,{retracted:true,updatedAt:now});
});
test('closed payload budget removes oldest other entries first and never emits an oversized own entry',()=>{
  const large=Array.from({length:25},(_,i)=>({...item(i),url:'https://example.test/'+ '\u4e2d'.repeat(1800)}));
  const out=m.applyBudget({own:device(large),other:device(large,now-1)},'own');
  assert.ok(Buffer.byteLength(JSON.stringify(out))<=65536);assert.ok(out.own.items.length>0);
  assert.equal(out.other,undefined);
});
