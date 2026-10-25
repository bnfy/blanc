'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`).then(m=>m.default);
const account='a'.repeat(64), other='b'.repeat(64);
const sid=n=>n.toString(16).padStart(32,'0');
function storage(vars={}) {
  const records=new Map(),lists=[],deletes=[];
  return {...vars,records,lists,deletes,SYNC:{
    get:async(k,o)=>{const v=records.get(k)??null;return v&&o?.type==='json'?JSON.parse(v):v;},
    put:async(k,v)=>records.set(k,v),delete:async k=>{deletes.push(k);records.delete(k);},
    list:async({prefix='',cursor}={})=>{lists.push({prefix,cursor});const all=[...records.keys()].filter(k=>k.startsWith(prefix)).sort();const start=Number(cursor??0),end=start+2;return {keys:all.slice(start,end).map(name=>({name})),list_complete:end>=all.length,...(end<all.length?{cursor:String(end)}:{})};},
  }};
}
async function request(env,method,store,body,who=account,headers={}) {
  return (await worker).fetch(new Request(`https://sync.test/v1/blob/${who}${store?'/'+store:''}`,{method,headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body),duplex:'half'})}),env);
}

test('space blobs and new fixed stores retain round trips and optimistic versions',async()=>{
  for(const store of ['spaces','closed','shared','space-'+sid(1)]) {
    const env=storage();
    const put=await request(env,'PUT',store,{blob:{ct:'one'},ifVersion:null});assert.equal(put.status,200);
    const version=(await put.json()).version;
    const get=await request(env,'GET',store);assert.equal(get.status,200);assert.deepEqual(await get.json(),{version,blob:{ct:'one'}});
    assert.equal((await request(env,'PUT',store,{blob:{ct:'two'},ifVersion:null})).status,409);
    assert.equal((await request(env,'PUT',store,{blob:{ct:'two'},ifVersion:version})).status,200);
  }
});
test('malformed Space store identifiers never store data',async()=>{
  for(const store of ['space-','space-'+ 'a'.repeat(31),'space-'+ 'a'.repeat(33),'space-'+ 'A'.repeat(32),'spaces-'+sid(1),'history']) {
    const env=storage();const r=await request(env,'PUT',store,{blob:{ct:'x'}});
    assert.equal(r.status,404);assert.equal(await r.text(),'unknown store');assert.equal(env.records.size,0);
  }
});
test('account deletion pages through all blobs including orphans and preserves other prefixes',async()=>{
  const env=storage();
  for(let i=0;i<30;i++)env.records.set(`blob:${account}:space-${sid(i)}`,'{}');
  for(const s of ['spaces','closed','shared','bookmarks','settings','session','icons','sends'])env.records.set(`blob:${account}:${s}`,'{}');
  env.records.set(`seen:${account}`,'{}');
  env.records.set(`blob:${other}:space-${sid(1)}`,'{}');
  env.records.set(`blob:${account}d:space-${sid(1)}`,'{}');
  const r=await request(env,'DELETE');assert.equal(r.status,204);
  assert.equal([...env.records.keys()].some(k=>k.startsWith(`blob:${account}:`)),false);
  assert.ok(env.records.has(`blob:${other}:space-${sid(1)}`));assert.ok(env.records.has(`blob:${account}d:space-${sid(1)}`));
  assert.equal(env.records.has(`seen:${account}`),false);assert.equal(env.deletes.at(-1),`seen:${account}`);
  assert.ok(env.lists.length>1);assert.ok(env.lists.every(l=>l.prefix===`blob:${account}:`));
});
test('Space stores enforce both blob and streamed request limits',async()=>{
  const store='space-'+sid(1),env=storage();
  assert.equal((await request(env,'PUT',store,{blob:{ct:'x'.repeat(524288-9)}})).status,200);
  assert.equal((await request(storage(),'PUT',store,{blob:{ct:'x'.repeat(524288-8)}})).status,413);
  assert.equal((await request(storage(),'PUT',store,{blob:{},ignored:'x'.repeat(513*1024)})).status,413);
});
test('Space reads share the account throttle and preserve the new-account budget',async t=>{
  t.mock.method(Date,'now',()=>1800000000000);
  const env=storage();
  for(let i=0;i<30;i++)assert.equal((await request(env,'GET','space-'+sid(i))).status,404);
  assert.equal((await request(env,'GET','spaces')).status,429);
  const blocked=storage({NEW_ACCOUNT_DAILY_LIMIT:'0'});
  assert.equal((await request(blocked,'PUT','space-'+sid(1),{blob:{}})).status,503);
  assert.equal([...blocked.records.keys()].some(k=>k.startsWith('blob:')),false);
});
test('scheduled cleanup removes orphan Space blobs only for inactive accounts',async()=>{
  const env=storage({CLEANUP_ENABLED:'true'});
  env.records.set(`blob:${account}:space-${sid(1)}`,'{}');env.records.set(`blob:${other}:space-${sid(2)}`,'{}');env.records.set(`seen:${other}`,'{}');
  let job;(await worker).scheduled({},env,{waitUntil:p=>{job=p;}});await job;
  assert.equal(env.records.has(`blob:${account}:space-${sid(1)}`),false);assert.ok(env.records.has(`blob:${other}:space-${sid(2)}`));
});
