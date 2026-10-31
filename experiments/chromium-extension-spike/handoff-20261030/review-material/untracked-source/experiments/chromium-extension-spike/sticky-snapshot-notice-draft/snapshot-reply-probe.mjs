// Test-only instrumentation installed into an owned disposable host page.
// It drops one successful native snapshot reply per armed phase; no extra
// snapshot or user-profile request is manufactured.
export function installSnapshotReplyProbe() {
  const status=document.getElementById('status'),originalSend=chrome.send,originalReply=window.blancPrototypeReply;
  if(!status||typeof originalSend!=='function'||typeof originalReply!=='function'||typeof window.BlancPrototypeHost?.notice!=='function')throw Error('host observer unavailable');
  const seen=new Set();
  const state={phase:null,history:[]};window.__snapshotNoticeProbe=state;
  state.arm=function(name){
    if(!['recovery','unrelated'].includes(name)||!status.hidden||state.phase&&!state.phase.completed)throw Error('fixture phase not ready');
    state.phase={name,dropId:null,dropAt:null,dropped:false,droppedSuccess:null,timeoutSeen:false,timeoutAt:null,warningInjected:false,successes:[],completed:false};
    state.history.push(state.phase);
  };
  const onStatus=()=>{
    const phase=state.phase;if(!phase||phase.completed)return;
    if(!status.hidden&&status.textContent==='Native bridge timed out: snapshot'&&phase.dropped&&phase.droppedSuccess===true&&performance.now()-phase.dropAt>=9900){
      if(!phase.timeoutSeen){phase.timeoutSeen=true;phase.timeoutAt=performance.now();}
      if(phase.name==='unrelated'&&!phase.warningInjected){phase.warningInjected=true;window.BlancPrototypeHost.notice('fixture unrelated warning');}
    }
  };
  new MutationObserver(onStatus).observe(status,{attributes:true,childList:true,characterData:true,subtree:true});
  const send=function(name,args){
    if(name==='blancPrototype'&&Array.isArray(args)&&args[1]==='snapshot'){
      const id=String(args[0]);seen.add(id);const phase=state.phase;
      if(phase&&!phase.completed&&phase.dropId===null){phase.dropId=id;phase.dropAt=performance.now();}
    }
    return originalSend.apply(this,arguments);
  };
  const reply=function(id,ok,value){
    const key=String(id),phase=state.phase;
    if(phase&&!phase.completed&&key===phase.dropId&&!phase.dropped){phase.dropped=true;phase.droppedSuccess=ok===true&&Array.isArray(value?.tabs);return;}
    const ret=originalReply.apply(this,arguments);
    if(phase&&!phase.completed&&seen.has(key)&&phase.dropId!==null&&/^\d+$/.test(key)&&/^\d+$/.test(phase.dropId)&&BigInt(key)>BigInt(phase.dropId)&&ok===true&&Array.isArray(value?.tabs)){
      queueMicrotask(()=>{phase.successes.push({id:key,timeMs:performance.now(),hidden:status.hidden,timeoutVisible:!status.hidden&&status.textContent==='Native bridge timed out: snapshot',unrelatedVisible:!status.hidden&&status.textContent==='fixture unrelated warning'});});
    }
    return ret;
  };
  chrome.send=send;window.blancPrototypeReply=reply;
  if(chrome.send!==send||window.blancPrototypeReply!==reply)throw Error('host observer cannot be installed');
}
