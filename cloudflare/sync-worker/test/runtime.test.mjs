import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
process.env.WRANGLER_SEND_METRICS='false';
const {createTestHarness}=await import('wrangler');
const root=fileURLToPath(new URL('../',import.meta.url));
test('the configured Worker and SQLite Durable Object enforce quota and release storage locally',{timeout:120000},async t=>{
 const server=createTestHarness({root,workers:[{configPath:'./wrangler.toml'}]});t.after(()=>server.close());await server.listen();
 const worker=server.getWorker(),account='a'.repeat(64),sid=n=>'space-'+n.toString(16).padStart(32,'0'),base='/v1/blob/'+account+'/';
 const put=(name,blob,ifVersion=null)=>worker.fetch(base+name,{method:'PUT',body:JSON.stringify({blob,ifVersion})});
 const large={ct:'x'.repeat(512*1024-9)};let full=null;const versions=new Map();
 for(let n=1;n<45;n++){
  const response=await put(sid(n),large);
  if(response.status===507){assert.deepEqual(await response.json(),{error:'account-quota'});full=n;break;}
  assert.equal(response.status,200);versions.set(n,(await response.json()).version);
 }
 assert.equal(full,24,'eight permanent reservations leave room for 23 full-cap Space blobs');
 const fixed=await put('settings',{});assert.equal(fixed.status,200);await fixed.arrayBuffer();
 await worker.evictDurableObject('ACCOUNT_QUOTA',{name:account});
 assert.equal((await put(sid(full),large)).status,507,'the ledger must survive eviction');
 assert.equal((await put(sid(1),{},versions.get(1))).status,200,'compaction releases bytes');
 const made=await put(sid(full),large);assert.equal(made.status,200);await made.arrayBuffer();
 const deleted=await worker.fetch(base+sid(full),{method:'DELETE'});assert.equal(deleted.status,204);
 const again=await put(sid(full+1),large);assert.equal(again.status,200);await again.arrayBuffer();
 const wipe=await worker.fetch('/v1/blob/'+account,{method:'DELETE'});assert.equal(wipe.status,204);
 await worker.evictDurableObject('ACCOUNT_QUOTA',{name:account});
 assert.equal((await put(sid(100),large)).status,200);
});

test('real local KV and SQLite cover every legacy subset without inventory',{timeout:120000},async t=>{
 // This probe exists only in the disposable runtime. Production has no ledger
 // read/seed endpoint. The accountant receives a KV binding whose reads/list
 // throw, while the test seeds and observes the real underlying local KV.
 const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
 const probe=`import {AccountQuota} from './quota.mjs';
 export class ProbeQuota extends AccountQuota {
  constructor(state,env){const fault={mode:null};super({storage:{
   get:(...a)=>state.storage.get(...a),put:(...a)=>state.storage.put(...a),deleteAll:()=>state.storage.deleteAll(),
   transaction:async callback=>{const mode=fault.mode;fault.mode=null;const result=await state.storage.transaction(async tx=>{const result=await callback(tx);if(mode==='before')throw Error('failure before commit');return result;});if(mode==='after')throw Error('response lost after commit');return result;}
  }},{...env,SYNC:{
   get:async()=>{throw new Error('no inventory');},list:async()=>{throw new Error('no inventory');},
   put:(...args)=>env.SYNC.put(...args),delete:(...args)=>env.SYNC.delete(...args)
  }});this.fault=fault;}
  async fetch(request){if(new URL(request.url).pathname==='/fault'){this.fault.mode=await request.text();return new Response('armed');}if(request.method==='GET')return Response.json((await this.state.storage.get('ledger'))??null);return super.fetch(request);}
 }
 export default {fetch(){return new Response('test only',{status:404});}};`;
 const runtime=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2026-10-01',modules:[
  {type:'ESModule',path:'probe.mjs',contents:probe},{type:'ESModule',path:'quota.mjs',contents:source}
 ],durableObjects:{ACCOUNT_QUOTA:{className:'ProbeQuota',useSQLite:true}},kvNamespaces:['SYNC'],
 bindings:{ACCOUNT_STORAGE_QUOTA_BYTES:'20971520',ACCOUNT_STORAGE_MAX_STORES:'256'}}));
 t.after(()=>runtime.dispose());const env=await runtime.getBindings();
 const fixed=['bookmarks','settings','session','icons','sends','spaces','closed','shared'];
 const row={version:'x'.repeat(36),blob:{ct:'legacy'}};
 for(let mask=0;mask<256;mask++){
  const account=(mask+1).toString(16).padStart(64,'0');
  for(let n=0;n<8;n++)if(mask&(1<<n))await env.SYNC.put(`blob:${account}:${fixed[n]}`,JSON.stringify(row));
  const object=env.ACCOUNT_QUOTA.get(env.ACCOUNT_QUOTA.idFromName(account)),store='space-'+'1'.repeat(32);
  const write=await object.fetch('https://quota.invalid/write',{method:'POST',body:JSON.stringify({accountId:account,store,stored:JSON.stringify(row)})});
  assert.equal(write.status,200);await write.arrayBuffer();
  const ledger=await (await object.fetch('https://quota.invalid/ledger')).json();
  assert.equal(ledger.schema,2);assert.deepEqual(ledger.stores,{[store]:{bytes:Buffer.byteLength(JSON.stringify(row))}});
  assert.equal(await env.SYNC.get(`blob:${account}:${store}`),null);const read=await (await object.fetch('https://quota.invalid/read',{method:'POST',body:JSON.stringify({accountId:account,store})})).json();assert.deepEqual(read.record,row);
 }
 const account='f'.repeat(64),historical=JSON.stringify({version:'x'.repeat(36),blob:{ct:'€'.repeat(524279)}});
 for(const store of fixed.slice(0,4))await env.SYNC.put(`blob:${account}:${store}`,historical);
 assert.ok(4*(Buffer.byteLength(historical)+256)+4*(524288+58+256)<=8391120);
 const object=env.ACCOUNT_QUOTA.get(env.ACCOUNT_QUOTA.idFromName(account));
 assert.equal((await object.fetch('https://quota.invalid/write',{method:'POST',body:JSON.stringify({accountId:account,store:'settings',stored:JSON.stringify(row)})})).status,200);
 // A late fixed-only legacy writer must not invalidate the unchanged reserve.
 await env.SYNC.put(`blob:${account}:settings`,historical);
 assert.deepEqual((await (await object.fetch('https://quota.invalid/ledger')).json()).stores,{});
 for(const mode of ['before','after']){
  const id=(mode==='before'?'c':'d').repeat(64),store='space-'+'9'.repeat(32),object=env.ACCOUNT_QUOTA.get(env.ACCOUNT_QUOTA.idFromName(id));
  const post=(path,body)=>object.fetch('https://quota.invalid/'+path,{method:'POST',body:JSON.stringify({accountId:id,...body})});
  await post('read',{store});await object.fetch('https://quota.invalid/fault',{method:'POST',body:mode});
  assert.equal((await post('write',{store,stored:JSON.stringify(row)})).status,503);
  const ledger=await (await object.fetch('https://quota.invalid/ledger')).json(),read=await (await post('read',{store})).json();
  assert.equal(Boolean(ledger.stores[store]),mode==='after');assert.equal(Boolean(read.record),mode==='after');
  assert.equal((await post('write',{store,stored:JSON.stringify(row)})).status,200);
  assert.equal((await post('delete-account',{})).status,204);
  assert.equal(await (await object.fetch('https://quota.invalid/ledger')).json(),null);
 }
});
