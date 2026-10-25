'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let createSyncFixture;try{({createSyncFixture}=require('../desktop/support/sync-fixture'));}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const worker=import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`).then(m=>m.default);
const account='a'.repeat(64),sid=n=>n.toString(16).padStart(32,'0');
function directStorage() {
  const records=new Map();return {records,SYNC:{get:async(k,o)=>{const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
    put:async(k,v)=>records.set(k,v),delete:async k=>records.delete(k),
    list:async({prefix='',cursor}={})=>{const all=[...records.keys()].filter(k=>k.startsWith(prefix)).sort(),start=Number(cursor??0);return {keys:all.slice(start,start+2).map(name=>({name})),list_complete:start+2>=all.length,...(start+2<all.length?{cursor:String(start+2)}:{})};}}};
}
const options=(method,body)=>({method,...(body===undefined?{}:{body:JSON.stringify(body),headers:{'content-type':'application/json'},duplex:'half'})});
const parsed=async response=>{const text=await response.text();try{return JSON.parse(text);}catch{return text;}};
function normalize(versions) {
  return function stable(value) {
    if(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value)){if(!versions.has(value))versions.set(value,'version-'+(versions.size+1));return versions.get(value);}
    if(Array.isArray(value))return value.map(stable);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
    return value;
  };
}
test('fixture HTTP routes, statuses, bodies and stored keys match the real Worker handler',async t=>{
  assert.equal(typeof createSyncFixture,'function');t.mock.method(Date,'now',()=>1800000000000);
  const fixture=await createSyncFixture({pageSize:2});t.after(()=>fixture.close());const direct=directStorage(),stable=[normalize(new Map()),normalize(new Map())];
  async function pair(method,store,body,who=account) {
    const path='/v1/blob/'+who+(store?'/'+store:'');const bodies=Array.isArray(body)?body:[body,body];
    const responses=await Promise.all([(await worker).fetch(new Request('https://direct.test'+path,options(method,bodies[0])),direct),fetch(fixture.url+path,options(method,bodies[1]))]);
    const values=await Promise.all(responses.map(parsed));assert.equal(responses[0].status,responses[1].status);
    assert.deepEqual(stable[0](values[0]),stable[1](values[1]));return {status:responses[0].status,values};
  }
  assert.equal((await pair('GET','space-'+sid(1))).status,404);
  for(const store of ['spaces','closed','shared','space-'+sid(1)]) {
    const made=await pair('PUT',store,{blob:{ct:'one'},ifVersion:null});assert.equal(made.status,200);
    assert.equal((await pair('GET',store)).status,200);
    assert.equal((await pair('PUT',store,{blob:{ct:'wrong'},ifVersion:'old-version'})).status,409);
    assert.equal((await pair('PUT',store,made.values.map(v=>({blob:{ct:'two'},ifVersion:v.version})))).status,200);
  }
  assert.equal((await pair('GET','space-'+ 'A'.repeat(32))).status,404);
  assert.equal((await pair('PUT','space-'+sid(2),{blob:{ct:'x'.repeat(524288)}})).status,413);
  let last;for(let n=0;n<32;n++)last=await pair('GET','bookmarks',undefined,'c'.repeat(64));assert.equal(last.status,429);
  for(let n=10;n<16;n++)for(const env of [direct,fixture.env])env.records.set(`blob:${account}:space-${sid(n)}`,'{}');
  assert.equal((await pair('DELETE','')).status,204);
  assert.equal([...fixture.env.records.keys()].some(k=>k.startsWith('blob:'+account+':')),false);
  const stored=env=>Object.fromEntries([...env.records].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>{try{return [k,JSON.parse(v)];}catch{return [k,v];}}));
  assert.deepEqual(stable[0](stored(direct)),stable[1](stored(fixture.env)));
});
test('same-version concurrent PUTs both succeed through the real non-atomic Worker check',async t=>{
  const f=await createSyncFixture();t.after(()=>f.close());const store='space-'+sid(1),url=f.url+'/v1/blob/'+account+'/'+store;
  const first=await (await fetch(url,options('PUT',{blob:{ct:'seed'},ifVersion:null}))).json();
  f.raceNextPuts({accountId:account,store,count:2});
  const writes=await Promise.all(['A','B'].map(ct=>fetch(url,options('PUT',{blob:{ct},ifVersion:first.version}))));
  assert.deepEqual(writes.map(x=>x.status),[200,200]);
  const final=await (await fetch(url)).json();assert.ok(['A','B'].includes(final.blob.ct));
});
test('stale reads and acknowledged disappearing writes change KV visibility without replacing the handler',async t=>{
  const f=await createSyncFixture();t.after(()=>f.close());const store='space-'+sid(1),url=f.url+'/v1/blob/'+account+'/'+store;
  const seed=await (await fetch(url,options('PUT',{blob:{ct:'old'},ifVersion:null}))).json();
  f.inject({type:'stale',accountId:account,store,times:2});
  const next=await (await fetch(url,options('PUT',{blob:{ct:'new'},ifVersion:seed.version}))).json();
  for(let n=0;n<2;n++)assert.equal((await (await fetch(url)).json()).blob.ct,'old');
  assert.equal((await (await fetch(url)).json()).blob.ct,'new');
  f.inject({type:'disappear',accountId:account,store});
  assert.equal((await fetch(url,options('PUT',{blob:{ct:'lost'},ifVersion:next.version}))).status,200);
  assert.equal((await fetch(url)).status,404);
});
test('fixture fault modes distinguish rate limiting, old Worker routes and network failure',async t=>{
  const f=await createSyncFixture();t.after(()=>f.close());const root=f.url+'/v1/blob/'+account+'/';
  f.inject({type:'429',store:'spaces',times:2});
  assert.equal((await fetch(root+'spaces')).status,429);assert.equal((await fetch(root+'spaces')).status,429);assert.equal((await fetch(root+'spaces')).status,404);
  f.inject({type:'unknown-store',spacesOnly:true,times:Infinity});
  assert.equal(await (await fetch(root+'spaces')).text(),'unknown store');assert.equal(await (await fetch(root+'bookmarks')).text(),'not found');
  f.inject({type:'network',store:'settings'});await assert.rejects(fetch(root+'settings'));
});
