'use strict';
// Local test server for the actual v1 Worker. Only KV and explicitly injected
// faults are simulated; route parsing, limits, versions and DELETE are upstream.
const http=require('node:http');
const fs=require('node:fs');
const {AsyncLocalStorage}=require('node:async_hooks');
const {quotaState,blobView}=require('../../support/sync-quota.cjs');
const workerModulePromise=import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../../cloudflare/sync-worker/src/index.js')).toString('base64')}`);

async function createSyncFixture({pageSize=2,now=()=>Date.now()}={}) {
  const workerModule=await workerModulePromise,worker=workerModule.default,records=new Map(),expires=new Map(),scope=new AsyncLocalStorage();
  const requests=[],rules=[],clientServers=[],clients=new Map();let race=null,url;
  const raw=k=>{if(expires.has(k)&&expires.get(k)<=now()){expires.delete(k);records.delete(k);}return records.get(k)??null;};
  const env={records,NEW_ACCOUNT_DAILY_LIMIT:'10',ACCOUNT_STORAGE_QUOTA_BYTES:String(20*1024*1024),ACCOUNT_STORAGE_MAX_STORES:'256',SYNC:{
    get:async(key,options)=>{
      const context=scope.getStore();let value=raw(key);
      if(context?.fault?.type==='stale'&&key===context.blobKey)value=context.fault.frozen;
      const barrier=race;
      if(barrier&&context?.method==='PUT'&&key===barrier.key) {
        // Capture the old version BEFORE yielding. This makes the real
        // read-then-write Worker check exhibit its documented non-atomic race.
        barrier.arrived++;
        if(barrier.arrived===barrier.count){clearTimeout(barrier.timer);race=null;barrier.release();}
        await barrier.ready;
      }
      return value!==null&&options?.type==='json'?JSON.parse(value):value;
    },
    put:async(key,value,options={})=>{records.set(key,String(value));if(options.expirationTtl)expires.set(key,now()+options.expirationTtl*1000);else expires.delete(key);},
    delete:async key=>{records.delete(key);expires.delete(key);},
    list:async({prefix='',cursor}={})=>{
      const all=[...records.keys()].filter(k=>raw(k)!==null&&k.startsWith(prefix)).sort(),start=Number(cursor??0),end=start+pageSize;
      return {keys:all.slice(start,end).map(name=>({name})),list_complete:end>=all.length,...(end<all.length?{cursor:String(end)}:{})};
    },
  }};
  const quotaObjects=new Map(),quotaStates=new Map();
  env.ACCOUNT_QUOTA={idFromName:name=>name,get:id=>({fetch:(url,init)=>{
    let object=quotaObjects.get(id);if(!object){let state=quotaStates.get(id);if(!state){state=quotaState();quotaStates.set(id,state);}object=new workerModule.AccountQuota(state,env);quotaObjects.set(id,object);}
    return (async()=>{
      const response=await object.fetch(new Request(url,init));
      if(new URL(url).pathname!=='/read'||!response.ok)return response;
      const context=scope.getStore(),barrier=race;
      if(barrier&&context?.method==='PUT'&&context.blobKey===barrier.key){barrier.arrived++;if(barrier.arrived===barrier.count){clearTimeout(barrier.timer);race=null;barrier.release();}await barrier.ready;}
      if(context?.fault?.type==='stale')return Response.json({record:context.fault.frozen?JSON.parse(context.fault.frozen):null});
      return response;
    })();
  }})};
  const blobs=blobView(records,quotaStates);
  async function loseBlob(accountId,store){
    blobs.delete(`blob:${accountId}:${store}`);
    const state=quotaStates.get(accountId),ledger=await state?.storage.get('ledger');
    if(ledger?.stores[store]){delete ledger.stores[store];await state.storage.put('ledger',ledger);quotaObjects.delete(accountId);}
  }
  function inject(input) {
    const rule={...input,remaining:input.times??1};
    if(rule.type==='stale') {
      if(!rule.accountId||!rule.store)throw new TypeError('Stale-read fault needs accountId and store');
      rule.frozen=blobs.get(`blob:${rule.accountId}:${rule.store}`)??null;
    }
    rules.push(rule);return rule;
  }
  function matches(rule,event) {
    const method=rule.method??(rule.type==='stale'?'GET':['disappear','hook'].includes(rule.type)?'PUT':null);
    return rule.remaining>0&&(!method||event.method===method)&&(!rule.store||event.store===rule.store)&&(!rule.accountId||event.accountId===rule.accountId)
      &&(!rule.spacesOnly||['spaces','closed','shared'].includes(event.store)||event.store?.startsWith('space-'));
  }
  async function dispatch(request) {
    const path=new URL(request.url).pathname,parts=path.match(/^\/v1\/blob\/([0-9a-f]{64})(?:\/([^/]+))?$/);
    const event={url:request.url,client:clients.get(new URL(request.url).origin)??'A',method:request.method,accountId:parts?.[1],store:parts?.[2],at:now()};requests.push(event);
    const fault=rules.find(rule=>matches(rule,event));if(fault)fault.remaining--;
    if(fault?.type==='network'){event.status='network';throw new Error('Injected network failure');}
    if(fault?.type==='429'){event.status=429;return Response.json({error:'rate-limited'},{status:429});}
    if(fault?.type==='unknown-store'){event.status=404;return new Response('unknown store',{status:404});}
    if(fault?.type==='hook')await fault.before(event);
    const blobKey=`blob:${event.accountId}:${event.store}`;
    const response=await scope.run({...event,fault,blobKey},()=>worker.fetch(request,env));
    event.status=response.status;
    if(fault?.type==='disappear'&&request.method==='PUT'&&response.ok){
      // Explicit storage-loss fault: remove both halves of the committed row.
      // SQLite's normal transactional path cannot produce this split itself.
      await loseBlob(event.accountId,event.store);
    }
    return response;
  }
  const handler=async(req,res)=>{
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=chunks.length?Buffer.concat(chunks):undefined;
      const request=new Request('http://127.0.0.1:'+req.socket.localPort+req.url,{method:req.method,headers:req.headers,...(body?{body,duplex:'half'}:{})});
      const response=await dispatch(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch(error) {req.socket.destroy(error);}
  };
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  url='http://127.0.0.1:'+server.address().port;
  return {url,env,blobs,loseBlob,requests,inject,dispatch,
    quotaUsage:async accountId=>{const ledger=await quotaStates.get(accountId)?.storage.get('ledger');return {bytes:workerModule.AccountQuota.fixedReservationBytes+Object.values(ledger?.stores??{}).reduce((sum,row)=>sum+row.bytes+256,0),stores:8+Object.keys(ledger?.stores??{}).length};},
    clientEndpoint:async name=>{const server=http.createServer(handler);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});clientServers.push(server);const origin='http://127.0.0.1:'+server.address().port;clients.set(origin,name);return origin;},
    beforeNextPut:(store,before)=>inject({type:'hook',store,before}),
    raceNextPuts:({accountId,store,count=2})=>{
      if(race)throw new Error('A concurrent PUT barrier is already pending');
      let release,fail;const ready=new Promise((resolve,reject)=>{release=resolve;fail=reject;});
      race={key:`blob:${accountId}:${store}`,count,arrived:0,release,ready,timer:setTimeout(()=>{race=null;fail(new Error('Concurrent PUT barrier timed out'));},10000)};
    },
    close:async()=>{if(race){clearTimeout(race.timer);race.release();race=null;}for(const item of [...clientServers,server]){item.closeAllConnections?.();await new Promise((resolve,reject)=>item.close(error=>error?reject(error):resolve()));}},
  };
}
module.exports={createSyncFixture};
