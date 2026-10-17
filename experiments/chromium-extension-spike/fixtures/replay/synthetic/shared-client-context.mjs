// Resolve only observed browser-created connection ports, never fixture intent.
export function sharedClients(run,request){
 const events=run.workerEvidence.events,pages=new Map((run.source.observedPageTargets||[run.source.observedPageTarget]).filter(Boolean).map(page=>[page.targetId,page]));
 const bindings=events.filter(e=>e.method==='Runtime.bindingCalled');
 const worker=bindings.filter(e=>e.sessionId===request.sessionId);
 const installed=worker.filter(e=>e.params.type==='worker-agent-installed'&&e.sequence<request.sequence);
 if(installed.length!==1)return {status:'gap',reason:'shared-agent-not-installed-before-request'};
 const realms=events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.sessionId===request.sessionId);
 if(realms.length!==1||worker.some(e=>e.params.executionContextId!==realms[0].params.context.id))return {status:'gap',reason:'shared-worker-binding-realm-mismatch'};
 const connections=worker.filter(e=>e.params.type==='worker-connect'&&e.sequence<request.sequence);
 if(connections.some(e=>e.sequence<=installed[0].sequence))return {status:'gap',reason:'shared-agent-installed-too-late'};
 if(!connections.length)return {status:'gap',reason:'shared-no-observed-connection'};
 // Any observed construction that cannot be accounted for could be another
 // pending client. Refuse it rather than publishing an incomplete client set.
 for(const client of bindings.filter(e=>e.params.type==='client-created'&&e.sequence<request.sequence)){
  const matches=bindings.filter(e=>e.params.type==='worker-peer'&&e.params.token===client.params.token);
  if(matches.length!==1)return {status:'gap',reason:'shared-unaccounted-construction'};
  if(matches[0].sessionId===request.sessionId&&!connections.some(e=>e.params.portToken===matches[0].params.portToken))return {status:'gap',reason:'shared-pending-connection'};
 }
 const members=new Map(),proof=[];let endedDocuments=0;
 for(const connection of connections){
  const token=connection.params.portToken;
  if(typeof token!=='string'||worker.filter(e=>e.params.type==='worker-connect'&&e.params.portToken===token).length!==1)return {status:'gap',reason:'shared-connection-ambiguous'};
  const peers=worker.filter(e=>e.params.type==='worker-peer'&&e.params.portToken===token&&e.sequence>connection.sequence);
  if(peers.length!==1)return {status:'gap',reason:'shared-peer-handshake-missing-or-ambiguous'};
  const peer=peers[0],clientToken=peer.params.token;
  const creates=bindings.filter(e=>e.params.type==='client-created'&&e.params.token===clientToken&&e.sequence<connection.sequence);
  if(creates.length!==1)return {status:'gap',reason:'shared-client-challenge-not-unique'};
  const client=creates[0];
  if(bindings.filter(e=>e.params.type==='worker-peer'&&e.params.token===clientToken).length!==1)return {status:'gap',reason:'shared-challenge-reused'};
  const realms=events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.sessionId===client.sessionId&&e.params.context.id===client.params.executionContextId&&e.sequence<client.sequence);
  if(realms.length!==1)return {status:'gap',reason:'shared-client-realm-unresolved'};
  const realm=realms[0].params.context;
  const attaches=events.filter(e=>e.method==='Target.attachedToTarget'&&e.params.sessionId===client.sessionId),targetId=attaches[0]?.params.targetInfo.targetId;
  if(attaches.length!==1||!pages.has(targetId)||!realm.auxData?.isDefault||realm.auxData.frameId!==targetId)return {status:'gap',reason:'shared-client-target-unobserved'};
  if(!bindings.some(e=>e.sessionId===client.sessionId&&e.params.executionContextId===client.params.executionContextId&&e.params.type==='page-agent-installed'&&e.sequence<client.sequence))return {status:'gap',reason:'shared-page-agent-missing'};
  const through=Math.max(request.sequence,peer.sequence),beforeRequest=e=>e.sequence>client.sequence&&e.sequence<request.sequence;
  const pageGone=bindings.some(e=>beforeRequest(e)&&e.params.type==='client-document-gone'&&e.params.token===clientToken);
  const portGone=bindings.some(e=>beforeRequest(e)&&((e.params.type==='client-port-close'&&e.params.token===clientToken)||(e.params.type==='worker-port-close'&&e.sessionId===request.sessionId&&e.params.portToken===token)));
  const destroyed=events.some(e=>e.sessionId===client.sessionId&&beforeRequest(e)&&(e.method==='Runtime.executionContextsCleared'||(e.method==='Runtime.executionContextDestroyed'&&e.params.executionContextId===client.params.executionContextId)));
  const detached=events.some(e=>e.method==='Target.detachedFromTarget'&&e.params.sessionId===client.sessionId&&beforeRequest(e));
  const anyEnded=pageGone||portGone||destroyed||detached;
  if(anyEnded&&!destroyed&&!detached)return {status:'gap',reason:'shared-client-teardown-incomplete'};
  if(destroyed||detached){endedDocuments++;proof.push({connectionSequence:connection.sequence,peerSequence:peer.sequence,clientSequence:client.sequence,clientTargetId:targetId,endedBeforeRequest:true,teardownEvidence:destroyed?'realm-destroyed':'target-detached'});continue;}
  const endedThrough=bindings.some(e=>e.sequence<=through&&e.sequence>client.sequence&&((['client-port-close','client-document-gone'].includes(e.params.type)&&e.params.token===clientToken)||(e.params.type==='worker-port-close'&&e.sessionId===request.sessionId&&e.params.portToken===token)))||events.some(e=>e.sessionId===client.sessionId&&e.sequence>client.sequence&&e.sequence<=through&&(e.method==='Runtime.executionContextsCleared'||(e.method==='Runtime.executionContextDestroyed'&&e.params.executionContextId===client.params.executionContextId)));
  if(endedThrough)return {status:'gap',reason:'shared-client-lifetime-incomplete'};
  let origin;try{origin=new URL(realm.origin).origin;if(origin==='null')throw Error();}catch{return {status:'gap',reason:'shared-client-origin-unresolved'};}
  const member=members.get(targetId)||{role:'observed-page-target',origin,ports:0};member.ports++;members.set(targetId,member);
  proof.push({connectionSequence:connection.sequence,peerSequence:peer.sequence,clientSequence:client.sequence,clientTargetId:targetId,endedBeforeRequest:false});
 }
 const grouped=new Map();for(const member of members.values()){const key=member.role+'\0'+member.origin,current=grouped.get(key)||{role:member.role,origin:member.origin,documents:0,ports:0};current.documents++;current.ports+=member.ports;grouped.set(key,current);}
 const normalized=[...grouped.values()].sort((a,b)=>(a.role+a.origin).localeCompare(b.role+b.origin)).map(member=>member.documents===1?{role:member.role,origin:member.origin,ports:member.ports}:member);
 return {status:'resolved',clients:{kind:'connected-documents',status:'observed-port-handshake',members:normalized,...(endedDocuments?{endedDocuments}: {})},proof};
}
