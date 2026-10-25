'use strict';
const model=require('./shared-spaces-model');
const {planSharing,reconcileCapture,recoveryCapture}=require('./shared-spaces-sharing');
function createSharingService({sync,spaces,workspaces,offered,now=Date.now,ids,isOpen=()=>false,bind=()=>{},changed=()=>{},recoverNative=()=>{},recoveryName=name=>name+' · kept on this device',captureLocal=()=>{},devices=()=>[]}) {
  const context=()=>sync.sharedContext();
  const persist=ctx=>{if(!spaces.rebind(ctx.accountId).flush())throw new Error('save-failed');};
  function plan(selections,ctx) {
    // The model needs a synchronous encryption callback. Admission below uses
    // the actual account key, before any state is changed.
    const state=spaces.snapshot(ctx),rows=workspaces.list(),resumed=new Map();
    for(const choice of selections) {
      const row=rows.find(row=>row.id===choice.id),staged=Object.values(state.draftPlans??{}).find(item=>item.workspaceId===choice.id);
      if(staged&&choice.mode==='copy')resumed.set(choice.id,{...staged,...(row?.sharedId===staged.spaceId?{tabIds:row.tabIds}:{}),blob:state.blobs[staged.spaceId]?.blob??staged.blob});
      else if(row&&choice.mode==='rejoin'&&state.draftPlans?.[row.sharedId])resumed.set(choice.id,{...state.draftPlans[row.sharedId],tabIds:row.tabIds,blob:state.blobs[row.sharedId]?.blob??state.draftPlans[row.sharedId].blob});
    }
    const result=planSharing(state.index,rows,selections.filter(choice=>!resumed.has(choice.id)),{now:now(),deviceId:ctx.deviceId,ids,encryptFn:()=>''});
    if(result.ok)result.items=selections.map(choice=>resumed.get(choice.id)??result.items.find(item=>item.workspaceId===choice.id));
    if(result.ok&&result.items.some(item=>item.blob&&!sync.sharedPayloadFits(item.blob)))return {ok:false,error:'full'};
    return result;
  }
  async function preview() {
    if(!offered())return {offered:false};
    const fetched=await sync.sharedIndexPreview();if(!fetched.ok)return {offered:true,...fetched};
    await captureLocal();const ctx=context(),state=spaces.snapshot(ctx);
    const choices=workspaces.list().filter(row=>!row.recoveredFrom).map(row=>{
      const rejoin=!!state.index.spaces[row.sharedId]&&!state.index.spaces[row.sharedId].deleted.v;
      const mode=rejoin?'rejoin':'copy',candidate=plan([{id:row.id,mode}],ctx);
      return {id:row.id,name:row.name,tabCount:candidate.items?.[0]?.blob?model.liveTabCount(candidate.items[0].blob):row.urls.length,mode,rejoin,checked:candidate.ok,reason:candidate.error??null};
    });
    return {offered:true,ok:true,enabled:spaces.isEnabled(ctx),count:spaces.spaceCount(ctx),limit:model.LIMITS.spaces,choices};
  }
  async function applyNow({enabled,selections=[]}) {
    if(!offered())return {ok:false,error:'unavailable'};
    try {
      await captureLocal();const ctx=context();
      if(!enabled) {
        if(sync.setSyncSpaces(false).error)throw new Error('save-failed');persist(ctx);
        const linked=workspaces.list().filter(row=>row.sharedId);
        for(const row of linked)if(!workspaces.setSharedLink(row.id,{sharedLink:'dormant'}).ok)throw new Error('save-failed');
        spaces.setDormant(linked.map(row=>row.sharedId),ctx);persist(ctx);changed();return {ok:true,enabled:false};
      }
      const fetched=await sync.sharedIndexPreview();if(!fetched.ok)return fetched;
      if(context().accountId!==ctx.accountId)return {ok:false,error:'account-changed'};
      const result=plan(selections,ctx);if(!result.ok)return result;
      const store=spaces.rebind(ctx.accountId);
      // Drafts are never scheduled, including after a crash between staging
      // the protocol records and saving their local workspace binding.
      store.update(data=>{data.draftIds=[...new Set([...(data.draftIds??[]),...result.items.filter(item=>item.mode==='copy').map(item=>item.spaceId)])];data.draftPlans??={};for(const item of result.items)if(item.mode==='copy')data.draftPlans[item.spaceId]=item;});persist(ctx);
      for(const item of result.items) {
        if(context().accountId!==ctx.accountId)throw new Error('account-changed');
        if(item.blob) {
          spaces.noteLocalSpace(item.spaceId,item.blob,item.edits,ctx);
          spaces.setIndex({v:1,spaces:{[item.spaceId]:item.index}},ctx);persist(ctx);
        }
        const original=workspaces.list().find(row=>row.id===item.workspaceId);
        const patch={sharedId:item.spaceId,sharedLink:'active',...(item.blob?{tabIds:item.tabIds,groups:(original.groups??[]).map(group=>({...group,id:item.groupBindings[group.id]??group.id})),groupIds:(original.groupIds??[]).map(id=>item.groupBindings[id]??id)}:{})};
        if(!workspaces.setSharedLink(item.workspaceId,patch).ok)throw new Error('save-failed');
        await bind(item);
        if(context().accountId!==ctx.accountId)throw new Error('account-changed');

      }
      const active=new Set(result.items.map(item=>item.spaceId));
      store.update(data=>{data.draftIds=(data.draftIds??[]).filter(id=>!active.has(id));for(const id of active)if(data.draftPlans)delete data.draftPlans[id];});
      spaces.setDormant((store.data.dormantIds??[]).filter(id=>!active.has(id)),ctx);persist(ctx);
      if(sync.setSyncSpaces(true).error)throw new Error('save-failed');persist(ctx);changed();
      await sync.syncNow(result.items.map(item=>'space-'+item.spaceId));
      return {ok:true,enabled:true};
    } catch(error) {return {ok:false,error:['save-failed','account-changed'].includes(error.message)?error.message:'unavailable'};}
  }
  async function reconcile() {
    if(!offered())return;
    const ctx=context(),state=spaces.snapshot(ctx);if(!state.enabled)return;
    for(const [sid,records] of Object.entries(state.recoveries)) {
      if(context().accountId!==ctx.accountId)return;
      const original=workspaces.list().find(row=>row.sharedId===sid);
      const previous=workspaces.list().find(row=>row.recoveredFrom===sid);
      const done=new Set(state.recoveryDone?.[sid]??[]),fresh=Object.fromEntries(Object.entries(records.tabs??{}).filter(([id])=>!done.has(id)));
      if(!Object.keys(fresh).length){if(previous)await recoverNative(sid,previous,records);continue;}
      const blob={v:1,spaceId:sid,tabs:fresh,groups:records.groups??{}};
      const saved=workspaces.upsertShared({recoveredFrom:sid,name:recoveryName(original?.name??state.index.spaces[sid]?.name.v??'Space'),capture:recoveryCapture(previous,blob)});
      if(saved.ok){const store=spaces.rebind(ctx.accountId);store.update(data=>{data.recoveryDone??={};data.recoveryDone[sid]=[...new Set([...(data.recoveryDone[sid]??[]),...Object.keys(fresh)])];});persist(ctx);await recoverNative(sid,saved.workspace,records);}
    }
    for(const [sid,record] of Object.entries(state.index.spaces)) {
      if(context().accountId!==ctx.accountId)return;
      const existing=workspaces.list().find(row=>row.sharedId===sid);
      if(record.deleted.v){if(existing&&!isOpen(existing.id))workspaces.remove(existing.id);continue;}
      if(spaces.isDormant(sid,ctx)||spaces.isDraft(sid,ctx)||!state.blobs[sid])continue;
      workspaces.upsertShared({sharedId:sid,name:record.name.v,color:record.color.v,symbol:record.symbol.v,
        capture:existing&&isOpen(existing.id)?existing:reconcileCapture(existing,state.blobs[sid].blob)});
    }
    workspaces.reorderShared?.(model.orderOf(state.index.spaces).filter(id=>!state.index.spaces[id].deleted.v));
    changed();
  }
  function metadata(workspace,patch) {
    if(!offered()||!workspace?.sharedId)return true;
    const ctx=context(),record=spaces.snapshot(ctx).index.spaces[workspace.sharedId];if(!record)return true;
    const updated={...record};let dirty=false;
    for(const name of ['name','color','symbol','deleted','pos'])if(Object.hasOwn(patch,name)&&patch[name]!==record[name]?.v){updated[name]=model.field(patch[name],Math.max(now(),(record[name]?.c??0)+1),ctx.deviceId);dirty=true;}
    if(dirty){spaces.setIndex({v:1,spaces:{[workspace.sharedId]:updated}},ctx);try{persist(ctx);}catch{return false;}}
    return true;
  }
  function restored(id){const row=workspaces.list().find(row=>row.id===id);if(!offered()||!row?.sharedId)return true;const ctx=context(),state=spaces.snapshot(ctx);if(!state.index.spaces[row.sharedId]?.deleted.v)return true;if(!workspaces.setSharedLink(id,{sharedLink:'dormant'}).ok)return false;spaces.setDormant([...(state.dormantIds??[]),row.sharedId],ctx);try{persist(ctx);return true;}catch{return false;}}
  function reorder(){let left='';for(const row of workspaces.list().filter(row=>row.sharedId)){left=model.keyFor(left,'',row.sharedId);if(!metadata(row,{pos:left}))return false;}return true;}
  function question() {
    if(!offered())return null;
    const state=spaces.snapshot(context());if(state.enabled||!Array.isArray(state.pairingBaseline))return null;
    return devices().find(device=>!state.pairingBaseline.includes(device.deviceId)&&!(state.askedDeviceIds??[]).includes(device.deviceId))??null;
  }
  function armPairing() {if(!offered())return;const ctx=context(),store=spaces.rebind(ctx.accountId);store.update(data=>{data.pairingBaseline=devices().map(device=>device.deviceId);});store.flush();}
  function acknowledge(deviceId) {
    const ctx=context();if(!offered()||!devices().some(device=>device.deviceId===deviceId))return false;
    const store=spaces.rebind(ctx.accountId);store.update(data=>{data.askedDeviceIds=[...new Set([...(data.askedDeviceIds??[]),deviceId])];});return store.flush();
  }
  let tail=Promise.resolve();
  const apply=payload=>{const result=tail.then(()=>applyNow(payload));tail=result.catch(()=>{});return result;};
  return {preview,apply,reconcile,question,acknowledge,armPairing,metadata,reorder,restored};
}
module.exports={createSharingService};
