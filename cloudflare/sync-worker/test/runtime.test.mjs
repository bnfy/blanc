import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
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
 assert.ok(full,'the real runtime must refuse storage growth');
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
