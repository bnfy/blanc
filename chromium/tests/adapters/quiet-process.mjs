// Retain observed renderer PIDs so a discarded-but-lingering OS process counts.
export const quietProcess={
 async tabProcessCount(w){
  w.app.releasePages();
  const tabs=(await w.snapshot()).tabs;
  const states=await Promise.all(tabs.map(t=>w.native('quietSleepState',[t.id])));
  const candidate=tabs.findIndex(t=>new URL(t.url).pathname==='/site/quietable');
  const pid=candidate<0?0:states[candidate].rendererPid;
  if(pid&&states.some((s,i)=>i!==candidate&&s.rendererPid===pid))
   throw Error('Quiet fixture shares its renderer with another tab; no isolated process decrement can be proved');
  w._quietRendererPids??=new Set();
  for(const s of states)if(s.rendererPid>0)w._quietRendererPids.add(s.rendererPid);
  return [...w._quietRendererPids].filter(pid=>{
   try{process.kill(pid,0);return true;}
   catch(error){if(error.code==='ESRCH')return false;if(error.code==='EPERM')return true;throw error;}
  }).length;
 },
};
