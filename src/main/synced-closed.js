'use strict';
const { JsonStore }=require('./store');
const { canonical }=require('./tabsync-model');
const model=require('./synced-closed-model');
let store;
const ensure=()=>store??=new JsonStore('synced-closed',{accountId:'',devices:{},dismissed:{}},{scope:'profile'});
const listeners=new Set();
const notify=()=>{for(const fn of listeners)fn();};
function rebind(accountId) {
  const s=ensure();
  if(s.data.accountId!==accountId)s.update(d=>{d.accountId=accountId;d.devices={};d.dismissed={};});
  return s;
}
const identity=ctx=>({name:ctx.deviceName,platform:ctx.platform});
function exportForSync(ctx) {
  const s=rebind(ctx.accountId),now=Date.now();
  const {entry}=model.ownEntry(s.data.devices[ctx.deviceId],identity(ctx),now);
  s.update(d=>{d.devices=model.mergeDevices({...d.devices,[ctx.deviceId]:entry},{},ctx.deviceId,now);d.dismissed=model.pruneDismissed(d.dismissed,now);});
  return {devices:model.applyBudget(s.data.devices,ctx.deviceId)};
}
function mergeFromSync(remote,ctx) {
  const s=rebind(ctx.accountId),before=canonical(s.data.devices);
  s.update(d=>{d.devices=model.mergeDevices(d.devices,remote?.devices,ctx.deviceId,Date.now());});
  if(before!==canonical(s.data.devices))notify();
}
function addOwnItem(ctx,raw) {
  const item=model.sanitizeItem(raw,Date.now());if(!item)return false;
  const s=rebind(ctx.accountId),now=Date.now();
  const {entry}=model.ownEntry(s.data.devices[ctx.deviceId],identity(ctx),now,{force:true});
  entry.items=model.normalizeItems([item,...entry.items],now);
  s.update(d=>{d.devices={...d.devices,[ctx.deviceId]:entry};});notify();return true;
}
const inbox=ctx=>{const s=rebind(ctx.accountId);return model.inbox(s.data.devices,ctx.deviceId,s.data.dismissed,Date.now());};
function hide(ctx,id) {
  const row=inbox(ctx).find(x=>x.id===id);if(!row)return null;
  ensure().update(d=>{d.dismissed={...d.dismissed,[id]:Date.now()};});notify();return row;
}
function clear(ctx) {
  const rows=inbox(ctx),s=rebind(ctx.accountId),now=Date.now();
  const {entry}=model.ownEntry(s.data.devices[ctx.deviceId],identity(ctx),now,{force:true});entry.items=[];
  s.update(d=>{d.devices={...d.devices,[ctx.deviceId]:entry};for(const row of rows)d.dismissed[row.id]=now;});notify();
}
module.exports={rebind,exportForSync,mergeFromSync,addOwnItem,inbox,hide,clear,
  onChanged:fn=>listeners.add(fn),equalsRemote:(a,b)=>canonical(a?.devices??{})===canonical(b?.devices??{}),
  hasOwnItems:(payload,ctx)=>!!payload?.devices?.[ctx.deviceId]?.items?.length,
  heartbeatDue:ctx=>{const own=rebind(ctx.accountId).data.devices[ctx.deviceId];return !own || own.retracted || Date.now()-own.updatedAt>=model.HEARTBEAT_MS;},
  retractedOwn:()=>({retracted:true,updatedAt:Date.now()}),onSyncDisabled:()=>{rebind('');notify();}};
