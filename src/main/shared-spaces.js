'use strict';
// Account-bound local protocol state. This module never performs network I/O
// or changes a window: sync.js observes outcomes, and the adapter owns display.
const { JsonStore }=require('./store');
const model=require('./shared-spaces-model');
const { canonical }=require('./tabsync-model');
const copy=x=>structuredClone(x);
const empty=()=>({accountId:'',enabled:false,index:{v:1,spaces:{}},knownIndex:{},blobs:{},pending:{},windows:{},
  recoveries:{},sidecar:{devices:{}},requestLog:[],nextClass:'I',cursors:{}});
let store;
const ensure=()=>store??=new JsonStore('shared-spaces',empty(),{scope:'profile'});
const changed=new Set(),remoteChanged=new Set();
const notify=listeners=>{for(const fn of listeners)fn();};
function rebind(accountId) {
  const s=ensure();if(s.data.accountId!==accountId)s.update(d=>Object.assign(d,empty(),{accountId,requestLog:d.requestLog??[]}));return s;
}
const snapshot=ctx=>copy(rebind(ctx.accountId).data);
function setEnabled(on,ctx) {rebind(ctx.accountId).update(d=>{d.enabled=!!on;});notify(changed);}
const isEnabled=ctx=>rebind(ctx.accountId).data.enabled===true;
function noteLocalSpace(id,blob,edits,ctx) {
  const clean=model.sanitizeBlob(blob);if(!clean || clean.spaceId!==id)throw new TypeError('Invalid local Space');
  const s=rebind(ctx.accountId);
  s.update(d=>{const prev=d.blobs[id];d.blobs[id]={...prev,blob:prev?model.mergeBlob(prev.blob,clean):clean,mergedAt:prev?.mergedAt??Date.now()};
    d.pending[id]=model.applyLocalEdits(d.pending[id],edits);});notify(changed);
}
function setIndex(index,ctx) {const s=rebind(ctx.accountId);s.update(d=>{d.index=model.mergeIndex(d.index,index);});notify(changed);}
function mergeIndex(index,ctx) {
  const s=rebind(ctx.accountId),before=canonical(s.data.index);
  s.update(d=>{d.index=model.mergeIndex(d.index,index);for(const id of Object.keys(index.spaces))d.knownIndex[id]=true;});
  if(before!==canonical(s.data.index))notify(remoteChanged);
}
function exportIndex(ctx) {
  const d=rebind(ctx.accountId).data,index=copy(d.index);
  for(const id of Object.keys(index.spaces)) {
    if(!d.knownIndex[id] && !d.blobs[id]?.lastPublishable){delete index.spaces[id];continue;}
    if(d.pending[id]?.index)index.spaces[id].rev=d.pending[id].index.rev;
  }
  return model.expireTombstones(index,Date.now());
}
function settleIndex(payload,ctx) {
  const s=ensure();if(s.data.accountId!==ctx.accountId)return;
  s.update(d=>{for(const [id,entry] of Object.entries(payload.spaces)) {
    d.knownIndex[id]=true;
    if(d.pending[id]?.index?.rev===entry.rev)delete d.pending[id].index;
  }});
}
function mergeSpace(id,remote,version,ctx,encryptFn) {
  const s=rebind(ctx.accountId),entry=s.data.blobs[id];
  const local=entry?.blob??remote??{v:1,spaceId:id,tabs:{},groups:{}};
  const before=copy(s.data.pending[id]??{});
  const plan=model.pushPlan({fetchedBlob:remote,fetchedVersion:version,localBlob:local,pending:before,
    lastMergeAt:entry?.mergedAt,now:Date.now(),deviceId:ctx.deviceId,encryptFn,lastPublishable:entry?.lastPublishable});
  s.update(d=>{
    if(plan.recover.size) {
      const recovery=d.recoveries[id]??={tabs:{},groups:{}};
      for(const kind of ['tabs','groups'])for(const rid of plan.recover)if(local[kind][rid])recovery[kind][rid]=copy(local[kind][rid]);
    }
    d.blobs[id]={...entry,blob:plan.mergedBlob,rev:remote?model.revisionOf(remote):null,mergedAt:plan.nextLastMergeAt,
      lastPublishable:remote && model.blobFits(remote,encryptFn)?copy(remote):entry?.lastPublishable,
      unsynced:[...plan.unsynced],reason:plan.reason};
    // A failed/no PUT cannot acknowledge unrelated writes. Retention cleanup
    // is independent, and must survive failure and process restart too.
    d.pending[id]=plan.upload?model.settleUpload(plan,before,{blobStored:false}).pending:copy(plan.pendingAfter);
  });
  notify(remoteChanged);
  return {...plan,pendingBefore:before,accountId:ctx.accountId};
}
function settleSpace(id,plan,outcome,ctx) {
  const s=ensure();if(s.data.accountId!==ctx.accountId || plan.accountId!==ctx.accountId)return false;
  const current=s.data.pending[id]??{},delta={};
  // Writes arriving after the plan was built must survive both success and
  // failure; a response only settles the snapshot it actually represented.
  for(const kind of ['tabs','groups'])for(const [rid,record] of Object.entries(current[kind]??{}))for(const [name,value] of Object.entries(record)) {
    if(canonical(value)===canonical(plan.pendingBefore[kind]?.[rid]?.[name]))continue;
    delta[kind]??={};delta[kind][rid]??={};delta[kind][rid][name]=copy(value);
  }
  const result=model.settleUpload(plan,current,outcome);
  s.update(d=>{
    d.pending[id]=model.applyLocalEdits(result.pending,delta);
    if(outcome.blobStored && plan.upload)d.blobs[id].lastPublishable=copy(plan.upload.blob);
  });return true;
}
function spaceIds(ctx) {
  const d=rebind(ctx.accountId).data;
  return [...new Set([...Object.keys(d.index.spaces),...Object.keys(d.blobs)])].filter(id=>d.index.spaces[id]?.deleted?.v!==true).sort();
}
function sanitizeSidecar(payload) {
  const devices={};
  for(const [id,raw] of Object.entries(payload?.devices??{})) {
    if(!Number.isSafeInteger(raw?.forUpdatedAt) || raw.forUpdatedAt<=0 || Date.now()-raw.forUpdatedAt>=model.LIMITS.tombstoneMs || !Array.isArray(raw.tabs))continue;
    const tabs=raw.tabs.filter(t=>Number.isInteger(t?.i)&&t.i>=0&&typeof t.spaceId==='string'&&/^[0-9a-f]{32}$/.test(t.spaceId)).map(t=>({i:t.i,spaceId:t.spaceId}));
    const entry={forUpdatedAt:raw.forUpdatedAt,tabs};
    if(Buffer.byteLength(canonical(entry),'utf8')<=65536)devices[id]=entry;
  }
  return {devices};
}
function mergeSidecar(remote,ctx) {
  const s=rebind(ctx.accountId),local=sanitizeSidecar(s.data.sidecar),incoming=sanitizeSidecar(remote);
  for(const [id,entry] of Object.entries(incoming.devices)) {
    const prev=local.devices[id];
    if(!prev || entry.forUpdatedAt>prev.forUpdatedAt || (entry.forUpdatedAt===prev.forUpdatedAt && canonical(entry)<canonical(prev)))local.devices[id]=entry;
  }
  s.update(d=>{d.sidecar=local;});notify(remoteChanged);
}
const exportSidecar=ctx=>sanitizeSidecar(rebind(ctx.accountId).data.sidecar);
module.exports={rebind,snapshot,setEnabled,isEnabled,noteLocalSpace,setIndex,mergeIndex,exportIndex,settleIndex,
  mergeSpace,exportSpace:mergeSpace,settleSpace,spaceIds,exportSidecar,mergeSidecar,
  equals:(a,b)=>canonical(a)===canonical(b),hasPublishableContent:payload=>Object.keys(payload?.spaces??{}).length>0,
  onChanged:fn=>changed.add(fn),onRemoteChanged:fn=>remoteChanged.add(fn),
  onSyncDisabled:()=>{rebind('');notify(remoteChanged);}};
