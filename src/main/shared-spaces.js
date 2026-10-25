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
const container=value=>value!==null && typeof value==='object' && !Array.isArray(value);
function rebind(accountId) {
  const s=ensure();if(s.data.accountId!==accountId)s.update(d=>Object.assign(d,empty(),{accountId,requestLog:d.requestLog??[]}));
  // JsonStore repairs unreadable JSON, but a readable file can still contain
  // invalid optional containers. Repair only those containers, preserving
  // unrelated records and any readable future version marker.
  const defaults=empty(),repairs={};
  for(const name of ['index','knownIndex','blobs','pending','windows','recoveries','sidecar','cursors'])if(!container(s.data[name]))repairs[name]=defaults[name];
  const index=repairs.index??s.data.index,sidecar=repairs.sidecar??s.data.sidecar;
  if(!container(index.spaces))repairs.index={...index,spaces:{}};
  if(index.v===1) {
    const clean=model.sanitizeIndex(repairs.index??index);
    if(canonical(clean)!==canonical(index))repairs.index=clean;
  }
  if(!container(sidecar.devices))repairs.sidecar={...sidecar,devices:{}};
  if(Object.keys(repairs).length)s.update(d=>Object.assign(d,repairs));
  return s;
}
const snapshot=ctx=>copy(rebind(ctx.accountId).data);
function setEnabled(on,ctx) {rebind(ctx.accountId).update(d=>{d.enabled=!!on;});notify(changed);}
const isEnabled=ctx=>rebind(ctx.accountId).data.enabled===true;
function noteLocalSpace(id,blob,edits,ctx) {
  const clean=model.sanitizeBlob(blob);if(!clean || clean.spaceId!==id)throw new TypeError('Invalid local Space');
  const s=rebind(ctx.accountId),eligible=copy(edits??{});
  s.update(d=>{const prev=d.blobs[id],retryOrder=Array.isArray(prev?.retryOrder)?[...prev.retryOrder]:[];
    // Once classified, an id belongs to the durable recovery copy. A local
    // edit arriving during I/O must stay there even if the process exits
    // before settlement; advancing mergedAt cannot make it publishable again.
    for(const kind of ['groups','tabs'])for(const rid of Object.keys(d.recoveries[id]?.[kind]??{})) {
      const incoming=model.mergeRecord(clean[kind][rid],eligible[kind]?.[rid]);
      d.recoveries[id][kind][rid]=model.mergeRecord(d.recoveries[id][kind][rid],incoming);
      delete clean[kind][rid];if(eligible[kind])delete eligible[kind][rid];
    }
    for(const kind of ['groups','tabs'])for(const rid of Object.keys(eligible[kind]??{})) {
      const key=kind+':'+rid;if(!retryOrder.includes(key))retryOrder.push(key);
    }
    d.blobs[id]={...prev,blob:prev?model.mergeBlob(prev.blob,clean):clean,mergedAt:prev?.mergedAt??Date.now(),retryOrder};
    d.pending[id]=model.applyLocalEdits(d.pending[id],eligible);});notify(changed);
}
function setIndex(index,ctx) {const s=rebind(ctx.accountId);s.update(d=>{d.index=model.mergeIndex(d.index,index);});notify(changed);}
// The fetched index as received, for the export that follows it in the same
// pass (sync.js merges then exports with no await between). Consumed once, so
// an export after a missing (404) index relays nothing stale.
let indexRelay=null;
function mergeIndex(index,ctx) {
  indexRelay={accountId:ctx.accountId,index:model.relayIndex(index)};
  const s=rebind(ctx.accountId),before=canonical(s.data.index);
  s.update(d=>{d.index=model.mergeIndex(d.index,index);for(const id of Object.keys(index.spaces))d.knownIndex[id]=true;});
  if(before!==canonical(s.data.index))notify(remoteChanged);
}
function exportIndex(ctx) {
  const d=rebind(ctx.accountId).data,index=model.sanitizeIndex(d.index);
  if(!index)throw new TypeError('Invalid or unsupported Spaces index');
  for(const id of Object.keys(index.spaces)) {
    if(!d.knownIndex[id] && !d.blobs[id]?.lastPublishable){delete index.spaces[id];continue;}
    const receipt=d.pending[id]?.index,entry=index.spaces[id];
    if(receipt&&entry.rev!==receipt.rev) {
      // A newer hint must outrank every hint already published, even one
      // from a device whose clock runs ahead.
      entry.rev=receipt.rev;
      entry.revAt=Math.max(receipt.at??0,(Number.isSafeInteger(entry.revAt)?entry.revAt:-1)+1);
      entry.revBy=receipt.by??ctx.deviceId;
    }
  }
  const relay=indexRelay?.accountId===ctx.accountId?indexRelay.index:null;indexRelay=null;
  return model.expireTombstones(model.relayInto(index,relay,Date.now()),Date.now());
}
function settleIndex(payload,ctx) {
  const s=ensure();if(s.data.accountId!==ctx.accountId)return;
  s.update(d=>{for(const [id,entry] of Object.entries(payload.spaces)) {
    d.knownIndex[id]=true;
    if(d.index.spaces[id])for(const key of ['rev','revAt','revBy']) {
      if(entry[key]!==undefined)d.index.spaces[id][key]=entry[key];else delete d.index.spaces[id][key];
    }
    if(d.pending[id]?.index?.rev===entry.rev)delete d.pending[id].index;
  }});
}
function mergeSpace(id,remote,version,ctx,encryptFn) {
  const s=rebind(ctx.accountId),entry=s.data.blobs[id];
  const retryOrder=Array.isArray(entry?.retryOrder)?entry.retryOrder:[];
  const local=entry?.blob??remote??{v:1,spaceId:id,tabs:{},groups:{}};
  const before=copy(s.data.pending[id]??{});
  const plan=model.pushPlan({fetchedBlob:remote,fetchedVersion:version,localBlob:local,pending:before,
    lastMergeAt:entry?.mergedAt,now:Date.now(),deviceId:ctx.deviceId,encryptFn,lastPublishable:entry?.lastPublishable,admissionOrder:retryOrder});
  s.update(d=>{
    if(plan.recover.size) {
      const recovery=d.recoveries[id]??={tabs:{},groups:{}};
      for(const kind of ['tabs','groups'])for(const rid of plan.recover)if(local[kind][rid]) {
        recovery[kind][rid]=model.mergeRecord(recovery[kind][rid],model.mergeRecord(local[kind][rid],before[kind]?.[rid]));
      }
    }
    d.blobs[id]={...entry,retryOrder,blob:plan.mergedBlob,rev:remote?model.revisionOf(remote):null,mergedAt:plan.nextLastMergeAt,
      lastPublishable:remote && model.liveTabCount(remote)<=model.LIMITS.tabsPerSpace && model.blobFits(remote,encryptFn)?copy(remote):entry?.lastPublishable,
      unsynced:[...plan.unsynced].sort((a,b)=>{
        const rank=id=>retryOrder.findIndex(key=>key==='tabs:'+id||key==='groups:'+id);
        const ar=rank(a),br=rank(b);return (ar<0?Infinity:ar)-(br<0?Infinity:br) || (a<b?-1:a>b?1:0);
      }),reason:plan.reason};
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
  if(current.active&&canonical(current.active)!==canonical(plan.pendingBefore.active))delta.active=copy(current.active);
  // Writes arriving after the plan was built must survive both success and
  // failure; a response only settles the snapshot it actually represented.
  for(const kind of ['tabs','groups'])for(const [rid,record] of Object.entries(current[kind]??{}))for(const [name,value] of Object.entries(record)) {
    if(plan.expiredRecords[kind].includes(rid)||plan.recover.has(rid))continue;
    if(canonical(value)===canonical(plan.pendingBefore[kind]?.[rid]?.[name]))continue;
    delta[kind]??={};delta[kind][rid]??={};delta[kind][rid][name]=copy(value);
  }
  const result=model.settleUpload(plan,current,outcome);
  s.update(d=>{
    d.pending[id]=model.applyLocalEdits(result.pending,delta);
    for(const kind of ['tabs','groups'])for(const rid of plan.recover) {
      const record=model.mergeRecord(d.blobs[id].blob[kind][rid],current[kind]?.[rid]);
      if(Object.keys(record).length) {
        const recovery=d.recoveries[id]??={tabs:{},groups:{}};
        recovery[kind][rid]=model.mergeRecord(recovery[kind][rid],record);
      }
    }
    for(const kind of ['tabs','groups'])for(const rid of [...plan.expiredRecords[kind],...plan.recover]) {
      delete d.blobs[id].blob[kind][rid];
      if(d.pending[id][kind])delete d.pending[id][kind][rid];
    }
    for(const kind of ['tabs','groups'])if(d.pending[id][kind]&&!Object.keys(d.pending[id][kind]).length)delete d.pending[id][kind];
    d.blobs[id].blob=model.sanitizeBlob(d.blobs[id].blob);
    if(d.pending[id].active)d.pending[id].active=model.sanitizeBlob({...d.blobs[id].blob,active:d.pending[id].active}).active;
    d.blobs[id].retryOrder=(d.blobs[id].retryOrder??[]).filter(key=>{
      const [kind,rid]=key.split(':');return !!d.pending[id][kind]?.[rid] || d.blobs[id].unsynced.includes(rid);
    });
    // The Worker now holds exactly the upload: its revision is the one this
    // device last saw, so the index hint we publish next doesn't send us to
    // fetch our own write.
    if(outcome.blobStored && plan.upload){d.blobs[id].lastPublishable=copy(plan.upload.blob);d.blobs[id].rev=plan.upload.rev;}
  });return true;
}
function spaceIds(ctx) {
  const d=rebind(ctx.accountId).data,index=model.sanitizeIndex(d.index)?.spaces??{};
  return [...new Set([...Object.keys(index),...Object.keys(d.blobs)])].filter(id=>index[id]?.deleted?.v!==true).sort();
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
  // An oversized snapshot cannot be trusted for hiding any F27 occurrence.
  if(Buffer.byteLength(canonical(remote),'utf8')>65536)return;
  const s=rebind(ctx.accountId),local=sanitizeSidecar(s.data.sidecar),incoming=sanitizeSidecar(remote);
  for(const [id,entry] of Object.entries(incoming.devices)) {
    const prev=local.devices[id];
    if(!prev || entry.forUpdatedAt>prev.forUpdatedAt || (entry.forUpdatedAt===prev.forUpdatedAt && canonical(entry)<canonical(prev)))local.devices[id]=entry;
  }
  s.update(d=>{d.sidecar=local;});notify(remoteChanged);
}
function exportSidecar(ctx) {
  const payload=sanitizeSidecar(rebind(ctx.accountId).data.sidecar);
  const fits=()=>Buffer.byteLength(canonical(payload),'utf8')<=65536;
  if(!fits())delete payload.devices[ctx.deviceId];
  // Peer entries are mandatory. If omitting ours still cannot fit, hold
  // publication rather than trim somebody else's occurrence bindings.
  return fits()?payload:null;
}
const spaceCount=ctx=>Object.values(model.sanitizeIndex(rebind(ctx.accountId).data.index)?.spaces??{}).filter(record=>record.deleted.v!==true).length;
const canAddSpace=ctx=>spaceCount(ctx)<model.LIMITS.spaces;
module.exports={rebind,snapshot,setEnabled,isEnabled,noteLocalSpace,setIndex,mergeIndex,exportIndex,settleIndex,
  mergeSpace,exportSpace:mergeSpace,settleSpace,spaceIds,spaceCount,canAddSpace,exportSidecar,mergeSidecar,
  equals:(a,b)=>canonical(a)===canonical(b),hasPublishableContent:payload=>Object.keys(payload?.spaces??{}).length>0,
  onChanged:fn=>changed.add(fn),onRemoteChanged:fn=>remoteChanged.add(fn),
  onSyncDisabled:()=>{rebind('');notify(remoteChanged);}};
