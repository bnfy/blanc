'use strict';
// Window orchestration over the pure adapter. Electron actions are supplied
// by main; displayed receipts and deferred targets remain local to a window.
const model=require('./shared-spaces-model');
const adapter=require('./shared-spaces-adapter');
const copy=value=>structuredClone(value);
const key=row=>`${row.kind}:${row.id}:${row.field??'*'}`;
function createRuntimeSync({read,saveWindow,writeLocal,capture,applyRow,layout,checkpoint=()=>true,now=Date.now,ids}={}) {
  const operations=new WeakMap();
  function operation(runtime) {
    if(!operations.has(runtime))operations.set(runtime,{tail:Promise.resolve(),mutating:false,pending:new Map(),superseded:new Set(),blocked:false,unsaved:null});
    return operations.get(runtime);
  }
  function save(runtime,state) {
    const op=operation(runtime);
    // Even if disk is unavailable, this is what the live window displays.
    // Keep that receipt for local diffs; replaying from the older disk receipt
    // would both echo remote actions and overwrite edits made during failure.
    op.unsaved={accountId:read(runtime)?.accountId,state:copy(state)};
    op.blocked=checkpoint(runtime,state)===false||saveWindow(runtime,state)===false;
    if(!op.blocked)op.unsaved=null;
    return !op.blocked;
  }
  function effective(context,state) {
    let target=context.blob;
    for(const row of state.accepted??[]) {
      const record=row.field?{...state.displayed[row.kind]?.[row.id],[row.field]:row.value}:row.record;
      if(record)target=model.mergeBlob(target,{v:1,spaceId:context.spaceId,tabs:{},groups:{},[row.kind]:{[row.id]:record}});
    }
    return target;
  }
  function nonvisual(before,plan) {
    const next=copy(plan.nextBaseline);
    for(const row of [...plan.apply,...plan.accept]) {
      if(row.field){if(before[row.kind]?.[row.id]?.[row.field])next[row.kind][row.id][row.field]=copy(before[row.kind][row.id][row.field]);}
      else if(before[row.kind]?.[row.id])next[row.kind][row.id]=copy(before[row.kind][row.id]);
      else delete next[row.kind][row.id];
    }
    return next;
  }
  function stateFor(context,op) {
    if(op.unsaved) {
      if(op.unsaved.accountId===context.accountId&&op.unsaved.state.spaceId===context.spaceId)return copy(op.unsaved.state);
      op.unsaved=null;op.blocked=false;
    }
    return context.window?.spaceId===context.spaceId?copy(context.window):{
      spaceId:context.spaceId,displayed:{v:1,spaceId:context.spaceId,tabs:{},groups:{}},accepted:[],groupBindings:{}};
  }
  function settleAccepted(state) {
    state.accepted=(state.accepted??[]).filter(row=>{
      const shown=state.displayed[row.kind]?.[row.id]?.[row.field];
      return !row.field||!model.acknowledged(shown,row.value,row.field);
    });
  }
  function local(runtime) {
    const context=read(runtime),op=operation(runtime);if(!context||op.mutating)return null;
    const state=stateFor(context,op),before=state.displayed;
    const diff=adapter.diffWindow(before,{...capture(runtime),groupBindings:state.groupBindings,accepted:state.accepted},now(),context.deviceId,ids);
    // A navigation's native promise can outlive its first broadcast. Suppress
    // only that remote field, not unrelated local edits in the same window.
    for(const [rowKey,row] of op.pending)if(row.field&&!op.superseded.has(rowKey)) {
      if(diff.edits[row.kind]?.[row.id]) {
        delete diff.edits[row.kind][row.id][row.field];
        if(!Object.keys(diff.edits[row.kind][row.id]).length)delete diff.edits[row.kind][row.id];
      }
      if(before[row.kind]?.[row.id]?.[row.field])diff.nextBaseline[row.kind][row.id][row.field]=copy(before[row.kind][row.id][row.field]);
    }
    for(const kind of ['tabs','groups'])if(diff.edits[kind]&&!Object.keys(diff.edits[kind]).length)delete diff.edits[kind];
    state.displayed=diff.nextBaseline;state.groupBindings=diff.groupBindings;settleAccepted(state);
    if(Object.keys(diff.edits).length)writeLocal(runtime,diff.nextBaseline,diff.edits,diff);
    save(runtime,state);return diff;
  }
  function supersede(runtime,id,field) {operation(runtime).superseded.add(key({kind:'tabs',id,field}));}
  function apply(runtime,{force=false}={}) {
    const op=operation(runtime);
    const run=async()=>{
      // Capture edits against the in-memory materialized receipt before a
      // retry can apply any remote work. Keep remote work paused if saving
      // still fails, but never pause the recording of local intent.
      if(op.blocked){local(runtime);if(op.blocked)return false;}
      const context=read(runtime);if(!context)return false;
      const initial=stateFor(context,op);
      const plan=adapter.planApply(initial.displayed,effective(context,initial),force?[]:context.protectedIds);
      initial.displayed=nonvisual(initial.displayed,plan);
      const pending=[...plan.accept,...plan.apply];
      // Persist intent before touching a live view. A crash replays the same
      // field/id, rather than manufacturing a new tab or losing the target.
      initial.accepted=pending;if(save(runtime,initial)===false)return false;
      for(const planned of plan.apply) {
        const current=read(runtime);if(!current||current.spaceId!==context.spaceId||current.accountId!==context.accountId)break;
        const latest=stateFor(current,op),livePlan=adapter.planApply(latest.displayed,effective(current,latest),force?[]:current.protectedIds);
        const row=livePlan.apply.find(candidate=>key(candidate)===key(planned));
        if(!row)continue;
        const rowKey=key(row);op.pending.set(rowKey,row);op.superseded.delete(rowKey);op.mutating=true;
        let done=false;
        try {
          const result=applyRow(runtime,{...row,...(row.op==='create'?{quiet:true}:{})});
          if(result&&typeof result.then==='function'){op.mutating=false;done=await result!==false;}
          else done=result!==false;
        } finally {op.mutating=false;op.pending.delete(rowKey);}
        const fresh=read(runtime);if(!fresh||fresh.spaceId!==context.spaceId||fresh.accountId!==context.accountId)break;
        const state=stateFor(fresh,op);
        if(done&&!op.superseded.has(rowKey)) {
          if(row.field) {
            state.displayed[row.kind][row.id]??={};
            state.displayed[row.kind][row.id][row.field]=model.mergeField(state.displayed[row.kind][row.id][row.field],row.value,row.field);
          } else state.displayed[row.kind][row.id]=copy(row.record);
          state.accepted=state.accepted.filter(candidate=>key(candidate)!==rowKey);
        }
        op.superseded.delete(rowKey);op.mutating=true;try{layout(runtime,state.displayed);}finally{op.mutating=false;}
        if(!save(runtime,state))return false;
      }
      const finalContext=read(runtime);if(!finalContext||finalContext.accountId!==context.accountId||finalContext.spaceId!==context.spaceId)return false;
      const finalState=stateFor(finalContext,op),remaining=adapter.planApply(finalState.displayed,effective(finalContext,finalState),force?[]:finalContext.protectedIds);
      finalState.displayed=nonvisual(finalState.displayed,remaining);finalState.accepted=[...remaining.accept,...remaining.apply];
      op.mutating=true;
      try {layout(runtime,finalState.displayed);}finally{op.mutating=false;}
      if(!save(runtime,finalState))return false;
      return true;
    };
    const result=op.tail.then(run);op.tail=result.catch(()=>{});return result;
  }
  return {local,apply,supersede,isMutating:runtime=>operation(runtime).mutating};
}
module.exports={createRuntimeSync};
