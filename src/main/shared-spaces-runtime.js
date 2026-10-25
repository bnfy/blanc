'use strict';
// Window orchestration over the pure adapter. Electron actions are supplied
// by main; displayed receipts and deferred targets remain local to a window.
const model=require('./shared-spaces-model');
const adapter=require('./shared-spaces-adapter');
const copy=value=>structuredClone(value);
const key=row=>`${row.kind}:${row.id}:${row.field??'*'}`;
function createRuntimeSync({read,saveWindow,writeLocal,capture,applyRow,layout,now=Date.now,ids}={}) {
  const operations=new WeakMap();
  function operation(runtime) {
    if(!operations.has(runtime))operations.set(runtime,{tail:Promise.resolve(),mutating:false,pending:new Map(),superseded:new Set()});
    return operations.get(runtime);
  }
  function stateFor(context) {
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
    const state=stateFor(context),before=state.displayed;
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
    saveWindow(runtime,state);return diff;
  }
  function supersede(runtime,id,field) {operation(runtime).superseded.add(key({kind:'tabs',id,field}));}
  function apply(runtime,{force=false}={}) {
    const op=operation(runtime);
    const run=async()=>{
      const context=read(runtime);if(!context)return false;
      const initial=stateFor(context);
      let target=context.blob;
      for(const row of initial.accepted??[]) {
        const record=row.field?{...initial.displayed[row.kind]?.[row.id],[row.field]:row.value}:row.record;
        if(record)target=model.mergeBlob(target,{v:1,spaceId:context.spaceId,tabs:{},groups:{},[row.kind]:{[row.id]:record}});
      }
      const plan=adapter.planApply(initial.displayed,target,force?[]:context.protectedIds);
      const pending=[...plan.accept,...plan.apply];
      // Persist intent before touching a live view. A crash replays the same
      // field/id, rather than manufacturing a new tab or losing the target.
      initial.accepted=pending;if(saveWindow(runtime,initial)===false)return false;
      for(const row of plan.apply) {
        const current=read(runtime);if(!current||current.spaceId!==context.spaceId||current.accountId!==context.accountId)break;
        const rowKey=key(row);op.pending.set(rowKey,row);op.superseded.delete(rowKey);op.mutating=true;
        let done=false;
        try {
          const result=applyRow(runtime,{...row,...(row.op==='create'?{quiet:true}:{})});
          if(result&&typeof result.then==='function'){op.mutating=false;done=await result!==false;}
          else done=result!==false;
        } finally {op.mutating=false;op.pending.delete(rowKey);}
        const fresh=read(runtime);if(!fresh||fresh.spaceId!==context.spaceId||fresh.accountId!==context.accountId)break;
        const state=stateFor(fresh);
        if(done&&!op.superseded.has(rowKey)) {
          if(row.field) {
            state.displayed[row.kind][row.id]??={};
            state.displayed[row.kind][row.id][row.field]=model.mergeField(state.displayed[row.kind][row.id][row.field],row.value,row.field);
          } else state.displayed[row.kind][row.id]=copy(row.record);
          state.accepted=state.accepted.filter(candidate=>key(candidate)!==rowKey);
        }
        op.superseded.delete(rowKey);saveWindow(runtime,state);
      }
      op.mutating=true;
      try {layout(runtime,read(runtime)?.blob);}finally{op.mutating=false;}
      return true;
    };
    const result=op.tail.then(run);op.tail=result.catch(()=>{});return result;
  }
  return {local,apply,supersede,isMutating:runtime=>operation(runtime).mutating};
}
module.exports={createRuntimeSync};
