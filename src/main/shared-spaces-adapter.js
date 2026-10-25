'use strict';
// Displayed baselines are local projections, never the store's merged blob.
// This module plans edits/actions; main applies actions and persists receipts.
const crypto=require('node:crypto');
const model=require('./shared-spaces-model');
const { canonical }=require('./tabsync-model');
const { normalizeTabName }=require('./tab-name');
const { sanitizeGroupColor }=require('./group-color');
const validId=v=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
const copy=v=>structuredClone(v);
const equal=(a,b)=>canonical(a)===canonical(b);
const defaultId=()=>crypto.randomUUID().replace(/-/g,'');
function safeUrl(value) {
  if(typeof value!=='string'||value.length>2048)return false;
  try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}
}
function diffWindow(displayedBaseline,windowState,now,deviceId,ids=defaultId) {
  const baseline=model.sanitizeBlob(displayedBaseline);if(!baseline)throw new TypeError('Invalid displayed baseline');
  const nextBaseline=copy(baseline),edits={},tabIds=Array(windowState.urls?.length??0).fill(null),groupBindings={};
  const used=new Set([...Object.keys(baseline.tabs),...Object.keys(baseline.groups)]);
  function fresh() {const id=ids();if(!validId(id)||used.has(id))throw new TypeError('Record id must be fresh');used.add(id);return id;}
  function write(kind,id,name,value) {
    const prev=nextBaseline[kind][id]?.[name];
    const accepted=(windowState.accepted??[]).find(row=>row.kind===kind&&row.id===id&&row.field===name)?.value;
    const clock=Math.max(now,(prev?.c??-1)+1,(accepted?.c??-1)+1);
    const field=model.field(value,clock,deviceId);
    edits[kind]??={};edits[kind][id]??={};edits[kind][id][name]=field;
    nextBaseline[kind][id]??={};nextBaseline[kind][id][name]=field;
  }
  function values(kind,id,fields) {
    for(const [name,value] of Object.entries(fields)) {
      const prev=nextBaseline[kind][id]?.[name];
      const before=name==='groupId'&&prev?model.effectiveGroup(nextBaseline,nextBaseline.tabs[id]):prev?.v;
      if(!prev||!equal(before,value))write(kind,id,name,value);
    }
  }
  function positions(kind,order) {
    let left='';
    for(let n=0;n<order.length;n++) {
      const id=order[n],current=nextBaseline[kind][id]?.pos?.v;
      const right=order.slice(n+1).map(id=>({id,key:nextBaseline[kind][id]?.pos?.v})).find(x=>model.validKey(x.key,x.id)&&x.key>left)?.key??'';
      const key=model.validKey(current,id)&&current>left&&(!right||current<right)?current:model.keyFor(left,right,id);
      if(key!==current)write(kind,id,'pos',key);left=key;
    }
  }
  const groupOrder=[],seenGroups=new Set();
  for(const group of windowState.groups??[]) {
    if(!group||typeof group.id!=='string'||seenGroups.has(group.id))continue;seenGroups.add(group.id);
    let id=windowState.groupBindings?.[group.id]??group.id;
    if(!validId(id)||baseline.groups[id]?.deleted?.v===true)id=fresh();
    groupBindings[group.id]=id;groupOrder.push(id);
    values('groups',id,{name:String(group.name??'').slice(0,60),color:sanitizeGroupColor(group.color),collapsed:!!group.collapsed,deleted:false});
  }
  for(const [id,record] of Object.entries(baseline.groups))if(!groupOrder.includes(id)&&record.deleted.v!==true)write('groups',id,'deleted',true);
  positions('groups',groupOrder);
  const tabOrder=[],seenTabs=new Set();
  for(let n=0;n<(windowState.urls?.length??0);n++) {
    if(!safeUrl(windowState.urls[n])||windowState.private?.[n]===true)continue;
    let id=windowState.tabIds?.[n];
    if(!validId(id)||seenTabs.has(id)||baseline.tabs[id]?.deleted?.v===true)id=fresh();
    seenTabs.add(id);tabIds[n]=id;tabOrder.push(id);
    const meta=windowState.meta?.[n]??{},group=groupBindings[windowState.groupIds?.[n]]??null;
    values('tabs',id,{nav:{url:windowState.urls[n],title:typeof meta.title==='string'?meta.title.slice(0,200):''},
      name:normalizeTabName(meta.customTitle),pinned:!!windowState.pinned?.[n],groupId:group,deleted:false});
  }
  for(const [id,record] of Object.entries(baseline.tabs))if(!seenTabs.has(id)&&record.deleted.v!==true)write('tabs',id,'deleted',true);
  positions('tabs',tabOrder);
  const active=tabIds[windowState.activeIndex];
  if(active && (baseline.active?.v!==active || baseline.active?.cleared===true)) {
    const accepted=(windowState.accepted??[]).find(x=>x.kind==='active')?.value;
    const value=model.field(active,Math.max(now,(baseline.active?.c??-1)+1,(accepted?.c??-1)+1),deviceId);
    nextBaseline.active=value;edits.active=value;
  }
  return {edits,nextBaseline:model.sanitizeBlob(nextBaseline),tabIds,groupBindings};
}
function planApply(displayedBaseline,mergedBlob,protectedTabIds=new Set()) {
  const baseline=model.sanitizeBlob(displayedBaseline),merged=model.sanitizeBlob(mergedBlob);
  if(!baseline||!merged||baseline.spaceId!==merged.spaceId)throw new TypeError('Invalid Space projection');
  const nextBaseline=copy(baseline),apply=[],accept=[];
  const protectedIds=new Set(protectedTabIds);
  for(const kind of ['groups','tabs'])for(const [id,incoming] of Object.entries(merged[kind])) {
    const previous=baseline[kind][id];
    if(!previous) {
      nextBaseline[kind][id]=copy(incoming);
      if(!incoming.deleted.v)apply.push({op:kind==='tabs'?'create':'create-group',kind,id,record:copy(incoming)});
      continue;
    }
    for(const [name,value] of Object.entries(incoming)) {
      const prev=previous[name],winner=model.mergeField(prev,value,name);
      if(equal(prev,winner))continue;
      const changed=!equal(prev?.v,winner.v);
      const op=name==='deleted'&&winner.v===true?(kind==='tabs'?'close':'delete-group'):name==='nav'?'nav':'field';
      const row={op,kind,id,field:name,value:copy(winner)};
      if(changed&&kind==='tabs'&&protectedIds.has(id)&&(name==='nav'||(name==='deleted'&&winner.v===true)))accept.push(row);
      else {
        nextBaseline[kind][id][name]=copy(winner);
        if(changed&&previous.deleted.v!==true)apply.push(row);
      }
    }
  }
  // An open window keeps its selection; the saved remote choice is only for
  // cold materialization. Applying a remote nav must never steal live focus.
  return {apply,accept,nextBaseline:model.sanitizeBlob(nextBaseline)};
}
module.exports={diffWindow,planApply};
