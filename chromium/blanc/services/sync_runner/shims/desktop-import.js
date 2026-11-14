// Ephemeral desktop import state in the sandboxed utility process. No fs,
// network, credential, telemetry or Sync calls. Only native code supplies bytes
// and ownership; UI-facing replies are projections, never the apply plans.
const {createTabImportSessionStore}=__require('src/main/tab-import-session.js');
const {proposeFromSourceGroups,validateProposal}=__require('src/main/tab-import-organizer.js');
const {planTabImportApply}=__require('src/main/tab-import-apply.js');
const {parseChromiumSession}=__require('src/main/chromium-session.js');
const {parseArcSidebar,planArcSpacesImport}=__require('src/main/arc-sidebar.js');
const Bytes=__require('shim:desktop-import-buffer');
const uuid=()=>__require('shim:crypto').randomUUID();
const tabs=createTabImportSessionStore(), arcs=new Map();
// Idle state expires even when no later import operation arrives.
setInterval(()=>{tabs.expireIdleSessions();for(const [key,value] of arcs)if(Date.now()-value.at>15*60*1000)arcs.delete(key);},60000).unref();
const ownerOf=key=>({runtimeId:key,profileId:'native-owner'});
function valid(owner,id){return tabs.ownSession(id,ownerOf(owner));}
function projection(owner,id){const owned=valid(owner,id);return owned.error?owned:{sessionId:id,generation:owned.generation,...tabs.projectCandidates(id,ownerOf(owner))};}
function parse(bytes){
 if(typeof bytes!=='string'||bytes.length>Math.ceil(64*1024*1024/3)*4)return {error:'session-too-large'};
 const result=parseChromiumSession(Bytes.from(bytes,'base64'));
 // A changing/incomplete tail is not a verified newest snapshot.
 return result.partialTail?{error:'incomplete-session'}:result;
}
function arc(owner,id){const current=arcs.get(owner);if(!current||current.id!==id||Date.now()-current.at>15*60*1000){arcs.delete(owner);return null;}current.at=Date.now();return current;}
module.exports=function(owner,command,args=[]){
 if(typeof owner!=='string'||!owner||owner.length>128||!Array.isArray(args))return {error:'forbidden'};
 tabs.expireIdleSessions();for(const [key,value] of arcs)if(Date.now()-value.at>15*60*1000)arcs.delete(key);
 if(command==='discard'){tabs.destroyForRuntime(owner);arcs.delete(owner);return {ok:true};}
 if(command==='preflight'){const parsed=parse(args[0]);return parsed.error?{error:parsed.error}:{ok:true,count:parsed.candidates.length};}
 if(command==='open'){
  tabs.destroyForRuntime(owner);
  const parsed=parse(args[0]);if(parsed.error)return {error:parsed.error};
  const made=tabs.createSession({...ownerOf(owner),sourceKind:'chromium',sourceLabel:String(args[1]??'').slice(0,240)});
  const candidates=parsed.candidates.map(c=>({...c,title:(!c.title||c.title===c.url?new URL(c.url).hostname:c.title).slice(0,240)}));
  const assigned=tabs.assignCandidates(made.sessionId,candidates,ownerOf(owner));
  if(assigned.error){tabs.destroyForRuntime(owner);return assigned;}
  return {...projection(owner,made.sessionId),windowCount:parsed.windowCount,excludedCount:parsed.excludedCount};
 }
 if(command==='project')return projection(owner,args[0]);
 if(command==='select'){
  const owned=valid(owner,args[0]);if(owned.error)return owned;
  const result=tabs.setSelection(args[0],args[1],ownerOf(owner));return result.error?result:projection(owner,args[0]);
 }
 if(command==='suggest'){
  const projected=projection(owner,args[0]);if(projected.error)return projected;
  const chosen=projected.candidates.filter(c=>c.selected&&!c.excluded);
  const checked=validateProposal(proposeFromSourceGroups(chosen),{selectedIds:chosen.map(c=>c.candidateId),excludedIds:projected.candidates.filter(c=>c.excluded).map(c=>c.candidateId)});
  return checked.ok?{generation:projected.generation,proposal:checked.proposal}:{error:'invalid-proposal'};
 }
 if(command==='plan'){
  const owned=valid(owner,args[0]);if(owned.error)return owned;
  const resolved=tabs.resolveApply(args[0],args[1],ownerOf(owner));if(resolved.error)return resolved;
  return planTabImportApply({candidates:resolved.entries,proposal:{version:1,groups:resolved.groups,ungroupedCandidateIds:resolved.ungroupedCandidateIds},existingGroupNames:args[2]??[]});
 }
 if(command==='cancel'){
  const owned=valid(owner,args[0]);if(owned.error)return owned;
  tabs.destroySession(args[0],'cancel');return {ok:true};
 }
 if(command==='arcOpen'){
  arcs.delete(owner);const parsed=parseArcSidebar(args[0]);if(parsed.error)return parsed;
  if(!parsed.spaces.some(s=>s.tabs.length)&&!parsed.favorites.length)return {error:'empty'};
  const ids=new Map(),id=uuid();let unnamed=0;
  const spaces=parsed.spaces.map(s=>{const opaque=`space-${ids.size+1}`;ids.set(opaque,s.sourceSpaceId);return {id:opaque,name:s.name??`Space ${++unnamed}`,tabCount:s.tabs.length,pinnedCount:s.tabs.filter(t=>t.section==='pinned'&&t.folderKey===null).length,todayCount:s.tabs.filter(t=>t.section==='today'&&t.folderKey===null).length,folderCount:s.folders.length,separateProfile:s.arcProfile==='custom'};});
  arcs.set(owner,{id,parsed,ids,at:Date.now()});
  return {sessionId:id,source:args[1]==='file'?'file':'arc',spaces,favoritesCount:parsed.favorites.length,skippedCount:parsed.skippedCount,remainingSlots:args[2]??0};
 }
 if(command==='arcPlan'){
  const current=arc(owner,args[0]);if(!current)return {error:'session-unavailable'};
  const request=args[1]??{},ids=Array.isArray(request.spaceIds)?[...new Set(request.spaceIds)]:[];
  if(ids.some(id=>!current.ids.has(id)))return {error:'invalid-selection'};
  const favorites=request.favorites===true?current.parsed.favorites:[];
  if(!ids.length&&!favorites.length)return {error:'nothing-selected'};
  const planned=planArcSpacesImport({spaces:current.parsed.spaces,selectedSpaceIds:ids.map(id=>current.ids.get(id)),existingWorkspaceNames:args[2]??[],remainingSlots:args[3]??0,untitledName:n=>`Space ${n}`,randomId:uuid});
  if(planned.error)return planned;
  if(planned.noRoom.length)return {error:'no-room',remainingSlots:args[3]??0};
  return {spaces:planned.planned.map(({name,capture})=>({name,capture})),favorites,emptyCount:planned.empty.length,droppedCount:planned.planned.reduce((n,s)=>n+s.droppedCount,0)};
 }
 if(command==='arcCancel'){if(arc(owner,args[0]))arcs.delete(owner);return {ok:true};}
 if(command==='arcHasSession')return !!arcs.get(owner);
 return {error:'unknown-operation'};
};
