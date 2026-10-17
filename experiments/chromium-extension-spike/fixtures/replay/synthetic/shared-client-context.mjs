// Resolve only observed browser-created connection ports, never fixture intent.
export function sharedClients(run,request){
 const events=run.workerEvidence.events,page=run.source.observedPageTarget;
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
 const members=new Map(),proof=[];
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
  const attaches=events.filter(e=>e.method==='Target.attachedToTarget'&&e.params.sessionId===client.sessionId);
  if(attaches.length!==1||attaches[0].params.targetInfo.targetId!==page.targetId||!realm.auxData?.isDefault||realm.auxData.frameId!==page.targetId)return {status:'gap',reason:'shared-client-target-unobserved'};
  if(!bindings.some(e=>e.sessionId===client.sessionId&&e.params.executionContextId===client.params.executionContextId&&e.params.type==='page-agent-installed'&&e.sequence<client.sequence))return {status:'gap',reason:'shared-page-agent-missing'};
  const through=Math.max(request.sequence,peer.sequence);
  const gone=bindings.some(e=>e.sequence<=through&&e.sequence>client.sequence&&((['client-port-close','client-document-gone'].includes(e.params.type)&&e.params.token===clientToken)||(e.params.type==='worker-port-close'&&e.sessionId===request.sessionId&&e.params.portToken===token)));
  const destroyed=events.some(e=>e.sessionId===client.sessionId&&e.sequence>client.sequence&&e.sequence<=through&&(e.method==='Runtime.executionContextsCleared'||(e.method==='Runtime.executionContextDestroyed'&&e.params.executionContextId===client.params.executionContextId)));
  if(gone||destroyed)return {status:'gap',reason:'shared-client-lifetime-incomplete'};
  let origin;try{origin=new URL(realm.origin).origin;if(origin==='null')throw Error();}catch{return {status:'gap',reason:'shared-client-origin-unresolved'};}
  const member=members.get(page.targetId)||{role:'observed-page-target',origin,ports:0};member.ports++;members.set(page.targetId,member);
  proof.push({connectionSequence:connection.sequence,peerSequence:peer.sequence,clientSequence:client.sequence,clientTargetId:page.targetId});
 }
 return {status:'resolved',clients:{kind:'connected-documents',status:'observed-port-handshake',members:[...members.values()]},proof};
}
