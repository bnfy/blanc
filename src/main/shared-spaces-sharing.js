'use strict';
const model=require('./shared-spaces-model');
const adapter=require('./shared-spaces-adapter');
const copy=value=>structuredClone(value);
function projectSpace(blob) {
  const clean=model.sanitizeBlob(blob);if(!clean)throw new TypeError('Invalid Space');
  const ids=model.orderOf(clean.tabs).filter(id=>!clean.tabs[id].deleted.v);
  const groupIds=model.orderOf(clean.groups).filter(id=>!clean.groups[id].deleted.v);
  return {urls:ids.map(id=>clean.tabs[id].nav.v.url),tabIds:ids,
    meta:ids.map(id=>({title:clean.tabs[id].nav.v.title,customTitle:clean.tabs[id].name.v})),
    pinned:ids.map(id=>clean.tabs[id].pinned.v),groupIds:ids.map(id=>model.effectiveGroup(clean,clean.tabs[id])),
    groups:groupIds.map(id=>({id,name:clean.groups[id].name.v,color:clean.groups[id].color.v,collapsed:clean.groups[id].collapsed.v})),
    activeIndex:Math.max(0,ids.indexOf(model.activeTabId(clean))),sectionOrder:true};
}
function planSharing(index,workspaces,selections,{now,deviceId,ids,encryptFn}) {
  const current=model.sanitizeIndex(index);if(!current)return {ok:false,error:'unavailable',items:[]};
  const byId=new Map(workspaces.map(w=>[w.id,w])),seen=new Set(),items=[];
  const live=Object.values(current.spaces).filter(record=>!record.deleted.v).length;
  const copies=selections.filter(choice=>choice.mode!=='rejoin').length;
  if(copies>0&&live+copies>model.LIMITS.spaces)return {ok:false,error:'limit',items:[]};
  let left=model.orderOf(current.spaces).map(id=>current.spaces[id]).filter(record=>!record.deleted.v).at(-1)?.pos.v??'';
  for(const choice of selections) {
    const workspace=byId.get(choice.id);if(!workspace||seen.has(choice.id))return {ok:false,error:'not-found',items:[]};seen.add(choice.id);
    if(choice.mode==='rejoin') {
      const record=current.spaces[workspace.sharedId];
      if(!record||record.deleted.v)return {ok:false,error:'deleted',items:[]};
      items.push({workspaceId:workspace.id,spaceId:workspace.sharedId,mode:'rejoin'});continue;
    }
    if(choice.mode!=='copy')return {ok:false,error:'invalid-choice',items:[]};
    const spaceId=ids(),groups=(workspace.groups??[]).map((group,index)=>({...group,id:'local-group-'+index}));
    const mapping=new Map((workspace.groups??[]).map((group,index)=>[group.id,groups[index].id]));
    const capture={...workspace,groups,groupIds:(workspace.groupIds??[]).map(id=>mapping.get(id)??null),tabIds:undefined};
    const result=adapter.diffWindow({v:1,spaceId,tabs:{},groups:{}},capture,now,deviceId,ids);
    const blob=result.nextBaseline;
    if(model.liveTabCount(blob)>model.LIMITS.tabsPerSpace)return {ok:false,error:'tabs',items:[]};
    if(!model.blobFits(blob,encryptFn))return {ok:false,error:'full',items:[]};
    const field=value=>model.field(value,now,deviceId),pos=model.keyFor(left,'',spaceId);left=pos;
    items.push({workspaceId:workspace.id,spaceId,mode:'copy',blob,edits:result.edits,tabIds:result.tabIds,
      groupBindings:Object.fromEntries([...mapping].map(([oldId,localId])=>[oldId,result.groupBindings[localId]])),
      index:{name:field(workspace.name),color:field(workspace.color),symbol:field(workspace.symbol),pos:field(pos),deleted:field(false),createdAt:now,createdBy:deviceId}});
  }
  return {ok:true,items};
}
function reconcileCapture(previous,blob) {
  if(!previous)return projectSpace(blob);
  const {restoredMarker,DOCUMENT_POLICY_VERSION}=require('./document-policy');
  const projected=projectSpace(blob),oldIds=previous.tabIds??[],rows=[];
  const previousAt=new Map(oldIds.map((id,index)=>[id,index]).filter(([id])=>id));
  for(let i=0;i<projected.urls.length;i++) {
    const old=previousAt.get(projected.tabIds[i]);
    if(old!==undefined&&restoredMarker(previous,old))continue;
    rows.push({url:projected.urls[i],id:projected.tabIds[i],meta:{...(old!==undefined&&previous.urls[old]===projected.urls[i]?previous.meta?.[old]:{}),...projected.meta[i]},pinned:projected.pinned[i],group:projected.groupIds[i],old});
  }
  for(let i=0;i<previous.urls.length;i++)if(!oldIds[i]||restoredMarker(previous,i)||!/^https?:/.test(previous.urls[i])) {
    rows.splice(Math.min(i,rows.length),0,{url:previous.urls[i],id:null,meta:previous.meta?.[i]??{},pinned:!!previous.pinned?.[i],group:previous.groupIds?.[i]??null,old:i,local:true});
  }
  const active=rows.findIndex(row=>row.old===previous.activeIndex);
  const groups=new Map(projected.groups.map(group=>[group.id,group]));
  for(const group of previous.groups??[])if(rows.some(row=>row.local&&row.group===group.id))groups.set(group.id,group);
  return {...previous,urls:rows.map(row=>row.url),tabIds:rows.map(row=>row.id),meta:rows.map(row=>row.meta),pinned:rows.map(row=>row.pinned),groupIds:rows.map(row=>row.group),groups:[...groups.values()],
    localFiles:rows.map(row=>row.local&&previous.localFiles?.[row.old]===true),documentPolicy:DOCUMENT_POLICY_VERSION,
    inheritsDocumentPolicy:rows.map(row=>row.local&&restoredMarker(previous,row.old)),
    ...(previous.splitIds?.length===previous.urls.length?{splitIds:rows.map(row=>row.old===undefined?null:previous.splitIds[row.old])}:{}),
    activeIndex:active<0?Math.max(0,rows.findIndex(row=>row.id===projected.tabIds[projected.activeIndex])):active};
}
function recoveryCapture(previous,blob) {
  const {restoredMarker,DOCUMENT_POLICY_VERSION}=require('./document-policy');
  const added=projectSpace(blob),old=previous??{urls:[],tabIds:[],meta:[],pinned:[],groupIds:[],groups:[],activeIndex:0};
  const result=copy(old),seen=new Set(old.tabIds??[]);
  result.groups??=[];
  for(const [field,fallback] of Object.entries({tabIds:null,meta:{},pinned:false,groupIds:null}))result[field]=old.urls.map((_,i)=>copy(old[field]?.[i]??fallback));
  result.documentPolicy=DOCUMENT_POLICY_VERSION;
  result.inheritsDocumentPolicy=old.urls.map((_,i)=>restoredMarker(old,i));
  result.localFiles=old.urls.map((_,i)=>old.localFiles?.[i]===true);
  if(old.splitIds)result.splitIds=old.urls.map((_,i)=>old.splitIds[i]??null);
  for(let i=0;i<added.tabIds.length;i++)if(!seen.has(added.tabIds[i])) {
    seen.add(added.tabIds[i]);for(const field of ['urls','tabIds','meta','pinned','groupIds'])result[field].push(added[field][i]);
    result.inheritsDocumentPolicy.push(false);result.localFiles.push(false);
    if(result.splitIds)result.splitIds.push(null);
  }
  const groups=new Map(result.groups.map(group=>[group.id,group]));for(const group of added.groups)if(!groups.has(group.id))groups.set(group.id,group);
  result.groups=[...groups.values()];return result;
}
// A recovered record can replace this exact quiet projection, but never a
// visited page, retained snapshot, or locally edited recovery copy.
function isRecoveryPlaceholder(tab,record,hasSnapshot) {
  return !!(tab&&record&&tab.asleep&&!tab.sleeping&&!tab.waking&&!tab.isLoading&&!tab.view&&!hasSnapshot&&!tab.inheritsDocumentPolicy&&!tab.splitId&&!tab.muted&&
    tab.url===record.nav?.v.url&&(tab.title??'')===record.nav?.v.title&&
    (tab.customTitle??null)===record.name?.v&&!!tab.pinned===record.pinned?.v&&
    (tab.groupId??null)===record.groupId?.v&&(!tab.pinnedHomeUrl||tab.pinnedHomeUrl===record.nav?.v.url));
}
module.exports={planSharing,projectSpace,recoveryCapture,reconcileCapture,isRecoveryPlaceholder};
