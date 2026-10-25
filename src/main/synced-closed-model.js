'use strict';
// M16 Recently closed. One writer per device, with the same entry merge
// convention as Send to device; a row contains no held view or page state.
const { canonical, winner } = require('./tabsync-model');
const DAY=86400000;
const MAX_ITEMS=25, ITEM_TTL_MS=DAY, ENTRY_TTL_MS=30*DAY, HEARTBEAT_MS=DAY, BUDGET_BYTES=65536;
const validId=v=>typeof v==='string' && v.length>0 && v.length<=64;
const platforms=new Set(['darwin','win32','linux','ios']);
function sanitizeItem(raw,now) {
  if (!raw || raw.private===true || !validId(raw.id) || typeof raw.url!=='string' || raw.url.length>2048 || !Number.isFinite(raw.closedAt) || raw.closedAt<=0 || now-raw.closedAt>=ITEM_TTL_MS) return null;
  try { if (!['http:','https:'].includes(new URL(raw.url).protocol)) return null; } catch { return null; }
  return {id:raw.id,url:raw.url,title:typeof raw.title==='string'?raw.title.slice(0,200):'',closedAt:raw.closedAt,
    spaceId:typeof raw.spaceId==='string' && /^[0-9a-f]{32}$/.test(raw.spaceId)?raw.spaceId:null};
}
function normalizeItems(items,now) {
  const seen=new Set();
  return (Array.isArray(items)?items:[]).map(x=>sanitizeItem(x,now)).filter(Boolean)
    .sort((a,b)=>b.closedAt-a.closedAt || (a.id<b.id?-1:a.id>b.id?1:0))
    .filter(x=>seen.has(x.id)?false:seen.add(x.id)).slice(0,MAX_ITEMS);
}
function sanitizeEntry(raw,now) {
  if (!raw || !Number.isFinite(raw.updatedAt) || raw.updatedAt<=0) return null;
  if(raw.retracted)return {retracted:true,updatedAt:raw.updatedAt};
  return {name:typeof raw.name==='string' && raw.name?raw.name.slice(0,80):'unknown device',
    platform:platforms.has(raw.platform)?raw.platform:'',updatedAt:raw.updatedAt,items:normalizeItems(raw.items,now)};
}
function ownEntry(previous,{name,platform},now,{force=false}={}) {
  const clean=sanitizeEntry(previous,now),prev=clean && !clean.retracted?clean:null;
  const entry={name:String(name??'').slice(0,80)||'unknown device',platform:platforms.has(platform)?platform:'',updatedAt:now,items:prev?.items??[]};
  if(prev && !force && prev.name===entry.name && prev.platform===entry.platform && now-prev.updatedAt<HEARTBEAT_MS)entry.updatedAt=prev.updatedAt;
  return {entry,changed:canonical(entry)!==canonical(previous??null)};
}
function mergeDevices(local,remote,ownId,now) {
  const out={};
  for(const source of [local,remote])for(const [id,raw] of Object.entries(source??{})) {
    const entry=sanitizeEntry(raw,now);if(!entry)continue;
    out[id]=out[id]?winner(out[id],entry,id===ownId):entry;
  }
  for(const [id,entry] of Object.entries(out))if(id!==ownId && now-entry.updatedAt>=ENTRY_TTL_MS)delete out[id];
  return out;
}
function applyBudget(devices,ownId,{maxBytes=BUDGET_BYTES}={}) {
  const out=structuredClone(devices),over=()=>Buffer.byteLength(canonical(out),'utf8')>maxBytes;
  for(const [id] of Object.entries(out).filter(([id])=>id!==ownId).sort(([ia,a],[ib,b])=>a.updatedAt-b.updatedAt || (ia<ib?-1:1))) {
    if(!over())break;delete out[id];
  }
  // At the URL limit, Unicode can make even 25 own rows exceed 64 KiB.
  // Keep the newest complete rows; never truncate a URL into another page.
  while(over() && out[ownId]?.items?.length)out[ownId].items.pop();
  if(over())delete out[ownId];
  return out;
}
function inbox(devices,ownId,dismissed,now) {
  const rows=[];
  for(const [fromId,raw] of Object.entries(devices??{})) {
    if(fromId===ownId)continue;
    const entry=sanitizeEntry(raw,now);if(!entry || entry.retracted)continue;
    for(const item of entry.items)if(!Object.hasOwn(dismissed??{},item.id))rows.push({...item,fromId,fromName:entry.name});
  }
  return rows.sort((a,b)=>b.closedAt-a.closedAt || (a.id<b.id?-1:a.id>b.id?1:0));
}
const pruneDismissed=(dismissed,now)=>Object.fromEntries(Object.entries(dismissed??{}).filter(([id,at])=>validId(id)&&Number.isFinite(at)&&now-at<2*DAY));
module.exports={MAX_ITEMS,ITEM_TTL_MS,ENTRY_TTL_MS,HEARTBEAT_MS,BUDGET_BYTES,sanitizeItem,sanitizeEntry,normalizeItems,ownEntry,mergeDevices,applyBudget,inbox,pruneDismissed};
