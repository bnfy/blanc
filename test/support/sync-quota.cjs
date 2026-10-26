'use strict';
// Disposable transaction-capable storage for the real accountant. Fault tests
// may replace transaction() to model failure before or after atomic commit.
function quotaState() {
  const values=new Map();
  const access=map=>({get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),deleteAll:async()=>map.clear()});
  const storage=access(values);
  storage.transaction=async callback=>{const staged=new Map(structuredClone([...values]));const result=await callback(access(staged));values.clear();for(const [k,v] of staged)values.set(k,v);return result;};
  return {values,storage};
}
function attachQuota(env,AccountQuota) {
  const states=new Map(),objects=new Map();
  env.ACCOUNT_QUOTA={idFromName:id=>id,get:id=>({fetch:(url,init)=>{
    if(!states.has(id))states.set(id,quotaState());
    if(!objects.has(id))objects.set(id,new AccountQuota(states.get(id),env));
    return objects.get(id).fetch(new Request(url,init));
  }})};
  return {states,objects};
}
// Test observations/faults span both authoritative backends explicitly. The
// actual Worker still uses the real KV or SQLite path, never this view.
function blobView(records,states) {
  const locate=key=>{const m=key.match(/^blob:([0-9a-f]{64}):(space-[0-9a-f]{32})$/);return m?{map:states.get(m[1])?.values,key:'blob:'+m[2]}:{map:records,key};};
  const entries=()=>{const all=new Map(records);for(const [id,state] of states)for(const [key,value] of state.values)if(key.startsWith('blob:'))all.set(`blob:${id}:${key.slice(5)}`,value);return [...all];};
  return {get:key=>{const p=locate(key);return p.map?.get(p.key);},has:key=>{const p=locate(key);return p.map?.has(p.key)??false;},delete:key=>{const p=locate(key);return p.map?.delete(p.key)??false;},keys:function*(){for(const [k] of entries())yield k;},entries:()=>entries()[Symbol.iterator](),[Symbol.iterator]:()=>entries()[Symbol.iterator]()};
}
module.exports={quotaState,attachQuota,blobView};
